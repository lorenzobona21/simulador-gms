# Proximo passo: robo do NetFactor

Este e o passo-a-passo para transformar o fluxo manual do NetFactor em uma rotina automatica.

## O que ja esta pronto

- `.env.local` criado com as variaveis necessarias.
- Parser do PDF real criado em `src/integrations/netfactor-position-parser.ts`.
- Teste do parser criado em `src/integrations/netfactor-position-parser.test.ts`.
- O PDF real manual foi validado: 760 registros, 195 contas e zero linhas rejeitadas.
- O PDF agrupado baixado pelo robo foi validado: 195 investidores, 195 contas e zero linhas rejeitadas.
- Rotina Vercel agendada para dias uteis as 09:00 de Brasilia.
- Robo inicial criado em `src/integrations/netfactor-robot.ts`.
- Script local criado em `scripts/run-netfactor-robot.mjs`.
- O robo ja faz login no NetFactor, abre a tela `Posicao de Debentures`, preenche a data, marca `Agrupamento por Debenturista`, envia o formulario e captura o PDF quando executado com navegador visivel.
- A rota `/api/sync/investor-report` pode usar o robo quando `NETFACTOR_SYNC_MODE=robot`.

## O que falta implementar

1. Decidir onde o robo vai rodar em producao: direto na Vercel ou em uma maquina autorizada da GMS.
2. Testar a execucao em ambiente invisivel/headless, pois o NetFactor travou esperando o PDF nesse modo durante o teste local.
3. Salvar apenas o saldo atualizado mais recente em banco de dados.
4. Criar o botao manual `Atualizar relatorio agora`.
5. Ligar a tela do simulador aos saldos sincronizados.

## Status do teste do robo

O robo foi testado localmente e chegou ate o POST final:

- Login: OK.
- Abertura da tela `Posicao de Debentures`: OK.
- Data atual: OK.
- `Agrupamento por Debenturista`: OK.
- `Nao imprime resgatadas`: OK.
- Envio do formulario: OK.
- Captura do PDF em navegador visivel: OK.
- Captura do PDF em navegador invisivel/headless: pendente.
- Extracao do PDF agrupado: OK, 195 contas.

O corpo do POST final inclui os campos esperados, por exemplo:

- `imprimir=true`
- `empCodigo=1`
- `escrituracao=0`
- `serie=0`
- `dataReferenciaAtu=DD/MM/AAAA`
- `agrupamentoPorDebenturista=on`

O NetFactor, porem, deixou a requisicao pendente quando acionado em modo invisivel/headless. Em modo visivel, o robo capturou a URL do PDF em `/netFactor/pdf/reports/*.pdf`, baixou o arquivo e extraiu os saldos.

## Descoberta do PDF

No fluxo manual, o PDF abre em URL com este padrao:

- `https://sistemagms.isafe.tec.br/netFactor/pdf/reports/{arquivo}.pdf`

Exemplo informado:

- `https://sistemagms.isafe.tec.br/netFactor/pdf/reports/8.7867756408467.pdf`

O robo foi ajustado para capturar respostas, popups ou paginas com `/netFactor/pdf/reports/*.pdf`.

## Como testar com seguranca

Primeiro teste deve ser local e visivel, com navegador aberto, para confirmar os cliques.

Depois que funcionar no ambiente escolhido:

- rodar em modo automatico;
- proteger as credenciais;
- publicar na Vercel;
- cadastrar as mesmas variaveis de ambiente na Vercel;
- ativar a rotina diaria.

Para forcar o navegador visivel:

- `NETFACTOR_HEADLESS=false`

Para usar o robo na rota de sincronizacao:

- `NETFACTOR_SYNC_MODE=robot`

## Possivel bloqueio

Se o NetFactor bloquear navegador automatico, a alternativa e rodar o robo em uma maquina autorizada da GMS e enviar o PDF processado para o CRM.

## Variaveis usadas

- `NETFACTOR_URL`
- `NETFACTOR_USERNAME`
- `NETFACTOR_PASSWORD`
- `NETFACTOR_SYNC_MODE`
- `NETFACTOR_HEADLESS`
- `GMS_SYNC_SECRET`
- `APP_LOGIN_USERNAME`
- `APP_LOGIN_PASSWORD`
