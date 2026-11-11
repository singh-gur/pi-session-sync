import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parseConfig } from "../src/config.ts";

test("valid minimal config gets defaults and stripped slashes", () => {
	const c = parseConfig({ repoUrl: "git@h:me/s.git", roots: { dev: "/home/me/dev/" } });
	assert.deepEqual(c, {
		repoUrl: "git@h:me/s.git",
		branch: "main",
		roots: { dev: "/home/me/dev" },
		auto: { pullOnStart: false, pushOnShutdown: false },
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
	])
		assert.throws(() => parseConfig(bad), JSON.stringify(bad));
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
