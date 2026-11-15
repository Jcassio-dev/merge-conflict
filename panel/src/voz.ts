// Voz no painel: a Marina fala (áudio gerado no servidor) e o jogador fala pelo
// microfone (reconhecimento de voz do próprio navegador). A fala escrita continua
// sempre na tela: o áudio é um extra, nunca o único jeito de acompanhar a conversa.

// ---------- voz da Marina ----------
let tocando: HTMLAudioElement | undefined;

/** Toca o áudio da URL, parando o que estiver tocando. Falha em silêncio: o texto já está na tela. */
export function tocar(url: string): void {
  parar();
  const audio = new Audio(url);
  tocando = audio;
  audio.play().catch(() => {
    if (tocando === audio) tocando = undefined;
  });
}

export function parar(): void {
  tocando?.pause();
  tocando = undefined;
}

// ---------- microfone do jogador ----------
type Resultado = { isFinal: boolean; 0: { transcript: string } };
type Reconhecimento = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<Resultado> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type ConstrutorReconhecimento = new () => Reconhecimento;

const Construtor: ConstrutorReconhecimento | undefined =
  (window as unknown as { SpeechRecognition?: ConstrutorReconhecimento }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: ConstrutorReconhecimento }).webkitSpeechRecognition;

/** O navegador reconhece fala? (Chrome e Edge sim; Firefox não.) */
export const microfoneDisponivel = Boolean(Construtor);

const ERROS: Record<string, string> = {
  "not-allowed": "Libere o microfone no navegador para falar.",
  "service-not-allowed": "Libere o microfone no navegador para falar.",
  "audio-capture": "Nenhum microfone encontrado.",
  network: "O reconhecimento de voz não funcionou neste navegador. Responda por texto.",
  "no-speech": "Não ouvi nada. Tente de novo, mais perto do microfone.",
};

export type Escuta = { parar: () => void };

/**
 * Começa a ouvir. `aoTexto` recebe o texto reconhecido até agora (parcial e final);
 * `aoFim` é chamado ao parar, com uma mensagem quando houve erro.
 */
export function ouvir(aoTexto: (texto: string) => void, aoFim: (erro?: string) => void): Escuta | undefined {
  if (!Construtor) return undefined;
  parar(); // não deixa a voz da Marina entrar no microfone
  const rec = new Construtor();
  rec.lang = "pt-BR";
  rec.interimResults = true;
  rec.continuous = false;
  let finais = "";
  let erro: string | undefined;
  rec.onresult = (ev) => {
    let parcial = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i]!;
      if (r.isFinal) finais += r[0].transcript;
      else parcial += r[0].transcript;
    }
    aoTexto((finais + parcial).trim());
  };
  rec.onerror = (ev) => {
    if (ev.error !== "aborted") erro = ERROS[ev.error] ?? "O microfone parou. Tente de novo ou responda por texto.";
  };
  rec.onend = () => aoFim(erro);
  rec.start();
  return { parar: () => rec.stop() };
}
