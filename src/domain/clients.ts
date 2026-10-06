export type ClientStatus = "lead" | "active" | "review";

export type Client = {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  advisor: string;
  status: ClientStatus;
  createdAt: string;
};

export const clients: Client[] = [
  {
    id: "cli_aurora",
    name: "Aurora Participacoes Ltda.",
    document: "42.318.900/0001-10",
    email: "financeiro@auroraparticipacoes.com.br",
    phone: "(11) 4002-1090",
    advisor: "Mesa GMS",
    status: "active",
    createdAt: "2026-06-03"
  },
  {
    id: "cli_safira",
    name: "Safira Holding Familiar",
    document: "18.782.442/0001-87",
    email: "contato@safiraholding.com.br",
    phone: "(21) 3010-8844",
    advisor: "Relacionamento Private",
    status: "review",
    createdAt: "2026-06-11"
  },
  {
    id: "cli_monteverde",
    name: "Monteverde Agro S.A.",
    document: "07.551.229/0001-44",
    email: "tesouraria@monteverdeagro.com.br",
    phone: "(34) 3321-7788",
    advisor: "Originação GMS",
    status: "lead",
    createdAt: "2026-06-15"
  }
];
