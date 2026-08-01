import {
  action,
  type DialDownEvent,
  type DialRotateEvent,
  type DidReceiveSettingsEvent,
  type TouchTapEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";
import { formatFlag, formatRating } from "../utils/format";

type CullDialSettings = {
  /** What rotate adjusts: rating (default), or navigate photos */
  rotateMode?: "rating" | "navigate";
  /** Dial press action */
  pressAction?: "next" | "previous" | "zoomOneToOne";
  /** Touch-strip tap action */
  tapAction?: "zoomOneToOne" | "zoomToggle" | "next" | "previous";
};

/**
 * Stream Deck+ cull dial — Pro-style:
 * rotate = rating (or navigate), press = advance, tap = zoom 1:1.
 */
@action({ UUID: "com.cursor.lightroom.cull-dial" })
export class CullDialAction extends SingletonAction<CullDialSettings> {
  override onWillAppear(ev: WillAppearEvent<CullDialSettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<CullDialSettings>): Promise<void> {
    await this.paint(ev.action, ev.payload.settings);
  }

  override async onDialRotate(ev: DialRotateEvent<CullDialSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const ticks = ev.payload.ticks;
    const mode = settings.rotateMode ?? "rating";
    let ok = true;

    if (mode === "navigate") {
      const cmd = ticks > 0 ? "nextPhoto" : "previousPhoto";
      for (let i = 0; i < Math.abs(ticks); i++) {
        ok = (await bridge.sendSafe({ cmd })) && ok;
      }
    } else {
      const cmd = ticks > 0 ? "increaseRating" : "decreaseRating";
      for (let i = 0; i < Math.abs(ticks); i++) {
        ok = (await bridge.sendSafe({ cmd })) && ok;
      }
    }

    if (!ok) await ev.action.showAlert();
    await this.paint(ev.action, settings);
  }

  override async onDialDown(ev: DialDownEvent<CullDialSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const press = settings.pressAction ?? "next";
    const cmd =
      press === "previous"
        ? "previousPhoto"
        : press === "zoomOneToOne"
          ? "zoomOneToOne"
          : "nextPhoto";
    const ok = await bridge.sendSafe({ cmd });
    if (!ok) await ev.action.showAlert();
    await this.paint(ev.action, settings);
  }

  override async onTouchTap(ev: TouchTapEvent<CullDialSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const tap = settings.tapAction ?? "zoomOneToOne";
    const cmd =
      tap === "zoomToggle"
        ? "zoomToggle"
        : tap === "next"
          ? "nextPhoto"
          : tap === "previous"
            ? "previousPhoto"
            : "zoomOneToOne";
    const ok = await bridge.sendSafe({ cmd });
    if (!ok) await ev.action.showAlert();
    await this.paint(ev.action, settings);
  }

  async paint(
    action: {
      setTitle(title: string): Promise<void>;
      setFeedback?(feedback: Record<string, unknown>): Promise<void>;
    },
    _settings: CullDialSettings,
  ): Promise<void> {
    const rating = formatRating(bridge.state.rating);
    const flag = formatFlag(bridge.state.flag);
    await action.setTitle(`${rating}\n${flag}`);
    if (action.setFeedback) {
      await action.setFeedback({
        title: "Cull",
        value: `${rating} ${flag}`,
      });
    }
  }
}
