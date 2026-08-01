import {
  action,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";

type CommandSettings = {
  command?:
    | "undo"
    | "redo"
    | "autoTone"
    | "resetAll"
    | "zoomToggle"
    | "zoomOneToOne"
    | "editInPhotoshop"
    | "copySettings"
    | "pasteSettings"
    | "selectSubject"
    | "selectSky"
    | "selectBackground"
    | "selectPeople"
    | "uprightLevel"
    | "uprightAuto"
    | "uprightVertical"
    | "uprightFull"
    | "uprightOff"
    | "showModule"
    | "showView"
    | "selectTool"
    | "createMask";
  module?: "library" | "develop" | "map" | "book" | "slideshow" | "print" | "web";
  view?: string;
  tool?: string;
  maskType?: string;
  subtype?: string;
  title?: string;
};

const LABELS: Record<string, string> = {
  undo: "Undo",
  redo: "Redo",
  autoTone: "Auto\nTone",
  resetAll: "Reset\nAll",
  zoomToggle: "Zoom\nToggle",
  zoomOneToOne: "Zoom\n1:1",
  editInPhotoshop: "Edit in\nPS",
  copySettings: "Copy\nSettings",
  pasteSettings: "Paste\nSettings",
  selectSubject: "Select\nSubject",
  selectSky: "Select\nSky",
  selectBackground: "Select\nBg",
  selectPeople: "Select\nPeople",
  uprightLevel: "Level\nHorizon",
  uprightAuto: "Upright\nAuto",
  uprightVertical: "Upright\nVert",
  uprightFull: "Upright\nFull",
  uprightOff: "Upright\nOff",
};

@action({ UUID: "com.cursor.lightroom.command" })
export class CommandAction extends SingletonAction<CommandSettings> {
  override onWillAppear(ev: WillAppearEvent<CommandSettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<CommandSettings>): Promise<void> {
    await this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<CommandSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const command = settings.command ?? "undo";
    const payload: Record<string, unknown> = { cmd: command };

    if (command === "showModule") payload.module = settings.module ?? "develop";
    if (command === "showView") payload.view = settings.view ?? "loupe";
    if (command === "selectTool") payload.tool = settings.tool ?? "crop";
    if (command === "createMask") {
      payload.maskType = settings.maskType ?? "aiSelection";
      payload.subtype = settings.subtype;
    }

    const ok = await bridge.sendSafe(payload as { cmd: string });
    if (!ok) await ev.action.showAlert();
    else await ev.action.showOk();
  }

  async paint(
    action: { setTitle(title: string): Promise<void> },
    settings: CommandSettings,
  ): Promise<void> {
    if (settings.title) {
      await action.setTitle(settings.title);
      return;
    }
    const command = settings.command ?? "undo";
    if (command === "showModule") {
      await action.setTitle(`Module\n${settings.module ?? "develop"}`);
      return;
    }
    if (command === "showView") {
      await action.setTitle(`View\n${settings.view ?? "loupe"}`);
      return;
    }
    if (command === "selectTool") {
      await action.setTitle(`Tool\n${settings.tool ?? "crop"}`);
      return;
    }
    await action.setTitle(LABELS[command] ?? command);
  }
}
