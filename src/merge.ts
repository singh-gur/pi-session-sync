type Line = Record<string, unknown>;

function parse(text: string | undefined): { header?: Line; entries: Line[] } {
	const entries: Line[] = [];
	let header: Line | undefined;
	for (const raw of (text ?? "").split("\n")) {
		if (!raw.trim()) continue;
		const obj = JSON.parse(raw) as Line;
		if (obj.type === "session" && !header) header = obj;
		else entries.push(obj);
	}
	return { header, entries };
}

/**
 * Merge two versions of one session JSONL file. Local wins on header and id conflicts.
 * Entries are ordered by timestamp so the newest entry is the last line (pi's leaf, session-manager.js:733-742).
 */
export function mergeSessions(
	localText: string | undefined,
	remoteText: string | undefined,
): { text: string; added: number; conflicts: number; changed: boolean } {
	const local = parse(localText);
	const remote = parse(remoteText);
	if (local.header && remote.header && local.header.id !== remote.header.id)
		throw new Error(`session header id mismatch: ${local.header.id} vs ${remote.header.id}`);

	const header = local.header ?? remote.header;
	const byId = new Map<unknown, string>();
	const merged: Line[] = [];
	const noId: Line[] = [];
	let added = 0;
	let conflicts = 0;

	for (const e of local.entries) {
		if (e.id === undefined) noId.push(e);
		else if (!byId.has(e.id)) {
			byId.set(e.id, JSON.stringify(e));
			merged.push(e);
		}
	}
	for (const e of remote.entries) {
		if (e.id === undefined) {
			if (!localText) noId.push(e);
			continue;
		}
		const existing = byId.get(e.id);
		if (existing === undefined) {
			byId.set(e.id, JSON.stringify(e));
			merged.push(e);
			added++;
		} else if (existing !== JSON.stringify(e)) conflicts++;
	}

	// Array.prototype.sort is stable: ties keep local-before-remote input order.
	merged.sort((a, b) => {
		const ta = String(a.timestamp ?? "");
		const tb = String(b.timestamp ?? "");
		return ta < tb ? -1 : ta > tb ? 1 : 0;
	});

	const lines = [...(header ? [header] : []), ...merged, ...noId].map((l) => JSON.stringify(l));
	const text = lines.length ? `${lines.join("\n")}\n` : "";
	return { text, added, conflicts, changed: text !== localText };
}
