import {
  action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";
import { formatFlag } from "../utils/format";

type FlagSettings = {
  flag?: "pick" | "reject" | "none" | "toggle-pick" | "toggle-reject";
  autoAdvance?: boolean;
};

@action({ UUID: "com.cursor.lightroom.flag" })
export class FlagAction extends SingletonAction<FlagSettings> {
  override onWillAppear(ev: WillAppearEvent<FlagSettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<FlagSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const mode = settings.flag ?? "pick";
    const current = bridge.state.flag ?? 0;

    let flag: "pick" | "reject" | "none" = "pick";
    if (mode === "toggle-pick") {
      flag = current === 1 ? "none" : "pick";
    } else if (mode === "toggle-reject") {
      flag = current === -1 ? "none" : "reject";
    } else {
      flag = mode;
    }

    const ok = await bridge.sendSafe({ cmd: "flag", flag });
    if (ok && settings.autoAdvance && (flag === "pick" || flag === "reject")) {
      await bridge.sendSafe({ cmd: "nextPhoto" });
    }
    if (!ok) await ev.action.showAlert();
    await this.paint(ev.action, settings);
  }

  async paint(
    action: { setTitle(title: string): Promise<void> },
    settings: FlagSettings,
  ): Promise<void> {
    const live = formatFlag(bridge.state.flag);
    const mode = settings.flag ?? "pick";
    const label =
      mode === "pick" || mode === "toggle-pick"
        ? "Pick"
        : mode === "reject" || mode === "toggle-reject"
          ? "Reject"
          : "Unflag";
    await action.setTitle(`${label}\n${live}`);
  }
}
