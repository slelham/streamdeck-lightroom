import streamDeck, {
  action,
  type DialDownEvent,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { bridge } from "../bridge/client";
import { PLUGIN_VERSION_SHORT } from "../version";

@action({ UUID: "com.cursor.lightroom.connection" })
export class ConnectionAction extends SingletonAction {
  override onWillAppear(ev: WillAppearEvent): void {
    void this.refresh(ev.action);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const ok = await bridge.sendSafe({ cmd: "getState" });
    // Also refresh flag counts so Flag Count keys update after Connection press
    await bridge.sendAndWait({ cmd: "getFlagCounts" }, 4000);
    if (!ok) {
      await ev.action.showAlert();
    }
    await this.refresh(ev.action);
  }

  override async onDialDown(ev: DialDownEvent): Promise<void> {
    await this.onKeyDown(ev as unknown as KeyDownEvent);
  }

  async refresh(action: {
    setTitle(title: string): Promise<void>;
    setState?(state: number): Promise<void>;
  }): Promise<void> {
    const on = bridge.connected;
    // Version on every Connection key — easiest way to confirm the install stuck
    await action.setTitle(on ? `${PLUGIN_VERSION_SHORT}\nOnline` : `${PLUGIN_VERSION_SHORT}\nOffline`);
    if (action.setState) {
      await action.setState(on ? 0 : 1);
    }
  }
}

export function wireConnectionUpdates(action: ConnectionAction): void {
  const refreshAll = () => {
    for (const a of action.actions) {
      void action.refresh(a);
    }
  };
  bridge.on("connected", refreshAll);
  bridge.on("disconnected", refreshAll);
  streamDeck.logger.info(`Connection action wired (${PLUGIN_VERSION_SHORT})`);
}
