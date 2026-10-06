import assert from "node:assert/strict";
import { test } from "node:test";
import { expectedPositionDateForToday, getPositionFreshness } from "./data-freshness.ts";

test("expectedPositionDateForToday uses previous day on weekdays", () => {
  assert.equal(expectedPositionDateForToday(new Date("2026-07-21T12:00:00")), "2026-07-20");
});

test("expectedPositionDateForToday uses Friday when today is Monday", () => {
  assert.equal(expectedPositionDateForToday(new Date("2026-07-20T12:00:00")), "2026-07-17");
});

test("getPositionFreshness marks current, stale and missing positions", () => {
  const today = new Date("2026-07-20T12:00:00");

  assert.equal(getPositionFreshness("2026-07-17", today).status, "current");
  assert.equal(getPositionFreshness("2026-07-16", today).status, "stale");
  assert.equal(getPositionFreshness(undefined, today).status, "missing");
});

