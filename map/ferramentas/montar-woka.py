"""Junta as peças de personagem (Woka) do WorkAdventure em uma imagem por camada,
para o jogo montar o boneco de cada jogador no navegador.

Uso: python3 map/ferramentas/montar-woka.py <pasta-customisation>
<pasta-customisation> é play/public/resources/customisation do repositório
github.com/workadventure/workadventure (subpastas character_color, character_eyes,
character_hairs, character_clothes, character_hats e character_accessories).
Precisa do Pillow.

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

CAMADAS = ["color", "eyes", "hairs", "clothes", "hats", "accessories"]
LARGURA, ALTURA = 96, 128
COLUNAS = 10


def numero(arquivo: Path) -> int:
    achado = re.search(r"(\d+)\.png$", arquivo.name)
    return int(achado.group(1)) if achado else 0


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    origem = Path(sys.argv[1])
    destino = Path(__file__).resolve().parents[2] / "panel" / "public" / "mapa" / "woka"
    destino.mkdir(parents=True, exist_ok=True)
    total: dict[str, int] = {}
    for camada in CAMADAS:
        pecas = sorted((origem / f"character_{camada}").glob("*.png"), key=numero)
        linhas = (len(pecas) + COLUNAS - 1) // COLUNAS
        atlas = Image.new("RGBA", (COLUNAS * LARGURA, linhas * ALTURA))
        for i, arquivo in enumerate(pecas):
            folha = Image.open(arquivo).convert("RGBA")
            if folha.size != (LARGURA, ALTURA):
                sys.exit(f"tamanho inesperado em {arquivo}: {folha.size}")
            atlas.alpha_composite(folha, ((i % COLUNAS) * LARGURA, (i // COLUNAS) * ALTURA))
        atlas.save(destino / f"{camada}.png", optimize=True)
        total[camada] = len(pecas)
    (destino / "woka.json").write_text(json.dumps({"colunas": COLUNAS, "total": total}) + "\n")
    print(f"gerado em {destino}: {total}")


if __name__ == "__main__":
    main()
