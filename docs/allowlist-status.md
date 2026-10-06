# Status da base allowlist

Data: 2026-06-22 21:51 America/Sao_Paulo

## Estado atual

- Projeto novo criado em `C:\Users\Lorenzo.GMS\Documents\Codex\2026-06-22\gms-client-platform-allowlist`.
- Allowlist oficial criada em `data/my-client-codes.json`, com 113 codigos.
- Extratos detalhados salvos em `work/latest-investor-subscriptions.json`.
- Relatorio de posicao diaria filtrado salvo em `work/latest-investor-report.json`.
- 113 clientes da base estao com extrato detalhado sincronizado.
- 97 clientes da base aparecem no relatorio de posicao diaria.
- 0 clientes da base faltam extrato detalhado.
- 0 clientes fora da base foram importados para o extrato detalhado.
- Plataforma filtra relatorios e extratos para mostrar somente codigos permitidos.
- Comando seguro criado: `npm run netfactor:subscriptions:base -- --pilot --missing-only --limit=10`.
- Comando amplo `npm run netfactor:sync` esta bloqueado por padrao e exige `--allow-outside-base`.
- Nenhuma sincronizacao fora da allowlist foi iniciada.

## Fechamento dos ultimos clientes

Os ultimos clientes pendentes eram `266`, `271` e `245`.

- `245 - CHRISTIAN CHAVES KRIEGER`: sincronizado no lote final.
- `266 - JOAO ALEXANDRE`: falhava porque o lote usava nome incompleto/sem acento. Foi sincronizado com `JOÃO ALEXANDRE BERTOTTO`.
- `271 - EUTALIA MARIA LOPES`: falhava pelo mesmo padrao de nome sem acento. Foi sincronizado com `EUTÁLIA MARIA LOPES`.

O arquivo `config/pilot-investors.json` foi corrigido para usar os nomes completos desses clientes.

## Dados do projeto anterior

Foram reaproveitados somente codigo, estilos, scripts e documentacao como molde.

Os dados transferidos do projeto anterior foram filtrados pela allowlist antes de compor a base deste projeto.

## Clientes fora da base

Clientes fora de `data/my-client-codes.json` sao tratados como ocultos/ignorados:

- nao aparecem na pagina;
- nao aparecem na API de investidores;
- nao sao salvos no relatorio filtrado;
- nao podem ter subscricoes sincronizadas sem flag explicita.

## Rentabilidade e CDI medio

- A rentabilidade bruta da simulacao com extrato detalhado soma o rendimento de cada debenture antiga pela taxa real dela e o rendimento do novo aporte pela taxa informada.
- O CDI medio ponderado da carteira usa `valor atual da subscricao x % CDI`, dividido pelo total detalhado.
- A tela mostra o CDI medio da carteira e o CDI medio ponderado combinado com eventual novo aporte.
- O calculo esta protegido por teste em `src/domain/simulations.test.ts`.

## Validacao da interface

- A tela lista todos os 113 clientes da allowlist.
- O seletor contem 113 opcoes.
- Os indicadores mostram base oficial, posicao diaria, extrato detalhado, saldo conhecido e ultima atualizacao.
- Build, testes e smoke test devem ser executados apos este fechamento para validacao final da noite.
