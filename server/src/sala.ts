import { randomUUID } from "node:crypto";
import { z } from "zod";

// Sala multiplayer do escritório: só posição, direção e apelido de cada jogador.
// Nada é guardado: quem sai some da memória. Sem vídeo e sem chat.

export const MAX_NOME = 20;
export const CORES = 6;
/** Mensagens de movimento mais próximas que isso são descartadas (≈ 20 por segundo). */
const INTERVALO_MIN_MS = 45;

const Direcao = z.enum(["baixo", "cima", "esquerda", "direita"]);
const Coord = z.number().finite().min(0).max(4096);

const Entrar = z.object({
  t: z.literal("entrar"),
  nome: z.unknown(),
  cor: z.unknown(),
  x: Coord,
  y: Coord,
  dir: Direcao,
});
const Mover = z.object({
  t: z.literal("mover"),
  x: Coord,
  y: Coord,
  dir: Direcao,
  andando: z.boolean().optional(),
});

export type Jogador = {
  id: string;
  nome: string;
  cor: number;
  x: number;
  y: number;
  dir: z.infer<typeof Direcao>;
  andando: boolean;
};

/** Apelido seguro para mostrar aos outros: sem HTML, sem caracteres de controle, até 20 caracteres. */
export function limparNome(bruto: unknown, numero: number): string {
  const texto = typeof bruto === "string" ? bruto : "";
  const limpo = texto
    .replace(/[\p{Cc}\p{Cf}<>&"'`]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOME)
    .trim();
  return limpo || `Visitante ${numero}`;
}

function limparCor(bruta: unknown): number {
  return typeof bruta === "number" && Number.isInteger(bruta) && bruta >= 0 && bruta < CORES ? bruta : 0;
}

type Conexao = { enviar: (msg: object) => void };

export class Sala {
  private readonly jogadores = new Map<Conexao, Jogador>();
  private readonly ultimoMovimento = new Map<Conexao, number>();
  private readonly conexoes = new Set<Conexao>();
  private contador = 0;

  constructor(private readonly limite: number) {}

  /** false quando a sala está cheia. */
  conectar(c: Conexao): boolean {
    if (this.conexoes.size >= this.limite) return false;
    this.conexoes.add(c);
    return true;
  }

  receber(c: Conexao, bruto: string): void {
    let dado: unknown;
    try {
      dado = JSON.parse(bruto);
    } catch {
      return;
    }
    const tipo = (dado as { t?: unknown } | null)?.t;
    if (tipo === "entrar") this.entrar(c, dado);
    else if (tipo === "mover") this.mover(c, dado);
  }

  desconectar(c: Conexao): void {
    this.conexoes.delete(c);
    this.ultimoMovimento.delete(c);
    const j = this.jogadores.get(c);
    if (!j) return;
    this.jogadores.delete(c);
    this.espalhar(c, { t: "saiu", id: j.id });
  }

  get total(): number {
    return this.conexoes.size;
  }

  private entrar(c: Conexao, dado: unknown): void {
    if (this.jogadores.has(c)) return;
    const m = Entrar.safeParse(dado);
    if (!m.success) return;
    this.contador += 1;
    const j: Jogador = {
      id: randomUUID(),
      nome: limparNome(m.data.nome, this.contador),
      cor: limparCor(m.data.cor),
      x: m.data.x,
      y: m.data.y,
      dir: m.data.dir,
      andando: false,
    };
    const outros = [...this.jogadores.values()];
    this.jogadores.set(c, j);
    c.enviar({ t: "bemvindo", id: j.id, nome: j.nome, outros });
    this.espalhar(c, { t: "entrou", jogador: j });
  }

  private mover(c: Conexao, dado: unknown): void {
    const j = this.jogadores.get(c);
    if (!j) return;
    const m = Mover.safeParse(dado);
    if (!m.success) return;
    const agora = Date.now();
    // Parar de andar sempre passa, para ninguém ficar "andando" parado na tela dos outros.
    const parou = m.data.andando === false && j.andando;
    if (!parou && agora - (this.ultimoMovimento.get(c) ?? 0) < INTERVALO_MIN_MS) return;
    this.ultimoMovimento.set(c, agora);
    Object.assign(j, { x: m.data.x, y: m.data.y, dir: m.data.dir, andando: m.data.andando ?? false });
    this.espalhar(c, { t: "moveu", id: j.id, x: j.x, y: j.y, dir: j.dir, andando: j.andando });
  }

  private espalhar(origem: Conexao, msg: object): void {
    for (const c of this.jogadores.keys()) if (c !== origem) c.enviar(msg);
  }
}
