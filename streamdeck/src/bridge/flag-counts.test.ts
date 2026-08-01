import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";

import { LightroomBridge } from "./client";

async function listen(port: number): Promise<net.Server> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return server;
}

test("flag counts: nested ack updates; pick filter string does not corrupt", async () => {
  const receivePort = 59867;
  const sendPort = 59868;

  const commandServer = await listen(receivePort);
  const stateServer = await listen(sendPort);

  let stateSock: net.Socket | null = null;

  commandServer.on("connection", (socket) => {
    socket.setEncoding("utf8");
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk;
      let n: number;
      while ((n = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, n).trim();
        buf = buf.slice(n + 1);
        if (!line || !stateSock) continue;
        const msg = JSON.parse(line) as { id?: string; cmd: string };
        if (msg.cmd === "getFlagCounts") {
          stateSock.write(
            JSON.stringify({
              type: "ack",
              id: msg.id,
              ok: true,
              data: { flagCounts: { pick: 12, reject: 3, totalFlagged: 12 } },
            }) + "\n",
          );
        } else if (msg.cmd === "setPickFilter") {
          // Real Lightroom ack shape — pick is a filter mode string, not a count
          stateSock.write(
            JSON.stringify({
              type: "ack",
              id: msg.id,
              ok: true,
              data: { pick: "flagged", filter: { active: true, pick: "flagged", labels: [] } },
            }) + "\n",
          );
        } else {
          stateSock.write(JSON.stringify({ type: "ack", id: msg.id, ok: true }) + "\n");
        }
      }
    });
  });

  stateServer.on("connection", (socket) => {
    stateSock = socket;
    socket.setEncoding("utf8");
    socket.write(JSON.stringify({ type: "state", module: "library", flagCounts: { pick: 1, reject: 0 } }) + "\n");
  });

  const bridge = new LightroomBridge(receivePort, sendPort);
  await new Promise<void>((resolve) => {
    bridge.once("connected", () => resolve());
    bridge.start();
  });
  await new Promise((r) => setTimeout(r, 40));

  const countsAck = await bridge.sendAndWait({ cmd: "getFlagCounts" });
  assert.equal(countsAck?.ok, true);
  assert.equal(bridge.state.flagCounts?.pick, 12);
  assert.equal(bridge.state.flagCounts?.reject, 3);

  const filterAck = await bridge.sendAndWait({ cmd: "setPickFilter", pick: "flagged" });
  assert.equal(filterAck?.ok, true);
  // Must NOT become Number("flagged") => NaN
  assert.equal(bridge.state.flagCounts?.pick, 12);
  assert.equal(bridge.state.flagCounts?.reject, 3);
  assert.equal(bridge.state.viewFilter?.pick, "flagged");

  bridge.stop();
  stateSock?.destroy();
  await new Promise<void>((resolve) => commandServer.close(() => resolve()));
  await new Promise<void>((resolve) => stateServer.close(() => resolve()));
});
