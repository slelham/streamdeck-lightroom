import {
  action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { sendCullThenAdvance } from "../utils/advance";
import { bridge } from "../bridge/client";
import { asBool } from "../utils/settings";

type LabelSettings = {
  label?: "red" | "yellow" | "green" | "blue" | "purple" | "none";
  autoAdvance?: boolean | string;
};

@action({ UUID: "com.cursor.lightroom.label" })
export class LabelAction extends SingletonAction<LabelSettings> {
  override onWillAppear(ev: WillAppearEvent<LabelSettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<LabelSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const label = settings.label ?? "red";
    const current = (bridge.state.label || "none").toLowerCase();
    const next = current === label ? "none" : label;
    const advance = asBool(settings.autoAdvance) && next !== "none";
    const ok = await sendCullThenAdvance({ cmd: "label", label: next }, advance);
    if (!ok) await ev.action.showAlert();
    await this.paint(ev.action, settings);
  }

  async paint(
    action: { setTitle(title: string): Promise<void> },
    settings: LabelSettings,
  ): Promise<void> {
    const target = settings.label ?? "red";
    const live = bridge.state.label || "none";
    const active = live.toLowerCase() === target ? "●" : "○";
    await action.setTitle(`${target}\n${active} ${live}`);
  }
}
