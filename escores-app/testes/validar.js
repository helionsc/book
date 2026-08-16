#!/usr/bin/env node
/* Validador do conteudo clinico.
   Roda: node testes/validar.js
   Sai com codigo 1 se qualquer verificacao falhar. */

const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const conteudo = JSON.parse(fs.readFileSync(path.join(raiz, "public/conteudo.json"), "utf8"));
const { casos } = JSON.parse(fs.readFileSync(path.join(__dirname, "casos.json"), "utf8"));

const { validarConteudo } = require(path.join(raiz, "public/regras.js"));
const itens = conteudo.itens;
const acha = id => itens.find(i => i.id === id);

let falhas = 0, ok = 0;
const erro = m => { console.log("  FALHA  " + m); falhas++; };
const passa = m => { ok++; if (process.env.VERBOSE) console.log("  ok     " + m); };

/* ---------- 1. integridade estrutural ---------- */
/* Mesmas regras que o editor usa (public/regras.js). Uma fonte so:
   se divergissem, o editor aprovaria conteudo que este teste reprova. */
console.log("\n[1] Estrutura do conteudo");
validarConteudo(itens).forEach(x => erro(`${x.id}: ${x.msg}`));
itens.forEach(i => passa(i.id));

/* ---------- 2. casos clinicos ---------- */
console.log("\n[2] Casos clinicos");

const faixaDe = (e, v) => (e.faixas.find(f => v <= f.ate) ?? e.faixas.at(-1)).nome;
const perto = (a, b, t) => Math.abs(a - b) <= (t ?? 0.01);

for (const c of casos) {
  const nome = c.descricao;

  if (c.escore) {
    const e = acha(c.escore);
    if (!e) { erro(`${nome}: escore "${c.escore}" nao existe`); continue; }
    let total;

    if (e.tipo === "criterios") {
      const est = {};
      for (const id of (c.marcar || [])) {
        if (!e.itens.find(x => x.id === id)) { erro(`${nome}: item "${id}" nao existe em ${e.id}`); }
        est[id] = true;
        const it = e.itens.find(x => x.id === id);
        if (it && it.exclui) it.exclui.forEach(x => est[x] = false);
      }
      total = e.itens.reduce((s, i) => s + (est[i.id] ? i.pts : 0), 0);
    } else if (e.tipo === "escolha") {
      total = Object.values(c.valores).reduce((a, b) => a + b, 0);
    } else if (e.tipo === "formula") {
      const fn = new Function(...Object.keys(c.valores), `return (${e.formula});`);
      total = fn(...Object.values(c.valores));
    }

    if (!perto(total, c.esperado, c.tolerancia)) {
      erro(`${nome}\n           esperado ${c.esperado}, obtido ${Number(total.toFixed(2))}`);
      continue;
    }
    if (c.faixaEsperada) {
      const f = faixaDe(e, total);
      if (f !== c.faixaEsperada) { erro(`${nome}\n           faixa esperada "${c.faixaEsperada}", obtida "${f}"`); continue; }
    }
    passa(nome);
  }

  if (c.infusao) {
    const e = acha(c.infusao);
    const d = e.drogas.find(x => x.id === c.droga);
    if (!d) { erro(`${nome}: droga "${c.droga}" nao existe`); continue; }
    const fator = d.unidade.endsWith("/min") ? 60 : 1;
    const mlh = (c.dose * c.peso * fator) / d.conc;
    if (!perto(mlh, c.esperadoMlH, c.tolerancia)) {
      erro(`${nome}\n           esperado ${c.esperadoMlH} mL/h, obtido ${mlh.toFixed(2)}`);
      continue;
    }
    if (c.dose < d.min || c.dose > d.max)
      console.log(`  AVISO  ${nome}: dose fora da faixa usual (${d.min}-${d.max} ${d.unidade})`);
    passa(nome);
  }

  if (c.oxigenio) {
    const litros = c.capacidade * c.pressao;
    const min = (litros / c.fluxo) * (1 - (c.reserva || 0) / 100);
    if (!perto(min, c.esperadoMin, c.tolerancia)) {
      erro(`${nome}\n           esperado ${c.esperadoMin} min, obtido ${min.toFixed(1)}`);
      continue;
    }
    passa(nome);
  }
}

/* ---------- 2b. doses por peso e fluxogramas ---------- */
for (const c of casos) {
  if (c.dosepeso) {
    const e = acha(c.dosepeso);
    const d = e.grupos.flatMap(g => g.drogas).find(x => x.nome === c.droga);
    if (!d) { erro(`${c.descricao}: droga "${c.droga}" nao encontrada`); continue; }
    const mg = d.dose * c.peso;
    const ml = mg / parseFloat(d.apres);
    if (!perto(mg, c.esperadoMg, c.tolerancia)) { erro(`${c.descricao}\n           esperado ${c.esperadoMg} mg, obtido ${mg.toFixed(2)}`); continue; }
    if (!perto(ml, c.esperadoMl, c.tolerancia)) { erro(`${c.descricao}\n           esperado ${c.esperadoMl} mL, obtido ${ml.toFixed(2)}`); continue; }
    if (d.dose < d.min || d.dose > d.max) erro(`${c.descricao}: dose padrao fora da propria faixa declarada`);
    passa(c.descricao);
  }

  if (c.fluxograma) {
    const e = acha(c.fluxograma);
    let no = e.inicio;
    let falhou = false;
    for (const escolha of c.caminho) {
      const atual = e.nos[no];
      if (!atual) { erro(`${c.descricao}: no "${no}" nao existe ou ja e um desfecho`); falhou = true; break; }
      const op = atual.op.find(o => o.t === escolha);
      if (!op) { erro(`${c.descricao}: opcao "${escolha}" nao existe no no "${no}"`); falhou = true; break; }
      no = op.ir;
    }
    if (falhou) continue;
    if (no !== c.fimEsperado) { erro(`${c.descricao}\n           desfecho esperado "${c.fimEsperado}", obtido "${no}"`); continue; }
    passa(c.descricao);
  }
}

/* ---------- 2c. integridade dos fluxogramas ---------- */
for (const e of itens.filter(i => i.tipo === "fluxograma")) {
  const alvos = new Set();
  Object.entries(e.nos).forEach(([id, n]) => {
    if (!n.op || !n.op.length) erro(`${e.id}/${id}: no sem opcoes de saida`);
    (n.op || []).forEach(o => {
      alvos.add(o.ir);
      if (!e.nos[o.ir] && !e.fins[o.ir]) erro(`${e.id}/${id}: aponta para "${o.ir}", que nao existe`);
    });
  });
  if (!e.nos[e.inicio] && !e.fins[e.inicio]) erro(`${e.id}: no inicial "${e.inicio}" nao existe`);
  Object.keys(e.nos).forEach(id => {
    if (id !== e.inicio && !alvos.has(id)) erro(`${e.id}: no "${id}" e inalcancavel`);
  });
  Object.keys(e.fins).forEach(id => {
    if (!alvos.has(id)) erro(`${e.id}: desfecho "${id}" e inalcancavel`);
    if (!["low", "mid", "high"].includes(e.fins[id].cor)) erro(`${e.id}/${id}: cor invalida`);
  });
  passa(`${e.id} (grafo)`);
}

/* ---------- 3. cobertura ---------- */
console.log("\n[3] Cobertura de testes");
const testados = new Set(casos.map(c => c.escore || c.infusao || c.oxigenio || c.dosepeso || c.fluxograma));
const semTeste = itens.filter(i => !testados.has(i.id) && i.tipo !== "checklist");
if (semTeste.length) {
  console.log(`  AVISO  sem caso de teste: ${semTeste.map(i => i.id).join(", ")}`);
}

/* ---------- resultado ---------- */
console.log(`\n${falhas ? "REPROVADO" : "APROVADO"} — ${ok} verificacoes ok, ${falhas} falhas`);
console.log(`conteudo v${conteudo.versao} (${conteudo.atualizado}), ${itens.length} itens\n`);
process.exit(falhas ? 1 : 0);
