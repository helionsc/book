#!/usr/bin/env node
/* Testes do resolvedor de intencao. node testes/resolver.test.js */
const fs = require("fs");
const path = require("path");
const { resolver, extrairCampos } = require(path.join(__dirname, "../public/resolver.js"));
const itens = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/conteudo.json"), "utf8")).itens;

const casos = [
  ["qual a dose de rocuronio pra 80 kg?", "iot-rapida", { peso: 80 }],
  ["quanto de noradrenalina em paciente de 70kg", "bic", { peso: 70 }],
  ["nora 0.1 mcg/kg/min 70 kg", "bic", { peso: 70, dose: 0.1 }],
  ["quanto tempo dura o cilindro com fluxo de 5 L/min", "o2-autonomia", { fluxo: 5 }],
  ["cilindro 150 kgf trajeto de 90 min", "o2-autonomia", { pressao: 150, trajeto: 90 }],
  ["trajeto de 2 horas", "o2-autonomia", { trajeto: 120 }],
  ["paciente dessaturou no transporte", "fluxo-dessat", {}],
  ["caiu a sat do paciente intubado", "fluxo-dessat", {}],
  ["preciso conferir antes de sair", "check-transporte", {}],
  ["vou intubar, paciente de 65 kg", "iot-rapida", { peso: 65 }],
  ["etomidato 70 kg", "iot-rapida", { peso: 70 }],
  ["clearance de creatinina 1.2 mulher 70 anos", "cockcroft", { cr: 1.2, idade: 70 }],
  ["anticoagular fibrilacao atrial", "chads-vasc", {}],
  ["escala de coma", "glasgow", {}],
  ["suspeita de trombose venosa profunda", "wells-tvp", {}],
  ["paciente septico com hipotensao", "qsofa", {}],
  // fora do escopo — tem que devolver nada
  ["como fazer bolo de chocolate", null, {}],
  ["oi tudo bem", null, {}],
  ["qual o melhor time de futebol", null, {}],
  ["preciso fazer compras no mercado", null, {}]
];

let falhas = 0;
for (const [txt, esperado, campos] of casos) {
  const r = resolver(txt, itens);
  const got = r ? r.item.id : null;
  if (got !== esperado) {
    console.log(`  FALHA  "${txt}"\n         esperado ${esperado}, obtido ${got}`);
    falhas++; continue;
  }
  for (const [k, v] of Object.entries(campos)) {
    if (r.campos[k] !== v) {
      console.log(`  FALHA  "${txt}"\n         campo ${k}: esperado ${v}, obtido ${r.campos[k]}`);
      falhas++;
    }
  }
}

console.log(`\n${falhas ? "REPROVADO" : "APROVADO"} — ${casos.length} perguntas, ${falhas} falhas\n`);
process.exit(falhas ? 1 : 0);
