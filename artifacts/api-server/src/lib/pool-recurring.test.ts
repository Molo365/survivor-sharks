import assert from "node:assert/strict";
import test from "node:test";
import {
  effectivePoolIsRecurring,
  isRecurringConfigurablePool,
  resolveIsRecurringOnCreate,
} from "./pool-recurring";

test("defaults MLB postseason brackets to non-recurring", () => {
  assert.equal(resolveIsRecurringOnCreate("mlb_bracket", undefined), false);
  assert.equal(resolveIsRecurringOnCreate("wc_bracket", undefined), false);
});

test("forces brackets to behave as one-shot regardless of stored flag", () => {
  assert.equal(
    effectivePoolIsRecurring({ poolType: "mlb_bracket", isRecurring: true }),
    false,
  );
});

test("marks only weekly-frequency pool types as recurring-configurable", () => {
  assert.equal(
    isRecurringConfigurablePool({ sport: "mlb", poolType: "mlb_bracket" }),
    false,
  );
  assert.equal(
    isRecurringConfigurablePool({ sport: "mlb", poolType: "pickem" }),
    true,
  );
});
