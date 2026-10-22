import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loginPathWithReturnTo, sanitizeReturnTo } from "./return-to.ts";

describe("sanitizeReturnTo", () => {
  it("allows pool paths", () => {
    assert.equal(sanitizeReturnTo("/pools/42"), "/pools/42");
    assert.equal(sanitizeReturnTo("%2Fpools%2F42"), "/pools/42");
  });

  it("rejects open redirects", () => {
    assert.equal(sanitizeReturnTo("//evil.com"), null);
    assert.equal(sanitizeReturnTo("https://evil.com"), null);
    assert.equal(sanitizeReturnTo("/pools/../admin"), null);
  });

  it("strips query and hash", () => {
    assert.equal(sanitizeReturnTo("/pools/1?tab=picks"), "/pools/1");
    assert.equal(sanitizeReturnTo("/pools/1#section"), "/pools/1");
  });
});

describe("loginPathWithReturnTo", () => {
  it("encodes safe paths", () => {
    assert.equal(
      loginPathWithReturnTo("/pools/42"),
      "/login?returnTo=%2Fpools%2F42",
    );
  });

  it("falls back to plain login", () => {
    assert.equal(loginPathWithReturnTo("//evil"), "/login");
  });
});
