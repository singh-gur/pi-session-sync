import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CURRENT_SESSION_VERSION, getAgentDir, SessionManager } from "@earendil-works/pi-coding-agent";
import { loadConfig, type SyncConfig } from "./config.ts";
import { commitAndPush, ensureClone, type Exec, syncToRemote } from "./git.ts";
import { localSessionDirFor, repoPathFor } from "./layout.ts";
import { mergeSessions } from "./merge.ts";
import { pickSessions } from "./picklist.ts";
import { rewriteFileToLocal, rewriteFileToPortable } from "./rewrite.ts";

const EXAMPLE = `{
  "repoUrl": "git@github.com:me/pi-sessions.git",
  "branch": "main",
  "roots": { "dev": "/home/me/dev" },
  "auto": { "pullOnStart": false, "pushOnShutdown": false }
}`;

const configFile = () => join(getAgentDir(), "git-session-sync.json");
const cloneDir = () => join(getAgentDir(), "git-session-sync", "repo");
const sessionsRoot = () => join(getAgentDir(), "sessions");

type Summary = { synced: number; added: number; unchanged: number; conflicts: number; skipped: string[] };
const newSummary = (): Summary => ({ synced: 0, added: 0, unchanged: 0, conflicts: 0, skipped: [] });

function header(text: string): { version?: unknown; cwd?: unknown } | undefined {
	try {
		const h = JSON.parse(text.split("\n", 1)[0]);
		return h?.type === "session" ? h : undefined;
	} catch {
		return undefined;
	}
}

const readIf = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : undefined);

function writeAtomic(file: string, text: string) {
	mkdirSync(dirname(file), { recursive: true });
	const tmp = `${file}.tmp-pss`;
	writeFileSync(tmp, text);
	renameSync(tmp, file);
}

/** Load config and check preconditions; notifies and returns undefined when sync cannot run. */
function getConfig(ctx: ExtensionContext, quietIfMissing = false): SyncConfig | undefined {
	let cfg: SyncConfig | undefined;
	try {
		cfg = loadConfig(configFile());
	} catch (e) {
		ctx.ui.notify(`session-sync: ${(e as Error).message}`, "error");
		return undefined;
	}
	if (!cfg) {
		if (!quietIfMissing) ctx.ui.notify(`session-sync: create ${configFile()} like:\n${EXAMPLE}`, "warning");
		return undefined;
	}
	if (resolve(ctx.sessionManager.getSessionDir()) !== resolve(localSessionDirFor(resolve(ctx.cwd), getAgentDir()))) {
		ctx.ui.notify("session-sync: custom sessionDir is unsupported", "error");
		return undefined;
	}
	return cfg;
}

/** Push local session files (merged into the repo copy). */
async function pushSessions(exec: Exec, cfg: SyncConfig, paths: string[]): Promise<Summary> {
	const clone = cloneDir();
	await ensureClone(exec, cfg, clone);
	let s = newSummary();
	await commitAndPush(exec, cfg, clone, `push ${paths.length} session(s) from ${hostname()}`, async () => {
		s = newSummary();
		for (const path of paths) {
			const text = readIf(path);
			const h = text && header(text);
			if (!h) {
				s.skipped.push(`${basename(path)}: unreadable`);
				continue;
			}
			if (h.version !== CURRENT_SESSION_VERSION) {
				s.skipped.push(`${basename(path)}: session version ${h.version}`);
				continue;
			}
			const rel = typeof h.cwd === "string" ? repoPathFor(h.cwd, basename(path), cfg.roots) : undefined;
			if (!rel) {
				s.skipped.push(`${basename(path)}: cwd not under a configured root`);
				continue;
			}
			const repoFile = join(clone, rel);
			const repoText = readIf(repoFile);
			const m = mergeSessions(rewriteFileToPortable(text, cfg.roots), repoText);
			s.conflicts += m.conflicts;
			if (m.text === repoText) s.unchanged++;
			else {
				writeAtomic(repoFile, m.text);
				s.synced++;
			}
		}
		return s.synced;
	});
	return s;
}

type PullCandidate = { repoFile: string; target: string; isNew: boolean; label: string };

function walkJsonl(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true, recursive: true })
		.filter((d) => d.isFile() && d.name.endsWith(".jsonl"))
		.map((d) => join(d.parentPath, d.name));
}

/** Localize a repo file; returns the target path and localized text, or a skip reason. */
function localize(cfg: SyncConfig, repoFile: string): { target: string; text: string } | { skip: string } {
	const name = basename(repoFile);
	const { text, unknown } = rewriteFileToLocal(readFileSync(repoFile, "utf8"), cfg.roots);
	if (unknown.length) return { skip: `${name}: unknown root(s) ${unknown.join(", ")}` };
	const h = header(text);
	if (!h || typeof h.cwd !== "string" || !h.cwd.startsWith("/")) return { skip: `${name}: invalid header` };
	if (h.version !== CURRENT_SESSION_VERSION) return { skip: `${name}: session version ${h.version}` };
	const target = resolve(localSessionDirFor(h.cwd, getAgentDir()), name);
	// Trust boundary: repo content must never write outside the sessions dir.
	if (!target.startsWith(resolve(sessionsRoot()) + sep)) return { skip: `${name}: target outside sessions dir` };
	return { target, text };
}

async function scanPull(exec: Exec, cfg: SyncConfig, s: Summary): Promise<PullCandidate[]> {
	const clone = cloneDir();
	await ensureClone(exec, cfg, clone);
	await syncToRemote(exec, cfg, clone);
	const out: PullCandidate[] = [];
	for (const repoFile of walkJsonl(join(clone, "sessions"))) {
		const l = localize(cfg, repoFile);
		if ("skip" in l) {
			s.skipped.push(l.skip);
			continue;
		}
		const local = readIf(l.target);
		if (local !== undefined && !mergeSessions(local, l.text).changed) continue;
		const cwd = String(header(l.text)?.cwd);
		out.push({ repoFile, target: l.target, isNew: local === undefined, label: `${local === undefined ? "[new]" : "[changed]"} ${cwd} · ${basename(repoFile)}` });
	}
	return out;
}

function applyPull(cfg: SyncConfig, c: PullCandidate, s: Summary) {
	const l = localize(cfg, c.repoFile);
	if ("skip" in l) return void s.skipped.push(l.skip);
	const m = mergeSessions(readIf(c.target), l.text); // re-read: local may have changed since the scan
	s.conflicts += m.conflicts;
	if (!m.changed) return void s.unchanged++;
	writeAtomic(c.target, m.text);
	s.synced++;
	s.added += m.added;
}

function report(ctx: ExtensionContext, verb: string, s: Summary) {
	const parts = [`${verb} ${s.synced}`, `unchanged ${s.unchanged}`];
	if (s.added) parts.push(`new entries ${s.added}`);
	if (s.conflicts) parts.push(`id conflicts ${s.conflicts} (kept local)`);
	if (s.skipped.length) parts.push(`skipped ${s.skipped.length}:\n  ${s.skipped.join("\n  ")}`);
	ctx.ui.notify(`session-sync: ${parts.join(", ")}`, s.skipped.length ? "warning" : "info");
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function (pi: ExtensionAPI) {
	const exec: Exec = (cmd, args, opts) => pi.exec(cmd, args, opts);

	pi.registerCommand("session-sync-push", {
		description: "Push selected pi sessions to the sync git repo",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			const cfg = getConfig(ctx);
			if (!cfg) return;
			const current = ctx.sessionManager.getSessionFile();
			const infos = (await SessionManager.listAll())
				.filter((i) => repoPathFor(i.cwd, basename(i.path), cfg.roots))
				.sort((a, b) => b.modified.getTime() - a.modified.getTime());
			if (!infos.length) return ctx.ui.notify("session-sync: no sessions under configured roots", "info");
			const picked = await pickSessions(
				ctx,
				"Push sessions",
				infos.map((i) => ({
					id: i.path,
					label: `${(i.name || i.firstMessage || "(empty)").replace(/\s+/g, " ").slice(0, 60)} · ${i.cwd} · ${i.modified.toLocaleString()}`,
					checked: i.path === current,
				})),
			);
			if (!picked?.length) return ctx.ui.notify("session-sync: nothing selected", "info");
			ctx.ui.setStatus("session-sync", "pushing sessions...");
			try {
				report(ctx, "pushed", await pushSessions(exec, cfg, picked));
			} catch (e) {
				ctx.ui.notify(`session-sync push failed: ${errMsg(e)}`, "error");
			} finally {
				ctx.ui.setStatus("session-sync", undefined);
			}
		},
	});

	pi.registerCommand("session-sync-pull", {
		description: "Pull selected pi sessions from the sync git repo",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			const cfg = getConfig(ctx);
			if (!cfg) return;
			const current = ctx.sessionManager.getSessionFile();
			const s = newSummary();
			let currentUpdated = false;
			ctx.ui.setStatus("session-sync", "pulling sessions...");
			try {
				const candidates = await scanPull(exec, cfg, s);
				ctx.ui.setStatus("session-sync", undefined);
				if (!candidates.length) return report(ctx, "pulled", s);
				const picked = await pickSessions(
					ctx,
					"Pull sessions",
					candidates.map((c) => ({ id: c.target, label: c.label, checked: c.target === current })),
				);
				if (!picked?.length) return ctx.ui.notify("session-sync: nothing selected", "info");
				for (const c of candidates.filter((c) => picked.includes(c.target))) {
					if (c.target === current && !ctx.isIdle()) {
						s.skipped.push(`${basename(c.target)}: agent busy (current session)`);
						continue;
					}
					const before = s.synced;
					applyPull(cfg, c, s);
					if (c.target === current && s.synced > before) currentUpdated = true;
				}
				report(ctx, "pulled", s);
			} catch (e) {
				return ctx.ui.notify(`session-sync pull failed: ${errMsg(e)}`, "error");
			} finally {
				ctx.ui.setStatus("session-sync", undefined);
			}
			// Reload the active session from disk; ctx is stale afterwards, so this is the last use.
			if (currentUpdated && current) await ctx.switchSession(current);
		},
	});

	pi.on("session_start", async (event, ctx) => {
		if (event.reason !== "startup") return;
		const cfg = getConfig(ctx, true);
		if (!cfg?.auto.pullOnStart) return;
		const current = ctx.sessionManager.getSessionFile();
		// Fire and forget: never block startup on the network.
		void (async () => {
			const s = newSummary();
			for (const c of await scanPull(exec, cfg, s)) if (c.target !== current) applyPull(cfg, c, s);
			if (s.synced || s.skipped.length) report(ctx, "auto-pulled", s);
		})().catch((e) => ctx.ui.notify(`session-sync auto-pull failed: ${errMsg(e)}`, "warning"));
	});

	pi.on("session_shutdown", async (event, ctx) => {
		if (event.reason !== "quit") return;
		const cfg = getConfig(ctx, true);
		const current = ctx.sessionManager.getSessionFile();
		if (!cfg?.auto.pushOnShutdown || !current || !existsSync(current)) return;
		const h = header(readFileSync(current, "utf8"));
		if (typeof h?.cwd !== "string" || !repoPathFor(h.cwd, basename(current), cfg.roots)) return;
		try {
			await pushSessions(exec, cfg, [current]);
		} catch (e) {
			ctx.ui.notify(`session-sync auto-push failed: ${errMsg(e)}`, "warning");
		}
	});
}
