import {
  action,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";

type FlagCountSettings = {
  /** What to show on the key */
  display?: "pick" | "reject" | "both";
  /** What happens on press */
  onPress?: "refresh" | "filter-pick" | "filter-reject" | "clear-filter" | "none";
};

@action({ UUID: "com.cursor.lightroom.flag-count" })
export class FlagCountAction extends SingletonAction<FlagCountSettings> {
  override onWillAppear(ev: WillAppearEvent<FlagCountSettings>): void {
    void bridge.sendSafe({ cmd: "getFlagCounts" });
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<FlagCountSettings>,
  ): Promise<void> {
    await this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<FlagCountSettings>): Promise<void> {
    const onPress = ev.payload.settings.onPress ?? "filter-pick";
    let ok = true;

    if (onPress === "refresh" || onPress === "none") {
      ok = await bridge.sendSafe({ cmd: "getFlagCounts" });
    } else if (onPress === "filter-pick") {
      ok = await bridge.sendSafe({ cmd: "setPickFilter", pick: "flagged" });
      await bridge.sendSafe({ cmd: "getFlagCounts" });
    } else if (onPress === "filter-reject") {
      ok = await bridge.sendSafe({ cmd: "setPickFilter", pick: "rejected" });
      await bridge.sendSafe({ cmd: "getFlagCounts" });
    } else if (onPress === "clear-filter") {
      ok = await bridge.sendSafe({ cmd: "clearViewFilter" });
      await bridge.sendSafe({ cmd: "getFlagCounts" });
    }

    if (!ok) await ev.action.showAlert();
    await this.paint(ev.action, ev.payload.settings);
  }

  async paint(
    action: { setTitle(title: string): Promise<void> },
    settings: FlagCountSettings,
  ): Promise<void> {
    const counts = bridge.state.flagCounts;
    const pick = counts?.pick ?? "…";
    const reject = counts?.reject ?? "…";
    const display = settings.display ?? "pick";

    if (display === "reject") {
      await action.setTitle(`Rejects\n${reject}`);
    } else if (display === "both") {
      await action.setTitle(`P ${pick}\nR ${reject}`);
    } else {
      await action.setTitle(`Flagged\n${pick}`);
    }
  }
}
