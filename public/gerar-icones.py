#!/usr/bin/env python3
"""Gera os icones do app. Rode apos ajustar cores ou proporcoes:
   python3 public/gerar-icones.py

Estilo Apple: gradiente vertical sutil, glifo unico centrado, margem
generosa (~20% de cada lado), profundidade por brilho difuso em vez de
sombra dura.

Requisitos do iOS que este script respeita:
  - sem transparencia (o iOS preenche o fundo com preto)
  - sem cantos arredondados (o sistema aplica a propria mascara)
  - tamanhos exatos que o iOS busca para a tela de inicio
"""
from PIL import Image, ImageDraw, ImageFilter

TOPO  = (23, 92, 105)     # petroleo saturado
BASE  = (9, 34, 43)       # quase preto, para o glifo saltar
BAIXO = (93, 226, 143)
MEDIO = (252, 199, 71)
ALTO  = (252, 122, 141)
TRACO = (150, 224, 226)

def fundo(W):
    g = Image.new("RGB", (1, W))
    d = ImageDraw.Draw(g)
    for y in range(W):
        t = y / max(W - 1, 1)
        t = t * t * (3 - 2 * t)              # suaviza as pontas do gradiente
        d.point((0, y), fill=tuple(round(TOPO[i] + (BASE[i] - TOPO[i]) * t) for i in range(3)))
    return g.resize((W, W), Image.BICUBIC)

def icone(px):
    S = 4                                     # supersampling: bordas limpas
    W = px * S
    img = fundo(W)
    u = W / 1024.0

    # brilho superior difuso — profundidade sem sombra dura
    br = Image.new("L", (W, W), 0)
    ImageDraw.Draw(br).ellipse([-W*0.35, -W*0.78, W*1.35, W*0.42], fill=38)
    img.paste(Image.new("RGB", (W, W), (255, 255, 255)),
              (0, 0), br.filter(ImageFilter.GaussianBlur(W*0.06)))

    d = ImageDraw.Draw(img)

    # tres barras de risco: o conceito central do app
    larg, gap = 132*u, 52*u
    total = 3*larg + 2*gap
    x0 = (W - total) / 2
    base = 648*u
    for i, (c, h) in enumerate(zip([BAIXO, MEDIO, ALTO], [180*u, 288*u, 404*u])):
        x = x0 + i*(larg+gap)
        d.rounded_rectangle([x, base-h, x+larg, base], radius=30*u, fill=c)

    # ECG como acento, nao protagonista
    y, amp = base + 122*u, 74*u
    L = total + 40*u
    f = lambda v: x0 - 20*u + v*L
    d.line([
        (f(0.00), y), (f(0.18), y),
        (f(0.24), y-24*u), (f(0.30), y), (f(0.37), y),
        (f(0.41), y+30*u), (f(0.47), y-amp), (f(0.53), y+42*u), (f(0.58), y),
        (f(0.72), y), (f(0.80), y-32*u), (f(0.88), y), (f(1.00), y)
    ], fill=TRACO, width=int(22*u), joint="curve")

    return img.resize((px, px), Image.LANCZOS)

if __name__ == "__main__":
    for px in (120, 152, 167, 180):
        icone(px).save(f"icone-ios-{px}.png")
    for px in (192, 512):
        icone(px).save(f"icone-{px}.png")
    print("icones gerados")
