import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getNbaWeekendCreateOption,
  upcomingNbaWeekendFriday,
} from "./nbaWeekendCreatePool";

describe("upcomingNbaWeekendFriday", () => {
  it("on Monday after a weekend, points at the next Friday", () => {
    assert.equal(upcomingNbaWeekendFriday("2026-10-26"), "2026-10-30");
  });

  it("during the weekend, keeps that Friday", () => {
    assert.equal(upcomingNbaWeekendFriday("2026-10-24"), "2026-10-23");
    assert.equal(upcomingNbaWeekendFriday("2026-10-25"), "2026-10-23");
  });

  it("on Friday before games, uses that Friday", () => {
    assert.equal(upcomingNbaWeekendFriday("2026-10-23"), "2026-10-23");
  });
});

describe("getNbaWeekendCreateOption", () => {
  it("labels the upcoming weekend for create-pool UI", () => {
    const option = getNbaWeekendCreateOption("2026-10-26", 0);
    assert.equal(option.start, "2026-10-30");
    assert.match(option.label, /Oct 30/);
    assert.match(option.label, /Nov 1/);
  });
});
