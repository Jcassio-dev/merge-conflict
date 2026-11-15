import { randomUUID } from "node:crypto";
import type { Relatorio } from "./report.js";

export type Fala = { autor: "jogador" | "personagem"; texto: string };

export type Sessao = {
  id: string;
  jogadorId: string;
  cenarioId: string;
  falas: Fala[];
  encerrada: boolean;
  relatorio?: Relatorio;
  criadaEm: number;
};

export type Progresso = {
  tentativas: number;
  concluido: boolean;
  niveis?: Record<string, string>;
};

const DUAS_HORAS = 2 * 60 * 60 * 1000;

/**
 * Sessões e progresso em memória. Suficiente para o piloto; trocar por banco
 * (ex.: SQLite) se o servidor precisar reiniciar sem perder progresso.
 * A transcrição some quando a sessão expira (privacidade).
 */
export class Store {
  private sessoes = new Map<string, Sessao>();
  private progresso = new Map<string, Record<string, Progresso>>();

  criar(jogadorId: string, cenarioId: string, abertura: string): Sessao {
    this.limparExpiradas();
    const s: Sessao = {
      id: randomUUID(),
      jogadorId,
      cenarioId,
      falas: [{ autor: "personagem", texto: abertura }],
      encerrada: false,
      criadaEm: Date.now(),
    };
    this.sessoes.set(s.id, s);
    const p = this.progressoDe(jogadorId);
    const atual = p[cenarioId] ?? { tentativas: 0, concluido: false };
    p[cenarioId] = { ...atual, tentativas: atual.tentativas + 1 };
    return s;
  }

  obter(id: string): Sessao | undefined {
    return this.sessoes.get(id);
  }

  progressoDe(jogadorId: string): Record<string, Progresso> {
    let p = this.progresso.get(jogadorId);
    if (!p) {
      p = {};
      this.progresso.set(jogadorId, p);
    }
    return p;
  }

  registrarConclusao(s: Sessao, niveis: Record<string, string>): void {
    const p = this.progressoDe(s.jogadorId);
    const atual = p[s.cenarioId] ?? { tentativas: 1, concluido: false };
    p[s.cenarioId] = { ...atual, concluido: true, niveis };
  }

  private limparExpiradas(): void {
    const limite = Date.now() - DUAS_HORAS;
    for (const [id, s] of this.sessoes) if (s.criadaEm < limite) this.sessoes.delete(id);
  }
}
