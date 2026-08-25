#!/usr/bin/env python3
"""Gera os icones do app:  python3 public/gerar-icones.py

Direcao: um glifo so, traco grosso, eixo ascendente na diagonal.
Icone moderno se reconhece pela silhueta — o que sobrevive a 60 pontos
na tela e a forma, nao o detalhe interno.

O traco carrega o gradiente de risco (verde -> ambar -> coral), que e o
conceito do app inteiro, e sobe da esquerda para a direita: a diagonal da
movimento que a linha reta nao dava. Um pulso branco seria o clichê de
app de saude; o gradiente e o que torna este icone reconhecivelmente nosso.

Requisitos do iOS respeitados aqui:
  - sem transparencia (o iOS preenche o fundo com preto)
  - sem cantos arredondados (o sistema aplica a propria mascara)
  - tamanhos exatos que o iOS busca para a tela de inicio
"""
from PIL import Image, ImageDraw, ImageFilter

FUNDO = (10, 35, 45)          # petroleo escuro solido
VERDE = (86, 232, 152)
AMBAR = (255, 206, 92)
CORAL = (255, 118, 142)


def _traco(W, pts, esp, cores, alpha=255):
    """Desenha a polilinha em segmentos curtos para o gradiente correr ao
    longo dela, em vez de atravessar a imagem."""
    L = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    dl = ImageDraw.Draw(L)

    def pt(t):
        s = t * (len(pts) - 1)
        i = min(int(s), len(pts) - 2)
        f = s - i
        return (pts[i][0] + (pts[i+1][0] - pts[i][0]) * f,
                pts[i][1] + (pts[i+1][1] - pts[i][1]) * f)

    def cor(t):
        n = len(cores) - 1
        s = t * n
        i = min(int(s), n - 1)
        f = s - i
        f = f * f * (3 - 2 * f)
        a, b = cores[i], cores[i + 1]
        return tuple(round(a[j] + (b[j] - a[j]) * f) for j in range(3))

    N = 280
    for i in range(N):
        p1, p2, c = pt(i / N), pt((i + 1) / N), cor(i / N)
        dl.line([p1, p2], fill=c + (alpha,), width=esp)
        dl.ellipse([p2[0]-esp/2, p2[1]-esp/2, p2[0]+esp/2, p2[1]+esp/2], fill=c + (alpha,))
    p0, c0 = pt(0), cor(0)
    dl.ellipse([p0[0]-esp/2, p0[1]-esp/2, p0[0]+esp/2, p0[1]+esp/2], fill=c0 + (alpha,))
    return L


def icone(px):
    S = 3                                  # supersampling: bordas limpas
    W = px * S
    u = W / 1024.0
    img = Image.new("RGB", (W, W), FUNDO)

    y, A, esp = W * 0.54, 248 * u, int(90 * u)
    pts = [(W*0.110, y + 56*u), (W*0.290, y + 28*u),
           (W*0.375, y - A*0.30), (W*0.465, y + A*0.56),
           (W*0.550, y - A),      (W*0.635, y + A*0.28),
           (W*0.705, y - 18*u),   (W*0.890, y - 66*u)]

    # halo suave: da vida ao traco sem poluir a silhueta
    halo = _traco(W, pts, int(esp * 1.5), [VERDE, AMBAR, CORAL], alpha=70) \
        .filter(ImageFilter.GaussianBlur(W * 0.035))
    img.paste(halo, (0, 0), halo)

    linha = _traco(W, pts, esp, [VERDE, AMBAR, CORAL])
    img.paste(linha, (0, 0), linha)

    return img.resize((px, px), Image.LANCZOS)


if __name__ == "__main__":
    for px in (120, 152, 167, 180):
        icone(px).save(f"icone-ios-{px}.png")
    for px in (192, 512):
        icone(px).save(f"icone-{px}.png")
    print("icones gerados")
