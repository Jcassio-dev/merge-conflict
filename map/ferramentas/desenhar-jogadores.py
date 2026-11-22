"""Gera panel/public/mapa/jogadores.png: os bonecos dos jogadores, desenhados pela
equipe (sem peças de terceiros), em pixel art de 32x32.

Uso: python3 map/ferramentas/desenhar-jogadores.py   (precisa do Pillow)

Layout: 3 colunas (parado, passo esquerdo, passo direito) x 24 linhas.
A linha é cor * 4 + direção, com direção 0 baixo, 1 esquerda, 2 direita, 3 cima.
O jogo (panel/src/jogo/) depende desse layout.
"""

from pathlib import Path

from PIL import Image

T = 32
DIRECOES = ["baixo", "esquerda", "direita", "cima"]
CONTORNO = (43, 40, 58, 255)
CALCA = (47, 54, 80, 255)
SAPATO = (30, 30, 40, 255)
OLHO = (35, 30, 45, 255)
SOMBRA = (0, 0, 0, 60)

# camisa, cabelo, pele
CORES = [
    ((59, 184, 166), (90, 58, 34), (241, 194, 125)),
    ((242, 165, 65), (34, 34, 40), (198, 134, 66)),
    ((122, 91, 214), (230, 193, 90), (255, 219, 172)),
    ((214, 80, 74), (60, 38, 24), (141, 85, 36)),
    ((61, 123, 217), (181, 83, 42), (224, 172, 105)),
    ((91, 171, 74), (136, 136, 140), (241, 194, 125)),
]


def rgba(c):
    return (*c, 255) if len(c) == 3 else c


def escurecer(c, f=0.75):
    return (int(c[0] * f), int(c[1] * f), int(c[2] * f), 255)


def boneco(camisa, cabelo, pele, direcao: str, quadro: int) -> Image.Image:
    camisa, cabelo, pele = rgba(camisa), rgba(cabelo), rgba(pele)
    px: dict[tuple[int, int], tuple] = {}

    def ret(x0, y0, x1, y1, cor):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                px[(x, y)] = cor

    # quadro 0 parado; 1 e 2 dão o passo com uma perna e sobem o corpo 1 px
    sobe = 0 if quadro == 0 else 1
    perna_e = 1 if quadro == 1 else 0
    perna_d = 1 if quadro == 2 else 0
    lado = direcao in ("esquerda", "direita")

    # pernas e sapatos
    if lado:
        # de perfil, as pernas abrem para frente e para trás
        abre = {0: (0, 0), 1: (-2, 2), 2: (2, -2)}[quadro]
        for dx in abre:
            ret(14 + dx, 24, 17 + dx, 27, CALCA)
            ret(14 + dx, 28, 17 + dx, 28, SAPATO)
    else:
        ret(11, 24, 14, 27 - perna_e, CALCA)
        ret(11, 28 - perna_e, 14, 28 - perna_e, SAPATO)
        ret(17, 24, 20, 27 - perna_d, CALCA)
        ret(17, 28 - perna_d, 20, 28 - perna_d, SAPATO)

    # corpo (camisa) e braços
    y_corpo = 17 - sobe
    ret(10, y_corpo, 21, 24 - sobe, camisa)
    ret(9, y_corpo + 1, 22, 23 - sobe, camisa)
    if lado:
        balanco = {0: 0, 1: -1, 2: 1}[quadro]
        bx = 15 if direcao == "direita" else 14
        ret(bx, y_corpo + 2 + balanco, bx + 2, 22 - sobe + balanco, escurecer(camisa))
        ret(bx, 23 - sobe + balanco, bx + 2, 23 - sobe + balanco, pele)
    else:
        ret(8, y_corpo + 1, 9, 22 - sobe, escurecer(camisa))
        ret(22, y_corpo + 1, 23, 22 - sobe, escurecer(camisa))
        ret(8, 23 - sobe, 9, 23 - sobe, pele)
        ret(22, 23 - sobe, 23, 23 - sobe, pele)

    # cabeça
    yc = 4 - sobe
    ret(10, yc + 1, 21, yc + 12, pele)
    ret(9, yc + 3, 22, yc + 10, pele)
    ret(11, yc, 20, yc + 13, pele)

    # cabelo
    if direcao == "cima":
        ret(10, yc, 21, yc + 10, cabelo)
        ret(9, yc + 2, 22, yc + 9, cabelo)
        ret(11, yc - 1, 20, yc + 11, cabelo)
    else:
        ret(11, yc - 1, 20, yc + 2, cabelo)
        ret(9, yc + 1, 22, yc + 4, cabelo)
        if direcao == "baixo":
            ret(9, yc + 5, 10, yc + 8, cabelo)
            ret(21, yc + 5, 22, yc + 8, cabelo)
        elif direcao == "esquerda":
            ret(18, yc + 5, 22, yc + 9, cabelo)
        else:
            ret(9, yc + 5, 13, yc + 9, cabelo)

    # rosto
    if direcao == "baixo":
        ret(12, yc + 7, 13, yc + 8, OLHO)
        ret(18, yc + 7, 19, yc + 8, OLHO)
        ret(14, yc + 11, 17, yc + 11, escurecer(pele, 0.8))
    elif direcao == "esquerda":
        ret(11, yc + 7, 12, yc + 8, OLHO)
    elif direcao == "direita":
        ret(19, yc + 7, 20, yc + 8, OLHO)

    img = Image.new("RGBA", (T, T), (0, 0, 0, 0))
    # sombra no chão
    for x in range(10, 22):
        img.putpixel((x, 30), SOMBRA)
    for x in range(12, 20):
        img.putpixel((x, 31), SOMBRA)
    # contorno: pixel vazio vizinho de um pixel preenchido
    for (x, y) in list(px):
        for vx, vy in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if (vx, vy) not in px and 0 <= vx < T and 0 <= vy < T:
                img.putpixel((vx, vy), CONTORNO)
    for (x, y), cor in px.items():
        if 0 <= x < T and 0 <= y < T:
            img.putpixel((x, y), cor)
    return img


def main() -> None:
    folha = Image.new("RGBA", (3 * T, len(CORES) * 4 * T), (0, 0, 0, 0))
    for c, (camisa, cabelo, pele) in enumerate(CORES):
        for d, direcao in enumerate(DIRECOES):
            for q in range(3):
                folha.paste(boneco(camisa, cabelo, pele, direcao, q), (q * T, (c * 4 + d) * T))
    raiz = Path(__file__).resolve().parents[2]
    destino = raiz / "panel" / "public" / "mapa" / "jogadores.png"
    destino.parent.mkdir(parents=True, exist_ok=True)
    folha.save(destino)
    print(f"gerado {destino.relative_to(raiz)} ({folha.width}x{folha.height})")


if __name__ == "__main__":
    main()
