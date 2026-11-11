import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SyncConfig } from "./config.ts";

export type Exec = (
	cmd: string,
	args: string[],
	opts: { cwd?: string; timeout?: number },
) => Promise<{ stdout: string; stderr: string; code: number }>;

const TIMEOUT = 60_000;

async function git(exec: Exec, cwd: string, args: string[], allowFail = false) {
	const r = await exec("git", args, { cwd, timeout: TIMEOUT });
	if (r.code !== 0 && !allowFail) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim() || r.stdout.trim()}`);
	return r;
}

export async function ensureClone(exec: Exec, cfg: SyncConfig, cloneDir: string) {
	if (existsSync(join(cloneDir, ".git"))) return;
	const parent = dirname(cloneDir);
	mkdirSync(parent, { recursive: true });
	const r = await git(exec, parent, ["clone", "--branch", cfg.branch, cfg.repoUrl, cloneDir], true);
	if (r.code === 0) return;
	// Empty remote (or branch not created yet): plain clone, then create the branch locally.
	await git(exec, parent, ["clone", cfg.repoUrl, cloneDir]);
	await git(exec, cloneDir, ["checkout", "-B", cfg.branch]);
}

export async function syncToRemote(exec: Exec, cfg: SyncConfig, cloneDir: string) {
	await git(exec, cloneDir, ["fetch", "origin"]);
	const has = await git(exec, cloneDir, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${cfg.branch}`], true);
	if (has.code !== 0) return;
	await git(exec, cloneDir, ["checkout", "-B", cfg.branch, `origin/${cfg.branch}`]);
	await git(exec, cloneDir, ["reset", "--hard", `origin/${cfg.branch}`]);
	await git(exec, cloneDir, ["clean", "-fd"]);
}

/** rebuild() writes files into the clone and returns how many changed. Retries on push rejection. */
export async function commitAndPush(
	exec: Exec,
	cfg: SyncConfig,
	cloneDir: string,
	message: string,
	rebuild: () => Promise<number>,
): Promise<{ pushed: number }> {
	let lastErr = "";
	for (let attempt = 0; attempt < 3; attempt++) {
		await syncToRemote(exec, cfg, cloneDir);
		const n = await rebuild();
		if (n === 0) return { pushed: 0 };
		await git(exec, cloneDir, ["add", "-A", "sessions"]);
		await git(exec, cloneDir, ["commit", "-q", "-m", message]);
		const p = await git(exec, cloneDir, ["push", "origin", `HEAD:${cfg.branch}`], true);
		if (p.code === 0) return { pushed: n };
		lastErr = p.stderr.trim();
	}
	throw new Error(`git push failed after 3 attempts: ${lastErr}`);
}
