import {
  action,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";

type LabelFilterSettings = {
  /** Comma-separated or preset: blue-green, blue, green, etc. */
  labels?: string;
  title?: string;
};

function parseLabels(raw: string | undefined): string[] {
  const value = (raw ?? "blue-green").trim().toLowerCase();
  if (value === "blue-green" || value === "green-blue") return ["blue", "green"];
  return value
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function labelsKey(labels: string[]): string {
  return [...labels].map((l) => l.toLowerCase()).sort().join(",");
}

@action({ UUID: "com.cursor.lightroom.label-filter" })
export class LabelFilterAction extends SingletonAction<LabelFilterSettings> {
  override onWillAppear(ev: WillAppearEvent<LabelFilterSettings>): void {
    void this.paint(ev.action, ev.payload.settings);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<LabelFilterSettings>,
  ): Promise<void> {
    await this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<LabelFilterSettings>): Promise<void> {
    const labels = parseLabels(ev.payload.settings.labels);
    const ok = await bridge.sendSafe({
      cmd: "toggleLabelFilter",
      labels,
    });
    if (!ok) await ev.action.showAlert();
    await this.paint(ev.action, ev.payload.settings);
  }

  async paint(
    action: { setTitle(title: string): Promise<void>; setState?(state: number): Promise<void> },
    settings: LabelFilterSettings,
  ): Promise<void> {
    const wanted = parseLabels(settings.labels);
    const short =
      settings.title ||
      (wanted.length === 2 && wanted.includes("blue") && wanted.includes("green")
        ? "Blue+\nGreen"
        : wanted.map((w) => w[0]?.toUpperCase() + w.slice(1)).join("\n") || "Labels");

    const filter = bridge.state.viewFilter;
    const activeLabels = filter?.labels ?? [];
    const on =
      !!filter?.active &&
      labelsKey(activeLabels) === labelsKey(wanted) &&
      !(filter.pick && filter.pick.length > 0);

    await action.setTitle(on ? `${short}\n●` : `${short}\n○`);
    if (action.setState) {
      await action.setState(on ? 0 : 1);
    }
  }
}
