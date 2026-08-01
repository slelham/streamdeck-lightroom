import { bridge } from "../bridge/client";
import type { AckMessage, BridgeCommand, BridgeInbound } from "../bridge/types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ackOk(msg: BridgeInbound | null): boolean {
  if (!msg) return false;
  const ack = msg as AckMessage;
  if (ack.type === "ack") return ack.ok !== false;
  return true;
}

/**
 * Mirror a Stream Deck multi-action: finish the cull command, pause, then Next.
 * Same-task nextPhoto after flagAsPick is ignored by Lightroom; a delayed
 * separate nextPhoto (what multi-action does) works with Caps Lock off.
 * fromPhotoId skips Next when Caps Lock / Photo > Auto Advance already moved.
 */
export async function sendCullThenAdvance(
  command: BridgeCommand,
  shouldAdvance: boolean,
): Promise<boolean> {
  const fromPhotoId = bridge.state.photoId;
  const ack = await bridge.sendAndWait(command, 3000);
  const ok = ackOk(ack);
  if (!ok || !shouldAdvance) return ok;

  await sleep(220);
  await bridge.sendSafe({
    cmd: "nextPhoto",
    fromPhotoId,
  });
  return true;
}
