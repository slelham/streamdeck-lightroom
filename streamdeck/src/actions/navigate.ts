import {
  action,
  type DialRotateEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";
import { formatFlag, formatRating } from "../utils/format";

type NavSettings = {
  direction?: "next" | "previous";
};

@action({ UUID: "com.cursor.lightroom.navigate" })
export class NavigateAction extends SingletonAction<NavSettings> {
  override onWillAppear(ev: WillAppearEvent<NavSettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<NavSettings>): Promise<void> {
    const direction = ev.payload.settings.direction ?? "next";
    const cmd = direction === "previous" ? "previousPhoto" : "nextPhoto";
    const ok = await bridge.sendSafe({ cmd });
    if (!ok) await ev.action.showAlert();
    await this.paint(ev.action, ev.payload.settings);
  }

  override async onDialRotate(ev: DialRotateEvent<NavSettings>): Promise<void> {
    const cmd = ev.payload.ticks > 0 ? "nextPhoto" : "previousPhoto";
    for (let i = 0; i < Math.abs(ev.payload.ticks); i++) {
      await bridge.sendSafe({ cmd });
    }
    await this.paint(ev.action, ev.payload.settings);
  }

  async paint(
    action: {
      setTitle(title: string): Promise<void>;
      setFeedback?(feedback: Record<string, unknown>): Promise<void>;
    },
    settings: NavSettings,
  ): Promise<void> {
    const direction = settings.direction ?? "next";
    const arrow = direction === "previous" ? "◀ Prev" : "Next ▶";
    const meta = `${formatRating(bridge.state.rating)} ${formatFlag(bridge.state.flag)}`;
    await action.setTitle(`${arrow}\n${meta}`);
    if (action.setFeedback) {
      await action.setFeedback({
        title: "Photo",
        value: meta,
      });
    }
  }
}
