import {
  action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";
import { formatFlag } from "../utils/format";
import { asBool } from "../utils/settings";

type FlagSettings = {
  flag?: "pick" | "reject" | "none" | "toggle-pick" | "toggle-reject";
  autoAdvance?: boolean | string;
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
    // Default ON for culling (profile keys + newly dragged keys)
    const advance =
      settings.autoAdvance === undefined ? true : asBool(settings.autoAdvance);

    let flag: "pick" | "reject" | "none" = "pick";
    if (mode === "toggle-pick") {
      flag = current === 1 ? "none" : "pick";
    } else if (mode === "toggle-reject") {
      flag = current === -1 ? "none" : "reject";
    } else {
      flag = mode;
    }

    // Single LR command: flag + optional advance (avoids async race with nextPhoto)
    const ok = await bridge.sendSafe({
      cmd: "flag",
      flag,
      advance: advance && (flag === "pick" || flag === "reject"),
    });
    if (!ok) await ev.action.showAlert();
    await this.paint(ev.action, settings);
  }

  async paint(
    action: {
      setTitle(title: string): Promise<void>;
      setState?(state: number): Promise<void>;
      setImage?(path: string): Promise<void>;
    },
    settings: FlagSettings,
  ): Promise<void> {
    const live = formatFlag(bridge.state.flag);
    const mode = settings.flag ?? "pick";
    const current = bridge.state.flag ?? 0;
    const isPickMode = mode === "pick" || mode === "toggle-pick";
    const isRejectMode = mode === "reject" || mode === "toggle-reject";
    const active =
      (isPickMode && current === 1) ||
      (isRejectMode && current === -1) ||
      (mode === "none" && current === 0);

    const label = isPickMode ? "Pick" : isRejectMode ? "Reject" : "Unflag";
    await action.setTitle(`${label}\n${live}`);

    // Live key art: pick/reject/unflag each have idle + active images
    if (action.setImage) {
      const base = isRejectMode || mode === "none" ? "reject" : "flag";
      const suffix = active ? "-active" : "";
      await action.setImage(`imgs/actions/${base}${suffix}`);
    } else if (action.setState) {
      await action.setState(active ? 1 : 0);
    }
  }
}
