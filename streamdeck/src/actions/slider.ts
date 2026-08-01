import {
  action,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";
import { DEFAULT_STEPS, formatParamValue, shortParamName } from "../utils/format";

type SliderSettings = {
  param?: string;
  step?: number;
  direction?: "up" | "down" | "reset";
};

@action({ UUID: "com.cursor.lightroom.slider" })
export class SliderAction extends SingletonAction<SliderSettings> {
  private holdTimers = new Map<string, NodeJS.Timeout>();

  override onWillAppear(ev: WillAppearEvent<SliderSettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SliderSettings>): Promise<void> {
    await this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<SliderSettings>): Promise<void> {
    const ok = await this.apply(ev.payload.settings);
    if (!ok) {
      await ev.action.showAlert();
      return;
    }
    await this.paint(ev.action, ev.payload.settings);

    // Hold-to-repeat with mild acceleration
    const id = ev.action.id;
    this.clearHold(id);
    let delay = 220;
    const tick = () => {
      void this.apply(ev.payload.settings).then(() => this.paint(ev.action, ev.payload.settings));
      delay = Math.max(60, delay - 20);
      this.holdTimers.set(
        id,
        setTimeout(tick, delay),
      );
    };
    this.holdTimers.set(id, setTimeout(tick, 350));
  }

  override onKeyUp(ev: KeyUpEvent<SliderSettings>): void {
    this.clearHold(ev.action.id);
  }

  override onWillDisappear(ev: { action: { id: string } }): void {
    this.clearHold(ev.action.id);
  }

  private clearHold(id: string): void {
    const t = this.holdTimers.get(id);
    if (t) clearTimeout(t);
    this.holdTimers.delete(id);
  }

  private async apply(settings: SliderSettings): Promise<boolean> {
    const param = settings.param ?? "Exposure";
    const direction = settings.direction ?? "up";
    if (direction === "reset") {
      return bridge.sendSafe({ cmd: "resetParam", param });
    }
    const step = Number(settings.step ?? DEFAULT_STEPS[param] ?? 1);
    const amount = Number.isFinite(step) ? step : (DEFAULT_STEPS[param] ?? 1);
    const delta = direction === "down" ? -Math.abs(amount) : Math.abs(amount);
    return bridge.sendSafe({ cmd: "nudge", param, delta });
  }

  async paint(
    action: { setTitle(title: string): Promise<void> },
    settings: SliderSettings,
  ): Promise<void> {
    const param = settings.param ?? "Exposure";
    const value = bridge.state.params?.[param];
    const dir =
      settings.direction === "down" ? "−" : settings.direction === "reset" ? "↺" : "+";
    await action.setTitle(`${shortParamName(param)} ${dir}\n${formatParamValue(param, value)}`);
  }
}
