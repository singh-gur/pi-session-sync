import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteFileToLocal, rewriteFileToPortable, rewriteLine, toLocal, toPortable } from "../src/rewrite.ts";

const roots = { dev: "/home/me/dev", home: "/home/me" };

test("toPortable rewrites at path boundaries, longest root first", () => {
	assert.equal(toPortable("/home/me/dev/proj", roots), "{{PISYNC:dev}}/proj");
	assert.equal(toPortable("/home/me/dev2/x", roots), "{{PISYNC:home}}/dev2/x");
	assert.equal(toPortable("/home/me/dev2/x", { dev: "/home/me/dev" }), "/home/me/dev2/x");
	assert.equal(toPortable("cd /home/me/dev && ls", roots), "cd {{PISYNC:dev}} && ls");
	assert.equal(toPortable("/x/home/me/dev", roots), "/x/home/me/dev");
	assert.equal(toPortable("/home/me/dev", roots), "{{PISYNC:dev}}");
	assert.equal(toPortable('"/home/me/.bashrc"', roots), '"{{PISYNC:home}}/.bashrc"');
	assert.equal(toPortable("{{PISYNC:dev}}/a", roots), "{{PISYNC:dev}}/a");
});

test("toLocal round trips and reports unknown roots", () => {
	for (const s of ["/home/me/dev/proj", "/home/me/dev2/x", "cd /home/me/dev && ls", "/home/me/dev"])
		assert.equal(toLocal(toPortable(s, roots), roots).value, s);
	assert.deepEqual(toLocal("{{PISYNC:work}}/a {{PISYNC:work}}/b", roots), {
		value: "{{PISYNC:work}}/a {{PISYNC:work}}/b",
		unknown: ["work"],
	});
});

test("rewriteLine rewrites nested string values only", () => {
	const line = JSON.stringify({
		"/home/me/dev": 1,
		n: 2,
		b: true,
		z: null,
		message: { content: [{ type: "text", text: 'say "hi"\n/home/me/dev/p' }] },
	});
	const out = JSON.parse(rewriteLine(line, (s) => toPortable(s, roots)));
	assert.deepEqual(out, {
		"/home/me/dev": 1,
		n: 2,
		b: true,
		z: null,
		message: { content: [{ type: "text", text: 'say "hi"\n{{PISYNC:dev}}/p' }] },
	});
	assert.equal(rewriteLine("  ", (s) => s), "  ");
});

test("file rewrite preserves trailing newline and round trips", () => {
	const text = '{"type":"session","cwd":"/home/me/dev/p"}\n{"id":"a","x":"/home/me/f"}\n';
	const portable = rewriteFileToPortable(text, roots);
	assert.ok(!portable.includes("/home/me"));
	assert.ok(portable.endsWith("\n"));
	assert.deepEqual(rewriteFileToLocal(portable, roots), { text, unknown: [] });
});
