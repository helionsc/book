#!/usr/bin/env node
/* Testes da fila de duvidas. */
const path = require("path");
const loja = {};
global.localStorage = {
  getItem: k => loja[k] ?? null,
  setItem: (k, v) => { loja[k] = String(v); },
  removeItem: k => { delete loja[k]; }
};
const D = require(path.join(__dirname, "../public/duvidas.js"));

let f = 0;
const chk = (cond, msg) => { if (!cond) { console.log("  FALHA  " + msg); f++; } };

chk(D.lerDuvidas().length === 0, "comeca vazia");

D.novaDuvida("qual a dose de vancomicina em dialise");
chk(D.lerDuvidas().length === 1, "registra a primeira duvida");

// duplicata nao cria entrada nova, so incrementa
D.novaDuvida("Qual a dose de vancomicina em dialise");
chk(D.lerDuvidas().length === 1, "nao duplica pergunta igual");
chk(D.lerDuvidas()[0].vezes === 2, "conta quantas vezes foi perguntada");

D.novaDuvida("como manejar bradicardia no transporte");
chk(D.lerDuvidas().length === 2, "registra a segunda duvida");
chk(D.lerDuvidas()[0].texto.includes("bradicardia"), "mais recente vem primeiro");

D.novaDuvida("   ");
chk(D.lerDuvidas().length === 2, "ignora texto vazio");

const id = D.lerDuvidas()[0].id;
D.marcarResolvida(id);
chk(D.lerDuvidas()[0].estado === "resolvida", "marca como resolvida");
D.marcarResolvida(id);
chk(D.lerDuvidas()[0].estado === "pendente", "desmarca ao clicar de novo");

const md = D.exportarDuvidas();
chk(md.includes("Pendentes (2)"), "exporta contagem de pendentes");
chk(md.includes("perguntada 2×"), "exporta frequencia");
chk(md.includes("vancomicina"), "exporta o texto da duvida");

D.apagarDuvida(id);
chk(D.lerDuvidas().length === 1, "apaga duvida");

// ids tem que ser unicos mesmo em criacao rapida (colisao de milissegundo)
for (const k of Object.keys(loja)) delete loja[k];
for (let i = 0; i < 50; i++) D.novaDuvida("pergunta numero " + i);
const ids = D.lerDuvidas().map(d => d.id);
chk(new Set(ids).size === 50, "ids unicos em criacao rapida");
const alvo = ids[10];
D.apagarDuvida(alvo);
chk(D.lerDuvidas().length === 49, "apagar remove exatamente uma");

console.log(`\n${f ? "REPROVADO" : "APROVADO"} — fila de duvidas, ${f} falhas\n`);
process.exit(f ? 1 : 0);
