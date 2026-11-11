// shortcut: POSIX paths only, upgrade when Windows support is needed.

export type Roots = Record<string, string>;

export const TOKEN = (name: string) => `{{PISYNC:${name}}}`;
const TOKEN_RE = /\{\{PISYNC:([a-z0-9_-]+)\}\}/g;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Root path only matches at path boundaries: not glued to a preceding path/word char, and followed by "/" or a non-path char.
function rootRegexes(roots: Roots): [RegExp, string][] {
	return Object.entries(roots)
		.sort((a, b) => b[1].length - a[1].length)
		.map(([name, path]) => [new RegExp(`(?<![A-Za-z0-9._/-])${escapeRe(path)}(?![A-Za-z0-9._-])`, "g"), TOKEN(name)]);
}

export function toPortable(s: string, roots: Roots): string {
	for (const [re, token] of rootRegexes(roots)) s = s.replace(re, token);
	return s;
}

export function toLocal(s: string, roots: Roots): { value: string; unknown: string[] } {
	const unknown = new Set<string>();
	const value = s.replace(TOKEN_RE, (m, name: string) => {
		if (Object.hasOwn(roots, name)) return roots[name];
		unknown.add(name);
		return m;
	});
	return { value, unknown: [...unknown] };
}

function walk(v: unknown, fn: (s: string) => string): unknown {
	if (typeof v === "string") return fn(v);
	if (Array.isArray(v)) return v.map((x) => walk(x, fn));
	if (v && typeof v === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, x] of Object.entries(v)) out[k] = walk(x, fn);
		return out;
	}
	return v;
}

export function rewriteLine(line: string, fn: (s: string) => string): string {
	if (!line.trim()) return line;
	return JSON.stringify(walk(JSON.parse(line), fn));
}

const mapLines = (text: string, fn: (s: string) => string) =>
	text
		.split("\n")
		.map((l) => rewriteLine(l, fn))
		.join("\n");

export function rewriteFileToPortable(text: string, roots: Roots): string {
	const rs = rootRegexes(roots);
	return mapLines(text, (s) => rs.reduce((acc, [re, token]) => acc.replace(re, token), s));
}

export function rewriteFileToLocal(text: string, roots: Roots): { text: string; unknown: string[] } {
	const unknown = new Set<string>();
	const out = mapLines(text, (s) => {
		const r = toLocal(s, roots);
		for (const u of r.unknown) unknown.add(u);
		return r.value;
	});
	return { text: out, unknown: [...unknown] };
}
