import type { ReactNode } from "react";
import "./styles.css";

export const metadata = {
  title: "GMS | Simulador de Investimentos",
  description: "Simulador de investimentos e relatorio em PDF da GMS Securitizadora"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
