export type SimulationHistoryRecord = {
  id: string;
  generatedAt: string;
  clientId?: string;
  clientName: string;
  accountCode: string;
  simulationMode: "general" | "bonas" | "prospect";
  personType?: string;
  sourceBalance: number;
  additionalContribution: number;
  cdiPercentage: number;
  startDate: string;
  endDate: string;
  grossBalance: number;
  grossIncome: number;
  incomeTax: number;
  netIncome: number;
  grossRate: number;
  monthlyGrossRate: number;
  netBalance: number;
  combinedWeightedCdi: number;
  businessDays: number;
  elapsedDays: number;
  monthlyCount: number;
  crmOpportunityId?: string;
  crmLeadId?: string;
};

export type SimulationHistoryStore = {
  updatedAt: string;
  simulations: SimulationHistoryRecord[];
};
