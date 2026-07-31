import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";

import { LightroomBridge } from "./client";
import type { LightroomState } from "./types";

async function listen(port: number): Promise<net.Server> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return server;
}

function writeState(socket: net.Socket, state: LightroomState): void {
  socket.write(JSON.stringify({ type: "state", ...state }) + "\n");
}

test("integration: commands, acks, light state merge, reconnect", async () => {
  const receivePort = 59857;
  const sendPort = 59858;

  const commandServer = await listen(receivePort);
  const stateServer = await listen(sendPort);

  const commands: string[] = [];
  let commandSock: net.Socket | null = null;
  let stateSock: net.Socket | null = null;

  commandServer.on("connection", (socket) => {
    commandSock = socket;
    socket.setEncoding("utf8");
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk;
      let n: number;
      while ((n = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, n).trim();
        buf = buf.slice(n + 1);
        if (!line) continue;
        commands.push(line);
        const msg = JSON.parse(line) as { id?: string; cmd: string; action?: string };
        // Simulate Lightroom ack + state on the send socket
        if (stateSock && !stateSock.destroyed) {
          if (msg.cmd === "presetBrowser") {
            stateSock.write(
              JSON.stringify({
                type: "ack",
                id: msg.id,
                ok: true,
                data: {
                  folderName: "Color",
                  folderIndex: 2,
                  pageIndex: 1,
                  pageCount: 3,
                  pageSize: 8,
                  slots: [
                    { index: 1, name: "Warm", uuid: "u1", empty: false },
                    { index: 2, name: "—", uuid: null, empty: true },
                  ],
                },
              }) + "\n",
            );
          } else if (msg.cmd === "nudge") {
            stateSock.write(
              JSON.stringify({
                type: "ack",
                id: msg.id,
                ok: true,
                data: { param: "Exposure", value: 0.2 },
              }) + "\n",
            );
            writeState(stateSock, {
              rating: 3,
              flag: 1,
              module: "develop",
              params: { Exposure: 0.2 },
              // light heartbeat style: omit presetBrowser
            });
          } else {
            stateSock.write(
              JSON.stringify({ type: "ack", id: msg.id, ok: true }) + "\n",
            );
            writeState(stateSock, {
              rating: 2,
              flag: 0,
              label: "red",
              module: "develop",
              params: { Exposure: 0.1 },
              presetBrowser: {
                folderName: "Color",
                pageIndex: 1,
                pageCount: 3,
                slots: [{ index: 1, name: "Warm", uuid: "u1", empty: false }],
              },
            });
          }
        }
      }
    });
  });

  stateServer.on("connection", (socket) => {
    stateSock = socket;
    socket.setEncoding("utf8");
    writeState(socket, {
      rating: 1,
      module: "library",
      params: {},
      presetBrowser: {
        folderName: "Starter",
        pageIndex: 1,
        pageCount: 1,
        slots: [{ index: 1, name: "Base", uuid: "b1", empty: false }],
      },
    });
  });

  const bridge = new LightroomBridge(receivePort, sendPort);
  await new Promise<void>((resolve) => {
    bridge.once("connected", () => resolve());
    bridge.start();
  });

  // Wait for initial getState / presetBrowser
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(commands.some((c) => c.includes('"cmd":"getState"')));
  assert.ok(commands.some((c) => c.includes('"cmd":"presetBrowser"')));

  const browserAck = await bridge.sendAndWait({
    cmd: "presetBrowser",
    action: "nextFolder",
    pageSize: 8,
  });
  assert.ok(browserAck);
  assert.equal((browserAck as { ok?: boolean }).ok, true);
  assert.equal(bridge.state.presetBrowser?.folderName, "Color");
  assert.equal(bridge.state.presetBrowser?.slots?.[0]?.name, "Warm");

  // Light state without presetBrowser should keep previous browser
  await bridge.sendSafe({ cmd: "nudge", param: "Exposure", delta: 0.1 });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(bridge.state.params?.Exposure, 0.2);
  assert.equal(bridge.state.presetBrowser?.folderName, "Color");

  // Drop command socket and ensure reconnect
  commandSock?.destroy();
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(bridge.connected, true);

  bridge.stop();
  stateSock?.destroy();
  await new Promise<void>((resolve) => commandServer.close(() => resolve()));
  await new Promise<void>((resolve) => stateServer.close(() => resolve()));
});
