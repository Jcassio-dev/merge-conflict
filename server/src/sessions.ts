import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
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
  tentativa?: number;
  feedbackEnviado?: boolean;
  /** false quando o jogador pediu para ficar fora da pesquisa. */
  pesquisa?: boolean;
  /** Áudio já gerado das falas da personagem (índice da fala → WAV). Some com a sessão. */
  audios?: Map<number, Promise<Buffer>>;
};

export type Progresso = {
  tentativas: number;
  concluido: boolean;
  niveis?: Record<string, string>;
};

const DUAS_HORAS = 2 * 60 * 60 * 1000;

/**
 * Sessões em memória; progresso em memória e, se houver `arquivo`, também em disco
 * (JSON), para sobreviver a um reinício da API.
 * Só o progresso vai para o disco (id anônimo, tentativas, concluído, níveis).
 * A transcrição não vai para o progresso e some quando a sessão expira (privacidade); só
 * é guardada se o jogador ceder a conversa à pesquisa (ver pesquisa.ts).
 */
export class Store {
  private sessoes = new Map<string, Sessao>();
  private progresso = new Map<string, Record<string, Progresso>>();
  private gravando: Promise<void> = Promise.resolve();
  private agendado?: ReturnType<typeof setTimeout>;

  constructor(private readonly arquivo?: string) {
    if (!arquivo) return;
    try {
      const dados = JSON.parse(readFileSync(arquivo, "utf8")) as Record<string, Record<string, Progresso>>;
      for (const [id, p] of Object.entries(dados)) this.progresso.set(id, p);
    } catch (err) {
      // Sem arquivo ainda (primeira vez) ou arquivo estragado: começa vazio, sem derrubar a API.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.warn("progresso em disco ilegível; começando vazio");
    }
  }

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
    s.tentativa = atual.tentativas + 1;
    this.agendarGravacao();
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
    this.agendarGravacao();
  }

  /** Grava o progresso agora (e espera terminar). Sem arquivo, não faz nada. */
  async salvar(): Promise<void> {
    clearTimeout(this.agendado);
    this.agendado = undefined;
    if (!this.arquivo) return;
    const arquivo = this.arquivo;
    // Quem só consultou o progresso e nunca jogou não vai para o disco.
    const dados = Object.fromEntries([...this.progresso].filter(([, p]) => Object.keys(p).length));
    // Uma gravação por vez; arquivo temporário + rename para nunca deixar um JSON pela metade.
    this.gravando = this.gravando.then(async () => {
      const temp = `${arquivo}.tmp`;
      await writeFile(temp, JSON.stringify(dados));
      await rename(temp, arquivo);
    }).catch((err: unknown) => console.error("falha ao gravar o progresso", err));
    await this.gravando;
  }

  /** Junta várias mudanças seguidas numa gravação só. */
  private agendarGravacao(): void {
    if (!this.arquivo || this.agendado) return;
    this.agendado = setTimeout(() => void this.salvar(), 500);
  }

  private limparExpiradas(): void {
    const limite = Date.now() - DUAS_HORAS;
    for (const [id, s] of this.sessoes) if (s.criadaEm < limite) this.sessoes.delete(id);
  }
}
