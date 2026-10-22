import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getReturnToFromLocation, resolvePostAuthDestination } from "./post-auth-redirect.ts";

describe("getReturnToFromLocation", () => {
  it("reads returnTo from a combined location string", () => {
    assert.equal(
      getReturnToFromLocation("/login?returnTo=%2Fpools%2F42"),
      "/pools/42",
    );
  });

  it("reads returnTo from window.search when location is pathname-only (wouter v3)", () => {
    const prev = globalThis.window;
    // @ts-expect-error test shim
    globalThis.window = {
      location: { search: "?returnTo=%2Fpools%2F99" },
    };
    try {
      assert.equal(getReturnToFromLocation("/login"), "/pools/99");
    } finally {
      globalThis.window = prev;
    }
  });
});

describe("resolvePostAuthDestination", () => {
  it("prefers returnTo over dashboard", () => {
    assert.equal(
      resolvePostAuthDestination("/login?returnTo=%2Fpools%2F7", false),
      "/pools/7",
    );
  });
});
