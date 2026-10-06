"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getPositionFreshness } from "@/src/domain/data-freshness";
import type { SimulationHistoryRecord } from "@/src/domain/simulation-history";
import {
  averageMonthlyRateInPeriod,
  cdiCurve as projectedCdiCurve,
  simulateInvestment,
  simulatePortfolioInvestment,
  weightedAverageCdiPercentage,
  type PortfolioSimulationResult,
  type RateChange,
  type SimulationInput,
  type SubscriptionProjectionInput
} from "@/src/domain/simulations";

export type InvestorOption = {
  clientId: string;
  clientName: string;
  accountCode: string;
  balanceDate: string;
  currentBalance: number;
  dailyPositionBalance?: number;
  detailedBalance?: number;
  detailedBalanceDifference?: number;
  hasDetailedStatementMismatch?: boolean;
  subscriptions?: SubscriptionProjectionInput[];
  hasDailyPosition?: boolean;
  hasDetailedStatement?: boolean;
  weightedCdiPercentage?: number;
};

type InvestorSimulatorProps = {
  investors: InvestorOption[];
  generalInvestors?: InvestorOption[];
  syncedAt?: string;
  positionDate?: string;
  initialSimulations?: SimulationHistoryRecord[];
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const percent = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const date = new Intl.DateTimeFormat("pt-BR");

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo"
});

function todayIso() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function projectionLimitIso() {
  return "2027-12-31";
}

function defaultProjectionEndIso() {
  return "2026-12-31";
}

function formatIsoDateBr(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function parseBrDateToIso(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return undefined;

  const [, dayValue, monthValue, yearValue] = match;
  const day = Number(dayValue);
  const month = Number(monthValue);
  const year = Number(yearValue);
  const date = new Date(year, month - 1, day, 12);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function parseAmount(value: string) {
  return Number(value.replace(/\./g, "").replace(",", ".")) || 0;
}

function parseDecimal(value: string) {
  return Number(value.replace(",", ".")) || 0;
}

function formatRateInput(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function cleanUrlNumber(value: string) {
  return value.trim().replace(/\./g, "").replace(",", ".");
}

function cleanCrmNumber(value: string) {
  const cleaned = cleanUrlNumber(value);
  if (!cleaned) return { value: "", invalid: false };

  const numeric = Number(cleaned);
  return Number.isFinite(numeric) && numeric >= 0 ? { value: cleaned, invalid: false } : { value: "", invalid: true };
}

function formatPersonType(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[-\s]/g, "_");

  if (["pf", "fisica", "pessoa_fisica", "individual"].includes(normalized)) return "Pessoa física";
  if (["pj", "juridica", "pessoa_juridica", "company", "empresa"].includes(normalized)) return "Pessoa jurídica";

  return value.trim();
}

export function InvestorSimulator({
  investors,
  generalInvestors = [],
  syncedAt,
  positionDate,
  initialSimulations = []
}: InvestorSimulatorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const crmContext = {
    source: searchParams.get("source") ?? "",
    opportunityType: searchParams.get("opportunityType") ?? "",
    opportunityId: searchParams.get("opportunityId") ?? "",
    leadId: searchParams.get("leadId") ?? "",
    clientId: searchParams.get("clientId") ?? "",
    clientName: searchParams.get("clientName") ?? "",
    personType: searchParams.get("personType") ?? searchParams.get("tipoPessoa") ?? "",
    intendedAmount: searchParams.get("intendedAmount") ?? "",
    contractedRate: searchParams.get("contractedRate") ?? "",
    crmReturnUrl: searchParams.get("crmReturnUrl") ?? ""
  };
  const hasAppliedCrmContext = useRef(false);
  const [simulationMode, setSimulationMode] = useState<"general" | "bonas" | "prospect">("bonas");
  const [selectedClientId, setSelectedClientId] = useState(investors[0]?.clientId ?? "");
  const [sortMode, setSortMode] = useState<"name" | "balance">("name");
  const [useCurrentBalance, setUseCurrentBalance] = useState(true);
  const [prospectName, setProspectName] = useState("");
  const [manualBalance, setManualBalance] = useState("");
  const [additionalContribution, setAdditionalContribution] = useState("0");
  const [cdiPercentage, setCdiPercentage] = useState("160");
  const [cdiCurveValues, setCdiCurveValues] = useState(projectedCdiCurve.map(change => formatRateInput(change.rate)));
  const [startDateText, setStartDateText] = useState(formatIsoDateBr(todayIso()));
  const [endDateText, setEndDateText] = useState(formatIsoDateBr(defaultProjectionEndIso()));
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [crmSyncMessage, setCrmSyncMessage] = useState("");
  const [crmContextMessage, setCrmContextMessage] = useState("");
  const [activePanel, setActivePanel] = useState<"simulator" | "admin">("simulator");
  const [savedSimulations, setSavedSimulations] = useState(initialSimulations);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [historyMessage, setHistoryMessage] = useState("");
  const [isSyncingDetails, setIsSyncingDetails] = useState(false);
  const [detailsSyncMessage, setDetailsSyncMessage] = useState("");
  const [monthlyReportFile, setMonthlyReportFile] = useState<File | undefined>();
  const [isUploadingMonthlyReport, setIsUploadingMonthlyReport] = useState(false);
  const [monthlyReportMessage, setMonthlyReportMessage] = useState("");
  const startDate = parseBrDateToIso(startDateText) ?? todayIso();
  const endDate = parseBrDateToIso(endDateText) ?? defaultProjectionEndIso();
  const isProspect = simulationMode === "prospect";
  const personTypeLabel = crmContext.source === "gms-crm" ? formatPersonType(crmContext.personType) : "";

  useEffect(() => {
    if (hasAppliedCrmContext.current || crmContext.source !== "gms-crm") return;

    hasAppliedCrmContext.current = true;

    const warnings: string[] = [];
    const intendedAmount = cleanCrmNumber(crmContext.intendedAmount);
    const contractedRate = cleanCrmNumber(crmContext.contractedRate);

    if (crmContext.intendedAmount && intendedAmount.invalid) warnings.push("valor potencial inválido ignorado");
    if (crmContext.contractedRate && contractedRate.invalid) warnings.push("taxa contratada inválida ignorada");
    if (!crmContext.opportunityType) warnings.push("tipo de oportunidade não informado");

    if (contractedRate.value) {
      setCdiPercentage(contractedRate.value);
    }

    if (crmContext.clientId && crmContext.opportunityType === "bona" && investors.some(investor => investor.clientId === crmContext.clientId)) {
      setSimulationMode("bonas");
      setSelectedClientId(crmContext.clientId);
      setUseCurrentBalance(true);
      if (intendedAmount.value) setAdditionalContribution(intendedAmount.value);
      setCrmContextMessage(warnings.length ? `Dados do CRM recebidos com alerta: ${warnings.join("; ")}.` : "Dados do CRM aplicados.");
      return;
    }

    if (crmContext.clientId && crmContext.opportunityType === "client" && generalInvestors.some(investor => investor.clientId === crmContext.clientId)) {
      setSimulationMode("general");
      setSelectedClientId(crmContext.clientId);
      setUseCurrentBalance(true);
      if (intendedAmount.value) setAdditionalContribution(intendedAmount.value);
      setCrmContextMessage(warnings.length ? `Dados do CRM recebidos com alerta: ${warnings.join("; ")}.` : "Dados do CRM aplicados.");
      return;
    }

    if (crmContext.clientId && ["bona", "client"].includes(crmContext.opportunityType)) {
      warnings.push("cliente informado pelo CRM não foi localizado na base selecionada");
    }

    setSimulationMode("prospect");
    setUseCurrentBalance(false);
    setProspectName(crmContext.clientName || "Potencial cliente");
    if (intendedAmount.value) setManualBalance(intendedAmount.value);
    setCrmContextMessage(warnings.length ? `Dados do CRM recebidos com alerta: ${warnings.join("; ")}.` : "Dados do CRM aplicados.");
  }, [
    crmContext.clientId,
    crmContext.clientName,
    crmContext.contractedRate,
    crmContext.intendedAmount,
    crmContext.opportunityType,
    crmContext.personType,
    crmContext.source,
    generalInvestors,
    investors
  ]);

  const activeInvestors = simulationMode === "general" ? generalInvestors : investors;
  const summaryTitle =
    simulationMode === "general"
      ? "Clientes Gerais"
      : simulationMode === "bonas"
      ? "Clientes Bonas"
      : "Potencial Cliente";
  const summaryInvestors = isProspect ? [] : activeInvestors;
  const summaryWithPosition = summaryInvestors.filter(investor => investor.hasDailyPosition).length;
  const summaryWithDetails = summaryInvestors.filter(investor => investor.hasDetailedStatement).length;
  const summaryWithVerifiedRates = summaryInvestors.filter(
    investor => investor.hasDetailedStatement && !investor.hasDetailedStatementMismatch
  ).length;
  const summaryWithMismatchedDetails = summaryInvestors.filter(investor => investor.hasDetailedStatementMismatch).length;
  const summaryTotalBalance = summaryInvestors.reduce((sum, investor) => sum + investor.currentBalance, 0);
  const summaryPositionLabel = simulationMode === "general" ? "Com extrato completo" : "Com posição diária";
  const summaryMissingPositionLabel = simulationMode === "general" ? "Sem extrato completo" : "Sem posição diária";
  const summaryWithPositionValue = simulationMode === "general" ? summaryWithDetails : summaryWithPosition;
  const summaryWithoutPositionValue = Math.max(summaryInvestors.length - summaryWithPositionValue, 0);
  const dataFreshness = getPositionFreshness(positionDate);

  useEffect(() => {
    if (!isProspect && activeInvestors.length && !activeInvestors.some(investor => investor.clientId === selectedClientId)) {
      setSelectedClientId(activeInvestors[0]?.clientId ?? "");
    }
  }, [activeInvestors, isProspect, selectedClientId]);

  const sortedInvestors = useMemo(() => {
    return [...activeInvestors].sort((first, second) => {
      if (sortMode === "balance") return second.currentBalance - first.currentBalance;
      return first.clientName.localeCompare(second.clientName, "pt-BR");
    });
  }, [activeInvestors, sortMode]);

  const selectedInvestor = activeInvestors.find(investor => investor.clientId === selectedClientId);
  const clientName = isProspect ? prospectName.trim() || "Potencial cliente" : selectedInvestor?.clientName ?? "";
  const accountCode = isProspect ? "prospect" : selectedInvestor?.accountCode ?? "";
  const detailedSubscriptions = selectedInvestor?.subscriptions ?? [];
  const hasDetailedStatementMismatch = Boolean(selectedInvestor?.hasDetailedStatementMismatch);
  const canUseDetailedSubscriptions = !isProspect && useCurrentBalance && detailedSubscriptions.length > 0 && !hasDetailedStatementMismatch;
  const detailedBalance = detailedSubscriptions.reduce((sum, subscription) => sum + subscription.currentValue, 0);
  const dailyPositionBalance = selectedInvestor?.dailyPositionBalance ?? 0;
  const shouldUseCurrentBalance = !isProspect && useCurrentBalance;
  const sourceBalance = isProspect
    ? 0
    : shouldUseCurrentBalance
    ? canUseDetailedSubscriptions
      ? detailedBalance
      : dailyPositionBalance
    : parseAmount(manualBalance);
  const contribution = parseAmount(isProspect ? manualBalance : additionalContribution);
  const baseAmount = sourceBalance + contribution;
  const portfolioWeightedCdi = isProspect ? undefined : selectedInvestor?.weightedCdiPercentage;
  const cdiCurve: RateChange[] = projectedCdiCurve.map((change, index) => ({
    ...change,
    rate: parseDecimal(cdiCurveValues[index] ?? String(change.rate))
  }));

  const simulation = useMemo(() => {
    if (canUseDetailedSubscriptions) {
      return simulatePortfolioInvestment({
        id: "live-simulation",
        clientId: selectedClientId || "manual",
        title: "Simulação interna",
        existingSubscriptions: detailedSubscriptions,
        additionalContribution: contribution,
        additionalContributionCdiPercentage: Number(cdiPercentage) || 0,
        startDate,
        endDate,
        status: "draft"
      }, cdiCurve);
    }

    const input: SimulationInput = {
      id: "live-simulation",
      clientId: selectedClientId || "manual",
      title: "Simulação interna",
      sourceBalance,
      additionalContribution: contribution,
      cdiPercentage: Number(cdiPercentage) || 0,
      startDate,
      endDate,
      status: "draft"
    };

    return simulateInvestment(input, cdiCurve);
  }, [
    canUseDetailedSubscriptions,
    cdiCurveValues,
    detailedSubscriptions,
    selectedClientId,
    sourceBalance,
    contribution,
    cdiPercentage,
    startDate,
    endDate
  ]);
  const chartValues = simulation.monthly.map(month => month.closing);
  const minChartValue = Math.min(baseAmount, ...chartValues);
  const maxChartValue = Math.max(baseAmount, ...chartValues, 1);
  const chartRange = Math.max(maxChartValue - minChartValue, 1);
  const combinedWeightedCdi =
    canUseDetailedSubscriptions && "weightedCdiPercentage" in simulation
      ? (simulation as PortfolioSimulationResult).weightedCdiPercentage
      : weightedAverageCdiPercentage([
          { subscriptionId: "saldo", currentValue: sourceBalance, cdiPercentage: Number(cdiPercentage) || 0 },
          { subscriptionId: "aporte", currentValue: contribution, cdiPercentage: Number(cdiPercentage) || 0 }
        ]);
  const averageMonthlyGrossRate = averageMonthlyRateInPeriod(simulation.grossRate, startDate, endDate);
  const sortedSavedSimulations = useMemo(
    () => [...savedSimulations].sort((first, second) => second.generatedAt.localeCompare(first.generatedAt)),
    [savedSimulations]
  );
  const comparedSimulations = comparisonIds
    .map(id => savedSimulations.find(record => record.id === id))
    .filter((record): record is SimulationHistoryRecord => Boolean(record));

  async function refreshSimulationHistory() {
    const response = await fetch("/api/admin/simulations", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));

    if (response.ok && payload.ok && Array.isArray(payload.simulations)) {
      setSavedSimulations(payload.simulations);
    }
  }

  function buildHistoryRecord(generatedAt: string): SimulationHistoryRecord {
    return {
      id: crypto.randomUUID(),
      generatedAt,
      clientId: isProspect ? undefined : selectedClientId,
      clientName,
      accountCode,
      simulationMode,
      personType: crmContext.personType || undefined,
      sourceBalance,
      additionalContribution: contribution,
      cdiPercentage: Number(cdiPercentage) || 0,
      startDate,
      endDate,
      grossBalance: simulation.grossBalance,
      grossIncome: simulation.grossIncome,
      incomeTax: simulation.incomeTax,
      netIncome: simulation.netIncome,
      grossRate: simulation.grossRate,
      monthlyGrossRate: averageMonthlyGrossRate,
      netBalance: simulation.netBalance,
      combinedWeightedCdi,
      businessDays: simulation.businessDays,
      elapsedDays: simulation.elapsedDays,
      monthlyCount: simulation.monthly.length,
      crmOpportunityId: crmContext.opportunityId || undefined,
      crmLeadId: crmContext.leadId || undefined
    };
  }

  async function saveSimulationHistory(record: SimulationHistoryRecord) {
    const response = await fetch("/api/admin/simulations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });

    if (!response.ok) throw new Error("Simulação gerada, mas não foi possível salvar no painel administrativo.");
    await refreshSimulationHistory();
  }

  function reopenSimulation(record: SimulationHistoryRecord) {
    setActivePanel("simulator");
    setSimulationMode(record.simulationMode);
    if (record.clientId) setSelectedClientId(record.clientId);
    setUseCurrentBalance(record.simulationMode !== "prospect");
    setProspectName(record.simulationMode === "prospect" ? record.clientName : "");
    setManualBalance(record.simulationMode === "prospect" ? String(record.additionalContribution).replace(".", ",") : String(record.sourceBalance).replace(".", ","));
    setAdditionalContribution(String(record.additionalContribution).replace(".", ","));
    setCdiPercentage(String(record.cdiPercentage).replace(".", ","));
    setStartDateText(formatIsoDateBr(record.startDate));
    setEndDateText(formatIsoDateBr(record.endDate));
    setHistoryMessage(`Simulação de ${record.clientName} reaberta para edição.`);
  }

  function toggleComparison(recordId: string) {
    setComparisonIds(current => {
      if (current.includes(recordId)) return current.filter(id => id !== recordId);
      return [...current, recordId].slice(-3);
    });
  }

  async function generatePdf() {
    setIsGeneratingPdf(true);
    setPdfError("");
    setCrmSyncMessage("");
    setHistoryMessage("");

    try {
      const generatedAt = new Date().toISOString();
      const historyRecord = buildHistoryRecord(generatedAt);
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        throw new Error("O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente novamente.");
      }
      printWindow.document.write("<p style=\"font-family: Arial, sans-serif; padding: 24px;\">Preparando simulação GMS...</p>");

      const response = await fetch("/api/simulations/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          accountCode,
          generatedAt,
          startDate,
          endDate,
          isProspect,
          sourceBalance,
          dailyPositionBalance: !isProspect && selectedInvestor?.hasDailyPosition ? dailyPositionBalance : undefined,
          additionalContribution: contribution,
          baseAmount,
          grossBalance: simulation.grossBalance,
          grossIncome: simulation.grossIncome,
          incomeTax: simulation.incomeTax,
          netIncome: simulation.netIncome,
          grossRate: simulation.grossRate,
          monthlyGrossRate: averageMonthlyGrossRate,
          annualizedGrossRate: simulation.annualizedGrossRate,
          netBalance: simulation.netBalance,
          taxRate: simulation.taxRate,
          businessDays: simulation.businessDays,
          elapsedDays: simulation.elapsedDays,
          portfolioWeightedCdi,
          combinedWeightedCdi,
          cdiCurve,
          monthly: simulation.monthly
        })
      });

      if (!response.ok) throw new Error("Não foi possível gerar o PDF.");

      const html = await response.text();
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      await saveSimulationHistory(historyRecord);
      setHistoryMessage("Simulação salva no painel administrativo.");

      if (crmContext.source === "gms-crm" && crmContext.opportunityId && crmContext.crmReturnUrl) {
        const crmResponse = await fetch("/api/crm/simulations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            crmReturnUrl: crmContext.crmReturnUrl,
            opportunityId: crmContext.opportunityId,
            leadId: crmContext.leadId,
            clientId: crmContext.clientId || accountCode,
            clientName,
            personType: crmContext.personType,
            accountCode,
            amount: baseAmount,
            baseAmount,
            sourceBalance,
            additionalContribution: contribution,
            cdiAnnualRate: cdiCurve[0]?.rate ?? 0,
            productAnnualRate: simulation.annualizedGrossRate,
            annualizedGrossRate: simulation.annualizedGrossRate,
            grossRate: simulation.grossRate,
            grossBalance: simulation.grossBalance,
            grossIncome: simulation.grossIncome,
            netBalance: simulation.netBalance,
            netIncome: simulation.netIncome,
            monthly: simulation.monthly,
            generatedAt: new Date().toISOString()
          })
        });

        if (!crmResponse.ok) {
          const payload = await crmResponse.json().catch(() => ({}));
          throw new Error(payload.message ?? "PDF gerado, mas nao foi possivel vincular a simulacao ao CRM.");
        }

        setCrmSyncMessage("Simulacao vinculada ao CRM.");
      }
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function syncDetailedStatement() {
    if (isProspect || !selectedInvestor) return;
    const confirmed = window.confirm(
      `Atualizar o extrato detalhado do cliente ${selectedInvestor.accountCode} - ${selectedInvestor.clientName}?`
    );
    if (!confirmed) return;

    setIsSyncingDetails(true);
    setDetailsSyncMessage("");

    try {
      const response = await fetch("/api/sync/investor-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountCode: selectedInvestor.accountCode,
          investorName: selectedInvestor.clientName
        })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Não foi possível atualizar o extrato detalhado.");
      }

      setDetailsSyncMessage(
        `Extrato atualizado: ${payload.activeSubscriptions ?? payload.subscriptions ?? 0} subscrições ativas. Atualize a página para usar os dados novos.`
      );
    } catch (error) {
      setDetailsSyncMessage(error instanceof Error ? error.message : "Não foi possível atualizar o extrato detalhado.");
    } finally {
      setIsSyncingDetails(false);
    }
  }

  async function uploadMonthlyDetailedReport() {
    if (!monthlyReportFile) {
      setMonthlyReportMessage("Selecione o PDF do extrato mensal detalhado antes de enviar.");
      return;
    }

    setIsUploadingMonthlyReport(true);
    setMonthlyReportMessage("");

    try {
      const formData = new FormData();
      formData.append("report", monthlyReportFile);
      const response = await fetch("/api/sync/monthly-detailed-subscriptions", {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error ||
            `Não foi possível importar o extrato mensal detalhado. Erro ${response.status}: ${response.statusText || "sem detalhe"}`
        );
      }

      setMonthlyReportMessage(
        `Relatório importado: ${payload.general?.clients ?? 0} clientes gerais e ${payload.imported ?? 0} clientes Bonas atualizados. Data da posição: ${payload.positionDate ? formatIsoDateBr(payload.positionDate) : "não informada"}. Ignorados/fora da base Bonas: ${payload.skipped ?? 0}. Atualizando a tela com os dados novos.`
      );
      router.refresh();
    } catch (error) {
      setMonthlyReportMessage(error instanceof Error ? error.message : "Não foi possível importar o extrato mensal detalhado.");
    } finally {
      setIsUploadingMonthlyReport(false);
    }
  }

  function resetScenario() {
    setSimulationMode("bonas");
    setSelectedClientId(investors[0]?.clientId ?? "");
    setSortMode("name");
    setUseCurrentBalance(true);
    setProspectName("");
    setManualBalance("");
    setAdditionalContribution("0");
    setCdiPercentage("160");
    setCdiCurveValues(projectedCdiCurve.map(change => formatRateInput(change.rate)));
    setStartDateText(formatIsoDateBr(todayIso()));
    setEndDateText(formatIsoDateBr(defaultProjectionEndIso()));
    setPdfError("");
    setDetailsSyncMessage("");
    setMonthlyReportFile(undefined);
    setMonthlyReportMessage("");
  }

  if (!investors.length) {
    return (
      <section className="panel simulator-panel" id="live-simulator">
        <div className="panel-title">
          <div>
            <span className="eyebrow">SIMULADOR</span>
            <h2>Nenhum saldo sincronizado</h2>
          </div>
        </div>
        <p className="empty-state">Rode a sincronizacao do NetFactor para carregar os investidores.</p>
      </section>
    );
  }

  return (
    <section className="simulator-panel reference-simulator" id="live-simulator">
      <nav className="admin-tabs" aria-label="Áreas do simulador">
        <button
          className={activePanel === "simulator" ? "active" : ""}
          type="button"
          onClick={() => setActivePanel("simulator")}
        >
          Simulador
        </button>
        <button
          className={activePanel === "admin" ? "active" : ""}
          type="button"
          onClick={() => {
            setActivePanel("admin");
            void refreshSimulationHistory();
          }}
        >
          Simulações geradas
        </button>
      </nav>

      {activePanel === "admin" ? (
        <section className="admin-panel" aria-label="Painel administrativo de simulações">
          <div className="panel-title">
            <div>
              <span className="eyebrow">ADMINISTRATIVO</span>
              <h2>Simulações geradas</h2>
            </div>
            <b className="pill">{savedSimulations.length} registros</b>
          </div>

          {comparedSimulations.length > 0 && (
            <section className="comparison-panel" aria-label="Comparação de cenários">
              <div className="section-title-row">
                <div>
                  <span className="eyebrow">COMPARAÇÃO</span>
                  <h3>Cenários lado a lado</h3>
                </div>
                <button className="button secondary" type="button" onClick={() => setComparisonIds([])}>
                  Limpar comparação
                </button>
              </div>
              <div className="comparison-grid" style={{ "--scenario-count": comparedSimulations.length } as React.CSSProperties}>
                {comparedSimulations.map(record => (
                  <article className="comparison-card" key={record.id}>
                    <span>{record.simulationMode === "bonas" ? "Cliente Bona" : record.simulationMode === "general" ? "Cliente Geral" : "Potencial"}</span>
                    <h4>{record.clientName}</h4>
                    <dl>
                      <div><dt>Aporte</dt><dd>{money.format(record.additionalContribution)}</dd></div>
                      <div><dt>Taxa</dt><dd>{percent.format(record.cdiPercentage)}% CDI</dd></div>
                      <div><dt>Vencimento</dt><dd>{formatIsoDateBr(record.endDate)}</dd></div>
                      <div><dt>Saldo bruto</dt><dd>{money.format(record.grossBalance)}</dd></div>
                      <div><dt>Rendimento bruto</dt><dd>{money.format(record.grossIncome)}</dd></div>
                      <div><dt>Rendimento líquido</dt><dd>{money.format(record.netIncome)}</dd></div>
                      <div><dt>Média mensal</dt><dd>{percent.format(record.monthlyGrossRate * 100)}% a.m.</dd></div>
                    </dl>
                    <button className="button secondary" type="button" onClick={() => reopenSimulation(record)}>
                      Reabrir cenário
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {savedSimulations.length ? (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Comparar</th>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Aporte</th>
                    <th>Taxa</th>
                    <th>Vencimento</th>
                    <th>Saldo estimado</th>
                    <th>Média mensal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSavedSimulations.map(record => (
                    <tr key={record.id}>
                      <td>
                        <input
                          aria-label={`Comparar simulação de ${record.clientName}`}
                          checked={comparisonIds.includes(record.id)}
                          type="checkbox"
                          onChange={() => toggleComparison(record.id)}
                        />
                      </td>
                      <td>{dateTime.format(new Date(record.generatedAt))}</td>
                      <td>
                        <strong>{record.clientName}</strong>
                        <span>{record.accountCode || "Potencial cliente"}</span>
                      </td>
                      <td>{record.simulationMode === "bonas" ? "Cliente Bona" : record.simulationMode === "general" ? "Cliente Geral" : "Potencial"}</td>
                      <td>{money.format(record.additionalContribution)}</td>
                      <td>{percent.format(record.cdiPercentage)}% CDI</td>
                      <td>{formatIsoDateBr(record.endDate)}</td>
                      <td>{money.format(record.grossBalance)}</td>
                      <td>{percent.format(record.monthlyGrossRate * 100)}% a.m.</td>
                      <td>
                        <button className="button secondary" type="button" onClick={() => reopenSimulation(record)}>
                          Reabrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">Nenhuma simulação salva ainda. Gere um PDF para criar o primeiro registro.</p>
          )}
        </section>
      ) : (
      <>
      {!isProspect && (
        <section className="metric-grid compact simulator-summary" aria-label={`Resumo de ${summaryTitle}`}>
          <article>
            <span>Base selecionada</span>
            <strong>{summaryTitle}</strong>
          </article>
          <article>
            <span>Clientes ativos</span>
            <strong>{summaryInvestors.length}</strong>
          </article>
          <article>
            <span>{summaryPositionLabel}</span>
            <strong>{summaryWithPositionValue}</strong>
          </article>
          <article>
            <span>{summaryMissingPositionLabel}</span>
            <strong>{summaryWithoutPositionValue}</strong>
          </article>
          <article>
            <span>Taxas verificadas</span>
            <strong>{summaryWithVerifiedRates}</strong>
          </article>
          <article>
            <span>Extrato divergente</span>
            <strong>{summaryWithMismatchedDetails}</strong>
          </article>
          <article>
            <span>Extratos salvos</span>
            <strong>{summaryWithDetails}</strong>
          </article>
          <article className="metric-wide">
            <span>Saldo total conhecido</span>
            <strong>{money.format(summaryTotalBalance)}</strong>
          </article>
          <article>
            <span>Última atualização</span>
            <strong className="metric-date">
              {syncedAt ? dateTime.format(new Date(syncedAt)) : "Pendente"}
            </strong>
          </article>
          <article>
            <span>Data da posição</span>
            <strong className="metric-date">
              {positionDate ? formatIsoDateBr(positionDate) : "Pendente"}
            </strong>
          </article>
        </section>
      )}
      {!isProspect && (
        <div className={`data-freshness data-freshness-${dataFreshness.status}`}>
          <strong>{dataFreshness.status === "current" ? "Base em dia" : "Atenção à base"}</strong>
          <span>{dataFreshness.message}</span>
          <small>O extrato mensal detalhado do NetFactor sempre reflete o fechamento do dia útil anterior.</small>
        </div>
      )}

      <div className="simulator-toolbar">
        <div>
          <span className="eyebrow">GMS</span>
          <h2>Simulador de investimentos</h2>
        </div>
        <div className="toolbar-actions">
          <button className="button secondary" type="button" onClick={resetScenario}>
            Restaurar cenário
          </button>
          <button className="button primary" type="button" onClick={generatePdf} disabled={isGeneratingPdf}>
            {isGeneratingPdf ? "Abrindo PDF..." : "Compartilhar em PDF"}
          </button>
        </div>
      </div>
      {crmSyncMessage && <p className="form-success">{crmSyncMessage}</p>}
      {historyMessage && <p className="form-success">{historyMessage}</p>}

      <div className="simulator-grid">
        <aside className="simulator-sidebar" aria-label="Dados da simulação">
          <div className="sidebar-heading">
            <span className="eyebrow">NOVA SIMULACAO</span>
            <h2>Monte um cenário para seu cliente</h2>
            <p>Os resultados sao recalculados automaticamente conforme as premissas.</p>
          </div>

        <form className="simulator-form">
          <fieldset className="mode-switch">
            <legend>Tipo de simulação</legend>
            <label>
              <input
                type="radio"
                name="simulation-mode"
                value="general"
                checked={simulationMode === "general"}
                onChange={() => {
                  setSimulationMode("general");
                  setSelectedClientId(generalInvestors[0]?.clientId ?? "");
                  setUseCurrentBalance(true);
                }}
              />
              <span>Clientes Gerais</span>
            </label>
            <label>
              <input
                type="radio"
                name="simulation-mode"
                value="bonas"
                checked={simulationMode === "bonas"}
                onChange={() => {
                  setSimulationMode("bonas");
                  setSelectedClientId(investors[0]?.clientId ?? "");
                  setUseCurrentBalance(true);
                }}
              />
              <span>Clientes Bonas</span>
            </label>
            <label>
              <input
                type="radio"
                name="simulation-mode"
                value="prospect"
                checked={simulationMode === "prospect"}
                onChange={() => {
                  setSimulationMode("prospect");
                  setUseCurrentBalance(false);
                }}
              />
              <span>Potencial Cliente</span>
            </label>
          </fieldset>

          {isProspect ? (
            <label>
              <span>Nome do potencial cliente</span>
              <input
                value={prospectName}
                onChange={event => setProspectName(event.target.value)}
                placeholder="Digite o nome do cliente"
              />
            </label>
          ) : (
          <label>
            <span>Nome do cliente</span>
            <select value={selectedClientId} onChange={event => setSelectedClientId(event.target.value)}>
              {sortedInvestors.map(investor => (
                <option key={investor.clientId} value={investor.clientId}>
                  {investor.accountCode ? `${investor.accountCode} - ` : ""}{investor.clientName}
                </option>
              ))}
            </select>
          </label>
          )}

          {!isProspect && <label>
            <span>Ordenar lista</span>
            <select value={sortMode} onChange={event => setSortMode(event.target.value as "name" | "balance")}>
              <option value="name">Ordem alfabetica</option>
              <option value="balance">Maior saldo bruto primeiro</option>
            </select>
          </label>}

          {!isProspect && <label className="toggle-row">
            <input
              type="checkbox"
              checked={useCurrentBalance}
              onChange={event => setUseCurrentBalance(event.target.checked)}
            />
            <span>Usar saldo atualizado do NetFactor</span>
          </label>}

          <label>
            <span>{isProspect ? "Novo aporte" : "Saldo bruto atual"}</span>
            <div className="input-shell">
              <small>R$</small>
              <input
                value={shouldUseCurrentBalance ? money.format(sourceBalance).replace("R$", "").trim() : manualBalance}
                onChange={event => setManualBalance(event.target.value)}
                disabled={shouldUseCurrentBalance}
                placeholder="0,00"
              />
            </div>
          </label>

          {!isProspect && <label>
            <span>Novo aporte</span>
            <div className="input-shell">
              <small>R$</small>
              <input value={additionalContribution} onChange={event => setAdditionalContribution(event.target.value)} />
            </div>
          </label>}

          <div className="form-row">
          <label>
            <span>Rentabilidade contratada</span>
            <div className="input-shell">
              <input value={cdiPercentage} onChange={event => setCdiPercentage(event.target.value)} />
              <small>% do CDI</small>
            </div>
          </label>
            <label>
              <span>Data de aplicação</span>
              <input
                type="date"
                lang="pt-BR"
                value={startDate}
                onChange={event => setStartDateText(formatIsoDateBr(event.target.value))}
              />
            </label>
            <label>
              <span>Data de vencimento</span>
              <input
                type="date"
                lang="pt-BR"
                max={projectionLimitIso()}
                value={endDate}
                onChange={event => setEndDateText(formatIsoDateBr(event.target.value))}
              />
            </label>
          </div>

          <details className="curve-editor">
            <summary>
              <span>Curva Selic/Copom projetada</span>
              <small>Reuniões de 2026 e 2027</small>
            </summary>
            <div className="curve-list">
              {projectedCdiCurve.map((change, index) => (
                <label className="curve-row" key={change.date}>
                  <span>{change.label}</span>
                  <div className="input-shell compact">
                    <input
                      value={cdiCurveValues[index] ?? ""}
                      onChange={event => {
                        const nextValues = [...cdiCurveValues];
                        nextValues[index] = event.target.value;
                        setCdiCurveValues(nextValues);
                      }}
                    />
                    <small>% a.a.</small>
                  </div>
                </label>
              ))}
            </div>
          </details>
        </form>

          <div className="simulator-actions">
            {simulationMode === "bonas" && (
              <button
                className="button secondary"
                type="button"
                onClick={syncDetailedStatement}
                disabled={isSyncingDetails}
              >
                {isSyncingDetails ? "Atualizando extrato..." : "Atualizar extrato detalhado deste cliente"}
              </button>
            )}
            <div className="manual-report-upload">
              <strong>Atualizar por extrato mensal</strong>
              <span>Suba o PDF consolidado do NetFactor. O sistema atualiza a base geral e filtra os clientes Bonas.</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={event => setMonthlyReportFile(event.target.files?.[0])}
              />
              <button
                className="button secondary"
                type="button"
                onClick={uploadMonthlyDetailedReport}
                disabled={isUploadingMonthlyReport}
              >
                {isUploadingMonthlyReport ? "Importando relatório..." : "Submeter relatório mensal"}
              </button>
            </div>
            <div className="calculation-note">
              <strong>Como calculamos</strong>
              <span>Capitalização em dias úteis, CDI diário equivalente, IR regressivo e rentabilidade média mensal equivalente no período.</span>
            </div>
            {pdfError && <span className="form-error">{pdfError}</span>}
            {hasDetailedStatementMismatch && (
              <span className="form-error">
                Extrato detalhado divergente do saldo diário. A simulação está usando o saldo da posição diária; atualize o extrato deste cliente antes de usar as taxas antigas.
              </span>
            )}
            {detailsSyncMessage && <span className="form-info">{detailsSyncMessage}</span>}
            {monthlyReportMessage && <span className="form-info">{monthlyReportMessage}</span>}
            {crmContextMessage && <span className="form-info">{crmContextMessage}</span>}
          </div>
        </aside>

        <article className="proposal-sheet">
          <header className="proposal-header">
            <div className="proposal-brand">
              <img src="/brand/logo-gms-transparent.png" alt="GMS Securitizadora" />
              <div>
                <strong>GMS SECURITIZADORA</strong>
                <span>Simulação de investimento</span>
              </div>
            </div>
            <div className="proposal-client">
              <span>Preparado para</span>
              <strong>{clientName}</strong>
              <small>{personTypeLabel ? `${personTypeLabel} · ` : ""}{date.format(new Date())}</small>
            </div>
          </header>

          <section className="proposal-hero">
            <div>
              <span>Saldo bruto estimado</span>
              <strong>{money.format(simulation.grossBalance)}</strong>
              <small>ao final do período selecionado</small>
            </div>
            <div>
              <span>Rentabilidade bruta</span>
              <strong>{percent.format(simulation.grossRate * 100)}%</strong>
              <small>Rentabilidade média mensal: {percent.format(averageMonthlyGrossRate * 100)}% ao mês</small>
              <small>CDI médio ponderado: {percent.format(combinedWeightedCdi)}% do CDI</small>
            </div>
          </section>

          <section className={`proposal-metrics ${isProspect ? "proposal-metrics-prospect" : "proposal-metrics-base"}`}>
            {isProspect ? (
              <div>
                <span>Novo aporte</span>
                <strong>{money.format(contribution)}</strong>
              </div>
            ) : (
              <>
                <div>
                  <span>Saldo bruto atual</span>
                  <strong>{money.format(sourceBalance)}</strong>
                </div>
                <div>
                  <span>Novo aporte</span>
                  <strong>{money.format(contribution)}</strong>
                </div>
              </>
            )}
            <div>
              <span>Rendimento bruto</span>
              <strong>{money.format(simulation.grossIncome)}</strong>
              <small>Rentabilidade média mensal: {percent.format(averageMonthlyGrossRate * 100)}% ao mês</small>
              <small>Rentabilidade bruta no período: {percent.format(simulation.grossRate * 100)}%</small>
            </div>
            <div>
              <span>IR estimado</span>
              <strong>{money.format(simulation.incomeTax)}</strong>
              <small>IR médio de {percent.format(simulation.taxRate * 100)}%</small>
            </div>
            <div className="metric-highlight">
              <span>Rendimento líquido</span>
              <strong>{money.format(simulation.netIncome)}</strong>
              <small>após retenção estimada</small>
            </div>
          </section>

          <section className="proposal-chart">
            <div className="section-title-row">
              <div>
                <span className="eyebrow">EVOLUÇÃO</span>
                <h3>Projeção do saldo</h3>
              </div>
              <b>{simulation.businessDays} dias úteis</b>
            </div>
            <div className="bar-chart" aria-label="Projeção mensal do saldo">
              <div className="chart-scale" aria-hidden="true">
                <span>{money.format(maxChartValue).replace(",00", "")}</span>
                <span>{money.format(minChartValue).replace(",00", "")}</span>
              </div>
              <div
                className={`bar-series ${simulation.monthly.length > 10 ? "bar-series-dense" : ""}`}
                style={{ "--month-count": simulation.monthly.length } as React.CSSProperties}
              >
                {simulation.monthly.map((month, index) => {
                  const height = 34 + ((month.closing - minChartValue) / chartRange) * 130;
                  return (
                    <div className="bar-item" key={`${month.month}-${index}`}>
                      <span>{money.format(month.closing).replace(",00", "")}</span>
                      <i style={{ height: `${height}px` }} />
                      <small>{month.month}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="proposal-details">
            <div>
              <span className="eyebrow">DETALHAMENTO</span>
              <h3>Evolução mensal</h3>
              <div className="monthly-table">
                <table>
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>CDI a.a.</th>
                      <th>Rentab. mês</th>
                      <th>Rendimento</th>
                      <th>Saldo final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.monthly.map((month, index) => (
                      <tr key={`${month.month}-${index}`}>
                        <td>{month.month}</td>
                        <td>{percent.format(month.cdi)}%</td>
                        <td>{percent.format(month.grossRate * 100)}%</td>
                        <td>{money.format(month.income)}</td>
                        <td>{money.format(month.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <aside>
              <span className="eyebrow">PREMISSAS</span>
              <h3>Resumo do cenário</h3>
              <dl>
                <div>
                  <dt>Aplicação</dt>
                  <dd>{formatIsoDateBr(startDate)}</dd>
                </div>
                <div>
                  <dt>Vencimento</dt>
                  <dd>{formatIsoDateBr(endDate)}</dd>
                </div>
                <div>
                  <dt>CDI médio ponderado</dt>
                  <dd>{percent.format(combinedWeightedCdi)}% do CDI</dd>
                </div>
                <div>
                  <dt>Base aplicada</dt>
                  <dd>{money.format(baseAmount)}</dd>
                </div>
                <div>
                  <dt>CDI médio carteira</dt>
                  <dd>{portfolioWeightedCdi !== undefined ? `${percent.format(portfolioWeightedCdi)}%` : "Sem extrato"}</dd>
                </div>
                {canUseDetailedSubscriptions && (
                  <div>
                    <dt>Subscricoes</dt>
                    <dd>{detailedSubscriptions.length} taxas reais</dd>
                  </div>
                )}
              </dl>
            </aside>
          </section>
        </article>
      </div>
      </>
      )}
    </section>
  );
}
