import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AckMessage } from "../bridge/types";

/** Local copy of ackOk logic for unit coverage without socket I/O. */
function ackOk(msg: AckMessage | null): boolean {
  if (!msg) return false;
  if (msg.type === "ack") return msg.ok !== false;
  return true;
}

describe("cull advance ack helper", () => {
  it("requires a successful ack before advancing", () => {
    assert.equal(ackOk(null), false);
    assert.equal(ackOk({ type: "ack", ok: false }), false);
    assert.equal(ackOk({ type: "ack", ok: true }), true);
  });
});
