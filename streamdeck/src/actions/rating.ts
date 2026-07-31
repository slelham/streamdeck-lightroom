import {
  action,
  type DialRotateEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";
import { formatRating } from "../utils/format";

type RatingSettings = {
  mode?: "set" | "increase" | "decrease" | "cycle";
  rating?: number;
  autoAdvance?: boolean;
};

@action({ UUID: "com.cursor.lightroom.rating" })
export class RatingAction extends SingletonAction<RatingSettings> {
  override onWillAppear(ev: WillAppearEvent<RatingSettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<RatingSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const mode = settings.mode ?? "set";
    let ok = false;

    if (mode === "increase") {
      ok = await bridge.sendSafe({ cmd: "increaseRating" });
    } else if (mode === "decrease") {
      ok = await bridge.sendSafe({ cmd: "decreaseRating" });
    } else if (mode === "cycle") {
      const current = bridge.state.rating ?? 0;
      const next = current >= 5 ? 0 : current + 1;
      ok = await bridge.sendSafe({ cmd: "setRating", rating: next });
    } else {
      ok = await bridge.sendSafe({ cmd: "setRating", rating: Number(settings.rating ?? 0) });
    }

    if (ok && settings.autoAdvance) {
      await bridge.sendSafe({ cmd: "nextPhoto" });
    }

    if (!ok) await ev.action.showAlert();
    await this.paint(ev.action, settings);
  }

  override async onDialRotate(ev: DialRotateEvent<RatingSettings>): Promise<void> {
    const ticks = ev.payload.ticks;
    const cmd = ticks > 0 ? "increaseRating" : "decreaseRating";
    for (let i = 0; i < Math.abs(ticks); i++) {
      await bridge.sendSafe({ cmd });
    }
    await this.paint(ev.action, ev.payload.settings);
  }

  async paint(
    action: { setTitle(title: string): Promise<void>; setFeedback?(feedback: Record<string, unknown>): Promise<void> },
    settings: RatingSettings,
  ): Promise<void> {
    const live = formatRating(bridge.state.rating);
    const mode = settings.mode ?? "set";
    if (mode === "set") {
      await action.setTitle(`${Number(settings.rating ?? 0)}★\n${live}`);
    } else if (mode === "increase") {
      await action.setTitle(`★ +\n${live}`);
    } else if (mode === "decrease") {
      await action.setTitle(`★ -\n${live}`);
    } else {
      await action.setTitle(`★\n${live}`);
    }
    if (action.setFeedback) {
      await action.setFeedback({ title: "Rating", value: live });
    }
  }
}
