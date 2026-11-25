import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MockProvider } from "../src/llm/mock.js";

const DIA = 24 * 60 * 60 * 1000;
const app = (extra = {}) =>
  buildApp({ llm: new MockProvider(), acesso: { codigo: "codigo-da-turma", usuario: "turma", senha: "s3nh@", ...extra } });

async function entrar(a: ReturnType<typeof app>, c = "codigo-da-turma") {
  const r = await a.inject({ method: "GET", url: `/api/entrar?c=${c}` });
  return { r, cookie: String(r.headers["set-cookie"] ?? "").split(";")[0]! };
}
const conferir = (a: ReturnType<typeof app>, headers: Record<string, string> = {}) =>
  a.inject({ method: "GET", url: "/api/acesso", headers });

describe("link de convite", () => {
  it("o link grava um cookie HttpOnly e leva ao jogo; com ele, o Caddy deixa passar", async () => {
    const a = app();
    const { r, cookie } = await entrar(a);
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe("/");
    expect(String(r.headers["set-cookie"])).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect((await conferir(a, { cookie })).statusCode).toBe(204);
  });

  it("código errado não grava cookie", async () => {
    const { r } = await entrar(app(), "chute");
    expect(r.statusCode).toBe(403);
    expect(r.headers["set-cookie"]).toBeUndefined();
  });

  it("sem cookie pede a senha antiga, que continua valendo", async () => {
    const a = app();
    const sem = await conferir(a);
    expect(sem.statusCode).toBe(401);
    expect(sem.headers["www-authenticate"]).toMatch(/^Basic/);
    const basic = (u: string) => ({ authorization: `Basic ${Buffer.from(u).toString("base64")}` });
    expect((await conferir(a, basic("turma:s3nh@"))).statusCode).toBe(204);
    expect((await conferir(a, basic("turma:errada"))).statusCode).toBe(401);
  });

  it("trocar o código derruba quem entrou pelo link antigo", async () => {
    const { cookie } = await entrar(app());
    expect((await conferir(app({ codigo: "codigo-novo" }), { cookie })).statusCode).toBe(401);
  });

  it("cookie forjado ou adulterado não passa", async () => {
    const a = app();
    const { cookie } = await entrar(a);
    const [nome, valor] = cookie.split("=");
    const [, assinatura] = valor!.split(".");
    const adulterado = `${nome}=${Date.now() + 365 * DIA}.${assinatura}`;
    expect((await conferir(a, { cookie: adulterado })).statusCode).toBe(401);
  });

  it("link vencido não abre", async () => {
    const { r } = await entrar(app({ validoAte: "2020-01-01" }));
    expect(r.statusCode).toBe(403);
  });
});
