# Simulador GMS

Projeto independente do simulador de investimentos da GMS Securitizadora.

## O que inclui

- Simulador com curva Copom/CDI editavel.
- Relatorio visual para cliente.
- Botao **Compartilhar em PDF**, usando a funcao de imprimir/salvar como PDF do navegador.
- Logo GMS com fundo transparente.
- Projeto pronto para publicar na Vercel.

## Rodar localmente

```powershell
npm install
npm run dev
```

Depois abra:

```text
http://localhost:3000
```

## Publicar na Vercel

1. Envie esta pasta `simulador-gms` para um repositorio no GitHub.
2. Na Vercel, clique em **Add New Project**.
3. Importe o repositorio.
4. Use as configuracoes padrao:
   - Framework: Next.js
   - Build Command: `npm run build`
   - Output Directory: automatico
5. Clique em **Deploy**.

O link gerado pela Vercel podera ser compartilhado com outras pessoas.

## Aviso

As simulacoes sao meramente ilustrativas e dependem das premissas informadas. Nao representam garantia de rentabilidade, oferta ou recomendacao de investimento.
