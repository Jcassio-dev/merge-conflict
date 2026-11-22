"""Junta as peças de personagem (Woka) do WorkAdventure em uma imagem por camada,
para o jogo montar o boneco de cada jogador no navegador.

Uso: python3 map/ferramentas/montar-woka.py <pasta-customisation>
<pasta-customisation> é play/public/resources/customisation do repositório
github.com/workadventure/workadventure (subpastas character_color, character_eyes,
character_hairs, character_clothes, character_hats e character_accessories).
Precisa do Pillow.

Cabelos: o WorkAdventure traz cada corte em duas cores. Aqui fica um de cada corte,
em tons de cinza, para o jogo pintar com a cor que o jogador escolher. Também
geramos cortes cacheados a partir do formato de cortes existentes (ver CACHEADOS).

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

# Cortes cacheados gerados: (nome, peça original de base, volume em px)
CACHEADOS = [
    ("cacheado curto", 2, 1),
    ("cacheado médio", 12, 1),
    ("cachos longos", 37, 1),
    ("black power", 2, 2),
]
T = 32

CAMADAS = ["color", "eyes", "hairs", "clothes", "hats", "accessories"]
LARGURA, ALTURA = 96, 128
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


# Cachinho de 4x4 que se repete (deslocado em linhas alternadas): 0 vazio, 1 sombra, 2 tom, 3 brilho.
CACHO = [
    [2, 3, 2, 2],
    [3, 2, 1, 2],
    [2, 1, 2, 2],
    [2, 2, 2, 2],
]
TONS = {1: 140, 2: 205, 3: 250}


def cacheado(base: Image.Image, volume: int, rosto: Image.Image) -> Image.Image:
    """Cachos a partir do formato de um corte: mais volume para cima e para os lados,
    sem cobrir o rosto (pele da testa para baixo, tirada de `rosto`), e textura de cachos."""
    saida = Image.new("RGBA", base.size)
    pb = base.load()
    pr = rosto.load()
    po = saida.load()
    for linha in range(4):
        for coluna in range(3):
            ox, oy = coluna * T, linha * T
            m = {(x, y) for x in range(T) for y in range(T) if pb[ox + x, oy + y][3]}
            if not m:
                continue
            de_costas = linha == 3
            pele = {(x, y) for x in range(T) for y in range(T) if pr[ox + x, oy + y][3]}
            testa = min(y for _x, y in m) + 4
            fundo = max(y for _x, y in m)
            proibido = set() if de_costas else {(x, y) for x, y in pele if y >= testa}
            for _ in range(volume):
                novo = set(m)
                for x, y in m:
                    vizinhos = [(x - 1, y), (x + 1, y), (x, y - 1)]
                    if de_costas and y < fundo:
                        vizinhos.append((x, y + 1))
                    novo.update(
                        v for v in vizinhos if 0 <= v[0] < T and 0 <= v[1] < T and v not in proibido
                    )
                m = novo
            # borda recortada nas laterais e em cima, para parecer fofo
            borda = {(x, y) for x, y in m if any(v not in m for v in ((x - 1, y), (x + 1, y), (x, y - 1)))}
            m -= {(x, y) for x, y in borda if (x + y) % 3 == 0 and (x, y + 1) in m and len(m) > 40}
            for x, y in m:
                fora = any(v not in m for v in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
                desloc = 2 if (y // 4) % 2 else 0
                v = 60 if fora else TONS[CACHO[y % 4][(x + desloc) % 4]]
                po[ox + x, oy + y] = (v, v, v, 255)
    return saida


def cabelos_em_cinza(folhas: list[Image.Image], rosto: Image.Image) -> list[Image.Image]:
    """Um de cada corte (o primeiro de cada formato), em cinza, mais os cacheados."""
    vistos: set[bytes] = set()
    unicos = []
    for folha in folhas:
        m = mascara(folha)
        if m in vistos:
            continue
        vistos.add(m)
        unicos.append(em_cinza(folha))
    for _nome, base, volume in CACHEADOS:
        unicos.append(cacheado(folhas[base], volume, rosto))
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
        folhas = []
        for arquivo in pecas:
            folha = Image.open(arquivo).convert("RGBA")
            if folha.size != (LARGURA, ALTURA):
                sys.exit(f"tamanho inesperado em {arquivo}: {folha.size}")
            folhas.append(folha)
        if camada == "hairs":
            # o corpo 0 serve de molde do rosto, para os cachos não cobrirem a cara
            corpo = Image.open(origem / "character_color" / "character_color0.png").convert("RGBA")
            folhas = cabelos_em_cinza(folhas, corpo)
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
