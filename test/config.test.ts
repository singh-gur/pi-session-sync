import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { autoFor, loadConfig, parseConfig } from "../src/config.ts";

test("valid minimal config gets defaults and stripped slashes", () => {
	const c = parseConfig({ repoUrl: "git@h:me/s.git", roots: { dev: "/home/me/dev/" } });
	assert.deepEqual(c, {
		repoUrl: "git@h:me/s.git",
		branch: "main",
		roots: { dev: "/home/me/dev" },
		auto: { pullOnStart: false, pushOnShutdown: false, overrides: {} },
	});
});

test("invalid configs throw", () => {
	const ok = { repoUrl: "r", roots: { dev: "/d" } };
	for (const bad of [
		null,
		[],
		"x",
		{ roots: { dev: "/d" } },
		{ ...ok, repoUrl: " " },
		{ ...ok, roots: {} },
		{ ...ok, roots: { Dev: "/d" } },
		{ ...ok, roots: { dev: "rel/path" } },
		{ ...ok, roots: { dev: "/" } },
		{ ...ok, branch: "" },
		{ ...ok, auto: { overrides: [] } },
		{ ...ok, auto: { overrides: { work: {} } } },
		{ ...ok, auto: { overrides: { "dev//x": {} } } },
		{ ...ok, auto: { overrides: { "dev/../x": {} } } },
		{ ...ok, auto: { overrides: { dev: true } } },
		{ ...ok, auto: { overrides: { dev: { pullOnStart: "yes" } } } },
		{ ...ok, auto: { overrides: { dev: { pull: true } } } },
	])
		assert.throws(() => parseConfig(bad), JSON.stringify(bad));
});

test("autoFor: global defaults, longest override wins, off outside roots", () => {
	const c = parseConfig({
		repoUrl: "r",
		roots: { dev: "/d", work: "/w" },
		auto: {
			pushOnShutdown: true,
			overrides: { "/dev/": { pullOnStart: true }, "dev/api": { pushOnShutdown: false }, "dev/api/x": { pullOnStart: false } },
		},
	});
	const f = (cwd: string) => Object.values(autoFor(c, cwd));
	assert.deepEqual(f("/d"), [true, true]);
	assert.deepEqual(f("/d/web"), [true, true]);
	assert.deepEqual(f("/d/api"), [true, false]);
	assert.deepEqual(f("/d/api/x/y"), [false, false]);
	assert.deepEqual(f("/d/apix"), [true, true]); // not a path-boundary match
	assert.deepEqual(f("/w/a"), [false, true]);
	assert.deepEqual(f("/elsewhere"), [false, false]);
});

test("loadConfig: missing -> undefined, bad JSON throws with path", () => {
	const dir = mkdtempSync(join(tmpdir(), "pss-"));
	const f = join(dir, "c.json");
	assert.equal(loadConfig(f), undefined);
	writeFileSync(f, "{nope");
	assert.throws(() => loadConfig(f), (e: Error) => e.message.includes(f));
	writeFileSync(f, JSON.stringify({ repoUrl: "r", roots: { a: "/a" }, auto: { pullOnStart: true } }));
	assert.equal(loadConfig(f)?.auto.pullOnStart, true);
});
