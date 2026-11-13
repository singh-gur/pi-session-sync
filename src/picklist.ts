import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { type Component, getKeybindings, getSelectPageIndex, truncateToWidth } from "@earendil-works/pi-tui";

export type PickItem = { id: string; label: string; checked: boolean };
type Style = Pick<Theme, "fg" | "bold">;

/** Checkbox list: ↑/↓ move, space toggles, `a` toggles all, enter confirms, esc cancels. */
export class MultiSelect implements Component {
	readonly capturesViewportInput = true;
	cursor = 0;
	readonly selected: Set<string>;

	private title: string;
	private verb: string;
	private items: PickItem[];
	private style: Style;
	private done: (ids: string[] | undefined) => void;
	private maxVisible = 12;

	constructor(title: string, verb: string, items: PickItem[], style: Style, done: (ids: string[] | undefined) => void) {
		this.title = title;
		this.verb = verb;
		this.items = items;
		this.style = style;
		this.done = done;
		this.selected = new Set(items.filter((i) => i.checked).map((i) => i.id));
	}

	invalidate() {}

	handleInput(data: string) {
		const kb = getKeybindings();
		const n = this.items.length;
		const page = getSelectPageIndex(kb, data, this.cursor, n, this.maxVisible);
		if (kb.matches(data, "tui.select.up")) this.cursor = (this.cursor - 1 + n) % n;
		else if (kb.matches(data, "tui.select.down")) this.cursor = (this.cursor + 1) % n;
		else if (page !== undefined) this.cursor = page;
		else if (data === " ") {
			const id = this.items[this.cursor]!.id;
			if (!this.selected.delete(id)) this.selected.add(id);
		} else if (data === "a" || data === "A") {
			if (this.selected.size === n) this.selected.clear();
			else for (const i of this.items) this.selected.add(i.id);
		} else if (kb.matches(data, "tui.select.confirm")) this.done(this.items.filter((i) => this.selected.has(i.id)).map((i) => i.id));
		else if (kb.matches(data, "tui.select.cancel")) this.done(undefined);
	}

	render(width: number): string[] {
		const fg: Style["fg"] = (c, t) => this.style.fg(c, t);
		const bold = (t: string) => this.style.bold(t);
		const n = this.items.length;
		const start = Math.max(0, Math.min(this.cursor - Math.floor(this.maxVisible / 2), n - this.maxVisible));
		const end = Math.min(n, start + this.maxVisible);
		const lines = [fg("accent", bold(this.title)) + fg("muted", `  ${this.selected.size}/${n} selected`), ""];
		for (let i = start; i < end; i++) {
			const item = this.items[i]!;
			const on = this.selected.has(item.id);
			const box = on ? fg("success", "[x]") : fg("dim", "[ ]");
			const row = i === this.cursor ? `${fg("accent", "›")} ${box} ${fg("accent", item.label)}` : `  ${box} ${item.label}`;
			lines.push(truncateToWidth(row, width));
		}
		if (start > 0 || end < n) lines.push(fg("dim", `  (${this.cursor + 1}/${n})`));
		lines.push("", fg("dim", truncateToWidth(`↑↓ move · space select · a all/none · enter ${this.verb} · esc cancel`, width)));
		return lines;
	}
}

/** Returns selected ids (possibly empty), or undefined if cancelled. */
export async function pickSessions(ctx: ExtensionContext, title: string, verb: string, items: PickItem[]): Promise<string[] | undefined> {
	if (ctx.mode !== "tui") return items.filter((i) => i.checked).map((i) => i.id);
	return ctx.ui.custom<string[] | undefined>((tui, theme, _kb, done) => {
		const list = new MultiSelect(title, verb, items, theme, done);
		return {
			capturesViewportInput: true,
			render: (w: number) => list.render(w),
			invalidate: () => list.invalidate(),
			handleInput(data: string) {
				list.handleInput(data);
				tui.requestRender();
			},
		};
	});
}
