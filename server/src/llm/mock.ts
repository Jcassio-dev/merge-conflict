import { ChatMessage, LlmProvider } from "./types.js";

/**
 * Marina e avaliadora SIMULADAS, só para desenvolver e testar sem chave de API.
 * Usa regras simples de palavras; o jogo real NÃO deve funcionar assim
 * (a LLM avalia conteúdo e tom). Ver CLAUDE.md.
 */
export class MockProvider implements LlmProvider {
  async complete(messages: ChatMessage[]): Promise<string> {
    const system = messages[0]?.content ?? "";
    if (system.includes("AVALIADORA")) return avaliar(messages.at(-1)?.content ?? "");
    const ultima = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    return responderComoMarina(ultima);
  }
}

export function sinais(texto: string) {
  const t = texto.toLowerCase();
  return {
    rispido: /(não dá|nao da|impossível|impossivel|problema seu|nem pensar|absurdo)/.test(t),
    aceita: /^(ok|tá bom|ta bom|beleza|pode deixar|sim|claro)\b/.test(t.trim()) || t.includes("a gente dá um jeito"),
    impacto: /(atras|impacto|risco|não cabe|nao cabe|sobrecarg|qualidade|não vai dar tempo)/.test(t),
    proposta: /(próxima sprint|proxima sprint|trocar|tirar|priorizar|alternativa|e se|podemos|posso entregar)/.test(t),
    escuta: /(entendo|entendi|imagino|o que o cliente|faz sentido|sei que)/.test(t),
  };
}

function responderComoMarina(fala: string): string {
  const s = sinais(fala);
  if (s.impacto && s.proposta) {
    return "Entendi o risco. Fechado: o login entra na próxima sprint e eu aviso o cliente hoje. Valeu pela franqueza! [FIM]";
  }
  if (s.rispido) return "Mas eu já prometi pro cliente... Não tem mesmo nenhum jeito?";
  if (s.aceita) return "Perfeito, obrigada! Vou avisar o cliente que vem tudo na sexta. [FIM]";
  if (s.impacto) return "Entendo que aperta. Mas o que você sugere? O cliente está esperando algo na sexta.";
  if (s.proposta) return "Hum, pode ser. Mas por que não dá para encaixar agora?";
  return "Me ajuda a entender: o que te preocupa nisso?";
}

function avaliar(transcricao: string): string {
  const json = transcricao.slice(transcricao.indexOf("["));
  const falas = (JSON.parse(json) as { autor: string; texto: string }[])
    .filter((f) => f.autor === "jogador")
    .map((f) => f.texto);
  const todas = falas.join(" ");
  const s = sinais(todas);
  const primeira = falas[0] ?? "";
  const ultima = falas.at(-1) ?? primeira;
  const nivel = (bom: boolean, ok: boolean) => (bom ? "bom" : ok ? "adequado" : "a_melhorar");
  const resultado = s.impacto && s.proposta ? "acordo" : s.aceita ? "sobrecarga_aceita" : "sem_acordo";
  return JSON.stringify({
    criterios: [
      {
        nome: "assertividade",
        nivel: nivel(s.impacto && s.proposta && !s.rispido, s.impacto || s.proposta),
        evidencia: ultima,
        motivo: s.impacto && s.proposta ? "Você disse o impacto e fez uma proposta." : "Faltou dizer o impacto e propor algo.",
      },
      {
        nome: "escuta",
        nivel: nivel(s.escuta, !s.rispido),
        evidencia: primeira,
        motivo: s.escuta ? "Você mostrou que entendeu o lado da Marina." : "Faltou perguntar o que a Marina precisa.",
      },
      {
        nome: "negociacao",
        nivel: nivel(s.proposta, s.impacto),
        evidencia: ultima,
        motivo: s.proposta ? "Você ofereceu uma alternativa." : "Faltou oferecer uma alternativa concreta.",
      },
      {
        nome: "conflitos",
        nivel: nivel(resultado === "acordo", !s.rispido),
        evidencia: ultima,
        motivo: resultado === "acordo" ? "Vocês fecharam um combinado." : "A conversa terminou sem combinado.",
      },
    ],
    ponto_forte: { trecho: ultima, comentario: "Você manteve a conversa aberta até o fim." },
    para_treinar: {
      criterio: "escuta",
      voce_disse: primeira,
      tente: "Entendi que o cliente pressionou você. O que ele precisa ver na sexta?",
    },
    resultado,
  });
}
