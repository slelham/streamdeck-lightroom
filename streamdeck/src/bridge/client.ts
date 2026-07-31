import { EventEmitter } from "node:events";
import net from "node:net";

import {
  DEFAULT_RECEIVE_PORT,
  DEFAULT_SEND_PORT,
  type BridgeCommand,
  type BridgeInbound,
  type LightroomState,
} from "./types";

/**
 * Talks to the Lightroom companion plug-in over dual localhost TCP sockets.
 * Lightroom owns both listeners; we connect as clients.
 */
export class LightroomBridge extends EventEmitter {
  private commandSocket: net.Socket | null = null;
  private stateSocket: net.Socket | null = null;
  private stateBuffer = "";
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldRun = false;
  private nextId = 1;
  private _connected = false;
  private lastState: LightroomState = {};
  private connectGeneration = 0;

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
    this.connectGeneration += 1;
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
    const written = this.commandSocket.write(`${JSON.stringify(payload)}\n`);
    if (!written) {
      await new Promise<void>((resolve) => this.commandSocket?.once("drain", () => resolve()));
    }
  }

  async sendSafe(command: BridgeCommand): Promise<boolean> {
    try {
      await this.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /** Wait for an ack with matching id (best-effort). */
  sendAndWait(command: BridgeCommand, timeoutMs = 2000): Promise<BridgeInbound | null> {
    const id = command.id ?? String(this.nextId++);
    const payload = { ...command, id };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.off("ack", onAck);
        resolve(null);
      }, timeoutMs);

      const onAck = (msg: BridgeInbound) => {
        if ((msg as { id?: string }).id === id) {
          clearTimeout(timer);
          this.off("ack", onAck);
          resolve(msg);
        }
      };

      this.on("ack", onAck);
      void this.sendSafe(payload).then((ok) => {
        if (!ok) {
          clearTimeout(timer);
          this.off("ack", onAck);
          resolve(null);
        }
      });
    });
  }

  private connectBoth(): void {
    this.connectCommand();
    this.connectState();
  }

  private connectCommand(): void {
    if (!this.shouldRun || (this.commandSocket && !this.commandSocket.destroyed)) {
      return;
    }

    const generation = this.connectGeneration;
    const socket = net.createConnection({ host: "127.0.0.1", port: this.receivePort });
    this.commandSocket = socket;

    socket.setEncoding("utf8");
    socket.setKeepAlive(true, 5000);
    socket.on("connect", () => {
      if (generation !== this.connectGeneration) return;
      this.refreshConnected();
      this.requestInitialState();
    });
    socket.on("error", () => {
      /* reconnect loop handles this */
    });
    socket.on("close", () => {
      if (this.commandSocket === socket) this.commandSocket = null;
      this.refreshConnected();
      this.scheduleReconnect();
    });
  }

  private connectState(): void {
    if (!this.shouldRun || (this.stateSocket && !this.stateSocket.destroyed)) {
      return;
    }

    const generation = this.connectGeneration;
    const socket = net.createConnection({ host: "127.0.0.1", port: this.sendPort });
    this.stateSocket = socket;
    this.stateBuffer = "";

    socket.setEncoding("utf8");
    socket.setKeepAlive(true, 5000);
    socket.on("connect", () => {
      if (generation !== this.connectGeneration) return;
      this.refreshConnected();
      this.requestInitialState();
    });
    socket.on("data", (chunk: string) => {
      this.stateBuffer += chunk;
      // Cap runaway buffers
      if (this.stateBuffer.length > 1_000_000) {
        this.stateBuffer = this.stateBuffer.slice(-100_000);
      }
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
      if (this.stateSocket === socket) this.stateSocket = null;
      this.refreshConnected();
      this.scheduleReconnect();
    });
  }

  private requestInitialState(): void {
    if (!this._connected) return;
    void this.sendSafe({ cmd: "getState" });
    void this.sendSafe({ cmd: "presetBrowser", action: "refresh", pageSize: 8 });
  }

  private handleInbound(line: string): void {
    let msg: BridgeInbound;
    try {
      msg = JSON.parse(line) as BridgeInbound;
    } catch {
      return;
    }

    if (msg.type === "state") {
      const incoming = msg as LightroomState;
      // Light heartbeats may omit heavier fields; keep the last snapshots
      if (!incoming.presetBrowser && this.lastState.presetBrowser) {
        incoming.presetBrowser = this.lastState.presetBrowser;
      }
      if (!incoming.flagCounts && this.lastState.flagCounts) {
        incoming.flagCounts = this.lastState.flagCounts;
      }
      if (!incoming.viewFilter && this.lastState.viewFilter) {
        incoming.viewFilter = this.lastState.viewFilter;
      }
      this.lastState = incoming;
      this.emit("state", this.lastState);
      return;
    }

    if (msg.type === "ack") {
      this.emit("ack", msg);
      const data = (msg as { data?: Record<string, unknown> }).data;
      if (!data) return;

      let changed = false;
      const next: LightroomState = { ...this.lastState };

      if (Array.isArray(data.slots) || typeof data.folderName === "string") {
        next.presetBrowser = {
          ...(this.lastState.presetBrowser || {}),
          ...(data as LightroomState["presetBrowser"]),
        };
        changed = true;
      }

      if (data.flagCounts && typeof data.flagCounts === "object") {
        next.flagCounts = data.flagCounts as LightroomState["flagCounts"];
        changed = true;
      } else if (data.pick != null || data.reject != null) {
        next.flagCounts = {
          pick: Number(data.pick ?? 0),
          reject: Number(data.reject ?? 0),
          totalFlagged: Number(data.totalFlagged ?? data.pick ?? 0),
        };
        changed = true;
      }

      if (data.filter && typeof data.filter === "object") {
        next.viewFilter = data.filter as LightroomState["viewFilter"];
        changed = true;
      } else if (data.viewFilter && typeof data.viewFilter === "object") {
        next.viewFilter = data.viewFilter as LightroomState["viewFilter"];
        changed = true;
      }

      if (data.params != null || data.rating != null || data.module != null) {
        Object.assign(next, data as LightroomState);
        changed = true;
      }

      if (changed) {
        this.lastState = next;
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
    }, 750);
  }
}

export const bridge = new LightroomBridge();
