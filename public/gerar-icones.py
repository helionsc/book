#!/usr/bin/env python3
"""Gera os icones do app:  python3 public/gerar-icones.py

Direcao: um glifo so, traco grosso, fundo solido. Icone moderno se
reconhece pela silhueta, nao pelo detalhe — o que sobrevive a 60 pontos
na tela e a forma, nao os elementos internos.

O traco carrega o gradiente de risco (verde -> ambar -> coral), que e o
conceito do app inteiro. Um pulso branco seria o clichê de app de saude;
o gradiente e o que torna este icone reconhecivelmente nosso.

Requisitos do iOS respeitados aqui:
  - sem transparencia (o iOS preenche o fundo com preto)
  - sem cantos arredondados (o sistema aplica a propria mascara)
  - tamanhos exatos que o iOS busca para a tela de inicio
"""
from PIL import Image, ImageDraw

FUNDO = (11, 41, 50)        # petroleo solido — mantem a identidade da marca
VERDE   = (74, 222, 128)
AMBAR   = (252, 199, 71)
CORAL   = (252, 113, 133)


def _cor(t):
    if t < 0.5:
        k, a, b = t / 0.5, VERDE, AMBAR
    else:
        k, a, b = (t - 0.5) / 0.5, AMBAR, CORAL
    k = k * k * (3 - 2 * k)
    return tuple(round(a[i] + (b[i] - a[i]) * k) for i in range(3))


def icone(px):
    S = 3                                   # supersampling
    W = px * S
    img = Image.new("RGB", (W, W), FUNDO)
    u = W / 1024.0

    # Fundo solido pede traco mais decidido: sem gradiente para dar
    # profundidade, a forma precisa carregar sozinha.
    y, esp, A = W * 0.52, int(84 * u), 215 * u
    pts = [(W*0.12, y), (W*0.32, y), (W*0.40, y-A*0.28), (W*0.48, y+A*0.62),
           (W*0.56, y-A), (W*0.64, y+A*0.34), (W*0.70, y), (W*0.88, y)]

    def ponto(t):
        seg = t * (len(pts) - 1)
        i = min(int(seg), len(pts) - 2)
        f = seg - i
        return (pts[i][0] + (pts[i+1][0] - pts[i][0]) * f,
                pts[i][1] + (pts[i+1][1] - pts[i][1]) * f)

    # segmentos curtos para o gradiente correr ao longo da linha
    linha = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    dl = ImageDraw.Draw(linha)
    N = 240
    for i in range(N):
        p1, p2, c = ponto(i / N), ponto((i + 1) / N), _cor(i / N)
        dl.line([p1, p2], fill=c + (255,), width=esp)
        dl.ellipse([p2[0]-esp/2, p2[1]-esp/2, p2[0]+esp/2, p2[1]+esp/2], fill=c + (255,))
    p0, c0 = pts[0], _cor(0)
    dl.ellipse([p0[0]-esp/2, p0[1]-esp/2, p0[0]+esp/2, p0[1]+esp/2], fill=c0 + (255,))
    img.paste(linha, (0, 0), linha)

    return img.resize((px, px), Image.LANCZOS)


if __name__ == "__main__":
    for px in (120, 152, 167, 180):
        icone(px).save(f"icone-ios-{px}.png")
    for px in (192, 512):
        icone(px).save(f"icone-{px}.png")
    print("icones gerados")
