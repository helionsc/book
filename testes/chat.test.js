#!/usr/bin/env node
/* Testes do chat. Precisa de servidor em public/ na porta 8199 e do jsdom.
     npx http-server public -p 8199 &
     node testes/chat.test.js  */
const { JSDOM } = require("jsdom");
const PORTA = process.env.PORTA || 8199;
let corpo = null;
/* A camada de IA e simulada. Nos testes de calculo local ela e desligada,
   para exercitar o caminho que roda sem rede — que e o que a medica ve
   quando o sinal cai. */
let iaLigada = true;

JSDOM.fromURL(`http://127.0.0.1:${PORTA}/index.html`, {
  runScripts: "dangerously", resources: "usable",
  beforeParse(w){
    w.fetch = (u, o) => {
      if (String(u).includes("/api/responder")){
        corpo = JSON.parse(o.body);
        return Promise.resolve({ json: () => Promise.resolve(
          iaLigada
            ? { ativo: true, achou: true, resposta: "Resposta de teste.",
                fontes: ["Sequência rápida de intubação"] }
            : { ativo: false }) });
      }
      return fetch(new URL(u, `http://127.0.0.1:${PORTA}/`).href, o);
    };
    const m = {};
    Object.defineProperty(w, "localStorage", { value: {
      getItem: k => m[k] ?? null, setItem: (k,v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }
    }});
    w.scrollTo = () => {};
  }
}).then(dom => {
  const w = dom.window, d = w.document;
  const perg = q => { d.getElementById("perg").value = q; d.getElementById("enviar").click(); };
  let f = 0;
  const chk = (c, m) => { if (!c) { console.log("  FALHA  " + m); f++; } };
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  setTimeout(async () => {
    d.querySelector("[data-aba=duvidas]").click();
    chk(d.querySelectorAll(".sugs button").length >= 3, "chat abre com sugestoes de partida");

    perg("o que voce sabe?");
    await esperar(350);
    let b = [...d.querySelectorAll(".balao")].pop();
    chk(b.textContent.includes("ferramentas"), "responde sobre o proprio conteudo, sem rede");
    chk(corpo === null, "pergunta sobre o app nao gasta chamada de API");

    perg("dose de rocuronio pra 80 kg");
    await esperar(450);
    chk(corpo.trechos.some(t => t.nome.includes("intuba")), "envia o trecho certo como contexto");
    chk(corpo.trechos.length >= 3, "envia varios trechos, nao so um");
    b = [...d.querySelectorAll(".balao")].pop();
    chk(!!b.querySelector(".fontes"), "mostra a fonte da resposta");
    chk(/80 kg/.test(b.querySelector(".ir-chat").textContent), "botao abre a ferramenta com 80 kg");

    perg("e em 60 kg?");
    await esperar(450);
    chk(corpo.historico.length >= 2, "envia o historico da conversa");
    chk(corpo.historico.at(-1).papel === "ia", "historico termina na resposta, sem duplicar a pergunta");
    chk(corpo.trechos.some(t => t.nome.includes("intuba")), "seguimento mantem o assunto anterior");
    b = [...d.querySelectorAll(".balao")].pop();
    chk(/60 kg/.test(b.querySelector(".ir-chat").textContent), "seguimento usa o peso novo, nao o antigo");

    // calculo direto: quando a pergunta traz tudo, responde o numero
    // sem depender da IA — precisa funcionar offline
    iaLigada = false;
    const calc = async (q, deve) => {
      perg(q); await esperar(350);
      const t = [...d.querySelectorAll(".balao")].pop().querySelector(".txt").textContent;
      chk(deve.test(t), `"${q}" -> ${deve}\n           obtido: ${t.slice(0, 70)}`);
    };
    await calc("dose de rocuronio pra 80 kg", /96 mg.*9[,.]6 mL/);
    await calc("adrenalina em crianca de 12 kg", /1,20 mL/);
    await calc("noradrenalina 0.1 mcg\/kg\/min em 70 kg", /6\.6 mL\/h/);
    await calc("cilindro de 3,4 L a 150 kgf com fluxo de 5 L\/min", /1h17/);
    // falta dado: diz qual, em vez de mandar descobrir na tela
    await calc("quanto tempo dura o cilindro", /falta.*cilindro.*man[oô]metro.*fluxo/);
    await calc("clearance de creatinina 1.2 mulher 70 anos", /falta peso/);

    // conversa sobrevive a troca de aba
    d.querySelector("[data-aba=tudo]").click();
    d.querySelector("[data-aba=duvidas]").click();
    chk(d.querySelectorAll(".balao").length > 3, "conversa persiste ao trocar de aba");
    chk(!!d.querySelector(".limpa-chat"), "oferece limpar a conversa");
    d.querySelector(".limpa-chat").click();
    chk(d.querySelectorAll(".sugs button").length >= 3, "apos limpar, sugestoes voltam");

    console.log(`\n${f ? "REPROVADO" : "APROVADO"} — chat, ${f} falhas\n`);
    process.exit(f ? 1 : 0);
  }, 1600);
}).catch(e => { console.log("ERRO: nao consegui abrir o app —", e.message); process.exit(1); });
