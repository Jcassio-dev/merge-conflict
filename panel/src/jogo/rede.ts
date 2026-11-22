// Conexão com a sala multiplayer do server/ (WebSocket /api/sala).
// Se cair, tenta de novo sozinha; o jogo continua funcionando sem os outros jogadores.

export type Direcao = "baixo" | "esquerda" | "direita" | "cima";
export type Outro = { id: string; nome: string; cor: number; x: number; y: number; dir: Direcao; andando: boolean };
export type Eu = { nome: string; cor: number; x: number; y: number; dir: Direcao };

type Eventos = {
  bemvindo: (id: string, outros: Outro[]) => void;
  entrou: (o: Outro) => void;
  moveu: (o: Pick<Outro, "id" | "x" | "y" | "dir" | "andando">) => void;
  saiu: (id: string) => void;
  /** A conexão caiu: os outros jogadores devem sumir até reconectar. */
  caiu: () => void;
};

const INTERVALO_MS = 100;

export class Rede {
  private ws?: WebSocket;
  private espera = 1000;
  private ultimoEnvio = 0;
  private pendente?: ReturnType<typeof setTimeout>;
  private ultimo?: { x: number; y: number; dir: Direcao; andando: boolean };

  constructor(
    private readonly url: string,
    private readonly eu: () => Eu,
    private readonly on: Eventos,
  ) {}

  conectar(): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.reconectar();
      return;
    }
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.espera = 1000;
      const eu = this.eu();
      ws.send(JSON.stringify({ t: "entrar", ...eu }));
    });
    ws.addEventListener("message", (e) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === "bemvindo") this.on.bemvindo(String(m.id), (m.outros as Outro[]) ?? []);
      else if (m.t === "entrou") this.on.entrou(m.jogador as Outro);
      else if (m.t === "moveu") this.on.moveu(m as unknown as Outro);
      else if (m.t === "saiu") this.on.saiu(String(m.id));
    });
    ws.addEventListener("close", () => {
      this.on.caiu();
      this.reconectar();
    });
  }

  /** Avisa a posição. Manda no máximo 10 vezes por segundo, mas a última sempre chega. */
  mover(x: number, y: number, dir: Direcao, andando: boolean): void {
    const u = this.ultimo;
    if (u && u.x === x && u.y === y && u.dir === dir && u.andando === andando) return;
    this.ultimo = { x, y, dir, andando };
    const agora = performance.now();
    clearTimeout(this.pendente);
    // Parar sempre vai na hora, para ninguém ficar "andando" parado na tela dos outros.
    if (!andando || agora - this.ultimoEnvio >= INTERVALO_MS) this.enviarUltimo();
    else this.pendente = setTimeout(() => this.enviarUltimo(), INTERVALO_MS - (agora - this.ultimoEnvio));
  }

  /** Reconecta logo (ex.: trocou o apelido) para os outros verem a mudança. */
  reiniciar(): void {
    this.espera = 100;
    this.ws?.close();
  }

  private enviarUltimo(): void {
    if (!this.ultimo || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ultimoEnvio = performance.now();
    const { x, y, dir, andando } = this.ultimo;
    this.ws.send(JSON.stringify({ t: "mover", x: Math.round(x), y: Math.round(y), dir, andando }));
  }

  private reconectar(): void {
    setTimeout(() => this.conectar(), this.espera);
    this.espera = Math.min(this.espera * 2, 15000);
  }
}

/** Endereço WebSocket da sala a partir da URL da API (vazia = mesmo domínio). */
export function urlSala(api: string): string {
  const base = new URL(api || "/", location.href);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `${base.pathname.replace(/\/$/, "")}/api/sala`;
  return base.href;
}
