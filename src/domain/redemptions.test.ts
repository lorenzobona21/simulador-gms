import assert from "node:assert/strict";
import { test } from "node:test";
import { simulateRedemption, type RedemptionSimulationInput } from "./redemptions.ts";

function baseInput(overrides: Partial<RedemptionSimulationInput> = {}): RedemptionSimulationInput {
  return {
    id: "redemption-1",
    clientId: "client-1",
    clientName: "Cliente Teste",
    positionDate: "2026-07-17",
    redemptionDate: "2026-07-17",
    requestedGrossAmount: 1000,
    source: "manual",
    subscriptions: [
      {
        id: "sub-1",
        applicationDate: "2024-01-10",
        remainingPrincipal: 8000,
        currentGrossBalance: 10000,
        individualTaxRate: 0.15
      }
    ],
    ...overrides
  };
}

test("simulates one subscription after previous real redemption and later income", () => {
  const result = simulateRedemption(
    baseInput({
      requestedGrossAmount: 1000,
      subscriptions: [
        {
          id: "old-after-redemption",
          applicationDate: "2024-01-10",
          remainingPrincipal: 8000,
          currentGrossBalance: 10000,
          individualTaxRate: 0.15,
          previousWithdrawals: [
            {
              id: "real-redemption-1",
              date: "2025-12-01",
              grossAmount: 2500,
              principalReturned: 2200,
              accruedIncomeRedeemed: 300,
              incomeTax: 45
            }
          ]
        }
      ]
    })
  );

  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0]!.accruedIncomeBeforeRedemption, 2000);
  assert.equal(result.allocations[0]!.incomeShareBeforeRedemption, 0.2);
  assert.equal(result.allocations[0]!.accruedIncomeRedeemed, 200);
  assert.equal(result.allocations[0]!.principalReturned, 800);
  assert.equal(result.allocations[0]!.incomeTax, 30);
  assert.equal(result.allocations[0]!.remainingPrincipal, 7200);
  assert.equal(result.allocations[0]!.remainingGrossBalance, 9000);
});

test("consumes subscriptions by FIFO without proportional allocation", () => {
  const result = simulateRedemption(
    baseInput({
      requestedGrossAmount: 9000,
      subscriptions: [
        {
          id: "new",
          applicationDate: "2026-01-01",
          remainingPrincipal: 10000,
          currentGrossBalance: 12000,
          individualTaxRate: 0.225
        },
        {
          id: "old",
          applicationDate: "2024-01-01",
          remainingPrincipal: 7000,
          currentGrossBalance: 9000,
          individualTaxRate: 0.15
        }
      ]
    })
  );

  assert.deepEqual(result.allocations.map(allocation => allocation.subscriptionId), ["old"]);
  assert.equal(result.totalGrossWithdrawal, 9000);
  assert.equal(result.projectedSubscriptions.find(subscription => subscription.subscriptionId === "old")!.remainingGrossBalance, 0);
  assert.equal(result.projectedSubscriptions.find(subscription => subscription.subscriptionId === "new")!.remainingGrossBalance, 12000);
  assert.deepEqual(result.untouchedSubscriptions, ["new"]);
});

test("uses the next subscription only for the partial overflow amount", () => {
  const result = simulateRedemption(
    baseInput({
      requestedGrossAmount: 11000,
      subscriptions: [
        {
          id: "old",
          applicationDate: "2024-01-01",
          remainingPrincipal: 7000,
          currentGrossBalance: 9000,
          individualTaxRate: 0.15
        },
        {
          id: "new",
          applicationDate: "2026-01-01",
          remainingPrincipal: 10000,
          currentGrossBalance: 12000,
          individualTaxRate: 0.225
        }
      ]
    })
  );

  assert.deepEqual(result.allocations.map(allocation => allocation.subscriptionId), ["old", "new"]);
  assert.equal(result.allocations[0]!.grossWithdrawal, 9000);
  assert.equal(result.allocations[1]!.grossWithdrawal, 2000);
  assert.equal(result.projectedSubscriptions.find(subscription => subscription.subscriptionId === "new")!.remainingGrossBalance, 10000);
});

test("handles exact exhaustion of an old subscription and preserves the newer one", () => {
  const result = simulateRedemption(
    baseInput({
      requestedGrossAmount: 9000,
      subscriptions: [
        {
          id: "old",
          applicationDate: "2024-01-01",
          remainingPrincipal: 7000,
          currentGrossBalance: 9000,
          individualTaxRate: 0.15
        },
        {
          id: "new",
          applicationDate: "2026-01-01",
          remainingPrincipal: 10000,
          currentGrossBalance: 12000,
          individualTaxRate: 0.225
        }
      ]
    })
  );

  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0]!.remainingGrossBalance, 0);
  assert.equal(result.projectedSubscriptions.find(subscription => subscription.subscriptionId === "new")!.remainingPrincipal, 10000);
});

test("applies individual tax rates per subscription", () => {
  const result = simulateRedemption(
    baseInput({
      requestedGrossAmount: 11000,
      subscriptions: [
        {
          id: "old",
          applicationDate: "2024-01-01",
          remainingPrincipal: 7000,
          currentGrossBalance: 9000,
          individualTaxRate: 0.15
        },
        {
          id: "new",
          applicationDate: "2026-01-01",
          remainingPrincipal: 10000,
          currentGrossBalance: 12000,
          individualTaxRate: 0.225
        }
      ]
    })
  );

  assert.equal(result.allocations[0]!.incomeTax, 300);
  assert.equal(result.allocations[1]!.incomeTax, 75);
  assert.equal(result.totalIncomeTax, 375);
  assert.equal(result.totalNetAmount, 10625);
});

test("rejects insufficient balance", () => {
  assert.throws(
    () =>
      simulateRedemption(
        baseInput({
          requestedGrossAmount: 10001,
          subscriptions: [
            {
              id: "only",
              applicationDate: "2024-01-01",
              remainingPrincipal: 9000,
              currentGrossBalance: 10000,
              individualTaxRate: 0.15
            }
          ]
        })
      ),
    /Insufficient balance/
  );
});

test("validates negative values, zero gross balance and principal greater than balance", () => {
  assert.throws(() => simulateRedemption(baseInput({ requestedGrossAmount: -1 })), /cannot be negative/);

  assert.throws(
    () =>
      simulateRedemption(
        baseInput({
          subscriptions: [
            {
              id: "bad",
              applicationDate: "2024-01-01",
              remainingPrincipal: 10001,
              currentGrossBalance: 10000,
              individualTaxRate: 0.15
            }
          ]
        })
      ),
    /remainingPrincipal cannot exceed currentGrossBalance/
  );

  assert.throws(
    () =>
      simulateRedemption(
        baseInput({
          requestedGrossAmount: 1,
          subscriptions: [
            {
              id: "zero",
              applicationDate: "2024-01-01",
              remainingPrincipal: 0,
              currentGrossBalance: 0,
              individualTaxRate: 0.15
            }
          ]
        })
      ),
    /Insufficient balance/
  );
});
