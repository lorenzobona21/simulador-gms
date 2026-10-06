import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { filterInvestorReportToAllowlist } from "../domain/client-allowlist.ts";
import type { InvestorReportSyncResult } from "./investor-report-source";

const defaultStorePath = join(process.cwd(), "work", "latest-investor-report.json");
const deploymentSnapshotPath = join(process.cwd(), "data", "latest-investor-report.json");

function storePath() {
  return process.env.GMS_LATEST_REPORT_PATH || defaultStorePath;
}

export async function saveLatestInvestorReport(report: InvestorReportSyncResult) {
  const path = storePath();
  const filteredReport = filterInvestorReportToAllowlist(report);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(filteredReport, null, 2), "utf8");
  return path;
}

export async function readLatestInvestorReport() {
  const path = storePath();
  let contents: string;

  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (process.env.GMS_LATEST_REPORT_PATH) throw error;
    contents = await readFile(deploymentSnapshotPath, "utf8");
  }

  return filterInvestorReportToAllowlist(JSON.parse(contents) as InvestorReportSyncResult);
}
