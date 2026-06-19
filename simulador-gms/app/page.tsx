"use client";

import { useMemo, useState } from "react";

const CDI_CHANGES_2026 = [
  { date: "2026-01-28", label: "27 e 28 de jan.", rate: 14.9 },
  { date: "2026-03-18", label: "17 e 18 de mar.", rate: 14.65 },
  { date: "2026-04-29", label: "28 e 29 de abr.", rate: 14.4 },
  { date: "2026-06-17", label: "16 e 17 de jun.", rate: 14.15 },
  { date: "2026-08-05", label: "04 e 05 de ago.", rate: 14.15 },
  { date: "2026-09-16", label: "15 e 16 de set.", rate: 13.9 },
  { date: "2026-11-04", label: "03 e 04 de nov.", rate: 13.9 },
  { date: "2026-12-09", label: "08 e 09 de dez.", rate: 13.65 }
];

const HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03",
  "2026-04-21", "2026-05-01", "2026-06-04", "2026-09-07",
  "2026-10-12", "2026-11-02", "2026-11-20", "2026-12-25"
]);

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

type MonthlyResult = {
  month: string;
  opening: number;
  income: number;
  closing: number;
  cdi: number;
};

type RateChange = {
  date: string;
  label?: string;
  rate: number;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const percent = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const chartMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function isoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6 && !HOLIDAYS_2026.has(isoDate(date));
}

function incomeTaxRate(days: number) {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

function simulate(
  initialAmount: number,
  cdiPercentage: number,
  startDate: string,
  endDate: string,
  cdiChanges: RateChange[]
) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  let balance = initialAmount;
  let businessDays = 0;
  let cursor = new Date(start);
  let currentMonth = cursor.getMonth();
  let monthOpening = balance;
  let monthIncome = 0;
  const monthly: MonthlyResult[] = [];

  function rateAt(date: Date) {
    const dateKey = isoDate(date);
    let currentRate = cdiChanges[0]?.rate ?? 0;
    for (const change of cdiChanges) {
      if (change.date <= dateKey) currentRate = change.rate;
    }
    return currentRate;
  }

  while (cursor <= end) {
    const month = cursor.getMonth();
    if (month !== currentMonth) {
      monthly.push({
        month: MONTHS[currentMonth]!,
        opening: monthOpening,
        income: monthIncome,
        closing: balance,
        cdi: rateAt(new Date(cursor.getFullYear(), currentMonth + 1, 0, 12))
      });
      currentMonth = month;
      monthOpening = balance;
      monthIncome = 0;
    }

    if (isBusinessDay(cursor)) {
      const annualCdi = rateAt(cursor);
      const dailyCdi = Math.pow(1 + annualCdi / 100, 1 / 252) - 1;
      const income = balance * dailyCdi * (cdiPercentage / 100);
      balance += income;
      monthIncome += income;
      businessDays += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  monthly.push({
    month: MONTHS[currentMonth]!,
    opening: monthOpening,
    income: monthIncome,
    closing: balance,
    cdi: rateAt(end)
  });

  const elapsedDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  );
  const grossIncome = balance - initialAmount;
  const taxRate = incomeTaxRate(elapsedDays);
  const incomeTax = grossIncome * taxRate;
  const netBalance = balance - incomeTax;

  return {
    grossBalance: balance,
    grossIncome,
    incomeTax,
    netIncome: grossIncome - incomeTax,
    netBalance,
    grossRate: grossIncome / initialAmount,
    netRate: (grossIncome - incomeTax) / initialAmount,
    taxRate,
    businessDays,
    elapsedDays,
    monthly
  };
}

export default function HomePage() {
  const [clientName, setClientName] = useState("Cliente GMS");
  const [amount, setAmount] = useState(100_000);
  const [cdiPercentage, setCdiPercentage] = useState(160);
  const [startDate, setStartDate] = useState("2026-06-10");
  const [endDate, setEndDate] = useState("2026-12-31");
  const [cdiChanges, setCdiChanges] = useState(CDI_CHANGES_2026);
  const [showCurve, setShowCurve] = useState(false);

  const result = useMemo(
    () => simulate(amount, cdiPercentage, startDate, endDate, cdiChanges),
    [amount, cdiPercentage, startDate, endDate, cdiChanges]
  );

  const maxBalance = Math.max(...result.monthly.map(item => item.closing), amount);
  const balanceGrowth = Math.max(maxBalance - amount, 1);
  const generatedAt = new Intl.DateTimeFormat("pt-BR").format(new Date());

  function updateCdi(index: number, value: number) {
    setCdiChanges(current =>
      current.map((change, rateIndex) =>
        rateIndex === index ? { ...change, rate: value } : change
      )
    );
  }

  function resetSimulation() {
    setClientName("Cliente GMS");
    setAmount(100_000);
    setCdiPercentage(160);
    setStartDate("2026-06-10");
    setEndDate("2026-12-31");
    setCdiChanges(CDI_CHANGES_2026);
  }

  return (
    <main className="app-shell">
      <header className="topbar no-print">
        <div className="brand">
          <img className="brand-logo" src="/brand/logo-gms-transparent.png" alt="GMS Securitizadora" />
          <div>
            <strong>GMS</strong>
            <small>Simulador de investimentos</small>
          </div>
        </div>
        <div className="top-actions">
          <button className="button ghost" onClick={resetSimulation}>Restaurar cenário</button>
          <button className="button primary" onClick={() => window.print()}>Compartilhar em PDF</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="control-panel no-print">
          <div className="panel-heading">
            <span className="eyebrow">NOVA SIMULAÇÃO</span>
            <h1>Monte um cenário para seu cliente</h1>
            <p>Os resultados são recalculados automaticamente conforme as premissas.</p>
          </div>

          <div className="field-group">
            <label>
              <span>Nome do cliente</span>
              <input value={clientName} onChange={event => setClientName(event.target.value)} />
            </label>

            <label>
              <span>Valor investido</span>
              <div className="input-affix">
                <i>R$</i>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={amount}
                  onChange={event => setAmount(Math.max(Number(event.target.value), 1))}
                />
              </div>
            </label>

            <label>
              <span>Rentabilidade contratada</span>
              <div className="input-affix suffix">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cdiPercentage}
                  onChange={event => setCdiPercentage(Math.max(Number(event.target.value), 1))}
                />
                <i>% do CDI</i>
              </div>
            </label>

            <div className="two-columns">
              <label>
                <span>Data de aplicação</span>
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={event => setStartDate(event.target.value)}
                />
              </label>
              <label>
                <span>Data de vencimento</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={event => setEndDate(event.target.value)}
                />
              </label>
            </div>
          </div>

          <button className="curve-toggle" onClick={() => setShowCurve(value => !value)}>
            <span>
              <strong>Curva de CDI projetada</strong>
              <small>Cenário otimista 2026 da planilha</small>
            </span>
            <b>{showCurve ? "−" : "+"}</b>
          </button>

          {showCurve && (
            <div className="curve-grid">
              {cdiChanges.map((change, index) => (
                <label key={change.date}>
                  <span>{change.label ?? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(parseDate(change.date))}</span>
                  <input
                    type="number"
                    step="0.05"
                    value={change.rate}
                    onChange={event => updateCdi(index, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
          )}

          <div className="method-note">
            <strong>Como calculamos</strong>
            <p>Capitalização em dias úteis, CDI diário equivalente e IR regressivo sobre o rendimento.</p>
          </div>
        </aside>

        <article className="report" aria-label="Relatório da simulação">
          <header className="report-header">
            <div className="brand report-brand">
              <img className="brand-logo" src="/brand/logo-gms-transparent.png" alt="GMS Securitizadora" />
              <div>
                <strong>GMS SECURITIZADORA</strong>
                <small>Simulação de investimento</small>
              </div>
            </div>
            <div className="report-meta">
              <span>Preparado para</span>
              <strong>{clientName || "Cliente GMS"}</strong>
              <small>{generatedAt}</small>
            </div>
          </header>

          <section className="hero-result">
            <div>
              <span>Saldo bruto estimado</span>
              <strong>{money.format(result.grossBalance)}</strong>
              <small>ao final do período selecionado</small>
            </div>
            <div className="hero-rate">
              <span>Rentabilidade bruta</span>
              <strong>{percent.format(result.grossRate * 100)}%</strong>
              <small>{percent.format(cdiPercentage)}% do CDI</small>
            </div>
          </section>

          <section className="kpi-grid">
            <div>
              <span>Valor investido</span>
              <strong>{money.format(amount)}</strong>
            </div>
            <div>
              <span>Rendimento bruto</span>
              <strong>{money.format(result.grossIncome)}</strong>
              <small>{percent.format(result.grossRate * 100)}% no período</small>
            </div>
            <div>
              <span>IR estimado</span>
              <strong>{money.format(result.incomeTax)}</strong>
              <small>Alíquota de {percent.format(result.taxRate * 100)}%</small>
            </div>
            <div className="accent-card">
              <span>Rendimento líquido</span>
              <strong>{money.format(result.netIncome)}</strong>
              <small>após retenção estimada</small>
            </div>
          </section>

          <section className="chart-card">
            <div className="section-title">
              <div>
                <span className="eyebrow">EVOLUÇÃO</span>
                <h2>Projeção do saldo</h2>
              </div>
              <div className="period-pill">
                {result.businessDays} dias úteis
              </div>
            </div>
            <div className="balance-chart">
              {result.monthly.map(item => {
                const height = 20 + ((item.closing - amount) / balanceGrowth) * 76;
                return (
                  <div className="bar-column" key={item.month}>
                    <span>{chartMoney.format(item.closing)}</span>
                    <div className="bar-track">
                      <i style={{ height: `${height}%` }} />
                    </div>
                    <strong>{item.month}</strong>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="details-grid">
            <div className="projection-table">
              <div className="section-title compact">
                <div>
                  <span className="eyebrow">DETALHAMENTO</span>
                  <h2>Evolução mensal</h2>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>CDI a.a.</th>
                      <th>Rendimento</th>
                      <th>Saldo final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.monthly.map(item => (
                      <tr key={item.month}>
                        <td>{item.month}</td>
                        <td>{percent.format(item.cdi)}%</td>
                        <td>{money.format(item.income)}</td>
                        <td>{money.format(item.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="assumptions-card">
              <span className="eyebrow">PREMISSAS</span>
              <h2>Resumo do cenário</h2>
              <dl>
                <div><dt>Aplicação</dt><dd>{new Intl.DateTimeFormat("pt-BR").format(parseDate(startDate))}</dd></div>
                <div><dt>Vencimento</dt><dd>{new Intl.DateTimeFormat("pt-BR").format(parseDate(endDate))}</dd></div>
                <div><dt>Prazo</dt><dd>{result.elapsedDays} dias corridos</dd></div>
                <div><dt>Indexador</dt><dd>{percent.format(cdiPercentage)}% do CDI</dd></div>
                <div><dt>Tributação</dt><dd>IR regressivo</dd></div>
                <div><dt>Liquidez indicativa</dt><dd>{amount <= 100_000 ? "D+1" : "D+5"}</dd></div>
              </dl>
            </div>
          </section>

          <footer className="report-footer">
            <strong>Informações importantes</strong>
            <p>
              Esta simulação é meramente ilustrativa e utiliza as premissas informadas.
              Não representa garantia de rentabilidade, oferta ou recomendação de investimento.
              Os resultados podem variar conforme CDI realizado, datas, tributação e regras da operação.
            </p>
            <div>
              <span>GMS Securitizadora</span>
              <small>Documento gerado em {generatedAt}</small>
            </div>
          </footer>
        </article>
      </section>
    </main>
  );
}
