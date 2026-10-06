import { clients } from "./clients";
import { simulateInvestment, simulations } from "./simulations";
import { gmsOfficialClient } from "@/src/integrations/gms-official";

export function getPlatformOverview() {
  const simulationCards = simulations.map(simulation => {
    const client = clients.find(item => item.id === simulation.clientId);
    const statement = gmsOfficialClient.fetchStatement(simulation.clientId);
    const [position] = statement?.positions ?? [];
    const simulationWithUpdatedBalance = position
      ? { ...simulation, sourceBalance: position.availableBalance }
      : simulation;
    const result = simulateInvestment(simulationWithUpdatedBalance);

    return {
      simulation: simulationWithUpdatedBalance,
      client,
      statement,
      position,
      result
    };
  });

  const totalProjectedNetIncome = simulationCards.reduce((sum, item) => sum + item.result.netIncome, 0);
  const totalInvested = simulationCards.reduce(
    (sum, item) => sum + item.simulation.sourceBalance + item.simulation.additionalContribution,
    0
  );
  const totalOfficialBalance = simulationCards.reduce(
    (sum, item) => sum + (item.position?.availableBalance ?? 0),
    0
  );
  const totalAdditionalContribution = simulationCards.reduce(
    (sum, item) => sum + item.simulation.additionalContribution,
    0
  );

  return {
    clients,
    simulationCards,
    totals: {
      clients: clients.length,
      simulations: simulations.length,
      totalInvested,
      totalOfficialBalance,
      totalAdditionalContribution,
      totalProjectedNetIncome
    }
  };
}
