# Arquitetura recomendada para atualizacao diaria

Data: 2026-06-22

## Decisao principal

Nao usar o robo de tela para atualizar 113 extratos detalhados todos os dias.

O caminho robusto e:

1. atualizar diariamente a posicao/saldo consolidado dos clientes;
2. manter o extrato detalhado de debentures em cache;
3. atualizar detalhes em blocos pequenos, sob demanda ou quando houver divergencia.

## Por que nao usar o robo como rotina diaria completa

O robo depende de:

- login no NetFactor;
- frames internos;
- popup de impressao;
- geracao de PDF;
- parsing de texto do PDF;
- internet e DNS estaveis;
- tempo de resposta por cliente.

Nos testes, clientes individuais levaram perto de 2 minutos e alguns falharam por timeout, tela incompleta ou PDF que nao terminou de aparecer. Isso e aceitavel para carga assistida, mas fragil para rotina diaria obrigatoria.

## Rotina diaria proposta

### 1. Posicao diaria

Entrada ideal:

- PDF consolidado do NetFactor;
- Excel/CSV exportado;
- API ou arquivo em pasta/SharePoint/SFTP.

Processo:

```bash
npm run daily:import-position
```

O comando deve:

- ler o arquivo diario;
- filtrar somente `data/my-client-codes.json`;
- atualizar `work/latest-investor-report.json`;
- preservar `work/latest-investor-subscriptions.json`;
- gerar resumo de importacao.

### 2. Extrato detalhado cacheado

O detalhe por subscricao fica em:

```text
work/latest-investor-subscriptions.json
```

Atualizar somente:

- cliente novo;
- cliente sem detalhe;
- cliente com saldo divergente;
- cliente solicitado manualmente;
- blocos pequenos fora do horario de uso.

Comando operacional:

```bash
npm run netfactor:subscriptions:base -- --pilot --missing-only --limit=5 --timeout-seconds=210 --retries=1
```

## Estado atual

- Base oficial: 113 clientes.
- Com posicao diaria: 97 clientes.
- Com extrato detalhado: 75 clientes.
- Faltando extrato detalhado: 38 clientes.
- Clientes fora da base: 0.

## Comportamento da interface

A interface deve:

- listar todos os 113 clientes da allowlist;
- mostrar quando ha posicao diaria;
- mostrar quando ha extrato detalhado;
- usar extrato detalhado para CDI medio ponderado quando disponivel;
- permitir simulacao manual quando detalhe ainda estiver pendente;
- nunca ocultar cliente da allowlist apenas porque falta detalhe.

## Proximo passo definitivo

Descobrir qual e a melhor fonte diaria exportavel do NetFactor:

1. relatorio consolidado em PDF;
2. exportacao Excel/CSV;
3. envio automatico por email;
4. pasta compartilhada;
5. API/consulta direta.

Depois disso, implementar `daily:import-position` para depender de arquivo estruturado, nao de 113 navegacoes.
