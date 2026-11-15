"""Gera map/tilesets/conversas.png: Marina, caminho até a sala Projeto e placa.

Uso: python3 map/ferramentas/desenhar-tileset.py
Precisa do Pillow. Arte própria (pixel art), no estilo dos tilesets do mapa.

Layout (tiles de 32x32, 4 colunas x 3 linhas):
  0-1  Marina (64x32, cobre dois tiles, centralizada na mesa)
  2    caminho horizontal          3  caminho vertical
  4    curva baixo -> direita      5  curva esquerda -> cima
  6-7  placa (metade de cima)      8  seta para cima (fim do caminho)
  10-11 placa (metade de baixo)
"""

from pathlib import Path

from PIL import Image, ImageDraw

TILE = 32
SAIDA = Path(__file__).resolve().parent.parent / "tilesets" / "conversas.png"

CORES = {
    "k": (42, 36, 51),  # contorno
    "h": (90, 52, 32),  # cabelo
    "H": (122, 74, 44),  # brilho do cabelo
    "s": (232, 180, 138),  # pele
    "S": (201, 142, 102),  # sombra da pele
    "e": (42, 36, 51),  # olhos
    "r": (232, 144, 122),  # bochecha
    "m": (181, 82, 59),  # boca
    "b": (47, 127, 181),  # blusa
    "B": (35, 96, 138),  # sombra da blusa
    "l": (224, 176, 32),  # cordão do crachá
    "g": (242, 242, 242),  # crachá
    "p": (59, 63, 88),  # calça
    "P": (44, 47, 68),  # sombra da calça
    "o": (42, 36, 51),  # sapato
}

# Metade esquerda da Marina (10 colunas); a direita é o espelho.
MARINA_ESQ = [
    "......kkkk",
    "....kkhhhh",
    "...khhhhhh",
    "..khhHHhhh",
    "..khhhhhhh",
    ".khhhhhhhh",
    ".khhhhssss",
    ".khhhsssss",
    ".khhssssss",
    ".khhsseess",
    ".khhsseess",
    ".khhsrssss",
    ".khhhSssmm",
    "..khhhSsss",
    "..khhhhkSS",
    "..khhkbbbb",
    "..khkbbbbl",
    "...kbbbbbl",
    "..kbbbbBbl",
    "..kbsbbBgg",
    "..kbsbbBgg",
    "..kssbbbbb",
    "....kppppp",
    "....kppppp",
    "....kpppPk",
    "....kpppPk",
    "....kpppPk",
    "...kooook.",
    "...kkkkkk.",
]

COR_CAMINHO = (31, 194, 160)
COR_CAMINHO_BORDA = (15, 125, 104)

MADEIRA = (138, 90, 52)
MADEIRA_ESCURA = (74, 47, 28)
PAPEL = (244, 230, 200)
TINTA = (42, 36, 51)

# Fonte 3x5 só com as letras da placa.
FONTE = {
    "S": ["111", "100", "111", "001", "111"],
    "A": ["010", "101", "111", "101", "101"],
    "L": ["100", "100", "100", "100", "111"],
    "P": ["110", "101", "110", "100", "100"],
    "R": ["110", "101", "110", "101", "101"],
    "O": ["010", "101", "101", "101", "010"],
    "J": ["001", "001", "001", "101", "010"],
    "E": ["111", "100", "110", "100", "111"],
    "T": ["111", "010", "010", "010", "010"],
    "C": ["011", "100", "100", "100", "011"],
    "N": ["110", "101", "101", "101", "101"],
    "I": ["111", "010", "010", "010", "111"],
    "1": ["010", "110", "010", "010", "111"],
    " ": ["000", "000", "000", "000", "000"],
}


def desenhar_marina(img: Image.Image) -> None:
    linhas = [l + l[::-1] for l in MARINA_ESQ]
    largura = len(linhas[0])
    assert all(len(l) == largura for l in linhas), "linhas da Marina com tamanhos diferentes"
    x0 = (2 * TILE - largura) // 2
    y0 = TILE - len(linhas) - 2
    # Sombra no chão
    sombra = Image.new("RGBA", img.size)
    ImageDraw.Draw(sombra).ellipse((x0 + 2, TILE - 5, x0 + largura - 3, TILE - 1), fill=(0, 0, 0, 70))
    img.alpha_composite(sombra)
    for y, linha in enumerate(linhas):
        for x, c in enumerate(linha):
            if c != ".":
                img.putpixel((x0 + x, y0 + y), CORES[c] + (255,))


def ponto(d: ImageDraw.ImageDraw, cx: int, cy: int) -> None:
    d.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), fill=COR_CAMINHO, outline=COR_CAMINHO_BORDA)


def desenhar_caminho(img: Image.Image) -> None:
    d = ImageDraw.Draw(img)
    tiles = {
        2: [(8, 16), (24, 16)],  # horizontal
        3: [(16, 8), (16, 24)],  # vertical
        4: [(16, 24), (16, 16), (24, 16)],  # vem de baixo, segue para a direita
        5: [(8, 16), (16, 16), (16, 8)],  # vem da esquerda, segue para cima
    }
    for indice, pontos in tiles.items():
        ox, oy = (indice % 4) * TILE, (indice // 4) * TILE
        for cx, cy in pontos:
            ponto(d, ox + cx, oy + cy)
    # 8: seta para cima
    ox, oy = 0, 2 * TILE
    d.polygon(
        [(ox + 16, oy + 3), (ox + 27, oy + 15), (ox + 20, oy + 15), (ox + 20, oy + 22),
         (ox + 12, oy + 22), (ox + 12, oy + 15), (ox + 5, oy + 15)],
        fill=COR_CAMINHO, outline=COR_CAMINHO_BORDA,
    )
    ponto(d, ox + 16, oy + 27)


def escrever(d: ImageDraw.ImageDraw, texto: str, centro_x: int, y: int) -> None:
    largura = len(texto) * 4 - 1
    x = centro_x - largura // 2
    for letra in texto:
        if letra == "Á":
            d.point((x + 1, y - 2), fill=TINTA)
            d.point((x + 2, y - 3), fill=TINTA)
            letra = "A"
        for ly, linha in enumerate(FONTE[letra]):
            for lx, bit in enumerate(linha):
                if bit == "1":
                    d.point((x + lx, y + ly), fill=TINTA)
        x += 4


def desenhar_placa(img: Image.Image) -> None:
    ox, oy = 2 * TILE, 1 * TILE  # ocupa os tiles 6, 7, 10 e 11
    d = ImageDraw.Draw(img)
    # Pés
    for px in (14, 46):
        d.rectangle((ox + px, oy + 38, ox + px + 3, oy + 60), fill=MADEIRA, outline=MADEIRA_ESCURA)
    sombra = Image.new("RGBA", img.size)
    ImageDraw.Draw(sombra).ellipse((ox + 8, oy + 57, ox + 56, oy + 63), fill=(0, 0, 0, 60))
    img.alpha_composite(sombra)
    for px in (14, 46):
        d.rectangle((ox + px, oy + 38, ox + px + 3, oy + 60), fill=MADEIRA, outline=MADEIRA_ESCURA)
    # Quadro
    d.rectangle((ox + 2, oy + 6, ox + 61, oy + 40), fill=MADEIRA, outline=MADEIRA_ESCURA)
    d.rectangle((ox + 5, oy + 9, ox + 58, oy + 37), fill=PAPEL, outline=MADEIRA_ESCURA)
    escrever(d, "SALA PROJETO", ox + 32, oy + 15)
    escrever(d, "CENÁRIO 1", ox + 32, oy + 26)


def main() -> None:
    img = Image.new("RGBA", (4 * TILE, 3 * TILE), (0, 0, 0, 0))
    desenhar_marina(img)
    desenhar_caminho(img)
    desenhar_placa(img)
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    img.save(SAIDA)
    print(f"gerado: {SAIDA}")


if __name__ == "__main__":
    main()
