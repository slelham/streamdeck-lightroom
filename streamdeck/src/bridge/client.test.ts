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

test("bridge connects, sends commands, and receives state", async () => {
  const receivePort = 59847;
  const sendPort = 59848;

  const commandServer = await listen(receivePort);
  const stateServer = await listen(sendPort);

  let gotCommand = "";
  commandServer.on("connection", (socket) => {
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      gotCommand += chunk;
    });
  });

  let stateSocket: net.Socket | null = null;
  stateServer.on("connection", (socket) => {
    stateSocket = socket;
    socket.setEncoding("utf8");
    socket.write(
      JSON.stringify({
        type: "state",
        rating: 4,
        flag: 1,
        label: "red",
        module: "develop",
        params: { Exposure: 0.45 },
      }) + "\n",
    );
  });

  const bridge = new LightroomBridge(receivePort, sendPort);
  const statePromise = new Promise<void>((resolve) => {
    bridge.once("state", (state) => {
      assert.equal(state.rating, 4);
      assert.equal(state.params?.Exposure, 0.45);
      resolve();
    });
  });

  bridge.start();
  await new Promise<void>((resolve) => bridge.once("connected", resolve));
  await statePromise;

  await bridge.send({ cmd: "nudge", param: "Exposure", delta: 0.1 });
  await new Promise((r) => setTimeout(r, 50));
  assert.match(gotCommand, /"cmd":"nudge"/);
  assert.match(gotCommand, /"param":"Exposure"/);

  // Lightroom also gets an automatic getState on state-socket connect
  assert.match(gotCommand, /"cmd":"getState"/);

  bridge.stop();
  stateSocket?.destroy();
  await new Promise<void>((resolve) => commandServer.close(() => resolve()));
  await new Promise<void>((resolve) => stateServer.close(() => resolve()));
});
