import type { ReactNode } from "react";
import "./styles.css";

export const metadata = {
  title: "Simulador GMS",
  description: "Plataforma integrada para clientes, simulacoes e relatorios da GMS."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
