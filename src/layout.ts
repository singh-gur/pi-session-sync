import { join } from "node:path";
import type { Roots } from "./rewrite.ts";

export const encodeRel = (rel: string) => (rel ? rel.replace(/[/\\:]/g, "-") : "_root_");

/** Longest configured root containing cwd (equal or prefix + "/"). */
export function rootFor(cwd: string, roots: Roots): { name: string; rel: string } | undefined {
	let best: { name: string; rel: string; len: number } | undefined;
	for (const [name, path] of Object.entries(roots)) {
		if ((cwd === path || cwd.startsWith(`${path}/`)) && (!best || path.length > best.len))
			best = { name, rel: cwd.slice(path.length + 1), len: path.length };
	}
	return best && { name: best.name, rel: best.rel };
}

export function repoPathFor(localCwd: string, fileName: string, roots: Roots): string | undefined {
	const r = rootFor(localCwd, roots);
	return r && `sessions/${r.name}/${encodeRel(r.rel)}/${fileName}`;
}

/** Mirror of pi's getDefaultSessionDirPath (session-manager.js:291-294), which is not exported. */
export const localSessionDirFor = (cwd: string, agentDir: string) =>
	join(agentDir, "sessions", `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`);
