import assert from "node:assert/strict";
import test from "node:test";
import { listMonthlyCustodyAccounts, monthlyInflow, monthlyRedemptions } from "./monthly-custody-account-summary.ts";

test("conta como aporte bruto uma subscricao criada e resgatada no mesmo mes", () => {
  const account = {
    subscriptions: [{
      firstDate: "2026-10-01",
      originalValue: 20_000,
      currentValue: 0,
      rescueValue: 20_000,
      isRedeemed: true
    }]
  };

  assert.equal(monthlyInflow(account, "2026-10"), 20_000);
  assert.equal(monthlyRedemptions(account), 20_000);
});

test("nao carrega aporte de outra competencia", () => {
  const account = {
    subscriptions: [{ firstDate: "2026-09-30", originalValue: 50_000 }]
  };

  assert.equal(monthlyInflow(account, "2026-10"), 0);
});

test("mantem conta zerada quando houve movimento no mes", () => {
  const accounts = listMonthlyCustodyAccounts([{
    accountCode: "229",
    clientName: "Cliente Bona",
    totalCurrentValue: 0,
    subscriptions: [{
      firstDate: "2026-10-01",
      originalValue: 20_000,
      rescueValue: 20_000,
      isRedeemed: true
    }]
  }], "2026-10");

  assert.deepEqual(accounts, [{
    accountCode: "229",
    clientName: "Cliente Bona",
    totalCurrentValue: 0,
    monthlyInflow: 20_000,
    monthlyRedemptions: 20_000
  }]);
});
