import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import {
  extractGeneralInvestorSubscriptionsFromPdfData,
  importMonthlyDetailedSubscriptionsFromPdfData
} from "@/src/integrations/netfactor-monthly-detailed-subscriptions";
import { readGeneralInvestorSubscriptionStore, saveGeneralInvestorSubscriptionStore } from "@/src/integrations/general-investor-subscription-store";
import { readInvestorSubscriptionStore, saveInvestorSubscriptionStore } from "@/src/integrations/investor-subscription-store";
import { buildCrmBonaStore, parseCrmBonaClients } from "@/src/integrations/crm-bona-classification";
import { calculateCustodyMovements, saveLatestCustodyMovementSummary } from "@/src/integrations/custody-movement-store";
import { canUseRemoteJsonStore } from "@/src/integrations/remote-json-store";
import { listMonthlyCustodyAccounts } from "@/src/integrations/monthly-custody-account-summary";

export const runtime = "nodejs";
export const maxDuration = 300;

function safeUploadName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 90) || "extrato-mensal-detalhado.pdf";
}

function previousSaoPauloDateIso() {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  if (process.env.VERCEL === "1" && !canUseRemoteJsonStore()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Para atualizar direto no site publicado, conecte um Vercel Blob Store ao projeto. Depois o upload do extrato mensal detalhado atualiza a base sem redeploy."
      },
      { status: 400 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("report") ?? formData.get("file");
    const bonaClientsValue = formData.get("bonaClients");
    const bonaClients = typeof bonaClientsValue === "string"
      ? parseCrmBonaClients(JSON.parse(bonaClientsValue))
      : undefined;

    if (formData.get("reclassifyOnly") === "true") {
      if (!bonaClients) throw new Error("Envie a classificacao atual do CRM.");
      const currentGeneral = await readGeneralInvestorSubscriptionStore();
      if (!currentGeneral) throw new Error("Nenhum extrato geral salvo para recuperar a base Bona.");
      const recovered = buildCrmBonaStore(currentGeneral, bonaClients);
      await saveInvestorSubscriptionStore(recovered, bonaClients.map((client) => client.accountCode));
      const recoveredAccounts = Object.values(recovered.accounts);
      return NextResponse.json({
        ok: true,
        imported: recoveredAccounts.length,
        activeClients: recoveredAccounts.filter((account) => account.subscriptions.some((item) => !item.isRedeemed && item.currentValue > 0)).length,
        totalBalance: recoveredAccounts.reduce((sum, account) => sum + account.totalCurrentValue, 0),
        positionDate: recovered.positionDate,
        classificationSource: recovered.classificationSource
      });
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Envie o PDF do extrato mensal detalhado." },
        { status: 400 }
      );
    }

    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json(
        { ok: false, error: "O arquivo precisa ser um PDF." },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const positionDate = previousSaoPauloDateIso();
    const referenceMonth = positionDate.slice(0, 7);
    const [previousGeneralStore, previousBonaStore] = await Promise.all([
      readGeneralInvestorSubscriptionStore().catch(() => undefined),
      readInvestorSubscriptionStore().catch(() => undefined)
    ]);
    const classification = bonaClients ?? (previousBonaStore?.classificationSource === "crm"
      ? Object.values(previousBonaStore.accounts).map(({ accountCode, clientName }) => ({ accountCode, clientName }))
      : undefined);
    let uploadPath: string | undefined;

    if (process.env.VERCEL !== "1") {
      const uploadDir = join(process.cwd(), "work", "uploads");
      uploadPath = join(uploadDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeUploadName(file.name)}`);
      await mkdir(uploadDir, { recursive: true });
      await writeFile(uploadPath, bytes);
    }

    const generalStore = await extractGeneralInvestorSubscriptionsFromPdfData(new Uint8Array(bytes), { positionDate });
    let result;
    if (classification) {
      const classifiedStore = buildCrmBonaStore(generalStore, classification);
      await saveInvestorSubscriptionStore(classifiedStore, classification.map((client) => client.accountCode));
      result = {
        ok: true,
        imported: Object.keys(classifiedStore.accounts).length,
        skipped: Object.keys(generalStore.accounts).length - Object.keys(classifiedStore.accounts).length
      };
    } else {
      result = await importMonthlyDetailedSubscriptionsFromPdfData(new Uint8Array(bytes), { positionDate });
    }
    const generalOutputPath = await saveGeneralInvestorSubscriptionStore(generalStore);
    const bonaStore = await readInvestorSubscriptionStore().catch(() => undefined);
    const generalMovements = calculateCustodyMovements(previousGeneralStore, generalStore, referenceMonth);
    const bonaMovements = calculateCustodyMovements(previousBonaStore, bonaStore, referenceMonth);
    const movements = {
      referenceMonth,
      positionDate,
      inflows: generalMovements.inflows,
      redemptions: generalMovements.redemptions,
      bonaInflows: bonaMovements.inflows,
      bonaRedemptions: bonaMovements.redemptions,
      calculatedAt: new Date().toISOString(),
      method: "subscription-diff" as const
    };
    await saveLatestCustodyMovementSummary(movements);
    const generalAccounts = Object.values(generalStore.accounts);
    const generalSubscriptions = generalAccounts.reduce((sum, account) => sum + account.subscriptions.length, 0);
    const generalBalance = generalAccounts.reduce((sum, account) => sum + account.totalCurrentValue, 0);
    const accounts = listMonthlyCustodyAccounts(generalAccounts, referenceMonth);

    return NextResponse.json({
      ...result,
      general: {
        clients: generalAccounts.length,
        subscriptions: generalSubscriptions,
        totalBalance: generalBalance,
        outputPath: generalOutputPath,
        accounts
      },
      accounts,
      positionDate,
      movements,
      uploadPath,
      storage: process.env.VERCEL === "1" ? "vercel-blob" : "local",
      message: `Relatorio importado: ${generalAccounts.length} clientes gerais e ${result.imported} clientes Bonas atualizados. Data da posicao: ${positionDate}. Paginas fora da base Bonas ou sem vinculo: ${result.skipped}.`
    });
  } catch (error) {
    console.error("monthly detailed upload failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Nao foi possivel importar o extrato mensal detalhado."
      },
      { status: 500 }
    );
  }
}
