import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GeneralInvestorSubscriptionStore } from "./netfactor-monthly-detailed-subscriptions";
import { readRemoteJson, writeRemoteJson } from "./remote-json-store.ts";

const defaultStorePath = join(process.cwd(), "work", "latest-general-investor-subscriptions.json");
const snapshotStorePath = join(process.cwd(), "data", "latest-general-investor-subscriptions.json");
const remoteStorePath = "gms/latest-general-investor-subscriptions.json";

export async function readGeneralInvestorSubscriptionStore(): Promise<GeneralInvestorSubscriptionStore | undefined> {
  const remoteStore = await readRemoteJson<GeneralInvestorSubscriptionStore>(remoteStorePath).catch(() => undefined);
  if (remoteStore) return remoteStore;

  for (const path of [defaultStorePath, snapshotStorePath]) {
    try {
      return JSON.parse(await readFile(path, "utf8")) as GeneralInvestorSubscriptionStore;
    } catch {
      // Try the next store location.
    }
  }

  return undefined;
}

export async function saveGeneralInvestorSubscriptionStore(store: GeneralInvestorSubscriptionStore) {
  if (process.env.VERCEL === "1") {
    await writeRemoteJson(remoteStorePath, store);
    return remoteStorePath;
  }

  await mkdir(dirname(defaultStorePath), { recursive: true });
  await writeFile(defaultStorePath, JSON.stringify(store, null, 2), "utf8");
  return defaultStorePath;
}
