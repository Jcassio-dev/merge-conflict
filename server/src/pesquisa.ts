import { createHmac, randomBytes } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Sessao } from "./sessions.js";

// O jogador aparece só como um HMAC do id do navegador: liga as linhas da mesma pessoa sem dizer quem é.
export type OpcoesPesquisa = {
  pasta?: string;
  sal?: string;
  diasConversaCedida?: number;
};

export type Feedback = {
  util?: number;
  realista?: number;
  justo?: number;
  comentario?: string;
  ceder: boolean;
};

const DIA_MS = 24 * 60 * 60 * 1000;

export class Pesquisa {
  private readonly sal: string;
  private fila: Promise<void> = Promise.resolve();

  constructor(private readonly o: OpcoesPesquisa, private readonly agora: () => number = Date.now) {
    if (o.pasta && !o.sal) console.warn("PESQUISA_SAL vazio: o código do jogador muda a cada reinício da API");
    this.sal = o.sal || randomBytes(16).toString("hex");
  }

  get ligada(): boolean {
    return Boolean(this.o.pasta);
  }

  codigoDoJogador(jogadorId: string): string {
    return createHmac("sha256", this.sal).update(jogadorId).digest("hex").slice(0, 12);
  }

  conversaConcluida(s: Sessao, extra: { votos: number; divergentes: string[] }): Promise<void> {
    const r = s.relatorio!;
    return this.gravar("conversas.jsonl", {
      ...this.base(s),
      tentativa: s.tentativa ?? 1,
      niveis: Object.fromEntries(r.criterios.map((c) => [c.nome, c.nivel])),
      resultado: r.resultado,
      falasDoJogador: s.falas.filter((f) => f.autor === "jogador").length,
      duracaoS: Math.round((this.agora() - s.criadaEm) / 1000),
      votos: extra.votos,
      divergentes: extra.divergentes,
    });
  }

  async feedback(s: Sessao, f: Feedback): Promise<void> {
    const { ceder, ...respostas } = f;
    await this.gravar("feedback.jsonl", { ...this.base(s), ...respostas, cedeuConversa: ceder });
    if (!ceder) return;
    const r = s.relatorio!;
    await this.gravar("cedidas.jsonl", {
      ...this.base(s),
      apagarApos: new Date(this.agora() + (this.o.diasConversaCedida ?? 90) * DIA_MS).toISOString(),
      falas: s.falas.map((x) => ({ autor: x.autor, texto: x.texto })),
      niveisIA: Object.fromEntries(r.criterios.map((c) => [c.nome, c.nivel])),
      resultadoIA: r.resultado,
    });
  }

  private base(s: Sessao) {
    return {
      quando: new Date(this.agora()).toISOString(),
      sessao: s.id,
      jogador: this.codigoDoJogador(s.jogadorId),
      cenario: s.cenarioId,
    };
  }

  private gravar(arquivo: string, dado: object): Promise<void> {
    const pasta = this.o.pasta;
    if (!pasta) return Promise.resolve();
    this.fila = this.fila
      .then(async () => {
        await mkdir(pasta, { recursive: true });
        await appendFile(join(pasta, arquivo), `${JSON.stringify(dado)}\n`);
      })
      .catch((err: unknown) => console.error(`falha ao gravar ${arquivo}`, err instanceof Error ? err.message : err));
    return this.fila;
  }
}
