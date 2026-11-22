import { afterEach, describe, expect, it } from "vitest";
import type WebSocket from "ws";
import { buildApp } from "../src/app.js";
import { MockProvider } from "../src/llm/mock.js";
import { limparNome } from "../src/sala.js";

type Msg = Record<string, unknown> & { t: string };

/** Guarda as mensagens que chegam e deixa esperar pela próxima de um tipo. */
function ouvir(ws: WebSocket) {
  const caixa: Msg[] = [];
  const esperando: { t: string; resolve: (m: Msg) => void }[] = [];
  ws.on("message", (dado) => {
    const m = JSON.parse(String(dado)) as Msg;
    const i = esperando.findIndex((e) => e.t === m.t);
    if (i >= 0) esperando.splice(i, 1)[0]!.resolve(m);
    else caixa.push(m);
  });
  return {
    proxima(t: string): Promise<Msg> {
      const i = caixa.findIndex((m) => m.t === t);
      if (i >= 0) return Promise.resolve(caixa.splice(i, 1)[0]!);
      return new Promise((resolve) => esperando.push({ t, resolve }));
    },
    caixa,
  };
}

const enviar = (ws: WebSocket, m: object) => ws.send(JSON.stringify(m));

let app: ReturnType<typeof buildApp>;
afterEach(async () => {
  await app?.close();
});

describe("sala multiplayer", () => {
  it("quem entra recebe os outros; os outros veem entrar, mover e sair", async () => {
    app = buildApp({ llm: new MockProvider() });
    await app.ready();

    const a = await app.injectWS("/api/sala");
    const ouveA = ouvir(a);
    enviar(a, { t: "entrar", nome: "Ana", aparencia: { corpo: 2, olhos: 5, cabelo: 73, roupa: 7, chapeu: -1, acessorio: 3 }, x: 64, y: 544, dir: "baixo" });
    const bemA = await ouveA.proxima("bemvindo");
    expect(bemA.outros).toEqual([]);

    const b = await app.injectWS("/api/sala");
    const ouveB = ouvir(b);
    enviar(b, { t: "entrar", nome: "Bruno", aparencia: { corpo: 99, olhos: -1, cabelo: 1.5, roupa: "x", chapeu: 27 }, x: 100, y: 500, dir: "cima" });
    const bemB = await ouveB.proxima("bemvindo");
    expect(bemB.outros).toEqual([
      expect.objectContaining({ id: bemA.id, nome: "Ana", aparencia: { corpo: 2, olhos: 5, cabelo: 73, roupa: 7, chapeu: -1, acessorio: 3 }, x: 64, y: 544 }),
    ]);

    const entrou = await ouveA.proxima("entrou");
    // partes fora da faixa (ou que faltam) viram 0; chapéu e acessório viram -1 (nenhum)
    expect(entrou.jogador).toMatchObject({
      id: bemB.id,
      nome: "Bruno",
      aparencia: { corpo: 0, olhos: 0, cabelo: 0, roupa: 0, chapeu: -1, acessorio: -1 },
    });

    enviar(b, { t: "mover", x: 120, y: 510, dir: "direita", andando: true });
    const moveu = await ouveA.proxima("moveu");
    expect(moveu).toMatchObject({ id: bemB.id, x: 120, y: 510, dir: "direita", andando: true });

    b.terminate();
    const saiu = await ouveA.proxima("saiu");
    expect(saiu.id).toBe(bemB.id);
    a.terminate();
  });

  it("ignora mensagens inválidas e movimento antes de entrar", async () => {
    app = buildApp({ llm: new MockProvider() });
    await app.ready();
    const a = await app.injectWS("/api/sala");
    const ouveA = ouvir(a);
    enviar(a, { t: "entrar", nome: "Ana", x: 10, y: 10, dir: "baixo" });
    await ouveA.proxima("bemvindo");

    const b = await app.injectWS("/api/sala");
    b.send("isso não é json");
    enviar(b, { t: "mover", x: 1, y: 1, dir: "baixo" });
    enviar(b, { t: "entrar", nome: "B", x: "longe", y: 1, dir: "baixo" });
    await new Promise((r) => setTimeout(r, 50));
    expect(ouveA.caixa).toEqual([]);
    a.terminate();
    b.terminate();
  });

  it("recusa conexões acima do limite", async () => {
    app = buildApp({ llm: new MockProvider(), limiteSala: 1 });
    await app.ready();
    const a = await app.injectWS("/api/sala");
    const b = await app.injectWS("/api/sala");
    const codigo = await new Promise<number>((r) => b.on("close", (c) => r(c)));
    expect(codigo).toBe(1013);
    a.terminate();
  });
});

describe("limparNome", () => {
  it("tira HTML e controle, corta em 20 e usa Visitante quando vazio", () => {
    expect(limparNome("  <b>Ana</b>  ", 3)).toBe("bAna/b");
    expect(limparNome("x".repeat(40), 3)).toHaveLength(20);
    expect(limparNome("\u0000\n  ", 7)).toBe("Visitante 7");
    expect(limparNome(42, 7)).toBe("Visitante 7");
  });
});
