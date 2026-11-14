import assert from "node:assert/strict";
import test from "node:test";
import {
  multiplierLinesNotifyPeriodKey,
  shouldNotifyMultiplierLinesBump,
} from "./nba-multiplier-lines-notify-policy";

test("shouldNotifyMultiplierLinesBump fires only when lined game count increases", () => {
  assert.equal(shouldNotifyMultiplierLinesBump(0, 0), false);
  assert.equal(shouldNotifyMultiplierLinesBump(5, 5), false);
  assert.equal(shouldNotifyMultiplierLinesBump(5, 3), false);
  assert.equal(shouldNotifyMultiplierLinesBump(0, 1), true);
  assert.equal(shouldNotifyMultiplierLinesBump(4, 7), true);
});

test("multiplierLinesNotifyPeriodKey is stable per week and count", () => {
  assert.equal(
    multiplierLinesNotifyPeriodKey(3, 12),
    "nba-multiplier|week-3|lines:12",
  );
});