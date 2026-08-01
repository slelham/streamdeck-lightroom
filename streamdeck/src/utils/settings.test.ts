import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { asBool } from "./settings";

describe("asBool", () => {
  it("keeps real booleans", () => {
    assert.equal(asBool(true), true);
    assert.equal(asBool(false), false);
  });

  it("coerces PI string/number checkbox values", () => {
    assert.equal(asBool("true"), true);
    assert.equal(asBool("1"), true);
    assert.equal(asBool(1), true);
    assert.equal(asBool("false"), false);
    assert.equal(asBool("0"), false);
    assert.equal(asBool(0), false);
  });

  it("uses fallback for unknown values", () => {
    assert.equal(asBool(undefined), false);
    assert.equal(asBool(undefined, true), true);
    assert.equal(asBool("maybe", true), true);
  });
});
