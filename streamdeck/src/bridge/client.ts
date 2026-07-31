import { EventEmitter } from "node:events";
import net from "node:net";

import {
  DEFAULT_RECEIVE_PORT,
  DEFAULT_SEND_PORT,
  type BridgeCommand,
  type BridgeInbound,
  type LightroomState,
} from "./types";

export type BridgeEvents = {
  state: [LightroomState];
  connected: [];
  disconnected: [];
  ack: [BridgeInbound];
};

/**
 * Talks to the Lightroom companion plug-in over dual localhost TCP sockets.
 * Lightroom owns both listeners; we connect as clients.
 */
export class LightroomBridge extends EventEmitter {
  private commandSocket: net.Socket | null = null;
  private stateSocket: net.Socket | null = null;
  private commandBuffer = "";
  private stateBuffer = "";
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldRun = false;
  private nextId = 1;
  private _connected = false;
  private lastState: LightroomState = {};

  constructor(
    private receivePort = DEFAULT_RECEIVE_PORT,
    private sendPort = DEFAULT_SEND_PORT,
  ) {
    super();
  }

  get connected(): boolean {
    return this._connected;
  }

  get state(): LightroomState {
    return this.lastState;
  }

  start(): void {
    this.shouldRun = true;
    this.connectBoth();
  }

  stop(): void {
    this.shouldRun = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.commandSocket?.destroy();
    this.stateSocket?.destroy();
    this.commandSocket = null;
    this.stateSocket = null;
    this.setConnected(false);
  }

  async send(command: BridgeCommand): Promise<void> {
    if (!this.commandSocket || this.commandSocket.destroyed) {
      throw new Error("Lightroom bridge not connected");
    }
    const payload = {
      id: command.id ?? String(this.nextId++),
      ...command,
    };
    this.commandSocket.write(`${JSON.stringify(payload)}\n`);
  }

  async sendSafe(command: BridgeCommand): Promise<boolean> {
    try {
      await this.send(command);
      return true;
    } catch {
      return false;
    }
  }

  private connectBoth(): void {
    this.connectCommand();
    this.connectState();
  }

  private connectCommand(): void {
    if (!this.shouldRun || (this.commandSocket && !this.commandSocket.destroyed)) {
      return;
    }

    const socket = net.createConnection({ host: "127.0.0.1", port: this.receivePort });
    this.commandSocket = socket;
    this.commandBuffer = "";

    socket.setEncoding("utf8");
    socket.on("connect", () => this.refreshConnected());
    socket.on("data", (chunk: string) => {
      this.commandBuffer += chunk;
      // Command port usually only acks via send port; ignore unexpected data.
      this.commandBuffer = "";
    });
    socket.on("error", () => {
      /* reconnect loop handles this */
    });
    socket.on("close", () => {
      this.commandSocket = null;
      this.refreshConnected();
      this.scheduleReconnect();
    });
  }

  private connectState(): void {
    if (!this.shouldRun || (this.stateSocket && !this.stateSocket.destroyed)) {
      return;
    }

    const socket = net.createConnection({ host: "127.0.0.1", port: this.sendPort });
    this.stateSocket = socket;
    this.stateBuffer = "";

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      this.refreshConnected();
      void this.sendSafe({ cmd: "getState" });
    });
    socket.on("data", (chunk: string) => {
      this.stateBuffer += chunk;
      let newline: number;
      while ((newline = this.stateBuffer.indexOf("\n")) >= 0) {
        const line = this.stateBuffer.slice(0, newline).trim();
        this.stateBuffer = this.stateBuffer.slice(newline + 1);
        if (!line) continue;
        this.handleInbound(line);
      }
    });
    socket.on("error", () => {
      /* reconnect loop handles this */
    });
    socket.on("close", () => {
      this.stateSocket = null;
      this.refreshConnected();
      this.scheduleReconnect();
    });
  }

  private handleInbound(line: string): void {
    let msg: BridgeInbound;
    try {
      msg = JSON.parse(line) as BridgeInbound;
    } catch {
      return;
    }

    if (msg.type === "state") {
      this.lastState = msg as LightroomState;
      this.emit("state", this.lastState);
      return;
    }

    if (msg.type === "ack") {
      this.emit("ack", msg);
      const data = (msg as { data?: Record<string, unknown> }).data;
      if (!data) return;

      const hasBrowser =
        Array.isArray(data.slots) || typeof data.folderName === "string";
      const hasState =
        data.params != null ||
        data.rating != null ||
        data.presetBrowser != null ||
        data.folders != null;

      if (hasBrowser) {
        this.lastState = {
          ...this.lastState,
          presetBrowser: data as LightroomState["presetBrowser"],
        };
        this.emit("state", this.lastState);
      } else if (hasState) {
        this.lastState = { ...this.lastState, ...(data as LightroomState) };
        this.emit("state", this.lastState);
      }
    }
  }

  private refreshConnected(): void {
    const next =
      !!this.commandSocket &&
      !this.commandSocket.destroyed &&
      !!this.stateSocket &&
      !this.stateSocket.destroyed;
    this.setConnected(next);
  }

  private setConnected(next: boolean): void {
    if (this._connected === next) return;
    this._connected = next;
    this.emit(next ? "connected" : "disconnected");
  }

  private scheduleReconnect(): void {
    if (!this.shouldRun || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.shouldRun) return;
      if (!this.commandSocket || this.commandSocket.destroyed) this.connectCommand();
      if (!this.stateSocket || this.stateSocket.destroyed) this.connectState();
    }, 1000);
  }
}

export const bridge = new LightroomBridge();
