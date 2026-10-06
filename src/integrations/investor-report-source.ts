import type { GmsClientStatement } from "./gms-official";

export type InvestorReportSyncResult = {
  source: "mock" | "remote-file" | "netfactor-robot";
  syncedAt: string;
  statements: GmsClientStatement[];
};

const mockDailyReport: GmsClientStatement[] = [
  {
    clientId: "cli_aurora",
    syncedAt: "2026-06-19T07:00:00-03:00",
    positions: [
      {
        clientId: "cli_aurora",
        accountCode: "GMS-10234",
        balanceDate: "2026-06-19",
        currentBalance: 237850.42,
        availableBalance: 237850.42,
        productName: "GMS CDI Plus",
        lastMovementDescription: "Rendimento diario",
        lastMovementAmount: 128.74
      }
    ]
  },
  {
    clientId: "cli_safira",
    syncedAt: "2026-06-19T07:00:00-03:00",
    positions: [
      {
        clientId: "cli_safira",
        accountCode: "GMS-10441",
        balanceDate: "2026-06-19",
        currentBalance: 148220.1,
        availableBalance: 148220.1,
        productName: "GMS Conservador",
        lastMovementDescription: "Aporte identificado",
        lastMovementAmount: 25000
      }
    ]
  }
];

function formatBalanceDate(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

async function fetchNetfactorRobotReport(): Promise<InvestorReportSyncResult> {
  const { captureNetfactorPositionPdf } = await import("./netfactor-robot.ts");
  const syncedAt = new Date().toISOString();
  const balanceDate = formatBalanceDate(new Date());
  const result = await captureNetfactorPositionPdf();

  const statements: GmsClientStatement[] = result.accountPositions.map(account => ({
    clientId: `netfactor_${account.accountNumber}`,
    clientName: account.debentureHolderName,
    syncedAt,
    positions: [
      {
        clientId: `netfactor_${account.accountNumber}`,
        accountCode: account.accountNumber,
        balanceDate,
        currentBalance: account.totalCurrentNetValue,
        availableBalance: account.totalCurrentNetValue,
        productName: "Debentures GMS",
        lastMovementDescription: "Saldo atualizado pelo NetFactor",
        lastMovementAmount: account.rows.reduce((sum, row) => sum + row.lastMonthYieldValue, 0)
      }
    ]
  }));

  return {
    source: "netfactor-robot",
    syncedAt,
    statements
  };
}

export async function fetchDailyInvestorReport(): Promise<InvestorReportSyncResult> {
  if (process.env.NETFACTOR_SYNC_MODE === "robot") {
    return fetchNetfactorRobotReport();
  }

  const reportUrl = process.env.GMS_DAILY_REPORT_URL;

  if (!reportUrl) {
    return {
      source: "mock",
      syncedAt: new Date().toISOString(),
      statements: mockDailyReport
    };
  }

  const response = await fetch(reportUrl, {
    headers: process.env.GMS_DAILY_REPORT_TOKEN
      ? { Authorization: `Bearer ${process.env.GMS_DAILY_REPORT_TOKEN}` }
      : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Daily investor report request failed with status ${response.status}`);
  }

  const statements = (await response.json()) as GmsClientStatement[];

  return {
    source: "remote-file",
    syncedAt: new Date().toISOString(),
    statements
  };
}
