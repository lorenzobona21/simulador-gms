# GMS Client Platform Allowlist

Projeto limpo para a plataforma interna GMS, separado do thread/projeto anterior e limitado a base de clientes autorizada em `data/my-client-codes.json`.

## Regra principal da base

- A plataforma mostra somente investidores cujo codigo de conta esteja em `data/my-client-codes.json`.
- Relatorios importados ou sincronizados sao filtrados antes de serem salvos em `work/latest-investor-report.json`.
- Extratos analiticos de subscricoes fora da allowlist sao recusados pelo comando e pela API.
- Uma lista ampla do NetFactor so pode rodar com `--allow-outside-base`, e deve ter aprovacao explicita antes.

## O que foi copiado do projeto anterior

Copiado como referencia limpa:

- `app/`, `src/`, `scripts/`, `docs/`, `config/`, `public/brand/`
- `package.json`, `package-lock.json`, `tsconfig.json`, `vercel.json`, `.env.example`

Nao copiado:

- `.env.local`
- `.next/`
- `node_modules/`
- `work/`
- `outputs/`
- qualquer execucao travada do thread anterior

Este projeto nao altera o simulador publicado nem a pasta original `C:\Users\Lorenzo.GMS\Documents\Geracao de leads`.

## Comandos seguros

Instalar dependencias:

```bash
npm install
```

Rodar a plataforma local:

```bash
npm run dev
```

Atualizar saldos diarios e publicar o snapshot novo na Vercel:

```bash
atualizar-saldos-e-publicar-gms.cmd
```

Instalar a rotina automatica no Windows, de segunda a sexta as 08:30:

```bash
instalar-rotina-diaria-gms.cmd
```

Observacao: a Vercel usa os snapshots em `data/latest-investor-report.json` e
`data/latest-investor-subscriptions.json`. A atualizacao automatica confiavel
fica no Windows porque a Vercel nao deve gravar estes JSONs como armazenamento
persistente.

Sincronizar extratos analiticos apenas para a base permitida, usando o ultimo relatorio filtrado salvo em `work/`:

```bash
npm run netfactor:subscriptions:base
```

Auditar a qualidade dos dados antes de confiar nas taxas detalhadas:

```bash
npm run data:audit
```

O simulador usa a posicao diaria como fonte principal de saldo. Quando o
extrato detalhado nao bate com a posicao diaria, as taxas antigas daquele
cliente ficam marcadas como pendentes ate o extrato ser atualizado e conciliado.

Atualizar as taxas e aplicacoes pelo Extrato Mensal Subscricao Detalhado:

```bash
npm run netfactor:monthly-detailed -- --confirm-netfactor
```

Este comando abre o NetFactor com codigo `0` ate `999999`, nome em branco,
mes atual e ano atual. O PDF bruto pode conter clientes fora da base, mas a
importacao grava somente codigos presentes em `data/my-client-codes.json`.

Tambem e possivel enviar manualmente o PDF consolidado pelo site, na lateral do
simulador em "Atualizar por extrato mensal". Esse envio usa a mesma importacao
segura: separa as subscricoes por cliente, preserva taxas diferentes de CDI,
saldos brutos atuais e resgates, e ignora tudo que estiver fora da base oficial.
A rotina automatica diaria de saldos continua separada.

Rodar somente alguns clientes da base:

```bash
npm run netfactor:subscriptions:base -- --limit=5
```

O comando abaixo fica bloqueado por padrao porque captura a posicao ampla do NetFactor:

```bash
npm run netfactor:sync
```

Para qualquer sincronizacao real longa no NetFactor, primeiro confirme o plano operacional. Nao inicie coleta ampla sem aprovacao explicita.

## Visual e foco

A primeira tela preserva o foco do simulador GMS:

- selecao de investidor;
- formulario de saldo/aporte/CDI;
- resultado projetado;
- tabela mensal;
- base filtrada pela allowlist.

Exportacao PDF por cliente continua como proximo passo de produto.
