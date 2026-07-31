import {
  action,
  type DialDownEvent,
  type DialRotateEvent,
  type TouchTapEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";
import { DEFAULT_STEPS, formatParamValue, shortParamName } from "../utils/format";

type DialSettings = {
  param?: string;
  step?: number;
  fineStep?: number;
};

@action({ UUID: "com.cursor.lightroom.slider-dial" })
export class SliderDialAction extends SingletonAction<DialSettings> {
  private tracking = new Map<string, boolean>();

  override onWillAppear(ev: WillAppearEvent<DialSettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onDialRotate(ev: DialRotateEvent<DialSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const param = settings.param ?? "Exposure";
    const base = Number(settings.step ?? DEFAULT_STEPS[param] ?? 1);
    const fine = Number(settings.fineStep ?? base / 5);
    // Stream Deck + reports pressed state for finer control when available
    const pressed = Boolean((ev.payload as { pressed?: boolean }).pressed);
    const step = pressed ? fine : base;
    const delta = ev.payload.ticks * step;

    if (!this.tracking.get(ev.action.id)) {
      await bridge.sendSafe({ cmd: "startTracking", param });
      this.tracking.set(ev.action.id, true);
    }

    const ok = await bridge.sendSafe({ cmd: "nudge", param, delta });
    if (!ok) await ev.action.showAlert();
    await this.paint(ev.action, settings);
  }

  override async onDialDown(ev: DialDownEvent<DialSettings>): Promise<void> {
    const param = ev.payload.settings.param ?? "Exposure";
    await bridge.sendSafe({ cmd: "stopTracking" });
    this.tracking.set(ev.action.id, false);
    const ok = await bridge.sendSafe({ cmd: "resetParam", param });
    if (!ok) await ev.action.showAlert();
    await this.paint(ev.action, ev.payload.settings);
  }

  override async onTouchTap(ev: TouchTapEvent<DialSettings>): Promise<void> {
    // Tap LCD: toggle between coarse feedback refresh / get state
    await bridge.sendSafe({ cmd: "getState" });
    await this.paint(ev.action, ev.payload.settings);
  }

  override onWillDisappear(ev: { action: { id: string } }): void {
    if (this.tracking.get(ev.action.id)) {
      void bridge.sendSafe({ cmd: "stopTracking" });
      this.tracking.set(ev.action.id, false);
    }
  }

  async paint(
    action: {
      setTitle(title: string): Promise<void>;
      setFeedback?(feedback: Record<string, unknown>): Promise<void>;
    },
    settings: DialSettings,
  ): Promise<void> {
    const param = settings.param ?? "Exposure";
    const value = bridge.state.params?.[param];
    const formatted = formatParamValue(param, value);
    await action.setTitle(`${shortParamName(param)}\n${formatted}`);
    if (action.setFeedback) {
      await action.setFeedback({
        title: shortParamName(param),
        value: formatted,
      });
    }
  }
}
