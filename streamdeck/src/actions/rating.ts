import {
  action,
  type DialRotateEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";
import { formatRating } from "../utils/format";
import { asBool } from "../utils/settings";

type RatingSettings = {
  mode?: "set" | "increase" | "decrease" | "cycle";
  rating?: number;
  autoAdvance?: boolean | string;
};

@action({ UUID: "com.cursor.lightroom.rating" })
export class RatingAction extends SingletonAction<RatingSettings> {
  override onWillAppear(ev: WillAppearEvent<RatingSettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<RatingSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const mode = settings.mode ?? "set";
    const advance = asBool(settings.autoAdvance);
    let ok = false;

    if (mode === "increase") {
      ok = await bridge.sendSafe({ cmd: "increaseRating", advance });
    } else if (mode === "decrease") {
      ok = await bridge.sendSafe({ cmd: "decreaseRating", advance });
    } else if (mode === "cycle") {
      const current = bridge.state.rating ?? 0;
      const next = current >= 5 ? 0 : current + 1;
      ok = await bridge.sendSafe({ cmd: "setRating", rating: next, advance });
    } else {
      ok = await bridge.sendSafe({
        cmd: "setRating",
        rating: Number(settings.rating ?? 0),
        advance,
      });
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
    action: {
      setTitle(title: string): Promise<void>;
      setFeedback?(feedback: Record<string, unknown>): Promise<void>;
      setState?(state: number): Promise<void>;
    },
    settings: RatingSettings,
  ): Promise<void> {
    const live = formatRating(bridge.state.rating);
    const liveN = Math.max(0, Math.min(5, Math.round(bridge.state.rating ?? 0)));
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
    // State mirrors live rating (0–5) for set/cycle keys; for ± keys, 1 when any stars
    if (action.setState) {
      if (mode === "set") {
        const target = Math.max(0, Math.min(5, Math.round(Number(settings.rating ?? 0))));
        await action.setState(liveN === target ? 1 : 0);
      } else {
        await action.setState(liveN > 0 ? 1 : 0);
      }
    }
  }
}
