import { readLatestInvestorReport } from "@/src/integrations/investor-report-store";
import { readInvestorSubscriptionStore } from "@/src/integrations/investor-subscription-store";
import { readGeneralInvestorSubscriptionStore } from "@/src/integrations/general-investor-subscription-store";
import { readSimulationHistoryStore } from "@/src/integrations/simulation-history-store";
import { filterSubscriptionStoreToAllowlist, myClientCodes, normalizeClientCode } from "@/src/domain/client-allowlist";
import { weightedAverageCdiPercentage } from "@/src/domain/simulations";
import { InvestorSimulator, type InvestorOption } from "./investor-simulator";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo"
});

const dateOnly = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo"
});

const percent = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

type DailyPositionStatus = {
  ok?: boolean;
  finishedAt?: string;
  visibleClients?: number;
  positions?: number;
  totalBalance?: number;
  hiddenOutsideBase?: number;
  error?: string;
};

async function readDailyPositionStatus() {
  try {
    const contents = await readFile(join(process.cwd(), "work", "daily-position-sync-status.json"), "utf8");
    return JSON.parse(contents) as DailyPositionStatus;
  } catch {
    return undefined;
  }
}

async function getLatestInvestors(): Promise<{
  investors: InvestorOption[];
  generalInvestors: InvestorOption[];
  syncedAt?: string;
  positionDate?: string;
  dailyStatus?: DailyPositionStatus;
}> {
  const [report, rawSubscriptionStore, generalSubscriptionStore] = await Promise.all([
    readLatestInvestorReport().catch(() => undefined),
    readInvestorSubscriptionStore().catch(() => undefined),
    readGeneralInvestorSubscriptionStore().catch(() => undefined)
  ]);
  const dailyStatus = await readDailyPositionStatus();
  const subscriptionStore = filterSubscriptionStoreToAllowlist(rawSubscriptionStore);
  const bonaAccountCodes = myClientCodes.length > 0
    ? myClientCodes
    : Object.keys(subscriptionStore?.accounts ?? {}).map(normalizeClientCode);
  const statementsByCode = new Map(
    (report?.statements ?? []).map(statement => [
      normalizeClientCode(statement.positions[0]?.accountCode),
      statement
    ])
  );

  const investors = bonaAccountCodes.map(accountCode => {
      const statement = statementsByCode.get(accountCode);
      const subscriptionSummary = subscriptionStore?.accounts[accountCode];
      const activeSubscriptions =
        subscriptionSummary?.subscriptions.filter(subscription => !subscription.isRedeemed && subscription.currentValue > 0) ?? [];
      const positionBalance = statement?.positions.reduce((sum, position) => sum + position.currentBalance, 0);
      const detailedBalance = subscriptionSummary?.totalCurrentValue ?? 0;
      const detailIsPreferred = Boolean(subscriptionSummary);
      const detailedBalanceDifference =
        positionBalance !== undefined && subscriptionSummary
          ? Math.abs(positionBalance - detailedBalance)
          : 0;
      const hasDetailedStatementMismatch = false;
      const usableSubscriptions = hasDetailedStatementMismatch ? [] : activeSubscriptions;
      const currentBalance = detailIsPreferred ? detailedBalance : positionBalance ?? detailedBalance;

      return {
        clientId: `netfactor_${accountCode}`,
        clientName: statement?.clientName ?? subscriptionSummary?.clientName ?? accountCode,
        accountCode,
        balanceDate: statement?.positions[0]?.balanceDate ?? "",
        currentBalance,
        dailyPositionBalance: positionBalance,
        detailedBalance,
        detailedBalanceDifference,
        hasDetailedStatementMismatch,
        hasDailyPosition: Boolean(statement),
        hasDetailedStatement: Boolean(subscriptionSummary),
        subscriptions: usableSubscriptions,
        weightedCdiPercentage: usableSubscriptions.length ? weightedAverageCdiPercentage(usableSubscriptions) : undefined
      };
    }).filter(investor => (investor.subscriptions?.length ?? 0) > 0 || (!investor.hasDetailedStatement && investor.currentBalance > 0));

  const generalInvestors = Object.entries(generalSubscriptionStore?.accounts ?? {})
    .map(([clientKey, summary]) => {
      const activeSubscriptions = summary.subscriptions.filter(subscription => !subscription.isRedeemed && subscription.currentValue > 0);
      return {
        clientId: `general_${clientKey}`,
        clientName: summary.clientName,
        accountCode: summary.accountCode.startsWith("code:") || summary.accountCode.startsWith("doc:") || summary.accountCode.startsWith("name:")
          ? ""
          : summary.accountCode,
        balanceDate: "",
        currentBalance: summary.totalCurrentValue,
        detailedBalance: summary.totalCurrentValue,
        detailedBalanceDifference: 0,
        hasDetailedStatementMismatch: false,
        hasDailyPosition: false,
        hasDetailedStatement: true,
        subscriptions: activeSubscriptions,
        weightedCdiPercentage: activeSubscriptions.length ? weightedAverageCdiPercentage(activeSubscriptions) : undefined
      };
    })
    .filter(investor => (investor.subscriptions?.length ?? 0) > 0)
    .sort((first, second) => first.clientName.localeCompare(second.clientName, "pt-BR"));

  return {
    syncedAt: generalSubscriptionStore?.syncedAt ?? subscriptionStore?.syncedAt ?? report?.syncedAt,
    positionDate: generalSubscriptionStore?.positionDate ?? subscriptionStore?.positionDate,
    dailyStatus,
    investors,
    generalInvestors
  };
}

export default async function HomePage() {
  const [latestInvestors, simulationHistory] = await Promise.all([
    getLatestInvestors(),
    readSimulationHistoryStore()
  ]);
  const investorsWithPosition = latestInvestors.investors.filter(investor => investor.hasDailyPosition).length;
  const investorsWithoutPosition = latestInvestors.investors.length - investorsWithPosition;
  const investorsWithDetails = latestInvestors.investors.filter(investor => investor.hasDetailedStatement).length;
  const investorsWithVerifiedRates = latestInvestors.investors.filter(
    investor => investor.hasDetailedStatement && !investor.hasDetailedStatementMismatch
  ).length;
  const investorsWithMismatchedDetails = latestInvestors.investors.filter(
    investor => investor.hasDetailedStatementMismatch
  ).length;
  const totalKnownBalance = latestInvestors.investors.reduce((sum, investor) => sum + investor.currentBalance, 0);
  const consolidatedInvestors = latestInvestors.generalInvestors.length
    ? latestInvestors.generalInvestors
    : latestInvestors.investors;
  const consolidatedSubscriptions = consolidatedInvestors.reduce(
    (sum, investor) => sum + (investor.subscriptions?.length ?? 0),
    0
  );
  const consolidatedBalance = consolidatedInvestors.reduce((sum, investor) => sum + investor.currentBalance, 0);
  const dailyStatus = latestInvestors.dailyStatus;

  return (
    <main className="simulator-page">
      <header className="classic-header">
        <img src="/brand/logo-gms-transparent.png" alt="GMS Securitizadora" />
        <div>
          <span className="eyebrow">SIMULADOR INTERNO GMS</span>
          <h1>Simulador GMS</h1>
          <p>
            Selecione um investidor, use o saldo atual sincronizado e compare a projeção com ou sem novo aporte.
          </p>
        </div>
      </header>

      {false && (
      <section className="metric-grid compact" aria-label="Resumo da base sincronizada">
        <article>
          <span>Clientes ativos</span>
          <strong>{latestInvestors.investors.length}</strong>
        </article>
        <article>
          <span>Com posição diária</span>
          <strong>{investorsWithPosition}</strong>
        </article>
        <article>
          <span>Sem posição diária</span>
          <strong>{investorsWithoutPosition}</strong>
        </article>
        <article>
          <span>Taxas verificadas</span>
          <strong>{investorsWithVerifiedRates}</strong>
        </article>
        <article>
          <span>Extrato divergente</span>
          <strong>{investorsWithMismatchedDetails}</strong>
        </article>
        <article>
          <span>Extratos salvos</span>
          <strong>{investorsWithDetails}</strong>
        </article>
        <article className="metric-wide">
          <span>Saldo total conhecido</span>
          <strong>{money.format(totalKnownBalance)}</strong>
        </article>
        <article>
          <span>Última atualização</span>
          <strong className="metric-date">
            {latestInvestors.syncedAt ? dateTime.format(new Date(latestInvestors.syncedAt!)) : "Pendente"}
          </strong>
        </article>
      </section>
      )}

      <section className={`sync-status ${dailyStatus?.ok === false ? "sync-status-error" : ""}`}>
        <div>
          <span className="eyebrow">ROTINA DIÁRIA</span>
          <h2>Posição de debenturista</h2>
          <p>
            {dailyStatus
              ? dailyStatus.ok
                ? `Última atualização concluída em ${dailyStatus.finishedAt ? dateTime.format(new Date(dailyStatus.finishedAt)) : "horário não informado"}.`
                : `Última atualização falhou: ${dailyStatus.error ?? "erro não informado"}.`
              : latestInvestors.syncedAt
                ? `Base consolidada atualizada em ${dateTime.format(new Date(latestInvestors.syncedAt))}. ${latestInvestors.positionDate ? `Valores referentes a ${dateOnly.format(new Date(`${latestInvestors.positionDate}T12:00:00-03:00`))}.` : ""}`
                : "Nenhuma rotina diária registrada ainda."}
          </p>
        </div>
        <div className="sync-status-grid">
          <span>Clientes consolidados <b>{consolidatedInvestors.length}</b></span>
          <span>Subscrições ativas <b>{consolidatedSubscriptions}</b></span>
          <span>Data da posição <b>{latestInvestors.positionDate ? dateOnly.format(new Date(`${latestInvestors.positionDate}T12:00:00-03:00`)) : "Pendente"}</b></span>
          <span>Fora da base ignorados <b>0</b></span>
          <span>Saldo consolidado <b>{money.format(consolidatedBalance)}</b></span>
        </div>
      </section>

      <InvestorSimulator
        investors={latestInvestors.investors}
        generalInvestors={latestInvestors.generalInvestors}
        syncedAt={latestInvestors.syncedAt}
        positionDate={latestInvestors.positionDate}
        initialSimulations={simulationHistory.simulations}
      />

      <section className="panel" id="clients">
        <div className="panel-title">
          <div>
            <span className="eyebrow">BASE PERMITIDA</span>
            <h2>Investidores carregados da allowlist</h2>
          </div>
          <b className="pill">{investorsWithVerifiedRates} verificados, {investorsWithMismatchedDetails} divergentes</b>
        </div>

        <div className="client-list real-client-list">
          {latestInvestors.investors.map(investor => (
            <div className="client-row" key={investor.clientId}>
              <div>
                <strong>{investor.accountCode} - {investor.clientName}</strong>
                <span>
                  {investor.hasDetailedStatement
                    ? investor.hasDetailedStatementMismatch
                      ? `Extrato detalhado divergente do saldo diário em ${money.format(investor.detailedBalanceDifference ?? 0)}`
                      : `${investor.subscriptions?.length ?? 0} subscrições ativas detalhadas`
                    : "Aguardando extrato analítico"}
                  {investor.hasDailyPosition
                    ? " - posição diária carregada"
                    : investor.currentBalance > 0
                      ? " - sem posição diária, saldo pelo extrato"
                      : " - sem posição diária"}
                </span>
              </div>
              <div>
                <span>{investor.hasDetailedStatement ? "Saldo do extrato mensal" : "Saldo da posição diária"}</span>
                <b>{money.format(investor.currentBalance)}</b>
              </div>
              <div>
                <span>CDI médio ponderado</span>
                <b>
                  {investor.weightedCdiPercentage !== undefined
                    ? `${percent.format(investor.weightedCdiPercentage)}%`
                    : "Pendente"}
                </b>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
