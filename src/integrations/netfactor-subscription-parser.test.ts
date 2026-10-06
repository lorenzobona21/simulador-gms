import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNetfactorSubscriptionText } from "./netfactor-subscription-parser.ts";

test("parseNetfactorSubscriptionText groups active subscriptions by subscription id", () => {
  const parsed = parseNetfactorSubscriptionText(`
Codigo Debenture inicial: 171 final: 171 999999995
171 - PAULO RICARDO BONA
0,039270 706 13/06/2024 160.00% do Indice. (10.40%) 30.000,00 18,85 0,00 0,00 30.018,85 999999996
0,039270 706 14/06/2024 160.00% do Indice. (10.40%) 30.018,85 18,86 0,00 0,00 30.037,71 999999996
171 - PAULO RICARDO BONA
0,040168 792 13/09/2024 200.00% do Indice. (10.65%) 30.000,00 23,56 0,00 0,00 30.023,56 999999996
`);

  assert.equal(parsed.accountNumber, "171");
  assert.equal(parsed.debentureHolderName, "PAULO RICARDO BONA");
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.subscriptions.length, 2);
  assert.deepEqual(
    parsed.subscriptions.map(subscription => ({
      id: subscription.subscriptionId,
      rate: subscription.cdiPercentage,
      current: subscription.currentValue,
      redeemed: subscription.isRedeemed
    })),
    [
      { id: "706", rate: 160, current: 30037.71, redeemed: false },
      { id: "792", rate: 200, current: 30023.56, redeemed: false }
    ]
  );
});

test("parseNetfactorSubscriptionText handles redeemed subscription rows with retained tax before the date", () => {
  const parsed = parseNetfactorSubscriptionText(`
171 - PAULO RICARDO BONA
0,039270 706 06/08/2024 160.00% do Indice. (10.40%) 30.724,67 19,30 0,00 0,00 30.743,97 999999996
0,000000 706 167,39 07/08/2024 160.00% do Indice. (10.40%) 30.743,97 0,00 -30.743,97 0,00 999999996
SUBTOTAL 30.000,00 167,39 -30.743,97 0,00 000000004
`);

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[1]!.retainedTaxBeforeDate, 167.39);
  assert.equal(parsed.subscriptions.length, 1);
  assert.equal(parsed.subscriptions[0]!.subscriptionId, "706");
  assert.equal(parsed.subscriptions[0]!.currentValue, 0);
  assert.equal(parsed.subscriptions[0]!.isRedeemed, true);
});
