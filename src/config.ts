import { existsSync, readFileSync } from "node:fs";
import { rootFor } from "./layout.ts";

export type AutoFlags = { pullOnStart: boolean; pushOnShutdown: boolean };
export type SyncConfig = {
	repoUrl: string;
	branch: string;
	roots: Record<string, string>;
	/** overrides: "<root>" or "<root>/<rel/path>" -> partial flags; longest matching key wins. */
	auto: AutoFlags & { overrides: Record<string, Partial<AutoFlags>> };
};

const FLAGS = ["pullOnStart", "pushOnShutdown"] as const;

const ROOT_NAME = /^[a-z0-9_-]+$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseConfig(raw: unknown): SyncConfig {
	if (!isObject(raw)) throw new Error("config must be a JSON object");
	if (typeof raw.repoUrl !== "string" || !raw.repoUrl.trim()) throw new Error("config.repoUrl is required");
	if (raw.branch !== undefined && (typeof raw.branch !== "string" || !raw.branch.trim()))
		throw new Error("config.branch must be a non-empty string");
	if (!isObject(raw.roots) || Object.keys(raw.roots).length === 0)
		throw new Error("config.roots must be a non-empty object of name -> absolute path");

	const roots: Record<string, string> = {};
	for (const [name, path] of Object.entries(raw.roots)) {
		if (!ROOT_NAME.test(name)) throw new Error(`config.roots: invalid root name "${name}" (use a-z, 0-9, _ and -)`);
		if (typeof path !== "string" || !path.startsWith("/"))
			throw new Error(`config.roots.${name} must be an absolute path`);
		const stripped = path.replace(/\/+$/, "");
		if (!stripped) throw new Error(`config.roots.${name}: "/" is not allowed as a root`);
		roots[name] = stripped;
	}

	const auto = isObject(raw.auto) ? raw.auto : {};
	if (auto.overrides !== undefined && !isObject(auto.overrides))
		throw new Error("config.auto.overrides must be an object of \"root[/path]\" -> { pullOnStart?, pushOnShutdown? }");
	const overrides: Record<string, Partial<AutoFlags>> = {};
	for (const [rawKey, val] of Object.entries(auto.overrides ?? {})) {
		const key = rawKey.replace(/^\/+|\/+$/g, "");
		const segs = key.split("/");
		if (!(segs[0]! in roots)) throw new Error(`config.auto.overrides: "${rawKey}" must start with a configured root name`);
		if (segs.some((s) => !s || s === "." || s === ".."))
			throw new Error(`config.auto.overrides: "${rawKey}" has an empty, "." or ".." segment`);
		if (!isObject(val)) throw new Error(`config.auto.overrides.${rawKey} must be an object`);
		const o: Partial<AutoFlags> = {};
		for (const [k, v] of Object.entries(val)) {
			if (!(FLAGS as readonly string[]).includes(k) || typeof v !== "boolean")
				throw new Error(`config.auto.overrides.${rawKey}.${k}: expected pullOnStart or pushOnShutdown with a boolean`);
			o[k as keyof AutoFlags] = v;
		}
		overrides[key] = o;
	}
	return {
		repoUrl: raw.repoUrl,
		branch: (raw.branch as string | undefined) ?? "main",
		roots,
		auto: { pullOnStart: auto.pullOnStart === true, pushOnShutdown: auto.pushOnShutdown === true, overrides },
	};
}

/** Effective auto flags for a local cwd: global defaults, then matching overrides from shortest to longest key. Off outside roots. */
export function autoFor(cfg: SyncConfig, cwd: string): AutoFlags {
	const r = rootFor(cwd, cfg.roots);
	if (!r) return { pullOnStart: false, pushOnShutdown: false };
	const path = r.rel ? `${r.name}/${r.rel}` : r.name;
	const flags: AutoFlags = { pullOnStart: cfg.auto.pullOnStart, pushOnShutdown: cfg.auto.pushOnShutdown };
	for (const key of Object.keys(cfg.auto.overrides).sort((a, b) => a.length - b.length))
		if (path === key || path.startsWith(`${key}/`)) Object.assign(flags, cfg.auto.overrides[key]);
	return flags;
}

export function loadConfig(file: string): SyncConfig | undefined {
	if (!existsSync(file)) return undefined;
	try {
		return parseConfig(JSON.parse(readFileSync(file, "utf8")));
	} catch (e) {
		throw new Error(`${file}: ${(e as Error).message}`);
	}
}
