import type { InvestorSubscriptionStore, InvestorSubscriptionSummary } from "./investor-subscription-store.ts";

export type CrmBonaClient = { accountCode: string; clientName: string };

function normalizeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ").trim().toUpperCase();
}

function normalizeKey(value: string) {
  return value.replace(/^code:/i, "").trim();
}

export function parseCrmBonaClients(value: unknown): CrmBonaClient[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10000) {
    throw new Error("Classificacao Bona ausente ou invalida. A base anterior foi preservada.");
  }
  const codes = new Set<string>();
  return value.map((item) => {
    const accountCode = typeof item?.accountCode === "string" ? normalizeKey(item.accountCode) : "";
    const clientName = typeof item?.clientName === "string" ? item.clientName.trim() : "";
    if (!/^(?:[1-9]\d{0,8}|doc:\d{11,14})$/.test(accountCode) || !normalizeName(clientName) || codes.has(accountCode)) {
      throw new Error("Classificacao Bona inconsistente. Revise os codigos no CRM; a base anterior foi preservada.");
    }
    codes.add(accountCode);
    return { accountCode, clientName };
  });
}

export function buildCrmBonaStore(general: InvestorSubscriptionStore, clients: CrmBonaClient[]): InvestorSubscriptionStore {
  const validated = parseCrmBonaClients(clients).sort((a, b) => Number(a.accountCode.startsWith("doc:")) - Number(b.accountCode.startsWith("doc:")));
  const summaries = Object.values(general.accounts);
  const accounts: Record<string, InvestorSubscriptionSummary> = {};
  const consumed = new Map<InvestorSubscriptionSummary, CrmBonaClient>();

  for (const client of validated) {
    const codeMatches = summaries.filter((account) => normalizeKey(account.accountCode) === client.accountCode);
    const nameMatches = summaries.filter((account) => normalizeName(account.clientName) === normalizeName(client.clientName));
    const candidates = codeMatches.length ? codeMatches : nameMatches;
    if (candidates.length > 1) {
      throw new Error("Vinculo Bona ambiguo no extrato. A base anterior foi preservada.");
    }
    const match = candidates[0];
    if (!match) continue;
    const previous = consumed.get(match);
    if (previous) {
      const document = "document" in match ? String(match.document ?? "").replace(/\D/g, "") : "";
      if (!previous.accountCode.startsWith("doc:") && document && client.accountCode === `doc:${document}`) continue;
      throw new Error("Um investidor corresponde a mais de um cadastro Bona. A base anterior foi preservada.");
    }
    consumed.set(match, client);
    accounts[client.accountCode] = {
      ...match,
      accountCode: client.accountCode,
      subscriptions: match.subscriptions.map((subscription) => ({ ...subscription, accountCode: client.accountCode }))
    };
  }

  if (Object.keys(accounts).length === 0) {
    throw new Error("Nenhum cliente Bona foi identificado no extrato. A base anterior foi preservada.");
  }

  return { syncedAt: general.syncedAt, positionDate: general.positionDate, classificationSource: "crm", accounts };
}
