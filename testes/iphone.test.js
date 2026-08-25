#!/usr/bin/env node
/* Verificacoes especificas de iPhone. Precisa de servidor em public/:8199.

   Existem porque o viewport-fit=cover faz o conteudo ocupar a tela inteira,
   inclusive sob o notch e o indicador de home. Sem tratar as areas seguras,
   o topo some atras da Dynamic Island — e isso nao aparece em navegador
   de desktop nenhum. */
const { JSDOM } = require("jsdom");
const PORTA = process.env.PORTA || 8199;
const fs = require("fs");
const path = require("path");

let f = 0;
const chk = (c, m) => { if (!c) { console.log("  FALHA  " + m); f++; } };

// --- CSS: areas seguras ---
const css = fs.readFileSync(path.join(__dirname, "../public/estilo.css"), "utf8");
chk(/header\{padding-top:calc\([^)]*safe-area-inset-top/.test(css), "topo respeita a area segura (notch)");
chk(/\.wrap\{[^}]*safe-area-inset-left/.test(css), "laterais respeitam a area segura (paisagem)");
chk(/\.abas\{[^}]*safe-area-inset-bottom/.test(css), "abas acima do indicador de home");
chk(/\.res\{[^}]*safe-area-inset-bottom/.test(css), "placar acima do indicador de home");
chk(/html\{[^}]*background:var\(--fundo\)/.test(css), "fundo no html evita branco no repique da rolagem");
chk(/-webkit-text-size-adjust:100%/.test(css), "impede o iOS de inflar o texto ao girar");
chk(/overscroll-behavior-y:none/.test(css), "sem puxar-para-atualizar acidental");
chk(/touch-action:manipulation/.test(css), "sem espera de 300 ms no toque");
chk(/body\.travado\{position:fixed/.test(css), "travamento de rolagem no padrao iOS");

// --- manifest ---
const man = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/manifest.webmanifest"), "utf8"));
chk(man.display === "standalone", "abre sem barra de navegador");
chk(man.icons.some(i => i.sizes === "180x180"), "manifest tem o icone de 180");
chk(man.icons.some(i => i.purpose === "maskable"), "tem icone maskable");

JSDOM.fromURL(`http://127.0.0.1:${PORTA}/index.html`, {
  runScripts: "dangerously", resources: "usable",
  beforeParse(w){
    w.fetch = (u, o) => String(u).includes("/api/")
      ? Promise.resolve({ json: () => Promise.resolve({ ativo: false }) })
      : fetch(new URL(u, `http://127.0.0.1:${PORTA}/`).href, o);
    const m = {};
    Object.defineProperty(w, "localStorage", { value: {
      getItem: k => m[k] ?? null, setItem: (k,v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }
    }});
    Object.defineProperty(w, "scrollY", { value: 420, writable: true });
    w.scrollTo = (x, y) => { w.scrollY = y; };
  }
}).then(dom => {
  const w = dom.window, d = w.document;
  setTimeout(() => {
    chk(d.querySelector("meta[name=viewport]").content.includes("viewport-fit=cover"),
      "viewport cobre a tela toda");
    chk(!!d.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]'),
      "barra de status definida para o modo instalado");
    chk(d.querySelectorAll('link[rel="apple-touch-icon"]').length === 4,
      "quatro tamanhos de apple-touch-icon");
    chk(d.querySelectorAll('meta[name="theme-color"]').length === 2,
      "theme-color para tema claro e escuro");

    const y0 = w.scrollY;
    [...d.querySelectorAll(".card-alvo")][0].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    chk(d.body.classList.contains("travado"), "trava a rolagem ao abrir a ferramenta");
    chk(d.body.style.top === `-${y0}px`, "guarda a posicao da rolagem");
    d.querySelector("#back").click();
    chk(!d.body.classList.contains("travado"), "destrava ao voltar");
    chk(w.scrollY === y0, "devolve a posicao anterior");

    d.querySelector("[data-aba=duvidas]").click();
    d.getElementById("perg").dispatchEvent(new w.FocusEvent("focusin", { bubbles: true }));
    chk(d.body.classList.contains("digitando"), "recolhe o placar quando o teclado abre");

    console.log(`\n${f ? "REPROVADO" : "APROVADO"} — iPhone, ${f} falhas\n`);
    process.exit(f ? 1 : 0);
  }, 1600);
}).catch(e => { console.log("ERRO: nao consegui abrir o app —", e.message); process.exit(1); });
