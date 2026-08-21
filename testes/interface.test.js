#!/usr/bin/env node
/* Testes de interface. Precisa de um servidor servindo public/ na porta 8199:
     npx http-server public -p 8199 &
     node testes/interface.test.js

   Existe por causa de um bug real: o placar do resultado e a barra de abas
   sao ambos fixos no rodape, e a barra de abas ficava por cima. O escore era
   calculado certo e simplesmente nao aparecia. */
const { JSDOM } = require("jsdom");
const PORTA = process.env.PORTA || 8199;

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
    w.scrollTo = () => {};
  }
}).then(dom => {
  const w = dom.window, d = dom.window.document;
  setTimeout(() => {
    let f = 0;
    const chk = (c, m) => { if (!c) { console.log("  FALHA  " + m); f++; } };

    const SEM_PLACAR = ["fluxograma", "diferencial"];
    const cards = [...d.querySelectorAll(".card-alvo")];
    chk(cards.length > 0, "a lista carregou algum item");

    cards.forEach(c => {
      const nome = c.querySelector("h3").textContent;
      c.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
      chk(d.body.classList.contains("em-ferramenta"),
        `abas escondidas ao abrir "${nome}" (senao cobrem o placar)`);
      d.querySelector("#back").click();
      chk(!d.body.classList.contains("em-ferramenta"),
        `abas voltam ao sair de "${nome}"`);
    });

    // o placar tem que aparecer em quem calcula algo
    const glasgow = cards.find(c => c.textContent.includes("Glasgow"));
    glasgow.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    const segs = [...d.querySelectorAll("#items .seg")];
    segs[0].querySelectorAll("button")[1].click();   // ao som = 3
    segs[1].querySelectorAll("button")[4].click();   // ausente = 1
    segs[2].querySelectorAll("button")[4].click();   // extensao = 2
    chk(d.getElementById("res").classList.contains("on"), "placar visivel no Glasgow");
    chk(d.getElementById("val").textContent.includes("6"), "Glasgow 3+1+2 = 6");
    chk(d.getElementById("tname").textContent === "Grave", "faixa correta para 6 pontos");
    d.querySelector("#back").click();

    // abas de navegacao nunca escondem as proprias abas
    ["transporte", "favoritos", "registro", "duvidas", "tudo"].forEach(a => {
      d.querySelector(`[data-aba=${a}]`).click();
      chk(!d.body.classList.contains("em-ferramenta"), `abas visiveis na aba ${a}`);
    });

    console.log(`\n${f ? "REPROVADO" : "APROVADO"} — interface, ${cards.length} itens, ${f} falhas\n`);
    process.exit(f ? 1 : 0);
  }, 1600);
}).catch(e => { console.log("ERRO: nao consegui abrir o app —", e.message); process.exit(1); });
