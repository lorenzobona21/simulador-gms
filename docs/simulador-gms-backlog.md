# Backlog - Simulador GMS

Atualizado em: 23/09/2026

Legenda:
- `[x]` Confirmado por codigo, teste, build ou publicacao recente.
- `[~]` Parcial: existe implementacao, mas ainda depende de teste manual/integracao real.
- `[ ]` Pendente.

## Prioridade Imediata

- [x] Homologar a versao atualmente publicada.
  - Validado no site publicado pelo usuario.
- [x] Confirmar prazo permitido ate 31/12/2027.
- [x] Confirmar curva das reunioes do Copom de 2027.
- [x] Atualizar predefinicao da curva CDI apos Copom de 04 e 05/08/2026.
  - Decisao operacional: Selic 14,00% a.a. e CDI operacional 13,90% a.a.
  - Entrada central `2026-08-05` alterada de 14,15 para 13,90, preservando data e rotulo.
  - Simulacoes historicas e dados importados do NetFactor nao foram alterados.
- [x] Atualizar predefinicao da curva CDI apos Copom de 15 e 16/09/2026.
  - Decisao operacional: Selic 13,75% a.a. e CDI operacional 13,65% a.a.
  - Entrada central `2026-09-16` mantida em 13,65 e todas as reunioes seguintes permanecem em 13,65 ate nova alteracao expressa.
  - Simulacoes historicas, base de clientes e dados importados do NetFactor nao foram alterados.
- [x] Fechamento executivo de producao em 23/09/2026.
  - Producao verificada com CDI 13,65% a.a. desde a reuniao de 16/09/2026 e nas reunioes seguintes.
  - Validacao registrada: 24/24 testes, build aprovado e deployment Vercel `READY`.
  - Nenhuma nova alteracao autorizada; area permanece em manutencao operacional.
  - NetFactor nao foi sincronizado e a base de clientes nao foi alterada.
- [x] Confirmar edicao das premissas autorizadas.
  - Taxa do CDI por reuniao Copom, datas, aporte, saldo manual e cliente/potencial cliente.
- [x] Validar a media mensal pela metodologia oficial aprovada.
  - Metodologia: taxa mensal equivalente capitalizada.
  - Formula: `(1 + rentabilidadeBrutaPeriodo) ^ (1 / mesesComerciais) - 1`.
- [x] Confirmar evolucao mensal completa na tela.
- [x] Confirmar todos os meses no PDF.
- [x] Confirmar que o PDF permanece em uma pagina.
  - Implementado com tabela em duas colunas somente no PDF quando necessario.
- [x] Testar diferentes valores, taxas e prazos no site publicado.
- [x] Comparar os resultados com calculos manuais ou planilha de referencia.
  - Validado pelo usuario.

## Integracao com o CRM

- [x] Validar abertura do simulador por uma oportunidade.
  - Confirmado pelo usuario: o simulador abre corretamente direto do CRM.
- [x] Receber corretamente o nome.
  - Parametro: `clientName`.
- [x] Receber tipo de pessoa.
  - Parametros aceitos: `personType` ou `tipoPessoa`.
- [x] Identificar se e cliente da base ou potencial cliente.
  - Parametro: `opportunityType`.
  - Valores atuais esperados: `bona`, `client`; fallback para potencial cliente.
- [x] Selecionar automaticamente o cliente quando aplicavel.
  - A selecao exige `clientId` existente na base correta.
- [x] Receber a taxa contratada.
  - Parametro: `contractedRate`.
- [x] Receber o valor potencial.
  - Parametro: `intendedAmount`.
- [x] Validar parametros incompletos ou invalidos.
  - Valores invalidos sao ignorados e geram aviso na interface.
- [x] Evitar selecionar cliente incorreto por nomes semelhantes.
  - A selecao automatica usa `clientId`, nao nome.
- [x] Definir retorno automatico ao CRM como nao necessario agora.
  - Decisao atual: o CRM abre o simulador preenchido; o caminho inverso fica fora do curto prazo.
- [~] Gerar identificador unico para a simulacao.
  - O historico administrativo ja gera id tecnico; falta padronizar codigo comercial se necessario.
- [ ] Permitir salvar link da simulacao na oportunidade.
  - Futuro/opcional, se o fluxo comercial pedir.
- [ ] Avaliar envio ou armazenamento seguro do PDF.
  - Futuro/opcional, se houver necessidade de anexar PDF ao CRM.
- [x] Mostrar confirmacao clara quando a simulacao for vinculada ao CRM.

## Custodia e Base de Clientes

- [ ] Validar a integracao de custodia utilizada pelo CRM.
  - Decisao atual: por enquanto a atualizacao de custodia sera manual pelo simulador.
  - Futuro: integrar CRM e simulador para consulta automatica.
- [x] Confirmar autenticacao correta entre CRM e Simulador.
  - Endpoint exige segredo via header Authorization.
- [x] Confirmar que o endpoint de custodia responde apenas a chamadas autorizadas.
- [x] Confirmar que somente os clientes da base autorizada sao exibidos em Clientes Bonas.
- [x] Manter a allowlist como protecao obrigatoria.
- [x] Confirmar que sincronizacoes usam a allowlist por padrao.
- [x] Bloquear sincronizacao ampla sem autorizacao explicita.
- [x] Registrar data da ultima atualizacao da base.
- [x] Mostrar quando os dados estiverem desatualizados.
  - Regra: o extrato mensal detalhado representa o fechamento do dia util anterior.
  - O sistema alerta quando a data da posicao esta antes do ultimo dia util fechado.
- [x] Evitar que uma falha de sincronizacao apague dados validos anteriores.

## Motor Financeiro

- [x] Manter uma unica regra financeira oficial.
- [x] Garantir que tela, PDF e APIs principais utilizem o mesmo motor.
- [x] Centralizar calculo de rentabilidade.
- [x] Centralizar tratamento de prazos.
- [x] Centralizar curva CDI/Copom.
- [x] Centralizar metodologia da media mensal.
- [x] Criar testes para cenarios representativos.
- [x] Criar teste para o prazo ate 31/12/2027.
- [x] Criar teste para meses repetidos em anos diferentes.
  - A interface usa chave com indice para evitar colisao entre meses iguais em anos diferentes.
- [ ] Criar teste para valores e taxas em cenarios extremos.
  - Exemplos: valor zero, taxa zero, taxa muito alta, prazo curto e vencimento antes da aplicacao.
- [x] Registrar qualquer mudanca de metodologia financeira antes de publicar.
  - Decisao atual: media mensal equivalente capitalizada.

## PDF e Apresentacao ao Cliente

- [~] Validar identidade visual.
  - Ja houve ajuste visual; pendente revisao manual final em PDF real.
- [x] Validar nome e informacoes do cliente.
- [x] Validar taxa e prazo apresentados.
- [x] Validar premissas financeiras.
- [x] Validar evolucao mensal.
- [~] Validar textos e observacoes obrigatorias.
  - Existem observacoes; pendente revisao juridica/comercial final.
- [ ] Garantir boa leitura em celular e computador.
- [ ] Testar impressao e salvamento.
- [ ] Padronizar nome do arquivo gerado.
- [ ] Avaliar validade ou data de emissao da simulacao.

## Documentacao e Seguranca

- [x] Documentar CDI-base utilizado.
  - Predefinicao oficial atual: a partir da reuniao Copom de 15 e 16/09/2026, usar CDI operacional de 13,65% a.a. de 16/09/2026 em diante, ate nova alteracao expressa.
- [x] Documentar percentual contratado.
- [x] Documentar calculo dos meses comerciais.
- [x] Documentar curva Copom utilizada.
- [x] Documentar metodologia da media mensal.
- [x] Documentar parametros recebidos do CRM.
- [x] Documentar retorno esperado para o CRM.
  - Decisao atual: nao ha retorno automatico obrigatorio; o CRM apenas abre o simulador preenchido.
- [ ] Revisar credenciais e chaves de integracao.
- [x] Garantir que segredos nao aparecam na interface ou nos links.
- [~] Registrar erros de integracao sem expor informacoes sensiveis.
  - Mensagens atuais sao genericas; falta log estruturado.

## Melhorias Futuras

- [x] Criar painel administrativo das simulacoes geradas.
  - Primeira versao publicada: historico, reabertura e listagem.
- [x] Comparar cenarios lado a lado.
  - Primeira versao publicada: comparacao de ate 3 simulacoes salvas.
- [ ] Criar historico de simulacoes por cliente e oportunidade.
- [ ] Permitir duplicar uma simulacao anterior.
- [ ] Criar versoes de uma mesma simulacao.
- [ ] Criar expiracao ou validade da proposta.
- [ ] Avaliar assinatura ou aceite digital.

## Roteiro de Longo Prazo

### Fase 1 - Estabilidade operacional diaria

Objetivo: garantir que o simulador esteja confiavel todos os dias antes do time usar.

- [x] Upload manual do extrato mensal detalhado no site publicado.
- [x] Alerta de base desatualizada considerando fechamento do dia util anterior.
- [x] Validar calculos contra conta manual/planilha de referencia.
- [ ] Registrar rotina operacional final do upload diario.
- [ ] Acompanhar uso real por alguns dias antes de automatizar novas rotinas.
- [ ] Melhorar alerta visual quando a base estiver atrasada por mais de 1 dia util.
- [ ] Criar painel simples de saude da base: data da posicao, total de clientes, total de saldo, erros de importacao.
- [ ] Registrar historico de uploads realizados: data, arquivo, posicao, quantidade de clientes e falhas.
- [ ] Definir rotina operacional: quem sobe o extrato, horario esperado e como validar.

## Encerramento Operacional da Fase Atual

Este bloco pertence ao Simulador - estabilidade no uso diario. Nao e um novo bloco de desenvolvimento.

Depois desta definicao, o Simulador pode ser considerado:

- [x] Homologado.
- [x] Publicado.
- [x] Com rotina operacional definida.
- [x] Sem pendencias obrigatorias antes do piloto de Leads.

As melhorias abaixo continuam futuras e nao bloqueiam Leads:

- Automacao de custodia.
- Painel de saude da base.
- Historico avancado de atualizacoes.
- Filtros/status/versoes no painel administrativo.
- Integracao mais profunda com CRM.

### Rotina Operacional do Upload

- Responsavel titular: Lorenzo Bona.
- Substituto: Lorenzo Affonso.
- Frequencia: diaria, em dias uteis.
- Horario esperado do upload: ate 10:10, em todos os dias uteis.
- Fonte do arquivo: extrato mensal detalhado do NetFactor.
- Data de referencia: fechamento do dia util anterior.
- Local de upload: site publicado do Simulador GMS.
- Historico das atualizacoes: nao armazenar PDFs localmente; o documento pode ser reemitido no NetFactor a qualquer momento.
- Registro minimo recomendado: manter apenas data/hora do upload, data da posicao, quantidade de clientes importados e eventual mensagem de erro.

### Verificacoes Obrigatorias Apos Upload

- Confirmar que a data da posicao exibida no Simulador corresponde ao fechamento do dia util anterior.
- Confirmar que o alerta de base desatualizada nao aparece quando a base estiver em dia.
- Confirmar total de clientes carregados.
- Confirmar saldo consolidado aproximado.
- Fazer uma simulacao rapida com cliente conhecido.
- Gerar um PDF de teste apenas se houver mudanca relevante no fluxo ou nos dados.

### Procedimento Em Caso de Erro

- Nao subir outro arquivo sem entender a mensagem exibida.
- Conferir se o PDF enviado e o extrato mensal detalhado correto.
- Conferir se o mes/ano do extrato corresponde ao periodo atual.
- Se o upload falhar, manter a ultima base valida e registrar o erro.
- Se a base ficar desatualizada, usar o alerta como referencia e evitar simular sem avisar internamente.
- Se o erro persistir, abrir nova tarefa no Codex com o arquivo usado e print da mensagem.

### Fase 2 - Painel administrativo comercial

Objetivo: transformar as simulacoes geradas em um historico consultavel pela equipe.

- [x] Salvar simulacao ao gerar PDF.
- [x] Listar simulacoes geradas.
- [x] Reabrir simulacao anterior.
- [x] Comparar ate 3 cenarios salvos.
- [x] Manter painel em observacao antes de criar novas complexidades.
- [ ] Coletar dores reais do uso antes de adicionar filtros/status/versoes.
- [ ] Adicionar filtros por cliente, tipo de cliente, periodo, taxa e vencimento.
- [ ] Adicionar busca por nome/codigo.
- [ ] Criar acao "duplicar simulacao" para gerar nova versao rapidamente.
- [ ] Criar status da simulacao: rascunho, enviada, revisada, aprovada, expirada.
- [ ] Padronizar nome/identificador da simulacao.

### Fase 3 - CRM sem dependencia automatica obrigatoria

Objetivo: manter o CRM abrindo o simulador corretamente, sem exigir retorno automatico neste momento.

- [x] Abrir simulador direto da oportunidade.
- [x] Receber nome, tipo de pessoa, taxa e valor potencial.
- [x] Selecionar cliente por `clientId` quando aplicavel.
- [x] Definir que retorno automatico ao CRM nao e necessario agora.
- [ ] Salvar manualmente no CRM o PDF/link/resumo quando fizer sentido comercial.
- [ ] Reavaliar retorno automatico somente se o uso real mostrar necessidade.
- [ ] Se necessario no futuro, salvar na oportunidade: id da simulacao, resumo financeiro, link e status.

### Fase 4 - Comparacao avancada de cenarios

Objetivo: permitir analise comercial sem poluir a interface principal.

- [x] Comparar cenarios salvos no painel administrativo.
- [ ] Criar botao "duplicar para comparar".
- [ ] Criar visao comparativa com diferenca entre cenarios: saldo bruto, liquido, rendimento, IR e media mensal.
- [ ] Adicionar grafico comparativo compacto.
- [ ] Permitir comparar "sem novo aporte" vs "com aporte".
- [ ] Permitir exportar comparacao em PDF, se fizer sentido comercial.

### Fase 5 - Governanca financeira e auditoria

Objetivo: proteger a metodologia e facilitar revisoes futuras.

- [x] Centralizar media mensal como taxa equivalente capitalizada.
- [x] Centralizar curva CDI/Copom.
- [x] Testar prazo ate 31/12/2027.
- [ ] Criar testes para cenarios extremos.
- [ ] Criar documento de metodologia financeira em linguagem comercial.
- [ ] Registrar versao da metodologia usada em cada simulacao salva.
- [ ] Registrar curva CDI/Copom usada em cada simulacao salva.
- [ ] Criar trilha de auditoria para alteracoes de premissas importantes.

### Fase 6 - Automacao de custodia

Objetivo: reduzir trabalho manual quando o processo estiver maduro.

- [x] Atualizacao manual via upload no simulador.
- [ ] Definir se a custodia deve ser consultada pelo CRM ou apenas exibida no simulador.
- [ ] Criar integracao CRM x Simulador para consulta de custodia, se necessario.
- [ ] Automatizar coleta/atualizacao diaria somente quando o processo manual estiver totalmente confiavel.
- [ ] Criar alerta de falha de atualizacao diaria.
- [ ] Garantir que falha de atualizacao nunca substitua base valida anterior.

### Fase 7 - Proposta e jornada do cliente

Objetivo: evoluir o PDF e o uso comercial da simulacao.

- [ ] Definir validade da proposta.
- [ ] Mostrar data de emissao e validade no PDF.
- [ ] Revisar textos comerciais/juridicos.
- [ ] Avaliar aceite digital.
- [ ] Avaliar envio controlado ao cliente.
- [ ] Avaliar assinatura ou registro formal da proposta.
