import { test } from "node:test";
import assert from "node:assert/strict";
import { localSessionDirFor, repoPathFor } from "../src/layout.ts";

const roots = { dev: "/home/me/dev", home: "/home/me" };

test("repoPathFor maps cwd under the longest root", () => {
	assert.equal(repoPathFor("/home/me/dev/a/b", "f.jsonl", roots), "sessions/dev/a-b/f.jsonl");
	assert.equal(repoPathFor("/home/me/dev", "f.jsonl", roots), "sessions/dev/_root_/f.jsonl");
	assert.equal(repoPathFor("/home/me/dev2", "f.jsonl", roots), "sessions/home/dev2/f.jsonl");
	assert.equal(repoPathFor("/home/me/dev2", "f.jsonl", { dev: "/home/me/dev" }), undefined);
	assert.equal(repoPathFor("/opt/x", "f.jsonl", roots), undefined);
});

test("localSessionDirFor mirrors pi's encoding", () => {
	assert.equal(localSessionDirFor("/home/me/dev/proj", "/a"), "/a/sessions/--home-me-dev-proj--");
});
