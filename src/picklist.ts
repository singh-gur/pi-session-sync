import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, SettingsList } from "@earendil-works/pi-tui";

export type PickItem = { id: string; label: string; checked: boolean };

/** Multi-select list (pattern from examples/extensions/tools.ts). Returns selected ids, or undefined if cancelled. */
export async function pickSessions(ctx: ExtensionContext, title: string, items: PickItem[]): Promise<string[] | undefined> {
	if (ctx.mode !== "tui") return items.filter((i) => i.checked).map((i) => i.id);

	const selected = new Set(items.filter((i) => i.checked).map((i) => i.id));
	await ctx.ui.custom<void>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild({
			render: () => [theme.fg("accent", theme.bold(title)), theme.fg("dim", "space/enter toggle · esc done"), ""],
			invalidate() {},
		});
		const list = new SettingsList(
			items.map((i) => ({ id: i.id, label: i.label, currentValue: i.checked ? "on" : "off", values: ["on", "off"] })),
			Math.min(items.length + 2, 15),
			getSettingsListTheme(),
			(id, value) => (value === "on" ? selected.add(id) : selected.delete(id)),
			() => done(undefined),
		);
		container.addChild(list);
		return {
			capturesViewportInput: list.capturesViewportInput,
			render: (w: number) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput(data: string) {
				list.handleInput?.(data);
				tui.requestRender();
			},
		};
	});

	if (selected.size === 0) return undefined;
	const ok = await ctx.ui.confirm(title, `Sync ${selected.size} session(s)?`);
	return ok ? items.filter((i) => selected.has(i.id)).map((i) => i.id) : undefined;
}
