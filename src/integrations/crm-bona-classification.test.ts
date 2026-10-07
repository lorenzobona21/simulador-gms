import assert from "node:assert/strict";
import test from "node:test";
import { buildCrmBonaStore, parseCrmBonaClients } from "./crm-bona-classification.ts";
import { filterSubscriptionStoreToAllowlist } from "../domain/client-allowlist.ts";
import { saveInvestorSubscriptionStore, type InvestorSubscriptionStore } from "./investor-subscription-store.ts";

function store(accounts: Array<{ accountCode: string; clientName: string; value: number }>): InvestorSubscriptionStore {
  return {
    syncedAt: "2026-10-06T12:00:00Z", positionDate: "2026-10-05",
    accounts: Object.fromEntries(accounts.map(({ accountCode, clientName, value }) => [accountCode, {
      accountCode, clientName, syncedAt: "2026-10-06T12:00:00Z", source: "netfactor-robot" as const,
      totalCurrentValue: value, subscriptions: [{ accountCode, subscriptionId: "1", currentValue: value,
        originalValue: value, cdiPercentage: 150, latestAnnualIndexRate: 13.65,
        firstDate: "2026-09-01", latestDate: "2026-10-05", isRedeemed: false }]
    }]))
  };
}

test("CRM supplies the current Bona list even when the local allowlist is stale", () => {
  const general = store([{ accountCode: "doc:00000000001", clientName: "CLIENTE NOVO", value: 10000 },
    { accountCode: "50", clientName: "CLIENTE GERAL", value: 30000 }]);
  const selected = buildCrmBonaStore(general, [{ accountCode: "318", clientName: "Cliente Novo" }]);
  assert.equal(selected.accounts["318"].totalCurrentValue, 10000);
  assert.equal(selected.accounts["318"].subscriptions[0].accountCode, "318");
  assert.deepEqual(Object.keys(selected.accounts), ["318"]);
  assert.deepEqual(filterSubscriptionStoreToAllowlist(selected), selected);
  assert.equal(general.accounts["doc:00000000001"].accountCode, "doc:00000000001");
});

test("a confirmed code takes precedence over similar names", () => {
  const general = store([{ accountCode: "318", clientName: "CLIENTE A", value: 10000 },
    { accountCode: "319", clientName: "CLIENTE A", value: 20000 }]);
  assert.equal(buildCrmBonaStore(general, [{ accountCode: "318", clientName: "CLIENTE A" }]).accounts["318"].totalCurrentValue, 10000);
});

test("ambiguous names and duplicate assignments cannot replace the saved base", () => {
  const general = store([{ accountCode: "doc:00000000001", clientName: "CLIENTE A", value: 10000 },
    { accountCode: "doc:00000000002", clientName: "CLIENTE A", value: 20000 }]);
  assert.throws(() => buildCrmBonaStore(general, [{ accountCode: "318", clientName: "CLIENTE A" }]), /ambiguo/);
  assert.throws(() => buildCrmBonaStore(store([{ accountCode: "10", clientName: "CLIENTE A", value: 1 }]),
    [{ accountCode: "318", clientName: "CLIENTE A" }, { accountCode: "319", clientName: "CLIENTE A" }]), /mais de um/);
});

test("missing classification, duplicate codes and no matches are rejected", async () => {
  assert.throws(() => parseCrmBonaClients([]), /ausente/);
  assert.throws(() => parseCrmBonaClients([{ accountCode: "318", clientName: "A" }, { accountCode: "318", clientName: "B" }]), /inconsistente/);
  assert.throws(() => buildCrmBonaStore(store([]), [{ accountCode: "318", clientName: "A" }]), /Nenhum cliente/);
  await assert.rejects(saveInvestorSubscriptionStore(store([])), /base anterior/);
});

test("document identifiers stay separate from NetFactor codes", () => {
  const selected = buildCrmBonaStore(store([{ accountCode: "doc:00000000001", clientName: "CLIENTE A", value: 100 }]),
    [{ accountCode: "doc:00000000001", clientName: "CLIENTE A" }]);
  assert.deepEqual(Object.keys(selected.accounts), ["doc:00000000001"]);
});

test("a document alias verified by the statement does not duplicate the confirmed client", () => {
  const general = store([{ accountCode: "196", clientName: "CLIENTE A", value: 10000 }]);
  Object.assign(general.accounts["196"], { document: "00000000001" });
  const selected = buildCrmBonaStore(general, [{ accountCode: "doc:00000000001", clientName: "CLIENTE A" },
    { accountCode: "196", clientName: "CLIENTE A" }]);
  assert.deepEqual(Object.keys(selected.accounts), ["196"]);
  assert.equal(selected.accounts["196"].totalCurrentValue, 10000);
  assert.throws(() => buildCrmBonaStore(general, [{ accountCode: "doc:00000000002", clientName: "CLIENTE A" },
    { accountCode: "196", clientName: "CLIENTE A" }]), /mais de um/);
});
