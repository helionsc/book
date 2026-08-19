/* Motores de calculo. Nenhum conteudo clinico vive neste arquivo —
   ele fica todo em conteudo.json. */

let TUDO = [];
let filtro = null, aba = "tudo", atual = null, estado = {}, fluxo = null;
const areas = [];
const $ = s => document.querySelector(s);

/* ---------- favoritos ---------- */
const FAV = "escores:favoritos";
const lerFav = () => { try { return JSON.parse(localStorage.getItem(FAV)) || []; } catch { return []; } };
const ehFav = id => lerFav().includes(id);
function alternaFav(id){
  const f = lerFav();
  const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else f.push(id);
  try { localStorage.setItem(FAV, JSON.stringify(f)); } catch {}
  pintaLista();
}

/* ---------- carga ---------- */
function avaliaFormula(expr, vars){
  const nomes = Object.keys(vars);
  return new Function(...nomes, `"use strict"; return (${expr});`)(...nomes.map(n => vars[n]));
}

async function iniciar(){
  try {
    const r = await fetch("conteudo.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    const dados = await r.json();
    TUDO = dados.itens;
    // Versao visivel: sem isso e impossivel saber se a atualizacao chegou.
    const rot = document.getElementById("rotulo-aba");
    if (rot) rot.dataset.versao = dados.versao;
    document.title = `Escores v${dados.versao}`;
    const v = document.getElementById("ver");
    if (v) v.textContent = "v" + dados.versao;
    TUDO.forEach(e => { if (e.formula) e.calc = v => avaliaFormula(e.formula, v); });
    [...new Set(TUDO.map(e => e.area))].sort().forEach(a => areas.push(a));
    pintaTags(); pintaLista(); ligaAbas(); selo(); seloRegistro(); aplicaModo();
    ligaVoz($("#voz-busca"), $("#q"));
  } catch (err) {
    $("#list").innerHTML = '<p class="empty">Não foi possível carregar o conteúdo. Verifique a conexão e recarregue.</p>';
    console.error(err);
  }
}

/* ---------- abas ---------- */
function ligaAbas(){
  document.querySelectorAll("#abas button").forEach(b => {
    b.onclick = () => {
      aba = b.dataset.aba;
      document.querySelectorAll("#abas button").forEach(x => x.setAttribute("aria-current", x === b));
      $("#rotulo-aba").textContent = b.textContent.trim();
      filtro = null;
      $("#q").value = "";
      $("#resposta").innerHTML = "";
      $("#tags").style.display = aba === "tudo" ? "" : "none";
      document.querySelector(".search").style.display = ["duvidas","registro"].includes(aba) ? "none" : "";
      pintaTags(); pintaLista();
      scrollTo(0, 0);
    };
  });
}

function pintaTags(){
  const t = $("#tags"); t.innerHTML = "";
  ["Todos", ...areas].forEach(a => {
    const b = document.createElement("button");
    b.className = "tag"; b.textContent = a;
    b.setAttribute("aria-pressed", a === "Todos" ? !filtro : filtro === a);
    b.onclick = () => { filtro = a === "Todos" ? null : a; pintaTags(); pintaLista(); };
    t.append(b);
  });
}

function pintaLista(){
  if (aba === "registro") return pintaRegistro();
  if (aba === "duvidas") return pintaDuvidas();
  const q = $("#q").value.trim().toLowerCase();
  const favs = lerFav();
  let res = TUDO.filter(e => {
    if (aba === "transporte" && e.area !== "Transporte") return false;
    if (aba === "favoritos" && !favs.includes(e.id)) return false;
    if (aba === "tudo" && filtro && e.area !== filtro) return false;
    if (!q) return true;
    return (e.nome + " " + (e.sigla || "") + " " + e.uso + " " + e.area).toLowerCase().includes(q);
  });

  const L = $("#list"); L.innerHTML = "";
  if (!res.length){
    L.innerHTML = `<p class="empty">${
      aba === "favoritos" && !q
        ? "Toque na estrela de um item para guardá-lo aqui."
        : "Nenhum resultado. Tente outro termo."}</p>`;
    return;
  }

  let areaAtual = null;
  res.forEach(e => {
    if (aba === "tudo" && !filtro && !q && e.area !== areaAtual){
      areaAtual = e.area;
      const g = document.createElement("div");
      g.className = "grupo"; g.textContent = e.area;
      L.append(g);
    }
    const c = document.createElement("div");
    c.className = "card";

    const alvo = document.createElement("button");
    alvo.className = "card-alvo";
    alvo.innerHTML = `${aba !== "tudo" || filtro || q ? `<span class="area">${e.area}</span>` : ""}
      <h3>${e.nome}</h3><p>${e.uso}</p>`;
    alvo.onclick = () => abrir(e);

    const f = document.createElement("button");
    f.className = "fav";
    f.setAttribute("aria-pressed", ehFav(e.id));
    f.setAttribute("aria-label", "Favoritar");
    f.innerHTML = `<svg width="19" height="19" viewBox="0 0 24 24"><path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z"/></svg>`;
    f.onclick = ev => { ev.stopPropagation(); alternaFav(e.id); };

    c.append(alvo, f);
    L.append(c);
  });
}

function pintaResposta(){
  const alvo = $("#resposta");
  const q = $("#q").value.trim();
  alvo.innerHTML = "";

  // So tenta interpretar quando parece pergunta, nao busca de uma palavra so.
  if (q.split(/\s+/).length < 3) return;

  const r = resolver(q, TUDO);
  if (!r){
    const cx = document.createElement("div");
    cx.className = "semresp";
    cx.innerHTML = `<b>Não encontrei isso no conteúdo</b>
      Este app só responde a partir do material revisado. Guarde como dúvida
      para que ela entre na fila do que ainda precisa ser escrito.`;
    const g = document.createElement("button");
    g.className = "guardar";
    g.textContent = "Guardar como dúvida";
    g.onclick = () => {
      novaDuvida(q);
      g.disabled = true;
      g.textContent = "Guardada na fila";
      selo();
    };
    if (lerDuvidas().some(d => d.texto.toLowerCase() === q.toLowerCase())){
      g.disabled = true; g.textContent = "Já está na fila";
    }
    cx.append(g);
    alvo.append(cx);
    return;
  }

  const d = document.createElement("div");
  d.className = "resp";
  d.innerHTML = `<div class="rot">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 5 5L19 7"/></svg>
      Encontrado no conteúdo</div>
    <h3>${r.item.nome}</h3>
    <p class="pre">${explicar(r)}</p>
    <button class="ir">Abrir</button>`;
  d.querySelector(".ir").onclick = () => abrir(r.item, r);

  if (r.alternativas.length){
    const a = document.createElement("div");
    a.className = "alt";
    a.append("Não era isso? ");
    r.alternativas.forEach(alt => {
      const b = document.createElement("button");
      b.textContent = alt.nome;
      b.onclick = () => abrir(alt);
      a.append(b);
    });
    d.append(a);
  }
  alvo.append(d);
}

/* ---------- chat de dúvidas ---------- */

/* Converte um item do conteudo em texto. E isso que vai para o modelo:
   so material que a revisora ja aprovou, nunca conhecimento externo. */
function resumirItem(e){
  const l = [];
  if (e.tipo === "criterios" || e.tipo === "escolha")
    l.push(e.itens.map(i => i.opcoes
      ? `${i.txt}: ${i.opcoes.map(([t, v]) => `${t}=${v}`).join(", ")}`
      : `${i.txt} = ${i.pts} pt`).join("; "));
  if (e.faixas)
    l.push(e.faixas.map(f => `até ${f.ate}: ${f.nome} — ${f.nota}`).join("; "));
  if (e.tipo === "infusao")
    l.push(e.drogas.map(d =>
      `${d.nome}: ${d.min}–${d.max} ${d.unidade}, ${d.diluicao} (${d.conc} mcg/mL). ${d.alerta}`).join("; "));
  if (e.tipo === "dosepeso")
    l.push(e.grupos.map(g => `${g.titulo}: ` + g.drogas.map(d =>
      `${d.nome} ${d.dose} ${d.un} (faixa ${d.min}–${d.max}), apresentação ${d.apres}. ${d.nota}`).join("; ")).join(" | "));
  if (e.tipo === "checklist")
    l.push(e.secoes.map(s => `${s.titulo}: ` + s.itens.map(i =>
      i.txt + (i.critico ? " [crítico]" : "")).join("; ")).join(" | "));
  if (e.tipo === "fluxograma"){
    l.push(Object.values(e.nos).map(n => `${n.txt}${n.sub ? ` (${n.sub})` : ""}`).join("; "));
    l.push(Object.values(e.fins).map(f => `${f.txt}: ${f.nota}`).join("; "));
  }
  if (e.tipo === "diferencial"){
    l.push("Sinais de alarme: " + e.alarme.join("; "));
    l.push(e.hipoteses.map(h =>
      `${h.nome} (${h.risco} risco) — a favor: ${h.favor} Contra: ${h.contra} Primeiro passo: ${h.passo}`).join(" | "));
  }
  if (e.tipo === "oxigenio")
    l.push(`Cilindros: ${e.cilindros.map(([n]) => n).join(", ")}. Reserva padrão ${e.reservaPadrao}%.`);
  if (e.formula) l.push(`Fórmula: ${e.formula}`);

  return { nome: e.nome, area: e.area, corpo: `${e.uso}. ${l.join(" ")}`, fonte: e.fonte, id: e.id };
}

/* Escolhe os trechos mais provaveis para a pergunta. */
function trechosPara(pergunta){
  const r = resolver(pergunta, TUDO);
  const escolhidos = r ? [r.item, ...r.alternativas] : [];
  // Sem correspondencia clara, manda os do transporte — o contexto de uso.
  const base = escolhidos.length ? escolhidos : TUDO.filter(i => i.area === "Transporte");
  return base.slice(0, 4).map(resumirItem);
}

let conversando = false;

/* Saudacao nao e pergunta clinica. Responder "nao encontrei no conteudo
   revisado" a um "oi" e rispido e desnecessario. */
const SAUDACOES = /^(oi+|ola|olá|opa|eae?|hey|hi|bom dia|boa tarde|boa noite|tudo bem\??|blz|beleza|obrigad[oa]|valeu|vlw|tchau|até|ok|okay|certo|entendi|teste|testando)[\s!.,?]*$/i;

async function perguntarIA(texto){
  conversando = true;
  desenhaBalao("eu", texto);

  if (SAUDACOES.test(texto.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
      || SAUDACOES.test(texto.trim())){
    desenhaBalao("ia", "Olá. Pergunte uma dose, um escore ou uma conduta — por exemplo: \"dose de rocurônio pra 80 kg\" ou \"quanto tempo dura o cilindro no fluxo de 5 L/min\".");
    conversando = false;
    return;
  }

  const carregando = desenhaBalao("ia", "Consultando o conteúdo…");

  /* Resolve localmente ANTES de perguntar ao modelo.
     Se existe uma ferramenta que responde, ela vem sempre — com ou sem IA.
     Perguntas de calculo ("quanto tempo dura o cilindro") nao tem resposta
     em texto: dependem de numeros que a pessoa ainda nao informou. */
  const local = resolver(texto, TUDO);

  try {
    const r = await fetch("/api/responder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta: texto, trechos: trechosPara(texto) })
    });
    const d = await r.json();
    carregando.remove();

    if (d.ativo === false) return semIA(texto, local);
    if (!d.achou) return naoAchou(texto, local);

    const b = desenhaBalao("ia", d.resposta);
    if (d.fontes?.length){
      const f = document.createElement("div");
      f.className = "fontes";
      f.textContent = "Do conteúdo: " + d.fontes.join(", ");
      b.append(f);
    }
    if (local) anexaFerramenta(b, local);
  } catch {
    carregando.remove();
    semIA(texto, local);
  } finally { conversando = false; }
}

/* Botao que abre a ferramenta ja preenchida com o que a pergunta trouxe. */
function anexaFerramenta(balao, r){
  const b = document.createElement("button");
  b.className = "ir-chat";
  const extra = explicar(r);
  b.textContent = "Abrir " + r.item.nome + (extra !== "Abrir ferramenta" ? ` — ${extra.replace("Abrindo com ", "")}` : "");
  b.onclick = () => abrir(r.item, r);
  balao.append(b);
}

/* Sem chave configurada ou sem rede. */
function semIA(texto, local){
  const r = local ?? resolver(texto, TUDO);
  if (!r) return naoAchou(texto, null);
  const b = desenhaBalao("ia", "Isso está no conteúdo:");
  anexaFerramenta(b, r);
}

/* O modelo nao achou resposta em texto. Se existe ferramenta, ela resolve. */
function naoAchou(texto, local){
  const r = local ?? resolver(texto, TUDO);

  if (r){
    const b = desenhaBalao("ia",
      "Essa pergunta depende de valores que variam por paciente, então não dá para responder em texto. A ferramenta calcula:");
    anexaFerramenta(b, r);
    return;
  }

  const b = desenhaBalao("ia", "Não encontrei isso no conteúdo revisado. Não vou responder de cabeça — em dose, um palpite confiante é pior que um \"não sei\".");
  const g = document.createElement("button");
  g.className = "ir-chat";
  const jaTem = lerDuvidas().some(d => d.texto.toLowerCase() === texto.toLowerCase());
  g.textContent = jaTem ? "Já está na fila" : "Guardar como dúvida";
  g.disabled = jaTem;
  g.onclick = () => { novaDuvida(texto); g.textContent = "Guardada na fila"; g.disabled = true; selo(); };
  b.append(g);
}

function desenhaBalao(quem, txt){
  const t = $("#thread");
  const b = document.createElement("div");
  b.className = "balao " + quem;
  b.innerHTML = `<span class="txt">${escapar(txt)}</span>`;
  t.append(b);
  t.scrollTop = t.scrollHeight;
  return b;
}

/* ---------- modo ambulância ---------- */
/* Ler 13px dentro de um veiculo em movimento as 3h nao funciona.
   O modo aumenta fonte e area de toque sem mudar o conteudo. */
const MODO = "escores:modo-ambulancia";
function aplicaModo(){
  const on = localStorage.getItem(MODO) === "1";
  document.body.classList.toggle("ambulancia", on);
  const b = $("#modo");
  if (b) b.setAttribute("aria-pressed", on);
}
if ($("#modo")) $("#modo").onclick = () => {
  const on = localStorage.getItem(MODO) === "1";
  try { localStorage.setItem(MODO, on ? "0" : "1"); } catch {}
  aplicaModo();
};

/* ---------- ditado ---------- */
/* Mao ocupada, luva, veiculo em movimento. Ditar e a diferenca entre
   usar e nao usar. Sem suporte do navegador, o botao nem aparece. */
const Voz = window.SpeechRecognition || window.webkitSpeechRecognition;

function ligaVoz(botao, campo, aoTerminar){
  if (!Voz || !botao) return;
  botao.hidden = false;
  let rec = null, ouvindo = false;

  botao.onclick = () => {
    if (ouvindo){ rec?.stop(); return; }
    rec = new Voz();
    rec.lang = "pt-BR";
    rec.interimResults = true;
    rec.continuous = false;

    rec.onstart = () => { ouvindo = true; botao.classList.add("ouvindo"); };
    rec.onend = () => {
      ouvindo = false;
      botao.classList.remove("ouvindo");
      if (campo.value.trim() && aoTerminar) aoTerminar();
    };
    rec.onerror = () => { ouvindo = false; botao.classList.remove("ouvindo"); };
    rec.onresult = ev => {
      campo.value = [...ev.results].map(r => r[0].transcript).join("");
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    };
    try { rec.start(); } catch {}
  };
}

/* ---------- aba de registro ---------- */
function seloRegistro(){
  const r = lerRegistro();
  const s = $("#selo-registro");
  if (!s) return;
  const ativo = r && !r.fim;
  s.textContent = ativo ? "•" : "";
  s.classList.toggle("on", !!ativo);
}

function pintaRegistro(){
  const L = $("#list");
  L.innerHTML = "";
  $("#resposta").innerHTML = "";
  const r = lerRegistro();

  if (!r){
    const c = document.createElement("div");
    c.className = "reg-vazio";
    c.innerHTML = `<b>Nenhum transporte em andamento</b>
      <p>Inicie o registro ao sair com o paciente. O app anota os horários e
      monta o relatório no fim — nada sai deste aparelho.</p>`;
    const b = document.createElement("button");
    b.className = "reg-forte";
    b.textContent = "Iniciar transporte";
    b.onclick = () => { iniciarRegistro(); pintaRegistro(); seloRegistro(); };
    c.append(b);
    L.append(c);
    return;
  }

  // cabeçalho
  const topo = document.createElement("div");
  topo.className = "reg-topo";
  topo.innerHTML = `<div class="reg-tempo"><b>${duracao(r)}</b>
      <span>${r.fim ? "encerrado" : "em andamento"} · saída ${hhmmUI(r.inicio)}</span></div>`;
  L.append(topo);

  const og = document.createElement("div");
  og.className = "reg-og";
  ["origem", "destino"].forEach(k => {
    const i = document.createElement("input");
    i.placeholder = k[0].toUpperCase() + k.slice(1);
    i.value = r[k] || "";
    i.oninput = () => { const x = lerRegistro(); x[k] = i.value; salvarRegistro(x); };
    og.append(i);
  });
  L.append(og);

  if (!r.fim){
    // sinais vitais
    const v = document.createElement("div");
    v.className = "reg-vitais";
    v.innerHTML = `<div class="sec">Anotar sinais vitais</div>
      <div class="vgrid">
        <input id="v-pa" placeholder="PA" inputmode="text">
        <input id="v-fc" placeholder="FC" inputmode="numeric">
        <input id="v-fr" placeholder="FR" inputmode="numeric">
        <input id="v-sat" placeholder="SatO₂" inputmode="numeric">
        <input id="v-temp" placeholder="Tax" inputmode="decimal">
      </div>`;
    const bv = document.createElement("button");
    bv.className = "reg-acao";
    bv.textContent = "Registrar vitais";
    bv.onclick = () => {
      const n = id => { const x = document.getElementById(id).value.trim(); return x === "" ? null : parseFloat(x); };
      const ok = anotarVitais({
        pa: document.getElementById("v-pa").value.trim(),
        fc: n("v-fc"), fr: n("v-fr"), sat: n("v-sat"), temp: n("v-temp")
      });
      if (ok) pintaRegistro();
    };
    v.append(bv);
    L.append(v);

    // anotação livre
    const a = document.createElement("div");
    a.className = "reg-vitais";
    a.innerHTML = `<div class="sec">Anotar ocorrência</div>
      <div class="reg-entrada">
        <input id="reg-txt" placeholder="O que aconteceu">
        <button class="voz" id="voz-reg" aria-label="Ditar" hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
        </button>
      </div>
      <div class="reg-tipos">
        <button data-t="intercorrencia">Intercorrência</button>
        <button data-t="conduta">Conduta</button>
        <button data-t="marco">Marco</button>
      </div>`;
    a.querySelectorAll(".reg-tipos button").forEach(b => {
      b.onclick = () => {
        const c = document.getElementById("reg-txt");
        if (!c.value.trim()) return;
        anotar(b.dataset.t, c.value.trim());
        c.value = "";
        pintaRegistro();
      };
    });
    L.append(a);
    ligaVoz(document.getElementById("voz-reg"), document.getElementById("reg-txt"));
  }

  // linha do tempo
  const t = document.createElement("div");
  t.className = "reg-linha";
  t.innerHTML = `<div class="sec">Linha do tempo</div>`;
  [...r.eventos].reverse().forEach(e => {
    const d = document.createElement("div");
    d.className = "ev " + e.tipo;
    d.innerHTML = `<span class="ev-h">${hhmmUI(e.quando)}</span><span class="ev-t">${escapar(e.txt)}</span>`;
    t.append(d);
  });
  L.append(t);

  // ações
  const acoes = document.createElement("div");
  acoes.className = "reg-rodape";

  if (!r.fim){
    const f = document.createElement("button");
    f.className = "reg-forte";
    f.textContent = "Encerrar na chegada";
    f.onclick = () => { encerrarRegistro(); pintaRegistro(); seloRegistro(); };
    acoes.append(f);
  }

  const rel = document.createElement("button");
  rel.className = "reg-acao";
  rel.textContent = "Gerar relatório";
  rel.onclick = () => {
    const ta = document.createElement("textarea");
    ta.className = "saida"; ta.value = gerarRelatorio(); ta.readOnly = true;
    const velho = L.querySelector(".saida");
    if (velho) velho.remove(); else L.append(ta);
    ta.select();
  };
  acoes.append(rel);

  const del = document.createElement("button");
  del.className = "reg-acao";
  del.textContent = "Descartar";
  del.onclick = () => {
    if (!confirm("Descartar este registro? Não dá para recuperar.")) return;
    descartarRegistro(); pintaRegistro(); seloRegistro();
  };
  acoes.append(del);
  L.append(acoes);
}
const hhmmUI = iso => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/* ---------- aba de dúvidas ---------- */
function selo(){
  const n = lerDuvidas().filter(d => d.estado === "pendente").length;
  const s = $("#selo-duvidas");
  s.textContent = n > 9 ? "9+" : n;
  s.classList.toggle("on", n > 0);
}

function pintaDuvidas(){
  const L = $("#list");
  L.innerHTML = "";
  $("#resposta").innerHTML = "";

  // chat
  const chat = document.createElement("div");
  chat.className = "chat";
  chat.innerHTML = `<div class="thread" id="thread"></div>
    <div class="entrada">
      <input id="perg" type="text" placeholder="Pergunte uma dúvida" autocomplete="off">
      <button id="enviar" aria-label="Enviar">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="2.2"><path d="M4 12h15M13 6l6 6-6 6"/></svg>
      </button>
    </div>`;
  L.append(chat);

  const campo = chat.querySelector("#perg");
  const enviar = () => {
    const v = campo.value.trim();
    if (!v || conversando) return;
    campo.value = "";
    perguntarIA(v);
  };
  chat.querySelector("#enviar").onclick = enviar;
  campo.onkeydown = ev => { if (ev.key === "Enter") enviar(); };

  desenhaBalao("ia", "Pergunte o que quiser. Só respondo a partir do conteúdo revisado — quando não estiver lá, digo que não sei e guardo a pergunta na fila.");

  const lista = lerDuvidas();

  if (!lista.length){
    const p = document.createElement("p");
    p.className = "empty";
    p.innerHTML = "Nenhuma dúvida guardada ainda.";
    L.append(p);
    return;
  }

  const barra = document.createElement("div");
  barra.className = "barra-dv";
  const bExp = document.createElement("button");
  bExp.className = "forte";
  bExp.textContent = "Exportar para revisão";
  bExp.onclick = () => {
    const md = exportarDuvidas();
    const t = document.createElement("textarea");
    t.className = "saida"; t.value = md; t.readOnly = true;
    const antigo = L.querySelector(".saida");
    if (antigo) antigo.remove(); else L.append(t);
    t.select();
  };
  barra.append(bExp);
  L.append(barra);

  lista.forEach(d => {
    const el = document.createElement("div");
    el.className = "dv" + (d.estado === "resolvida" ? " feita" : "");
    el.innerHTML = `<span class="dv-l">
        <b>${escapar(d.texto)}</b>
        <small>${new Date(d.quando).toLocaleDateString("pt-BR")}${d.vezes > 1 ? ` · perguntada ${d.vezes}×` : ""}</small>
        ${d.contexto ? `<span class="ctx">${escapar(d.contexto)}</span>` : ""}
      </span>
      <span class="dv-acoes"></span>`;

    const acoes = el.querySelector(".dv-acoes");

    const ok = document.createElement("button");
    ok.setAttribute("aria-label", "Marcar como resolvida");
    ok.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24"><path d="m5 12 5 5L19 7"/></svg>`;
    ok.onclick = () => { marcarResolvida(d.id); pintaDuvidas(); selo(); };

    const del = document.createElement("button");
    del.setAttribute("aria-label", "Apagar dúvida");
    del.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/></svg>`;
    del.onclick = () => { apagarDuvida(d.id); pintaDuvidas(); selo(); };

    acoes.append(ok, del);
    L.append(el);
  });
}
const escapar = s => s.replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

/* ---------- abrir ---------- */
function abrir(e, intencao){
  atual = e; estado = {}; fluxo = null;
  $("#ttl").textContent = e.nome;
  $("#trilha").innerHTML = `<b>${e.area}</b> › ${e.uso}`;
  $("#ref").innerHTML = `<b>Referência</b><br>${e.fonte}`;
  const box = $("#items"); box.innerHTML = "";
  $("#res").classList.toggle("on", !["fluxograma","diferencial"].includes(e.tipo));

  if (e.tipo === "criterios") e.itens.forEach(i => box.append(linhaCheck(i)));
  else if (e.tipo === "escolha") e.itens.forEach(i => box.append(linhaOpcoes(i.id, i.txt, i.opcoes)));
  else if (e.tipo === "formula")
    e.campos.forEach(c => box.append(c.tipo === "opcao" ? linhaOpcoes(c.id, c.txt, c.opcoes) : linhaNum(c)));
  else if (e.tipo === "oxigenio"){
    box.append(linhaOpcoes("cap", "Cilindro", e.cilindros));
    box.append(linhaNum({id:"pressao", txt:"Pressão do manômetro", un:"kgf/cm²", min:0, max:250}));
    box.append(linhaNum({id:"fluxo", txt:"Fluxo de O₂", un:"L/min", min:0.5, max:60, passo:0.5}));
    box.append(linhaNum({id:"trajeto", txt:"Duração estimada do trajeto", un:"min", min:1, max:600}));
    box.append(linhaNum({id:"reserva", txt:"Reserva de segurança", un:"%", min:0, max:60}));
    estado.reserva = e.reservaPadrao;
    setTimeout(() => { const el = document.getElementById("f-reserva"); if (el) el.value = e.reservaPadrao; }, 0);
  }
  else if (e.tipo === "infusao"){
    box.append(linhaOpcoes("droga", "Droga", e.drogas.map(d => [d.nome, d.id])));
    /* Na ambulancia o caminho inverso e o mais usado: ela olha a bomba
       correndo a 12 mL/h e quer saber quanto o paciente esta recebendo. */
    box.append(linhaOpcoes("sentido", "O que você quer calcular", [
      ["Vazão (mL/h)", "vazao"], ["Dose recebida", "dose"]
    ]));
    estado.sentido = "vazao";
    setTimeout(() => {
      const b = [...document.querySelectorAll("#items .seg")][1]?.querySelector("button");
      if (b) b.setAttribute("aria-pressed", "true");
    }, 0);
    box.append(linhaNum({id:"peso", txt:"Peso do paciente", un:"kg", min:1, max:250, passo:0.5}));
    box.append(linhaNum({id:"dose", txt:"Dose desejada", un:"—", min:0, max:100, passo:0.01}));
    box.append(linhaNum({id:"vazao", txt:"Vazão na bomba", un:"mL/h", min:0, max:1000, passo:0.1}));
    box.append(linhaNum({id:"conc", txt:"Concentração da solução", un:"mcg/mL", min:0.1, max:5000, passo:0.1}));
    const a = document.createElement("div"); a.className = "aviso"; a.id = "aviso-droga";
    box.append(a);
  }
  else if (e.tipo === "checklist"){
    e.secoes.forEach(sec => {
      const h = document.createElement("div"); h.className = "sec"; h.textContent = sec.titulo;
      box.append(h);
      sec.itens.forEach(i => box.append(linhaCheck({ ...i, pts: 1 })));
    });
  }
  else if (e.tipo === "dosepeso"){
    box.append(linhaNum({ id:"peso", txt:"Peso do paciente", un:"kg", min:1, max:250, passo:0.5 }));
    const saida = document.createElement("div"); saida.id = "doses"; saida.style.display = "grid"; saida.style.gap = "9px";
    box.append(saida);
  }
  else if (e.tipo === "diferencial"){
    const al = document.createElement("div");
    al.className = "alarme";
    al.innerHTML = `<b>Sinais de alarme</b><ul>${
      e.alarme.map(a => `<li>${a}</li>`).join("")}</ul>`;
    box.append(al);

    const h = document.createElement("div");
    h.className = "sec"; h.textContent = "Hipóteses — toque para abrir";
    box.append(h);

    e.hipoteses.forEach((hp, i) => {
      const d = document.createElement("div");
      d.className = "hip " + hp.risco;
      d.innerHTML = `<button class="hip-top">
          <span class="hip-nome">${hp.nome}</span>
          <span class="hip-risco">${({alto:"alto risco",medio:"risco médio",baixo:"baixo risco"})[hp.risco]}</span>
        </button>
        <div class="hip-corpo">
          <p><b>A favor:</b> ${lig(hp.favor)}</p>
          <p><b>Contra:</b> ${lig(hp.contra)}</p>
          <p class="hip-passo"><b>Primeiro passo:</b> ${lig(hp.passo)}</p>
        </div>`;
      d.querySelector(".hip-top").onclick = () => d.classList.toggle("aberta");
      if (i === 0) d.classList.add("aberta");
      box.append(d);
      d.querySelectorAll("[data-ir]").forEach(a => {
        a.onclick = ev => {
          ev.preventDefault();
          const alvo = TUDO.find(x => x.id === a.dataset.ir);
          if (alvo) abrir(alvo);
        };
      });
    });
  }
  else if (e.tipo === "fluxograma"){
    fluxo = { atual: e.inicio, caminho: [] };
    box.id = "items";
  }

  if (intencao) preencher(e, intencao);

  $("#sheet").classList.add("on");
  document.body.style.overflow = "hidden";
  calcular();
}

/* Preenche os campos que o resolvedor conseguiu extrair da pergunta.
   So preenche entrada — nunca decide resultado nem marca criterio clinico. */
function preencher(e, r){
  const põe = (id, v) => {
    if (v == null) return;
    estado[id] = v;
    const el = document.getElementById("f-" + id);
    if (el) el.value = v;
  };

  põe("peso", r.campos.peso);
  põe("idade", r.campos.idade);
  põe("cr", r.campos.cr);
  põe("pressao", r.campos.pressao);
  põe("fluxo", r.campos.fluxo);
  põe("trajeto", r.campos.trajeto);

  if (e.tipo === "infusao" && r.droga){
    estado.droga = r.droga.id;
    const alvo = semAcentoUI(r.droga.nome);
    document.querySelectorAll("#items .seg button").forEach(b => {
      const bate = semAcentoUI(b.textContent) === alvo;
      b.setAttribute("aria-pressed", bate);
    });
    if (r.campos.dose != null) põe("dose", r.campos.dose);
  }
}
const semAcentoUI = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/* Transforma "[[id]]" no texto do conteudo em link para o item.
   Permite que um diferencial aponte para o escore que o estratifica,
   sem duplicar informacao. */
function lig(txt){
  return String(txt).replace(/\[\[([a-z0-9-]+)\]\]/g, (_, id) => {
    const alvo = TUDO.find(x => x.id === id);
    return alvo ? `<a href="#" data-ir="${id}" class="lnk">${alvo.nome}</a>` : id;
  });
}

/* ---------- widgets ---------- */
function linhaCheck(i){
  const b = document.createElement("button");
  b.className = "item"; b.dataset.item = i.id;
  b.innerHTML = `<span class="box"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="m5 12 5 5L19 7"/></svg></span>
    <span class="item-l"><b>${i.txt}</b>${i.sub ? `<small>${i.sub}</small>` : ""}</span>
    ${i.pts !== 1 || atual.tipo === "criterios" ? `<span class="pts">${i.pts > 0 ? "+" : ""}${i.pts}</span>` : ""}`;
  b.onclick = () => {
    estado[i.id] = !estado[i.id];
    if (estado[i.id] && i.exclui) i.exclui.forEach(x => estado[x] = false);
    sincroniza(); calcular();
  };
  return b;
}
function sincroniza(){
  document.querySelectorAll("[data-item]").forEach(el =>
    el.classList.toggle("on", !!estado[el.dataset.item]));
}
function linhaOpcoes(id, txt, ops){
  const d = document.createElement("div");
  d.className = "numrow";
  d.innerHTML = `<label>${txt}</label><div class="seg"></div>`;
  const seg = d.querySelector(".seg");
  ops.forEach(([t, v]) => {
    const b = document.createElement("button");
    b.textContent = t; b.setAttribute("aria-pressed", "false");
    b.onclick = () => {
      estado[id] = v;
      seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      calcular();
    };
    seg.append(b);
  });
  return d;
}
function linhaNum(c){
  const d = document.createElement("div");
  d.className = "numrow";
  d.innerHTML = `<label for="f-${c.id}">${c.txt}</label>
    <div class="f"><input id="f-${c.id}" type="number" inputmode="decimal"
      min="${c.min ?? 0}" max="${c.max ?? 9999}" step="${c.passo ?? 1}" placeholder="—">
    <span class="u">${c.un}</span></div>`;
  d.querySelector("input").addEventListener("input", ev => {
    const n = parseFloat(ev.target.value);
    estado[c.id] = isNaN(n) ? null : n;
    calcular();
  });
  return d;
}

/* ---------- resultado ---------- */
function mostra(valor, unidade, cor, titulo, nota, pct){
  $("#val").innerHTML = valor === null ? "—" : `${valor} <small>${unidade}</small>`;
  $("#val").style.color = valor === null ? "var(--fraco)" : cor;
  $("#fill").style.width = (pct ?? 0) + "%";
  $("#fill").style.background = cor;
  $("#tname").textContent = titulo;
  $("#tnote").textContent = nota;
}
const faixaDe = (e, v) => e.faixas.find(f => v <= f.ate) ?? e.faixas.at(-1);
const varCor = c => ({ low:"var(--baixo)", mid:"var(--medio)", high:"var(--alto)" })[c];

function calcular(){
  const e = atual;
  if (!e) return;
  if (e.tipo === "diferencial"){
    l.push("Sinais de alarme: " + e.alarme.join("; "));
    l.push(e.hipoteses.map(h =>
      `${h.nome} (${h.risco} risco) — a favor: ${h.favor} Contra: ${h.contra} Primeiro passo: ${h.passo}`).join(" | "));
  }
  if (e.tipo === "oxigenio") return calcO2(e);
  if (e.tipo === "infusao") return calcBIC(e);
  if (e.tipo === "checklist") return calcCheck(e);
  if (e.tipo === "dosepeso") return calcDose(e);
  if (e.tipo === "fluxograma") return pintaFluxo(e);

  let total = null;
  if (e.tipo === "criterios")
    total = e.itens.reduce((s, i) => s + (estado[i.id] ? i.pts : 0), 0);
  else if (e.tipo === "escolha"){
    const v = e.itens.map(i => estado[i.id]);
    total = v.some(x => x == null) ? null : v.reduce((a, b) => a + b, 0);
  } else if (e.tipo === "formula")
    total = e.campos.some(c => estado[c.id] == null) ? null : e.calc(estado);

  if (total == null)
    return mostra(null, "", "var(--fraco)", "Preencha os campos", "O resultado aparece aqui.");

  const exibe = e.tipo === "formula" ? total.toFixed(1) : total;
  const fx = faixaDe(e, total), cor = varCor(fx.cor);
  const min = e.min ?? 0, max = e.tipo === "formula" ? 120 : e.max;
  mostra(exibe, e.unidade, cor, fx.nome, fx.nota,
    Math.max(0, Math.min(100, ((total - min) / (max - min)) * 100)));
}

function calcO2(e){
  const { cap, pressao, fluxo: fl, trajeto, reserva } = estado;
  if (cap == null || pressao == null || fl == null || !fl)
    return mostra(null, "", "var(--fraco)", "Preencha cilindro, pressão e fluxo", "A autonomia aparece aqui.");
  const litros = cap * pressao;
  const util = (litros / fl) * (1 - (reserva ?? 0) / 100);
  const h = Math.floor(util / 60), m = Math.round(util % 60);
  const txt = h ? `${h}h${String(m).padStart(2, "0")}` : `${m}`;
  if (trajeto == null)
    return mostra(txt, h ? "" : "min", "var(--marca)", `${Math.round(litros)} L disponíveis`,
      `Com ${reserva ?? 0}% de reserva. Informe o trajeto para comparar.`, 50);
  const folga = util - trajeto;
  const cor = folga < 0 ? "var(--alto)" : folga < 20 ? "var(--medio)" : "var(--baixo)";
  mostra(txt, h ? "" : "min", cor,
    folga < 0 ? "Oxigênio insuficiente" : folga < 20 ? "Margem apertada" : "Autonomia suficiente",
    folga < 0 ? `Faltam ${Math.abs(Math.round(folga))} min. Trocar o cilindro ou levar reserva.`
              : `Folga de ${Math.round(folga)} min sobre ${trajeto} min de trajeto.`,
    Math.max(0, Math.min(100, (util / (trajeto || 1)) * 50)));
}

function calcBIC(e){
  const d = e.drogas.find(x => x.id === estado.droga);
  const av = document.getElementById("aviso-droga");
  const inverso = estado.sentido === "dose";

  // Mostra só o campo que é entrada no sentido escolhido.
  const linhaDe = id => document.getElementById("f-" + id)?.closest(".numrow");
  if (linhaDe("dose")) linhaDe("dose").style.display = inverso ? "none" : "";
  if (linhaDe("vazao")) linhaDe("vazao").style.display = inverso ? "" : "none";

  if (d){
    const u = document.querySelector("#f-dose")?.closest(".f")?.querySelector(".u");
    if (u) u.textContent = d.unidade;
    if (estado._ultima !== d.id){
      estado.conc = d.conc; estado._ultima = d.id;
      const c = document.getElementById("f-conc"); if (c) c.value = d.conc;
    }
    if (av) av.innerHTML = `<b>${d.diluicao}</b><br>Faixa usual: ${d.min}–${d.max} ${d.unidade}. ${d.alerta}`;
  } else if (av) av.textContent = "";

  const { peso, dose, vazao, conc } = estado;
  const fator = d ? (d.unidade.endsWith("/min") ? 60 : 1) : 1;

  if (inverso){
    if (!d || peso == null || vazao == null || conc == null || !conc || !peso)
      return mostra(null, "", "var(--fraco)", "Selecione a droga e preencha os campos", "A dose recebida aparece aqui.");
    const doseReal = (vazao * conc) / (peso * fator);
    const fora = doseReal < d.min || doseReal > d.max;
    return mostra(arredDose(doseReal), d.unidade, fora ? "var(--medio)" : "var(--marca)",
      fora ? "Dose fora da faixa usual" : `${d.nome} a ${vazao} mL/h`,
      fora ? `Faixa usual: ${d.min}–${d.max} ${d.unidade}. Conferir diluição e bomba.` : d.diluicao,
      Math.min(100, (doseReal / d.max) * 100));
  }

  if (!d || peso == null || dose == null || conc == null || !conc)
    return mostra(null, "", "var(--fraco)", "Selecione a droga e preencha os campos", "A vazão aparece aqui.");
  const mlh = (dose * peso * fator) / conc;
  const fora = dose < d.min || dose > d.max;
  mostra(mlh.toFixed(1), "mL/h", fora ? "var(--medio)" : "var(--marca)",
    fora ? "Dose fora da faixa usual" : `${d.nome} — ${dose} ${d.unidade}`,
    fora ? `Faixa usual: ${d.min}–${d.max} ${d.unidade}. Confirmar intenção.` : d.diluicao,
    Math.min(100, (dose / d.max) * 100));
}
/* Dose pode ser bem pequena (0,05 mcg/kg/min) — arredondar demais esconde
   diferenca clinicamente relevante. */
const arredDose = n => n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3);

function calcCheck(e){
  const todos = e.secoes.flatMap(s => s.itens);
  const feitos = todos.filter(i => estado[i.id]).length;
  const pend = todos.filter(i => i.critico && !estado[i.id]);
  const pct = (feitos / todos.length) * 100;
  if (pend.length)
    return mostra(`${feitos}/${todos.length}`, "", "var(--alto)",
      `${pend.length} ${pend.length === 1 ? "item crítico pendente" : "itens críticos pendentes"}`,
      pend.map(i => i.txt).join(" · "), pct);
  if (feitos < todos.length)
    return mostra(`${feitos}/${todos.length}`, "", "var(--medio)", "Críticos concluídos",
      `Faltam ${todos.length - feitos} itens não críticos.`, pct);
  mostra(`${feitos}/${todos.length}`, "", "var(--baixo)", "Checklist completo", "Liberado para embarque.", 100);
}

function calcDose(e){
  const saida = document.getElementById("doses");
  if (!saida) return;
  const p = estado.peso;
  if (p == null){
    saida.innerHTML = "";
    return mostra(null, "", "var(--fraco)", "Informe o peso", "As doses aparecem aqui.");
  }
  saida.innerHTML = "";
  e.grupos.forEach(g => {
    const h = document.createElement("div"); h.className = "sec"; h.textContent = g.titulo;
    saida.append(h);
    g.drogas.forEach(d => {
      const total = d.dose * p;
      const conc = parseFloat(d.apres);
      const ml = total / conc;
      const el = document.createElement("div");
      el.className = "dose";
      el.innerHTML = `<span class="dose-l"><b>${d.nome}</b>
          <small>${d.dose} ${d.un} · faixa ${d.min}–${d.max} · ${d.apres}<br>${d.nota}</small></span>
        <span class="dose-r"><span class="mg">${arred(total)} ${d.un.split("/")[0]}</span>
          <span class="ml">${arredML(ml)} mL</span></span>`;
      saida.append(el);
    });
  });
  const tot = (7.5 + p / 20).toFixed(1);
  mostra(p, "kg", "var(--marca)", "Doses calculadas",
    `Tubo orotraqueal sugerido: 7,0–8,0 mm. Fixar em ~${(21 + p / 40).toFixed(0)} cm na rima labial (conferir ausculta).`, 60);
}
const arred = n => n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2);
/* Volume aspirado em seringa: nunca esconder a fracao — 10,5 mL nao pode virar 11 mL. */
const arredML = n => n >= 1 ? n.toFixed(1) : n.toFixed(2);

/* ---------- fluxograma ---------- */
function pintaFluxo(e){
  const box = $("#items");
  box.innerHTML = "";

  if (fluxo.caminho.length){
    const t = document.createElement("div"); t.className = "trilhaFlx";
    fluxo.caminho.forEach(p => {
      const s = document.createElement("div"); s.className = "passo"; s.textContent = p;
      t.append(s);
    });
    box.append(t);
  }

  const fim = e.fins[fluxo.atual];
  if (fim){
    const d = document.createElement("div");
    d.className = `fim ${fim.cor}`;
    d.innerHTML = `<h4>${fim.txt}</h4><p>${fim.nota}</p>`;
    box.append(d);
  } else {
    const n = e.nos[fluxo.atual];
    const d = document.createElement("div");
    d.className = "no";
    d.innerHTML = `<h4>${n.txt}</h4>${n.sub ? `<p>${n.sub}</p>` : ""}<div class="opcs"></div>`;
    const ops = d.querySelector(".opcs");
    n.op.forEach(o => {
      const b = document.createElement("button");
      b.className = "opc";
      b.innerHTML = `<span>${o.t}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>`;
      b.onclick = () => { fluxo.caminho.push(o.t); fluxo.atual = o.ir; pintaFluxo(e); };
      ops.append(b);
    });
    box.append(d);
  }

  if (fluxo.caminho.length){
    const r = document.createElement("button");
    r.className = "reiniciar"; r.textContent = "Recomeçar";
    r.onclick = () => { fluxo = { atual: e.inicio, caminho: [] }; pintaFluxo(e); };
    box.append(r);
  }
}

/* ---------- navegação ---------- */
$("#back").onclick = () => {
  $("#sheet").classList.remove("on");
  $("#res").classList.remove("on");
  document.body.style.overflow = "";
  atual = null; fluxo = null;
};
$("#q").addEventListener("input", () => { pintaLista(); pintaResposta(); });
addEventListener("keydown", ev => { if (ev.key === "Escape" && atual) $("#back").click(); });

if ("serviceWorker" in navigator){
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(console.error));

  /* Quando um service worker novo assume o controle, recarrega uma vez.
     Sem isso, a aba continua rodando o codigo antigo ate o usuario limpar o
     navegador — e ninguem faz isso dentro de uma ambulancia. */
  let recarregou = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (recarregou) return;
    recarregou = true;
    location.reload();
  });
}

iniciar();
