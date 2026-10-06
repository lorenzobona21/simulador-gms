export type GmsStatementPosition = {
  clientId: string;
  accountCode: string;
  balanceDate: string;
  currentBalance: number;
  availableBalance: number;
  productName: string;
  lastMovementDescription: string;
  lastMovementAmount: number;
};

export type GmsSubscriptionPosition = {
  accountCode: string;
  subscriptionId: string;
  cdiPercentage: number;
  latestAnnualIndexRate: number;
  firstDate: string;
  latestDate: string;
  currentValue: number;
  originalValue?: number;
  isRedeemed: boolean;
};

export type GmsClientStatement = {
  clientId: string;
  clientName?: string;
  syncedAt: string;
  positions: GmsStatementPosition[];
  subscriptions?: GmsSubscriptionPosition[];
};

const statements: GmsClientStatement[] = [
  {
    clientId: "cli_aurora",
    syncedAt: "2026-06-19T09:15:00-03:00",
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
    syncedAt: "2026-06-19T09:16:00-03:00",
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
  },
  {
    clientId: "cli_monteverde",
    syncedAt: "2026-06-19T09:18:00-03:00",
    positions: [
      {
        clientId: "cli_monteverde",
        accountCode: "GMS-10887",
        balanceDate: "2026-06-19",
        currentBalance: 512430.78,
        availableBalance: 512430.78,
        productName: "GMS Caixa Safra",
        lastMovementDescription: "Saldo atualizado",
        lastMovementAmount: 0
      }
    ]
  }
];

export type GmsOfficialClient = {
  fetchStatement(clientId: string): GmsClientStatement | undefined;
};

export const gmsOfficialClient: GmsOfficialClient = {
  fetchStatement(clientId) {
    return statements.find(statement => statement.clientId === clientId);
  }
};
