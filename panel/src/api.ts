const API = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export type Nivel = "a_melhorar" | "adequado" | "bom";
export type NomeCriterio = "assertividade" | "escuta" | "negociacao" | "conflitos";

export type Relatorio = {
  criterios: { nome: NomeCriterio; nivel: Nivel; evidencia: string; motivo?: string }[];
  ponto_forte: { trecho: string; comentario: string };
  para_treinar: { criterio: NomeCriterio; voce_disse: string; tente: string };
  resultado: "acordo" | "sem_acordo" | "sobrecarga_aceita";
};

export type Fala = { autor: "jogador" | "personagem"; texto: string };

export class ApiError extends Error {}

export type InfoCenario = {
  id: string;
  ordem: number;
  titulo: string;
  personagem: { nome: string; papel: string };
  situacao: string;
  meta: string;
  maxTrocas: number;
};

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${caminho}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Sem conexão com o servidor. Verifique a internet e tente de novo.");
  }
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((dados as { erro?: string }).erro ?? "Algo deu errado. Tente de novo.");
  return dados as T;
}

export const api = {
  cenarios: () => chamar<{ cenarios: InfoCenario[] }>("/api/cenarios"),
  iniciar: (jogadorId: string, cenarioId: string) =>
    chamar<{ sessaoId: string; abertura: string; maxTrocas: number; voz?: boolean }>("/api/sessoes", {
      method: "POST",
      body: JSON.stringify({ jogadorId, cenarioId }),
    }),
  falar: (sessaoId: string, texto: string) =>
    chamar<{ resposta: string; troca: number; maxTrocas: number; encerrada: boolean }>(
      `/api/sessoes/${sessaoId}/falas`,
      { method: "POST", body: JSON.stringify({ texto }) },
    ),
  /** Áudio (WAV) da fala n da personagem; o servidor só aceita falas dela. */
  urlVoz: (sessaoId: string, n: number) => `${API}/api/sessoes/${sessaoId}/falas/${n}/voz`,
  relatorio: (sessaoId: string) =>
    chamar<{ relatorio: Relatorio; falas: Fala[] }>(`/api/sessoes/${sessaoId}/relatorio`, { method: "POST", body: "{}" }),
  feedback: (sessaoId: string, dados: Feedback) =>
    chamar<{ ok: true }>(`/api/sessoes/${sessaoId}/feedback`, { method: "POST", body: JSON.stringify(dados) }),
};

export type Feedback = { util?: number; realista?: number; justo?: number; comentario?: string; ceder: boolean };
