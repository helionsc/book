#!/usr/bin/env node
/* Testes do registro do transporte. */
const path = require("path");
const loja = {};
global.localStorage = {
  getItem: k => loja[k] ?? null,
  setItem: (k, v) => { loja[k] = String(v); },
  removeItem: k => { delete loja[k]; }
};
const R = require(path.join(__dirname, "../public/registro.js"));

let f = 0;
const chk = (c, m) => { if (!c) { console.log("  FALHA  " + m); f++; } };

chk(R.lerRegistro() === null, "comeca sem registro");
chk(R.anotar("intercorrencia", "x") === null, "nao anota sem registro aberto");
chk(R.gerarRelatorio() === null, "nao gera relatorio sem registro");

const r = R.iniciarRegistro();
chk(!!r.id && !!r.inicio, "cria registro com id e horario");
chk(r.eventos.length === 1, "registra o marco de inicio");
chk(r.fim === null, "nasce em aberto");

R.anotarVitais({ pa: "120x80", fc: 88, sat: 96 });
R.anotar("intercorrencia", "Queda de saturação para 88%");
R.anotar("conduta", "Aumentado FiO2 para 100%");
R.anotarVitais({ pa: "100x60", fc: 110, sat: 92 });

const a = R.lerRegistro();
chk(a.eventos.length === 5, "acumula eventos na ordem");
chk(a.eventos[1].vitais.fc === 88, "guarda os vitais estruturados");

chk(R.anotarVitais({}) === null, "ignora vitais vazios");
chk(R.lerRegistro().eventos.length === 5, "vitais vazios nao viram evento");

const rel1 = R.gerarRelatorio();
chk(rel1.includes("120x80"), "relatorio traz os vitais");
chk(rel1.includes("Queda de satura"), "relatorio traz a intercorrencia");
chk(rel1.includes("Aumentado FiO2"), "relatorio traz a conduta");
chk(rel1.includes("Médico receptor"), "relatorio tem campo do medico receptor");
chk(!rel1.includes("Chegada:"), "sem chegada enquanto aberto");

const fim = R.encerrarRegistro();
chk(!!fim.fim, "encerra com horario");
const rel2 = R.gerarRelatorio();
chk(rel2.includes("Chegada:"), "relatorio encerrado mostra chegada");
chk(rel2.includes("Duração:"), "relatorio traz duracao");

// registro sem nada anotado nao pode gerar relatorio mentindo
R.descartarRegistro();
R.iniciarRegistro();
const vazio = R.gerarRelatorio();
chk(vazio.includes("Sem intercorrências registradas"), "diz explicitamente quando nao houve registro");
chk(!vazio.includes("estável"), "nao inventa conclusao clinica");

R.descartarRegistro();
chk(R.lerRegistro() === null, "descarta o registro");

console.log(`\n${f ? "REPROVADO" : "APROVADO"} — registro do transporte, ${f} falhas\n`);
process.exit(f ? 1 : 0);
