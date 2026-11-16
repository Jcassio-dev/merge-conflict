"""Gera map/tilesets/marina.png: a Marina montada com as peças de personagem (Woka)
do WorkAdventure e o balão "…" animado acima dela. Gera também
panel/src/assets/marina.png, o mesmo sprite usado como retrato no painel.

Uso: python3 map/ferramentas/montar-marina.py <pasta-woka>
<pasta-woka> tem as subpastas character_color, character_eyes, character_hairs e
character_clothes, copiadas de github.com/workadventure/workadventure
(play/public/resources/customisation). Precisa do Pillow.

Licença: as peças Woka são do WorkAdventure. O repositório deles não traz licença
explícita para elas (conferido em 16/11/2026); o map/LICENSE.assets do starter kit
cobre os tilesets. Usamos o sprite só no mapa e no painel, que abre dentro do mapa.

Layout (tiles de 32x32, 2 colunas x 4 linhas):
  linha 0      Marina de frente, centralizada nos dois tiles (64x32)
  linhas 1..3  balão "…" com 1, 2 e 3 pontos (quadros da animação), 64x32 cada
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

TILE = 32
SAIDA = Path(__file__).resolve().parent.parent / "tilesets" / "marina.png"
RETRATO = Path(__file__).resolve().parents[2] / "panel" / "src" / "assets" / "marina.png"

# Marina 2: pele 7, olhos 1, roupa 15, cabelo 29.
PECAS = [
    ("character_color", "character_color7.png"),
    ("character_eyes", "character_eyes1.png"),
    ("character_clothes", "character_clothes15.png"),
    ("character_hairs", "character_hairs29.png"),
]

CONTORNO = (91, 58, 34, 255)  # madeira escura, igual às bordas do painel
PAPEL = (255, 250, 240, 255)
PONTO = (91, 58, 34, 255)


def montar_marina(pasta: Path) -> Image.Image:
    corpo = Image.new("RGBA", (TILE, TILE))
    for sub, nome in PECAS:
        folha = Image.open(pasta / sub / nome).convert("RGBA")
        # Quadro de frente parado: coluna do meio, primeira linha.
        corpo.alpha_composite(folha.crop((TILE, 0, 2 * TILE, TILE)))
    return corpo


def desenhar_balao(pontos: int) -> Image.Image:
    """Balão de 22x14 px com rabinho, centralizado em 64x32 e encostado embaixo."""
    img = Image.new("RGBA", (2 * TILE, TILE))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 21, 13, 42, 26
    d.rounded_rectangle((x0, y0, x1, y1), radius=4, fill=PAPEL, outline=CONTORNO)
    # rabinho apontando para a cabeça
    d.polygon([(29, y1), (34, y1), (31, 30)], fill=PAPEL)
    d.line([(29, y1 + 1), (31, 30)], fill=CONTORNO)
    d.line([(34, y1 + 1), (32, 30)], fill=CONTORNO)
    for i in range(pontos):
        cx = 26 + i * 5
        d.rectangle((cx, 19, cx + 1, 20), fill=PONTO)
    return img


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pasta = Path(sys.argv[1])
    marina = montar_marina(pasta)
    folha = Image.new("RGBA", (2 * TILE, 4 * TILE))
    folha.alpha_composite(marina, (TILE // 2, 0))
    for quadro in range(3):
        folha.alpha_composite(desenhar_balao(quadro + 1), (0, (quadro + 1) * TILE))
    folha.save(SAIDA)
    RETRATO.parent.mkdir(exist_ok=True)
    marina.save(RETRATO)
    print(f"gerado {SAIDA} e {RETRATO}")


if __name__ == "__main__":
    main()
