import assert from "node:assert/strict";
import test from "node:test";
import { scoreNhlDivisionPositions } from "./nhl-scoring";

const actual = ["A", "B", "C", "D", "E", "F", "G", "H"];
test("NHL scoring awards three for exact and one for adjacent slots", () => {
  assert.equal(scoreNhlDivisionPositions(actual, actual), 24);
  assert.equal(scoreNhlDivisionPositions(actual, ["B", "A", "C", "D", "E", "F", "G", "H"]), 20);
  assert.equal(scoreNhlDivisionPositions(actual, ["C", "B", "A", "D", "E", "F", "G", "H"]), 18);
});