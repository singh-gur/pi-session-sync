import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSessions } from "../src/merge.ts";

const H = { type: "session", version: 3, id: "S", timestamp: "2026-01-01T00:00:00.000Z", cwd: "/p" };
const e = (id: string, parentId: string | null, t: number, extra = {}) => ({
	type: "message",
	id,
	parentId,
	timestamp: `2026-01-01T00:00:${String(t).padStart(2, "0")}.000Z`,
	...extra,
});
const file = (...lines: object[]) => lines.map((l) => JSON.stringify(l)).join("\n") + "\n";

test("local missing -> remote verbatim", () => {
	const remote = file(H, e("a", null, 1), e("b", "a", 2));
	assert.deepEqual(mergeSessions(undefined, remote), { text: remote, added: 2, conflicts: 0, changed: true });
});

test("remote missing or identical -> unchanged", () => {
	const local = file(H, e("a", null, 1));
	assert.equal(mergeSessions(local, undefined).changed, false);
	assert.deepEqual(mergeSessions(local, local), { text: local, added: 0, conflicts: 0, changed: false });
});

test("disjoint branches merge; newest entry is last line", () => {
	const local = file(H, e("a", null, 1), e("l1", "a", 3));
	const remote = file(H, e("a", null, 1), e("r1", "a", 2), e("r2", "r1", 5));
	const r = mergeSessions(local, remote);
	const ids = r.text.trim().split("\n").map((l) => JSON.parse(l).id);
	assert.deepEqual(ids, ["S", "a", "r1", "l1", "r2"]);
	assert.equal(r.added, 2);
});

test("same id different content -> local kept, conflict counted", () => {
	const local = file(H, e("a", null, 1, { v: "local" }));
	const remote = file(H, e("a", null, 1, { v: "remote" }));
	const r = mergeSessions(local, remote);
	assert.equal(r.conflicts, 1);
	assert.equal(r.text, local);
});

test("parent before child across sides (3-level chain)", () => {
	const local = file(H, e("a", null, 1), e("c", "b", 3));
	const remote = file(H, e("a", null, 1), e("b", "a", 2));
	const ids = mergeSessions(local, remote).text.trim().split("\n").map((l) => JSON.parse(l).id);
	assert.deepEqual(ids, ["S", "a", "b", "c"]);
});

test("header id mismatch throws", () => {
	assert.throws(() => mergeSessions(file(H), file({ ...H, id: "X" })));
});

test("entries without id are kept", () => {
	const r = mergeSessions(file(H, { type: "weird" }), file(H, e("a", null, 1)));
	assert.ok(r.text.includes('"weird"'));
});
