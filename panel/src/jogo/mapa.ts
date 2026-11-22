// Lê o mapa do Tiled (escritorio.tmj, copiado de map/ por `npm run mapa`) e desenha no canvas.
// Suporta o que o nosso mapa usa: camadas de tiles e grupos, tiles espelhados,
// tiles animados, colisão pela propriedade "collides" e áreas retangulares.

const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
const SO_ID = 0x1fffffff;

/** Camadas que só têm função no jogo (zonas especiais) e não são desenhadas. */
const CAMADAS_LOGICAS = new Set(["start", "collisions"]);
/** Camada do balão "…" acima da Marina: some para quem já concluiu. */
export const CAMADA_BALAO = "balao-marina";

type Propriedade = { name: string; value: unknown };
type TileTmj = { id: number; properties?: Propriedade[]; animation?: { tileid: number; duration: number }[] };
type TilesetTmj = {
  name: string;
  firstgid: number;
  tilecount: number;
  columns: number;
  image: string;
  tilewidth: number;
  tileheight: number;
  tiles?: TileTmj[];
};
type CamadaTmj =
  | { type: "tilelayer"; name: string; visible: boolean; opacity: number; data: number[] }
  | { type: "group"; name: string; visible: boolean; opacity: number; layers: CamadaTmj[] }
  | { type: "objectgroup"; name: string; objects: { name: string; x: number; y: number; width: number; height: number }[] }
  | { type: "imagelayer"; name: string };
type MapaTmj = {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: CamadaTmj[];
  tilesets: TilesetTmj[];
};

export type Area = { nome: string; x: number; y: number; w: number; h: number };

type Tileset = TilesetTmj & { img: HTMLImageElement };
type Animacao = { quadros: { gid: number; ms: number }[]; total: number };
type Camada = { nome: string; opacidade: number; dados: number[]; acima: boolean };

export class Mapa {
  readonly largura: number;
  readonly altura: number;
  readonly tile: number;
  readonly areas: Area[] = [];
  /** true = não dá para pisar. Índice: y * largura + x. */
  readonly bloqueado: boolean[];
  readonly inicio: { x: number; y: number };
  private readonly camadas: Camada[] = [];
  private readonly tilesets: Tileset[];
  private readonly animacoes = new Map<number, Animacao>();
  private readonly ocultas = new Set<string>();
  /** Camadas estáticas já desenhadas (sem os tiles animados), abaixo e acima dos bonecos. */
  private cacheAbaixo?: HTMLCanvasElement;
  private cacheAcima?: HTMLCanvasElement;
  /** Tiles animados: [índice da camada, posição no mapa, gid]. */
  private readonly tilesAnimados: { camada: number; i: number; gid: number }[] = [];

  private constructor(tmj: MapaTmj, tilesets: Tileset[]) {
    this.largura = tmj.width;
    this.altura = tmj.height;
    this.tile = tmj.tilewidth;
    this.tilesets = tilesets;
    this.bloqueado = new Array(tmj.width * tmj.height).fill(false);
    let inicio = { x: tmj.tilewidth * 2, y: tmj.tileheight * 2 };

    const colide = new Set<number>();
    for (const ts of tilesets) {
      for (const t of ts.tiles ?? []) {
        const gid = ts.firstgid + t.id;
        if (t.properties?.some((p) => p.name === "collides" && p.value === true)) colide.add(gid);
        if (t.animation?.length) {
          const quadros = t.animation.map((a) => ({ gid: ts.firstgid + a.tileid, ms: a.duration }));
          this.animacoes.set(gid, { quadros, total: quadros.reduce((s, q) => s + q.ms, 0) });
        }
      }
    }

    // Tudo o que vem depois da camada de objetos (onde ficam os bonecos) é desenhado por cima deles.
    let acima = false;
    const percorrer = (camadas: CamadaTmj[], opacidadePai: number, visivelPai: boolean) => {
      for (const c of camadas) {
        if (c.type === "group") {
          percorrer(c.layers, opacidadePai * (c.opacity ?? 1), visivelPai && c.visible !== false);
        } else if (c.type === "objectgroup") {
          acima = true;
          for (const o of c.objects) {
            if (!o.name) continue;
            this.areas.push({ nome: o.name, x: o.x, y: o.y, w: o.width, h: o.height });
            if (o.name === "entrada") inicio = { x: o.x + o.width / 2, y: o.y + o.height / 2 };
          }
        } else if (c.type === "tilelayer") {
          c.data.forEach((g, i) => {
            if (g && colide.has(g & SO_ID)) this.bloqueado[i] = true;
          });
          if (CAMADAS_LOGICAS.has(c.name) || !visivelPai || c.visible === false) continue;
          this.camadas.push({ nome: c.name, opacidade: opacidadePai * (c.opacity ?? 1), dados: c.data, acima });
        }
      }
    };
    percorrer(tmj.layers, 1, true);
    this.inicio = inicio;

    this.camadas.forEach((c, n) =>
      c.dados.forEach((g, i) => {
        if (g && this.animacoes.has(g & SO_ID)) this.tilesAnimados.push({ camada: n, i, gid: g });
      }),
    );
  }

  static async carregar(url: string): Promise<Mapa> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapa não carregou (${res.status})`);
    const tmj = (await res.json()) as MapaTmj;
    const base = new URL(url, location.href);
    const tilesets = await Promise.all(
      tmj.tilesets.map(async (ts) => ({ ...ts, img: await carregarImagem(new URL(ts.image, base).href) })),
    );
    return new Mapa(tmj, tilesets);
  }

  get larguraPx(): number {
    return this.largura * this.tile;
  }
  get alturaPx(): number {
    return this.altura * this.tile;
  }

  ocultarCamada(nome: string): void {
    this.ocultas.add(nome);
  }

  /** O tile (tx, ty) pode ser pisado? Fora do mapa conta como parede. */
  livre(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.largura || ty >= this.altura) return false;
    return !this.bloqueado[ty * this.largura + tx];
  }

  /** Áreas que contêm o ponto (em pixels do mapa). */
  areasEm(x: number, y: number): string[] {
    return this.areas.filter((a) => x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h).map((a) => a.nome);
  }

  desenharAbaixo(ctx: CanvasRenderingContext2D, agora: number): void {
    this.cacheAbaixo ??= this.preDesenhar(false);
    ctx.drawImage(this.cacheAbaixo, 0, 0);
    this.desenharAnimados(ctx, agora, false);
  }

  desenharAcima(ctx: CanvasRenderingContext2D, agora: number): void {
    this.cacheAcima ??= this.preDesenhar(true);
    ctx.drawImage(this.cacheAcima, 0, 0);
    this.desenharAnimados(ctx, agora, true);
  }

  private preDesenhar(acima: boolean): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = this.larguraPx;
    canvas.height = this.alturaPx;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    for (const c of this.camadas) {
      if (c.acima !== acima) continue;
      ctx.globalAlpha = c.opacidade;
      c.dados.forEach((g, i) => {
        if (g && !this.animacoes.has(g & SO_ID)) this.desenharTile(ctx, g, i);
      });
    }
    ctx.globalAlpha = 1;
    return canvas;
  }

  private desenharAnimados(ctx: CanvasRenderingContext2D, agora: number, acima: boolean): void {
    for (const t of this.tilesAnimados) {
      const c = this.camadas[t.camada]!;
      if (c.acima !== acima || this.ocultas.has(c.nome)) continue;
      const anim = this.animacoes.get(t.gid & SO_ID)!;
      let resto = agora % anim.total;
      let gid = anim.quadros[0]!.gid;
      for (const q of anim.quadros) {
        if (resto < q.ms) {
          gid = q.gid;
          break;
        }
        resto -= q.ms;
      }
      ctx.globalAlpha = c.opacidade;
      this.desenharTile(ctx, gid | (t.gid & ~SO_ID), t.i);
    }
    ctx.globalAlpha = 1;
  }

  private desenharTile(ctx: CanvasRenderingContext2D, gidBruto: number, i: number): void {
    const gid = gidBruto & SO_ID;
    const ts = this.tilesetDe(gid);
    if (!ts) return;
    const id = gid - ts.firstgid;
    const sx = (id % ts.columns) * ts.tilewidth;
    const sy = Math.floor(id / ts.columns) * ts.tileheight;
    const x = (i % this.largura) * this.tile;
    const y = Math.floor(i / this.largura) * this.tile;
    const h = (gidBruto & FLIP_H) !== 0;
    const v = (gidBruto & FLIP_V) !== 0;
    const d = (gidBruto & FLIP_D) !== 0;
    if (!h && !v && !d) {
      ctx.drawImage(ts.img, sx, sy, ts.tilewidth, ts.tileheight, x, y, this.tile, this.tile);
      return;
    }
    // Espelhamento do Tiled: diagonal (troca x e y), depois horizontal e vertical.
    ctx.save();
    ctx.translate(x + this.tile / 2, y + this.tile / 2);
    if (d) {
      ctx.rotate(Math.PI / 2);
      ctx.scale(1, -1);
    }
    if (d ? v : h) ctx.scale(-1, 1);
    if (d ? h : v) ctx.scale(1, -1);
    ctx.drawImage(ts.img, sx, sy, ts.tilewidth, ts.tileheight, -this.tile / 2, -this.tile / 2, this.tile, this.tile);
    ctx.restore();
  }

  private tilesetDe(gid: number): Tileset | undefined {
    let achado: Tileset | undefined;
    for (const ts of this.tilesets) if (gid >= ts.firstgid) achado = ts;
    return achado && gid < achado.firstgid + achado.tilecount ? achado : undefined;
  }
}

export function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Imagem não carregou: ${url}`));
    img.src = url;
  });
}
