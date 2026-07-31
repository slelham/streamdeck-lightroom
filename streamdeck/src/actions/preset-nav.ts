import {
  action,
  type DialRotateEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";
import type { PresetBrowserState } from "../bridge/types";

type NavSettings = {
  action?: "nextFolder" | "prevFolder" | "nextPage" | "prevPage" | "refresh";
};

function browser(): PresetBrowserState | undefined {
  return bridge.state.presetBrowser;
}

@action({ UUID: "com.cursor.lightroom.preset-nav" })
export class PresetNavAction extends SingletonAction<NavSettings> {
  override onWillAppear(ev: WillAppearEvent<NavSettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<NavSettings>): Promise<void> {
    const nav = ev.payload.settings.action ?? "nextFolder";
    const ok = await bridge.sendSafe({ cmd: "presetBrowser", action: nav, pageSize: 8 });
    if (!ok) await ev.action.showAlert();
    // State push from Lightroom will refresh titles; paint optimistically too
    await this.paint(ev.action, ev.payload.settings);
  }

  override async onDialRotate(ev: DialRotateEvent<NavSettings>): Promise<void> {
    const actionName = ev.payload.ticks > 0 ? "nextFolder" : "prevFolder";
    await bridge.sendSafe({ cmd: "presetBrowser", action: actionName, pageSize: 8 });
    await this.paint(ev.action, ev.payload.settings);
  }

  async paint(
    action: {
      setTitle(title: string): Promise<void>;
      setFeedback?(feedback: Record<string, unknown>): Promise<void>;
    },
    settings: NavSettings,
  ): Promise<void> {
    const b = browser();
    const mode = settings.action ?? "nextFolder";
    const folder = b?.folderName ?? "Presets";
    const page = b ? `${b.pageIndex}/${b.pageCount}` : "—";

    if (mode === "nextFolder" || mode === "prevFolder") {
      const arrow = mode === "prevFolder" ? "◀ Folder" : "Folder ▶";
      await action.setTitle(`${arrow}\n${folder}`);
    } else if (mode === "nextPage" || mode === "prevPage") {
      const arrow = mode === "prevPage" ? "◀ Page" : "Page ▶";
      await action.setTitle(`${arrow}\n${page}`);
    } else {
      await action.setTitle(`Presets\n${folder}`);
    }

    if (action.setFeedback) {
      await action.setFeedback({ title: folder, value: `p ${page}` });
    }
  }
}
