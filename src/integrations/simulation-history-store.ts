import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SimulationHistoryRecord, SimulationHistoryStore } from "../domain/simulation-history";
import { readRemoteJson, writeRemoteJson } from "./remote-json-store";

const defaultStorePath = join(process.cwd(), "work", "simulation-history.json");
const remoteStorePath = "gms/simulation-history.json";
const maxRecords = 300;

function storePath() {
  return process.env.GMS_SIMULATION_HISTORY_PATH || defaultStorePath;
}

export async function readSimulationHistoryStore(): Promise<SimulationHistoryStore> {
  const remoteStore = await readRemoteJson<SimulationHistoryStore>(remoteStorePath).catch(() => undefined);
  if (remoteStore) return remoteStore;

  try {
    return JSON.parse(await readFile(storePath(), "utf8")) as SimulationHistoryStore;
  } catch {
    return { updatedAt: new Date().toISOString(), simulations: [] };
  }
}

export async function saveSimulationHistoryStore(store: SimulationHistoryStore) {
  const normalizedStore = {
    updatedAt: store.updatedAt,
    simulations: store.simulations.slice(0, maxRecords)
  };

  if (process.env.VERCEL === "1") {
    await writeRemoteJson(remoteStorePath, normalizedStore);
    return remoteStorePath;
  }

  const path = storePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(normalizedStore, null, 2), "utf8");
  return path;
}

export async function addSimulationHistoryRecord(record: SimulationHistoryRecord) {
  const current = await readSimulationHistoryStore();
  const nextStore: SimulationHistoryStore = {
    updatedAt: new Date().toISOString(),
    simulations: [
      record,
      ...current.simulations.filter(simulation => simulation.id !== record.id)
    ].slice(0, maxRecords)
  };

  await saveSimulationHistoryStore(nextStore);
  return nextStore;
}

