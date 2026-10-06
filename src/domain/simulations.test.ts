import assert from "node:assert/strict";
import { test } from "node:test";
import {
  averageMonthlyRateInPeriod,
  cdiCurve,
  commercialMonthsInPeriod,
  simulateInvestment,
  simulatePortfolioInvestment,
  weightedAverageCdiPercentage
} from "./simulations.ts";

test("cdiCurve includes the 2027 Copom meetings", () => {
  assert.deepEqual(
    cdiCurve.filter(change => change.date.startsWith("2027")).map(change => change.date),
    [
      "2027-01-27",
      "2027-03-17",
      "2027-04-28",
      "2027-06-16",
      "2027-08-04",
      "2027-09-22",
      "2027-10-27",
      "2027-12-08"
    ]
  );
});

test("cdiCurve uses the operational CDI of 13.90 after the August 2026 Copom meeting", () => {
  const augustMeeting = cdiCurve.find(change => change.date === "2026-08-05");

  assert.equal(augustMeeting?.label, "2026 - 04 e 05 de ago.");
  assert.equal(augustMeeting?.rate, 13.9);
});

test("cdiCurve uses 13.65 from the September 2026 Copom meeting onward", () => {
  const septemberMeeting = cdiCurve.find(change => change.date === "2026-09-16");
  const followingMeetings = cdiCurve.filter(change => change.date >= "2026-09-16");

  assert.equal(septemberMeeting?.label, "2026 - 15 e 16 de set.");
  assert.equal(septemberMeeting?.rate, 13.65);
  assert.ok(followingMeetings.length > 1);
  assert.ok(followingMeetings.every(change => change.rate === 13.65));
});

test("averageMonthlyRateInPeriod uses equivalent compounded monthly rate across 2027", () => {
  assert.equal(commercialMonthsInPeriod("2026-07-01", "2027-12-31"), 18);
  assert.ok(
    Math.abs(
      averageMonthlyRateInPeriod(0.36, "2026-07-01", "2027-12-31") -
        (Math.pow(1.36, 1 / 18) - 1)
    ) < 0.0000001
  );
});

test("simulatePortfolioInvestment projects existing subscriptions with their own CDI rates", () => {
  const cdiCurve = [{ date: "2026-01-01", label: "base", rate: 14 }];
  const startDate = "2026-06-01";
  const endDate = "2026-06-30";

  const portfolio = simulatePortfolioInvestment(
    {
      id: "portfolio",
      clientId: "netfactor_171",
      title: "Paulo Ricardo Bona",
      existingSubscriptions: [
        { subscriptionId: "a", currentValue: 10000, cdiPercentage: 100 },
        { subscriptionId: "b", currentValue: 10000, cdiPercentage: 200 }
      ],
      additionalContribution: 10000,
      additionalContributionCdiPercentage: 150,
      startDate,
      endDate,
      status: "draft"
    },
    cdiCurve
  );

  const projectedA = simulateInvestment(
    {
      id: "a",
      clientId: "netfactor_171",
      title: "a",
      sourceBalance: 10000,
      additionalContribution: 0,
      cdiPercentage: 100,
      startDate,
      endDate,
      status: "draft"
    },
    cdiCurve
  );
  const projectedB = simulateInvestment(
    {
      id: "b",
      clientId: "netfactor_171",
      title: "b",
      sourceBalance: 10000,
      additionalContribution: 0,
      cdiPercentage: 200,
      startDate,
      endDate,
      status: "draft"
    },
    cdiCurve
  );
  const projectedContribution = simulateInvestment(
    {
      id: "contribution",
      clientId: "netfactor_171",
      title: "contribution",
      sourceBalance: 0,
      additionalContribution: 10000,
      cdiPercentage: 150,
      startDate,
      endDate,
      status: "draft"
    },
    cdiCurve
  );

  assert.equal(portfolio.existingSubscriptions.length, 2);
  assert.equal(portfolio.existingSubscriptions[0]!.cdiPercentage, 100);
  assert.equal(portfolio.existingSubscriptions[1]!.cdiPercentage, 200);
  assert.ok(Math.abs(portfolio.existingSubscriptions[0]!.grossBalance - projectedA.grossBalance) < 0.01);
  assert.ok(Math.abs(portfolio.existingSubscriptions[1]!.grossBalance - projectedB.grossBalance) < 0.01);
  assert.ok(Math.abs(portfolio.additionalContributionGrossBalance - projectedContribution.grossBalance) < 0.01);
  assert.equal(portfolio.weightedCdiPercentage, 150);
});

test("weightedAverageCdiPercentage weights each subscription by current value", () => {
  assert.equal(
    weightedAverageCdiPercentage([
      { subscriptionId: "a", currentValue: 300000, cdiPercentage: 140 },
      { subscriptionId: "b", currentValue: 100000, cdiPercentage: 180 }
    ]),
    150
  );
});

test("simulatePortfolioInvestment taxes old subscriptions by their own holding period", () => {
  const cdiCurve = [{ date: "2026-01-01", label: "base", rate: 14 }];
  const startDate = "2026-07-01";
  const endDate = "2026-12-31";

  const portfolio = simulatePortfolioInvestment(
    {
      id: "portfolio-tax",
      clientId: "netfactor_171",
      title: "Carteira com prazos diferentes",
      existingSubscriptions: [
        { subscriptionId: "old", currentValue: 100000, cdiPercentage: 160, firstDate: "2024-01-01" },
        { subscriptionId: "recent", currentValue: 100000, cdiPercentage: 160, firstDate: "2026-06-01" }
      ],
      additionalContribution: 100000,
      additionalContributionCdiPercentage: 160,
      startDate,
      endDate,
      status: "draft"
    },
    cdiCurve
  );

  const oldProjection = simulateInvestment(
    {
      id: "old",
      clientId: "netfactor_171",
      title: "old",
      sourceBalance: 100000,
      additionalContribution: 0,
      cdiPercentage: 160,
      startDate,
      endDate,
      status: "draft"
    },
    cdiCurve
  );
  const recentProjection = simulateInvestment(
    {
      id: "recent",
      clientId: "netfactor_171",
      title: "recent",
      sourceBalance: 100000,
      additionalContribution: 0,
      cdiPercentage: 160,
      startDate,
      endDate,
      status: "draft"
    },
    cdiCurve
  );
  const contributionProjection = simulateInvestment(
    {
      id: "contribution",
      clientId: "netfactor_171",
      title: "contribution",
      sourceBalance: 0,
      additionalContribution: 100000,
      cdiPercentage: 160,
      startDate,
      endDate,
      status: "draft"
    },
    cdiCurve
  );

  const expectedIncomeTax =
    oldProjection.grossIncome * 0.15 +
    recentProjection.grossIncome * 0.2 +
    contributionProjection.grossIncome * 0.2;

  assert.ok(Math.abs(portfolio.incomeTax - expectedIncomeTax) < 0.01);
  assert.ok(portfolio.taxRate < 0.2);
});
