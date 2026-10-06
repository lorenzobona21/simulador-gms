# Sincronizacao diaria NetFactor

Este documento registra as informacoes confirmadas para automatizar a captura diaria do relatorio `Posicao de Debentures` no NetFactor.

## Objetivo

Atualizar automaticamente, todos os dias uteis as 09:00 de Brasilia, a base usada pelo simulador interno da GMS com o ultimo saldo disponivel dos debenturistas.

O sistema interno da GMS deve permanecer intacto. A automacao deve apenas acessar o relatorio permitido, gerar o PDF e extrair os dados necessarios para o simulador.

## Acesso confirmado

- URL: `https://sistemagms.isafe.tec.br/netFactor/jsp/nfInicia.jsp`
- Abre fora da rede da GMS.
- Usa login e senha.
- Nao possui captcha.
- Nao possui 2FA, token, SMS, e-mail ou aplicativo autenticador.
- A sessao expira, mas nao rapidamente.
- A senha nao expira periodicamente.

## Caminho do relatorio

1. Entrar no NetFactor.
2. Abrir `Securitizacao`.
3. Abrir `Relatorios`.
4. Escolher `Posicao de Debentures`.
5. Preencher `Data Referencia Atualizacao` com a data do dia.
6. Manter `Agrupamento por Debenturista` marcado.
7. Manter `Nao imprime resgatadas` desmarcado.
8. Clicar em `Imprimir`.
9. Capturar o PDF aberto em nova janela do navegador.

## Campos esperados no PDF

- Debenturista: numero da conta e nome.
- Quantidade de debentures.
- Valor de compra, sem resgates e rendimento.
- Valor corrigido pelo rendimento.
- Rendimento em valor.
- Rendimento em porcentagem.
- Imposto de renda.
- Resgate antecipado.
- IR sobre o resgate antecipado.
- Rentabilidade do ultimo mes em valor.
- Rentabilidade do ultimo mes em porcentagem.
- Valor atual.

## Regras de atualizacao

- Data: sempre o dia atual.
- Frequencia: somente dias uteis.
- Empresa: sempre `GMS`.
- Escrituracao: manter sem preencher, como no fluxo manual atual.
- Serie: manter sem preencher, como no fluxo manual atual.
- Historico: manter apenas o ultimo saldo atualizado.
- PDF: possui estrutura fixa.
- Tamanho: pode ter muitas paginas.
- Conteudo: contem todos os investidores necessarios.

## Pontos pendentes

- Desenvolver/testar inicialmente com um login autorizado normal.
- Depois, se possivel, criar um usuario exclusivo para a automacao.
- Depois, se possivel, limitar esse usuario somente a `Securitizacao > Relatorios > Posicao de Debentures`.
- Depois, se possivel, configurar esse usuario como apenas leitura.
- Implementar login e senha para acessar o simulador interno hospedado na Vercel.
- Definir usuario/senha inicial do simulador interno.
- Implementar botao manual `Atualizar relatorio agora` para reexecutar a sincronizacao se a rotina das 09:00 falhar.

## Decisoes confirmadas

- O simulador/CRM privado ficara hospedado na Vercel.
- Quem tiver o link podera acessar somente depois de login e senha do simulador.
- Em caso de erro na rotina diaria, o simulador deve oferecer um botao para baixar/processar novamente o relatorio.
- A rota interna `/api/sync/investor-report` aceita `GET` para o agendamento da Vercel e `POST` para a atualizacao manual.

## Recomendacao

Criar um usuario tecnico exclusivo para a automacao, com permissao minima e somente leitura. As credenciais devem ficar em variaveis seguras do ambiente de execucao, nunca no codigo.
