import streamDeck, {
  action,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type SendToPluginEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";
import type { PresetFolder } from "../bridge/types";

type ApplySettings = {
  uuid?: string;
  name?: string;
  folder?: string;
};

type DataSourceItem =
  | { label?: string; value: string; disabled?: boolean }
  | { label?: string; children: { label?: string; value: string; disabled?: boolean }[] };

@action({ UUID: "com.cursor.lightroom.preset-apply" })
export class PresetApplyAction extends SingletonAction<ApplySettings> {
  override onWillAppear(ev: WillAppearEvent<ApplySettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ApplySettings>): Promise<void> {
    await this.paint(ev.action, ev.payload.settings);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<{ event?: string }, ApplySettings>): Promise<void> {
    if (ev.payload?.event !== "getPresets") {
      return;
    }

    const folders = await this.fetchFolders();
    const items: DataSourceItem[] = folders.map((folder) => ({
      label: `${folder.name} (${(folder.presets || []).length})`,
      children: (folder.presets || []).map((preset) => ({
        label: preset.name,
        value: preset.uuid,
      })),
    }));

    await streamDeck.ui.sendToPropertyInspector({
      event: "getPresets",
      items,
    });
  }

  override async onKeyDown(ev: KeyDownEvent<ApplySettings>): Promise<void> {
    const uuid = ev.payload.settings.uuid;
    if (!uuid) {
      await ev.action.showAlert();
      return;
    }

    if (!ev.payload.settings.name) {
      const folders = await this.fetchFolders();
      for (const folder of folders) {
        const hit = (folder.presets || []).find((p) => p.uuid === uuid);
        if (hit) {
          await ev.action.setSettings({
            ...ev.payload.settings,
            name: hit.name,
            folder: folder.name,
          });
          break;
        }
      }
    }

    const ok = await bridge.sendSafe({ cmd: "applyPreset", uuid });
    if (!ok) await ev.action.showAlert();
    else await ev.action.showOk();
  }

  private fetchFolders(): Promise<PresetFolder[]> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        bridge.off("ack", onAck);
        resolve([]);
      }, 2000);

      const onAck = (msg: {
        type?: string;
        ok?: boolean;
        data?: { folders?: PresetFolder[] };
      }) => {
        if (msg?.type === "ack" && Array.isArray(msg.data?.folders)) {
          clearTimeout(timer);
          bridge.off("ack", onAck);
          resolve(msg.data?.folders ?? []);
        }
      };

      bridge.on("ack", onAck);
      void bridge.sendSafe({ cmd: "listPresets" }).then((ok) => {
        if (!ok) {
          clearTimeout(timer);
          bridge.off("ack", onAck);
          resolve([]);
        }
      });
    });
  }

  async paint(
    action: { setTitle(title: string): Promise<void> },
    settings: ApplySettings,
  ): Promise<void> {
    if (!settings.uuid) {
      await action.setTitle("Preset\n(pick)");
      return;
    }
    const name = settings.name ?? "Preset";
    const short = name.length > 16 ? `${name.slice(0, 15)}…` : name;
    const folder = settings.folder ? `\n${settings.folder}` : "";
    await action.setTitle(`${short}${folder}`);
  }
}
