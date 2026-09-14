import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bracketBlueprint,
  parseMlbPostseasonField,
  SANDBOX_MLB_FIELD,
} from "./mlb-bracket";

const clincherCodes = ["*", "x", "y", "z", "x", "y"];

function leagueGroup(name: "American League" | "National League", prefix: string, count = 6) {
  return {
    name,
    abbreviation: name === "American League" ? "AL" : "NL",
    standings: {
      entries: Array.from({ length: count }, (_, index) => ({
        team: { displayName: `${prefix} Team ${index + 1}` },
        stats: [
          { name: "playoffSeed", value: index + 1, displayValue: String(index + 1) },
          { name: "clincher", value: index + 1, displayValue: clincherCodes[index] },
        ],
      })),
    },
  };
}

describe("MLB postseason field parsing", () => {
  it("preserves ESPN parent-group league context and accepts real clincher markers", () => {
    const field = parseMlbPostseasonField({
      children: [
        leagueGroup("American League", "AL"),
        leagueGroup("National League", "NL"),
      ],
    });

    assert.deepEqual(field, {
      AL: ["AL Team 1", "AL Team 2", "AL Team 3", "AL Team 4", "AL Team 5", "AL Team 6"],
      NL: ["NL Team 1", "NL Team 2", "NL Team 3", "NL Team 4", "NL Team 5", "NL Team 6"],
    });
  });

  it("blocks an incomplete field even when projected playoff seeds exist", () => {
    const incompleteAl = leagueGroup("American League", "AL");
    incompleteAl.standings.entries[5].stats = [
      { name: "playoffSeed", value: 6, displayValue: "6" },
    ];

    assert.equal(parseMlbPostseasonField({
      children: [incompleteAl, leagueGroup("National League", "NL")],
    }), null);
  });

  it("does not treat ESPN's eliminated marker as a clinched berth", () => {
    const incompleteNl = leagueGroup("National League", "NL");
    incompleteNl.standings.entries[5].stats[1] = {
      name: "clincher",
      value: 4,
      displayValue: "e",
    };

    assert.equal(parseMlbPostseasonField({
      children: [leagueGroup("American League", "AL"), incompleteNl],
    }), null);
  });

  it("keeps the sandbox field compatible with the canonical eleven-slot bracket", () => {
    const field = {
      AL: SANDBOX_MLB_FIELD.slice(0, 6),
      NL: SANDBOX_MLB_FIELD.slice(6, 12),
    };
    const slots = bracketBlueprint(field);

    assert.equal(slots.length, 11);
    assert.deepEqual(slots.map(slot => slot.seriesSlot), [
      "AL_WC_1", "AL_WC_2", "AL_DS_1", "AL_DS_2", "ALCS",
      "NL_WC_1", "NL_WC_2", "NL_DS_1", "NL_DS_2", "NLCS",
      "WORLD_SERIES",
    ]);
  });
});