import assert from "node:assert/strict";
import test from "node:test";
import { nbaSurvivorWeekLabel } from "./nba-survivor-labels";

test("nbaSurvivorWeekLabel uses Monday of the Mon–Sun week", () => {
  const createdAt = new Date("2025-11-01T12:00:00.000Z");
  const label = nbaSurvivorWeekLabel(createdAt, 1, false);
  assert.match(label, /^[A-Z][a-z]{2} \d{1,2}$/);
});
