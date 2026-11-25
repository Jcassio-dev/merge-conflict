import { createHmac, timingSafeEqual } from "node:crypto";

export type OpcoesAcesso = {
  codigo?: string;
  validoAte?: string;
  diasCookie?: number;
  usuario?: string;
  senha?: string;
};

export const COOKIE = "cd_acesso";
const DIA_MS = 24 * 60 * 60 * 1000;

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// O cookie é assinado com o próprio código do convite: trocar o código invalida todos os cookies.
const assinar = (codigo: string, expira: number) =>
  createHmac("sha256", codigo).update(`acesso:${expira}`).digest("base64url");

export class Acesso {
  constructor(private readonly o: OpcoesAcesso, private readonly agora: () => number = Date.now) {}

  linkValido(c: string | undefined): boolean {
    const codigo = this.o.codigo;
    if (!codigo || !c || !iguais(c, codigo)) return false;
    if (this.o.validoAte && this.agora() > Date.parse(`${this.o.validoAte}T23:59:59-03:00`)) return false;
    return true;
  }

  novoCookie(): { valor: string; maxAge: number } {
    const dias = this.o.diasCookie ?? 7;
    const expira = this.agora() + dias * DIA_MS;
    return { valor: `${expira}.${assinar(this.o.codigo!, expira)}`, maxAge: dias * 24 * 60 * 60 };
  }

  cookieValido(valor: string | undefined): boolean {
    const codigo = this.o.codigo;
    if (!codigo || !valor) return false;
    const [expiraTxt, assinatura] = valor.split(".");
    const expira = Number(expiraTxt);
    if (!Number.isFinite(expira) || !assinatura || expira < this.agora()) return false;
    return iguais(assinatura, assinar(codigo, expira));
  }

  basicValido(cabecalho: string | undefined): boolean {
    const { usuario, senha } = this.o;
    if (!usuario || !senha || !cabecalho?.startsWith("Basic ")) return false;
    const texto = Buffer.from(cabecalho.slice(6), "base64").toString("utf8");
    const i = texto.indexOf(":");
    if (i < 0) return false;
    const u = iguais(texto.slice(0, i), usuario);
    const s = iguais(texto.slice(i + 1), senha);
    return u && s;
  }
}

export function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  for (const parte of (cabecalho ?? "").split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return v.join("=");
  }
  return undefined;
}
