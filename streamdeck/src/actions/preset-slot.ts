import {
  action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";

type SlotSettings = {
  /** 1-based slot index on the current browser page */
  slot?: number;
  pageSize?: number;
};

function truncate(name: string, max = 18): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

@action({ UUID: "com.cursor.lightroom.preset-slot" })
export class PresetSlotAction extends SingletonAction<SlotSettings> {
  override onWillAppear(ev: WillAppearEvent<SlotSettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<SlotSettings>): Promise<void> {
    const slot = Number(ev.payload.settings.slot ?? 1);
    const pageSize = Number(ev.payload.settings.pageSize ?? 8);
    const ok = await bridge.sendSafe({ cmd: "applyPreset", slot, pageSize });
    if (!ok) await ev.action.showAlert();
    else await ev.action.showOk();
    await this.paint(ev.action, ev.payload.settings);
  }

  async paint(
    action: { setTitle(title: string): Promise<void> },
    settings: SlotSettings,
  ): Promise<void> {
    const slot = Number(settings.slot ?? 1);
    const browser = bridge.state.presetBrowser;
    const item = browser?.slots?.[slot - 1];
    if (!item || item.empty) {
      await action.setTitle(`Preset ${slot}\n—`);
      return;
    }
    const folder = browser?.folderName ?? "";
    await action.setTitle(`${truncate(item.name)}\n${truncate(folder, 14)}`);
  }
}
