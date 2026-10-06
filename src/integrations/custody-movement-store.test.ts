import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateCustodyMovements } from "./custody-movement-store.ts";

test("calcula aportes novos e resgates por diferenca de subscricoes", () => {
  const previousStore = {
    accounts: {
      "code:100": {
        accountCode: "100",
        subscriptions: [
          {
            subscriptionId: "sub-antiga",
            firstDate: "2026-06-10",
            currentValue: 50000
          },
          {
            subscriptionId: "sub-removida",
            firstDate: "2026-06-15",
            currentValue: 20000
          }
        ]
      }
    }
  };

  const currentStore = {
    accounts: {
      "code:100": {
        accountCode: "100",
        subscriptions: [
          {
            subscriptionId: "sub-antiga",
            firstDate: "2026-06-10",
            currentValue: 35000
          },
          {
            subscriptionId: "sub-nova",
            firstDate: "2026-07-05",
            originalValue: 100000,
            currentValue: 101250
          }
        ]
      }
    }
  };

  assert.deepEqual(calculateCustodyMovements(previousStore, currentStore, "2026-07"), {
    inflows: 100000,
    redemptions: 35000
  });
});

test("primeira importacao sem base anterior nao inventa movimentacao", () => {
  const currentStore = {
    accounts: {
      "code:100": {
        accountCode: "100",
        subscriptions: [
          {
            subscriptionId: "sub-nova",
            firstDate: "2026-07-05",
            originalValue: 100000,
            currentValue: 101250
          }
        ]
      }
    }
  };

  assert.deepEqual(calculateCustodyMovements(undefined, currentStore, "2026-07"), {
    inflows: 0,
    redemptions: 0
  });
});

test("conta aporte novo do mes mesmo quando valor atualizado ainda esta zerado", () => {
  const previousStore = {
    accounts: {
      "code:100": {
        accountCode: "100",
        subscriptions: []
      }
    }
  };

  const currentStore = {
    accounts: {
      "code:100": {
        accountCode: "100",
        subscriptions: [
          {
            subscriptionId: "sub-fim-do-mes",
            firstDate: "2026-07-31",
            originalValue: 30000,
            currentValue: 0
          }
        ]
      }
    }
  };

  assert.deepEqual(calculateCustodyMovements(previousStore, currentStore, "2026-07"), {
    inflows: 30000,
    redemptions: 0
  });
});
