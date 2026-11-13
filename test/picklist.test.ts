import { test } from "node:test";
import assert from "node:assert/strict";
import { MultiSelect } from "../src/picklist.ts";

const style = { fg: (_c: string, t: string) => t, bold: (t: string) => t } as any;
const items = ["a", "b", "c"].map((id) => ({ id, label: id, checked: id === "a" }));

test("space toggles, enter confirms in list order", () => {
	let out: string[] | undefined | null = null;
	const m = new MultiSelect("T", "push", items, style, (ids) => (out = ids));
	m.handleInput(" "); // uncheck a
	m.handleInput("\x1b[B"); // down
	m.handleInput("\x1b[B");
	m.handleInput(" "); // check c
	assert.equal(out, null);
	m.handleInput("\r");
	assert.deepEqual(out, ["c"]);
});

test("a toggles all/none, esc cancels", () => {
	let out: string[] | undefined | null = null;
	const m = new MultiSelect("T", "pull", items, style, (ids) => (out = ids));
	m.handleInput("a");
	assert.equal(m.selected.size, 3);
	m.handleInput("a");
	assert.equal(m.selected.size, 0);
	assert.match(m.render(80).join("\n"), /\[ \] b/);
	m.handleInput("\x1b");
	assert.equal(out, undefined);
});

test("local items shown by default, tab reveals all, enter confirms visible only", () => {
	let out: string[] | undefined | null = null;
	const mixed = items.map((i) => ({ ...i, local: i.id !== "b" }));
	const m = new MultiSelect("T", "push", mixed, style, (ids) => (out = ids));
	assert.deepEqual(m.items.map((i) => i.id), ["a", "c"]);
	assert.doesNotMatch(m.render(80).join("\n"), /\] b/);
	m.handleInput("\t");
	assert.deepEqual(m.items.map((i) => i.id), ["a", "b", "c"]);
	m.handleInput("\x1b[B");
	m.handleInput(" "); // check b
	m.handleInput("\t"); // back to local: b hidden, not confirmed
	m.handleInput("\r");
	assert.deepEqual(out, ["a"]);
});

test("no local items falls back to all", () => {
	const m = new MultiSelect("T", "push", items.map((i) => ({ ...i, local: false })), style, () => {});
	assert.equal(m.items.length, 3);
	m.handleInput("\t"); // no-op
	assert.equal(m.items.length, 3);
});
