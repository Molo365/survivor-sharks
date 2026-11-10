import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isNbaAtsPrevWeekSettled,
  isSuperLeaguePrevWeekSettled,
  resolveDefaultPrevPickemWeek,
} from "./pickem-prev-week";

describe("resolveDefaultPrevPickemWeek", () => {
  it("returns null on week 1 (no prior completed week)", () => {
    assert.equal(resolveDefaultPrevPickemWeek(1), null);
  });

  it("returns currentWeek - 1 when at least week 2", () => {
    assert.equal(resolveDefaultPrevPickemWeek(2), 1);
    assert.equal(resolveDefaultPrevPickemWeek(5), 4);
  });
});

describe("isNbaAtsPrevWeekSettled", () => {
  it("is false mid-weekend while still on that week counter", () => {
    assert.equal(
      isNbaAtsPrevWeekSettled("2026-10-25", "2026-10-24", 1, 1),
      false,
    );
  });

  it("is true after Sunday when week counter has not advanced yet", () => {
    assert.equal(
      isNbaAtsPrevWeekSettled("2026-10-25", "2026-10-26", 1, 1),
      true,
    );
  });

  it("is true when pool has advanced to a later week", () => {
    assert.equal(
      isNbaAtsPrevWeekSettled("2026-10-25", "2026-10-24", 2, 1),
      true,
    );
  });
});

describe("isSuperLeaguePrevWeekSettled", () => {
  it("is true on the closing Monday", () => {
    assert.equal(
      isSuperLeaguePrevWeekSettled("2026-11-10", "2026-11-10", 11, 10),
      true,
    );
  });

  it("is true once the pool week has advanced", () => {
    assert.equal(
      isSuperLeaguePrevWeekSettled("2026-11-10", "2026-11-09", 12, 11),
      true,
    );
  });
});
