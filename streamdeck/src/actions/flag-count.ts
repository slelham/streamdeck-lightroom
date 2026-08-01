import {
  action,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";
import { PLUGIN_VERSION_SHORT } from "../version";

type FlagCountSettings = {
  /** What to show on the key */
  display?: "pick" | "reject" | "both";
  /** What happens on press */
  onPress?: "refresh" | "filter-pick" | "filter-reject" | "clear-filter" | "none";
};

@action({ UUID: "com.cursor.lightroom.flag-count" })
export class FlagCountAction extends SingletonAction<FlagCountSettings> {
  override onWillAppear(ev: WillAppearEvent<FlagCountSettings>): void {
    void this.refreshCounts().then(() => this.paint(ev.action, ev.payload.settings));
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<FlagCountSettings>,
  ): Promise<void> {
    await this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<FlagCountSettings>): Promise<void> {
    const onPress = ev.payload.settings.onPress ?? "filter-pick";
    let ok = true;

    if (!bridge.connected) {
      await ev.action.showAlert();
      await this.paint(ev.action, ev.payload.settings);
      return;
    }

    if (onPress === "filter-pick") {
      const ack = await bridge.sendAndWait({ cmd: "setPickFilter", pick: "flagged" }, 4000);
      ok = Boolean(ack?.ok);
    } else if (onPress === "filter-reject") {
      const ack = await bridge.sendAndWait({ cmd: "setPickFilter", pick: "rejected" }, 4000);
      ok = Boolean(ack?.ok);
    } else if (onPress === "clear-filter") {
      const ack = await bridge.sendAndWait({ cmd: "clearViewFilter" }, 4000);
      ok = Boolean(ack?.ok);
    }

    const countsOk = await this.refreshCounts();
    if (!ok || !countsOk) await ev.action.showAlert();
    await this.paint(ev.action, ev.payload.settings);
  }

  private async refreshCounts(): Promise<boolean> {
    if (!bridge.connected) return false;
    const ack = await bridge.sendAndWait({ cmd: "getFlagCounts" }, 5000);
    return Boolean(ack?.ok && bridge.state.flagCounts);
  }

  async paint(
    action: { setTitle(title: string): Promise<void> },
    settings: FlagCountSettings,
  ): Promise<void> {
    if (!bridge.connected) {
      await action.setTitle(`${PLUGIN_VERSION_SHORT}\nOffline`);
      return;
    }

    const counts = bridge.state.flagCounts;
    const pick = counts?.pick;
    const reject = counts?.reject;
    const pickLabel = typeof pick === "number" && Number.isFinite(pick) ? String(pick) : "…";
    const rejectLabel = typeof reject === "number" && Number.isFinite(reject) ? String(reject) : "…";
    const display = settings.display ?? "pick";

    if (display === "reject") {
      await action.setTitle(`Rejects\n${rejectLabel}`);
    } else if (display === "both") {
      await action.setTitle(`P ${pickLabel}\nR ${rejectLabel}`);
    } else {
      await action.setTitle(`Flagged\n${pickLabel}`);
    }
  }
}
