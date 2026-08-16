#!/usr/bin/env node
/* Validador do conteudo clinico.
   Roda: node testes/validar.js
   Sai com codigo 1 se qualquer verificacao falhar. */

const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const conteudo = JSON.parse(fs.readFileSync(path.join(raiz, "public/conteudo.json"), "utf8"));
const { casos } = JSON.parse(fs.readFileSync(path.join(__dirname, "casos.json"), "utf8"));

const itens = conteudo.itens;
const acha = id => itens.find(i => i.id === id);

let falhas = 0, ok = 0;
const erro = m => { console.log("  FALHA  " + m); falhas++; };
const passa = m => { ok++; if (process.env.VERBOSE) console.log("  ok     " + m); };

/* ---------- 1. integridade estrutural ---------- */
console.log("\n[1] Estrutura do conteudo");

const ids = new Set();
for (const e of itens) {
  const ctx = e.id || "(sem id)";
  ["id", "nome", "area", "tipo", "uso", "fonte"].forEach(k => {
    if (!e[k]) erro(`${ctx}: campo obrigatorio ausente -> ${k}`);
  });
  if (ids.has(e.id)) erro(`id duplicado: ${e.id}`);
  ids.add(e.id);

  if (e.faixas) {
    const lim = e.faixas.map(f => f.ate);
    lim.forEach((v, k) => {
      if (k > 0 && v <= lim[k - 1]) erro(`${ctx}: faixas fora de ordem crescente`);
    });
    e.faixas.forEach(f => {
      if (!f.nome || !f.nota) erro(`${ctx}: faixa sem nome ou conduta`);
      if (!["low", "mid", "high"].includes(f.cor)) erro(`${ctx}: cor de faixa invalida -> ${f.cor}`);
    });
  }

  if (e.tipo === "criterios") {
    const soma = e.itens.filter(i => i.pts > 0).reduce((s, i) => s + i.pts, 0);
    const excl = e.itens.filter(i => i.exclui);
    const maxReal = excl.length ? somaMaxComExclusao(e) : soma;
    if (e.max !== maxReal) erro(`${ctx}: max declarado ${e.max}, maximo alcancavel ${maxReal}`);
    // reciprocidade da exclusao
    excl.forEach(i => i.exclui.forEach(alvo => {
      const outro = e.itens.find(x => x.id === alvo);
      if (!outro) return erro(`${ctx}: ${i.id} exclui id inexistente "${alvo}"`);
      if (!outro.exclui || !outro.exclui.includes(i.id))
        erro(`${ctx}: exclusao nao reciproca entre ${i.id} e ${alvo}`);
    }));
  }

  if (e.tipo === "infusao") {
    e.drogas.forEach(d => {
      ["nome", "unidade", "conc", "diluicao", "min", "max", "alerta"].forEach(k => {
        if (d[k] === undefined) erro(`${ctx}/${d.id}: falta ${k}`);
      });
      if (d.min >= d.max) erro(`${ctx}/${d.id}: faixa de dose invalida (${d.min}-${d.max})`);
      if (d.conc <= 0) erro(`${ctx}/${d.id}: concentracao invalida`);
    });
  }

  if (e.tipo === "checklist") {
    const vistos = new Set();
    e.secoes.flatMap(s => s.itens).forEach(i => {
      if (vistos.has(i.id)) erro(`${ctx}: id de item repetido -> ${i.id}`);
      vistos.add(i.id);
    });
    if (!e.secoes.flatMap(s => s.itens).some(i => i.critico))
      erro(`${ctx}: checklist sem nenhum item critico`);
  }
  passa(ctx);
}

function somaMaxComExclusao(e) {
  // forca bruta: testa todas as combinacoes validas
  const its = e.itens.filter(i => i.pts > 0);
  let melhor = 0;
  const n = its.length;
  for (let m = 0; m < (1 << n); m++) {
    const sel = its.filter((_, k) => m & (1 << k));
    const conflito = sel.some(i => i.exclui && i.exclui.some(x => sel.find(y => y.id === x)));
    if (conflito) continue;
    melhor = Math.max(melhor, sel.reduce((s, i) => s + i.pts, 0));
  }
  return melhor;
}

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
