import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isAllowedClientCode } from "../domain/client-allowlist.ts";
import type { GmsSubscriptionPosition } from "./gms-official";
import { readRemoteJson, writeRemoteJson } from "./remote-json-store.ts";

export type InvestorSubscriptionSummary = {
  accountCode: string;
  clientName: string;
  syncedAt: string;
  source: "netfactor-robot" | "manual-file";
  totalCurrentValue: number;
  subscriptions: GmsSubscriptionPosition[];
};

export type InvestorSubscriptionStore = {
  syncedAt: string;
  positionDate?: string;
  classificationSource?: "crm";
  accounts: Record<string, InvestorSubscriptionSummary>;
};

const defaultStorePath = join(process.cwd(), "work", "latest-investor-subscriptions.json");
const deploymentSnapshotPath = join(process.cwd(), "data", "latest-investor-subscriptions.json");
const remoteStorePath = "gms/latest-investor-subscriptions.json";

function storePath() {
  return process.env.GMS_LATEST_SUBSCRIPTIONS_PATH || defaultStorePath;
}

export async function readInvestorSubscriptionStore(): Promise<InvestorSubscriptionStore> {
  const remoteStore = await readRemoteJson<InvestorSubscriptionStore>(remoteStorePath).catch(() => undefined);
  if (remoteStore) return remoteStore;

  const path = storePath();
  let contents: string;

  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (process.env.GMS_LATEST_SUBSCRIPTIONS_PATH) throw error;
    contents = await readFile(deploymentSnapshotPath, "utf8");
  }

  return JSON.parse(contents) as InvestorSubscriptionStore;
}

export async function saveInvestorSubscriptionStore(store: InvestorSubscriptionStore, allowedClientCodes?: readonly string[]) {
  if (Object.keys(store.accounts).length === 0) {
    throw new Error("A importacao nao encontrou clientes Bona. A base anterior foi preservada.");
  }
  const allowed = allowedClientCodes ? new Set(allowedClientCodes) : undefined;
  for (const accountCode of Object.keys(store.accounts)) {
    if (allowed ? !allowed.has(accountCode) : !isAllowedClientCode(accountCode)) {
      throw new Error(`Account ${accountCode} is outside data/my-client-codes.json.`);
    }
  }

  if (process.env.VERCEL === "1") {
    await writeRemoteJson(remoteStorePath, store);
    return remoteStorePath;
  }

  const path = storePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2), "utf8");

  return path;
}

export async function saveInvestorSubscriptionSummary(summary: InvestorSubscriptionSummary) {
  if (!isAllowedClientCode(summary.accountCode)) {
    throw new Error(`Account ${summary.accountCode} is outside data/my-client-codes.json.`);
  }

  let current: InvestorSubscriptionStore = { syncedAt: summary.syncedAt, accounts: {} };

  try {
    current = await readInvestorSubscriptionStore();
  } catch {
    current = { syncedAt: summary.syncedAt, accounts: {} };
  }

  current.syncedAt = summary.syncedAt;
  current.accounts[summary.accountCode] = summary;

  return saveInvestorSubscriptionStore(current);
}
