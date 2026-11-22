"""Junta as peças de personagem (Woka) do WorkAdventure em uma imagem por camada,
para o jogo montar o boneco de cada jogador no navegador.

Uso: python3 map/ferramentas/montar-woka.py <pasta-customisation>
<pasta-customisation> é play/public/resources/customisation do repositório
github.com/workadventure/workadventure (subpastas character_color, character_eyes,
character_hairs, character_clothes e character_hats).
Precisa do Pillow.

Cabelos: o WorkAdventure traz cada corte em duas cores. Aqui fica um de cada corte,
em tons de cinza, para o jogo pintar com a cor que o jogador escolher.

Saída em panel/public/mapa/woka/:
  <camada>.png   peças lado a lado, em grade de 10 colunas; cada peça é uma folha
                 de 96x128 (3 quadros x 4 direções: baixo, esquerda, direita, cima)
  woka.json      quantas peças há em cada camada (o jogo e o server/ usam)

Licença: as peças são do WorkAdventure (TheCodingMachine), no pacote play/ do
repositório, sob AGPL v3 com Commons Clause: uso sem venda, com crédito.
"""

import json
import re
import sys
from pathlib import Path

from PIL import Image

CAMADAS = ["color", "eyes", "hairs", "clothes", "hats"]

# Curadoria: só peças que combinam com um escritório (posição da peça na lista ordenada
# pelo número do arquivo, a mesma ordem do atlas completo).
# Fora: fantasmas, esqueletos e tons repetidos de pele; olhos borrados ou de monstro;
# roupa íntima, armaduras e fantasias; capacetes, abóbora e chapéus quase vazios.
# Os acessórios do WorkAdventure são quase todos armas (espada, escudo, arco): não entram.
MANTER = {
    "color": [9, 4, 3, 8, 5, 10, 6, 11, 12],
    "eyes": [*range(0, 10), 15, 16, *range(18, 34)],
    "clothes": [1, 2, 4, *range(13, 25), 28, 29, 30, 35, 36, 39, 40, 41, 42, *range(47, 57), 58, 68, 69],
    "hats": [9, 11, 12, 13, 17, 18, 19, 20],
}
LARGURA, ALTURA = 96, 128
T = 32
COLUNAS = 10


def numero(arquivo: Path) -> int:
    achado = re.search(r"(\d+)\.png$", arquivo.name)
    return int(achado.group(1)) if achado else 0


def mascara(folha: Image.Image) -> bytes:
    return bytes(1 if a else 0 for a in folha.getchannel("A").tobytes())


def em_cinza(folha: Image.Image) -> Image.Image:
    """Tons de cinza com o tom principal perto de 0,85: multiplicado pela cor escolhida,
    vira essa cor com luz e sombra."""
    px = folha.load()
    lums = sorted(
        (0.299 * r + 0.587 * g + 0.114 * b) / 255
        for x in range(folha.width) for y in range(folha.height)
        for r, g, b, a in [px[x, y]] if a
    )
    if not lums:
        return folha
    topo = lums[int(len(lums) * 0.9)] or 1
    saida = Image.new("RGBA", folha.size)
    po = saida.load()
    for x in range(folha.width):
        for y in range(folha.height):
            r, g, b, a = px[x, y]
            if a:
                v = min(255, round((0.299 * r + 0.587 * g + 0.114 * b) / 255 / topo * 0.9 * 255))
                po[x, y] = (v, v, v, a)
    return saida


def cabelos_em_cinza(folhas: list[Image.Image]) -> list[Image.Image]:
    """Um de cada corte (o primeiro de cada formato), em cinza."""
    vistos: set[bytes] = set()
    unicos = []
    for folha in folhas:
        m = mascara(folha)
        if m in vistos:
            continue
        # Alguns cortes vêm sem uma das direções ou com as direções trocadas (a nuca
        # aparece por cima do rosto). Só o careca pode ser vazio, e por inteiro.
        direcoes = [folha.crop((0, r * T, LARGURA, (r + 1) * T)).getbbox() is not None for r in range(4)]
        if any(direcoes) and not all(direcoes):
            continue
        vistos.add(m)
        unicos.append(em_cinza(folha))
    return unicos


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    origem = Path(sys.argv[1])
    destino = Path(__file__).resolve().parents[2] / "panel" / "public" / "mapa" / "woka"
    destino.mkdir(parents=True, exist_ok=True)
    total: dict[str, int] = {}
    for camada in CAMADAS:
        pecas = sorted((origem / f"character_{camada}").glob("*.png"), key=numero)
        if camada in MANTER:
            pecas = [pecas[i] for i in MANTER[camada]]
        folhas = []
        for arquivo in pecas:
            folha = Image.open(arquivo).convert("RGBA")
            if folha.size != (LARGURA, ALTURA):
                sys.exit(f"tamanho inesperado em {arquivo}: {folha.size}")
            folhas.append(folha)
        if camada == "hairs":
            folhas = cabelos_em_cinza(folhas)
        linhas = (len(folhas) + COLUNAS - 1) // COLUNAS
        atlas = Image.new("RGBA", (COLUNAS * LARGURA, linhas * ALTURA))
        for i, folha in enumerate(folhas):
            atlas.alpha_composite(folha, ((i % COLUNAS) * LARGURA, (i // COLUNAS) * ALTURA))
        atlas.save(destino / f"{camada}.png", optimize=True)
        total[camada] = len(folhas)
    (destino / "woka.json").write_text(json.dumps({"colunas": COLUNAS, "total": total}) + "\n")
    print(f"gerado em {destino}: {total}")


if __name__ == "__main__":
    main()
