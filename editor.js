/* Editor de conteudo clinico.
   Publico-alvo: a revisora medica, que nao mexe em codigo.
   Rascunho fica no navegador ate ela baixar o arquivo. */

const RASCUNHO = "escores:rascunho";
const $ = s => document.querySelector(s);
let dados = null, original = null, vendo = "lista", editando = null;

async function carregar(){
  const r = await fetch("conteudo.json", { cache: "no-cache" });
  original = await r.json();
  const salvo = localStorage.getItem(RASCUNHO);
  dados = salvo ? JSON.parse(salvo) : JSON.parse(JSON.stringify(original));
  render();
}

function guardar(){
  try { localStorage.setItem(RASCUNHO, JSON.stringify(dados)); } catch {}
  render();
}

const alterado = () => JSON.stringify(dados) !== JSON.stringify(original);

/* ---------- validacao ---------- */
function validar(mostrarOk){
  const erros = validarConteudo(dados.itens);
  const el = $("#estado");
  if (!erros.length){
    el.className = "estado ok";
    el.innerHTML = mostrarOk
      ? `<b>Conteúdo válido</b> — ${dados.itens.length} itens, nenhum problema encontrado.`
      : "";
    if (!mostrarOk) el.className = "";
    return true;
  }
  el.className = "estado ruim";
  el.innerHTML = `<b>${erros.length} ${erros.length === 1 ? "problema" : "problemas"} a corrigir</b>
    <ul>${erros.map(e => `<li><b>${e.id}</b>: ${e.msg}</li>`).join("")}</ul>`;
  return false;
}

/* ---------- render ---------- */
function render(){
  const t = $("#tela");
  t.innerHTML = "";
  $("#b-baixar").disabled = false;

  if (vendo === "json"){
    const ta = document.createElement("textarea");
    ta.className = "json";
    ta.value = JSON.stringify(dados, null, 2);
    ta.readOnly = true;
    t.append(ta);
    return;
  }

  if (editando) return formulario(t);

  const l = document.createElement("div");
  l.className = "lista-ed";
  dados.itens.forEach(it => {
    const d = document.createElement("div");
    d.className = "it";
    d.innerHTML = `<span><b>${it.nome}</b><small>${it.uso}</small></span>
      <span class="et">${it.tipo}</span>`;
    d.onclick = () => { editando = it.id; render(); };
    l.append(d);
  });
  t.append(l);
  validar(false);
}

function campo(rot, valor, aoMudar, opts = {}){
  const d = document.createElement("div");
  d.className = "campo";
  const l = document.createElement("label");
  l.textContent = rot;
  d.append(l);
  if (opts.dica){
    const p = document.createElement("div");
    p.className = "dica"; p.textContent = opts.dica;
    d.append(p);
  }
  const el = document.createElement(opts.longo ? "textarea" : "input");
  if (!opts.longo) el.type = opts.numero ? "number" : "text";
  if (opts.passo) el.step = opts.passo;
  el.value = valor ?? "";
  el.oninput = () => aoMudar(opts.numero ? (el.value === "" ? null : parseFloat(el.value)) : el.value);
  d.append(el);
  return d;
}

function seletor(rot, valor, opcoes, aoMudar){
  const d = document.createElement("div");
  d.className = "campo";
  d.innerHTML = `<label>${rot}</label>`;
  const s = document.createElement("select");
  opcoes.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    if (v === valor) o.selected = true;
    s.append(o);
  });
  s.onchange = () => aoMudar(s.value);
  d.append(s);
  return d;
}

function titulo(txt, pai){
  const h = document.createElement("div");
  h.className = "sub-h"; h.textContent = txt;
  pai.append(h);
}

function botaoAdd(txt, aoClicar, pai){
  const b = document.createElement("button");
  b.className = "add"; b.textContent = txt;
  b.onclick = aoClicar;
  pai.append(b);
}

/* ---------- formulario ---------- */
function formulario(t){
  const it = dados.itens.find(x => x.id === editando);
  const f = document.createElement("div");
  f.className = "form";

  const voltar = document.createElement("button");
  voltar.className = "add";
  voltar.textContent = "← Voltar para a lista";
  voltar.onclick = () => { editando = null; render(); };
  t.append(voltar);

  f.append(campo("Nome", it.nome, v => { it.nome = v; salvarLeve(); }));
  f.append(campo("Para que serve", it.uso, v => { it.uso = v; salvarLeve(); },
    { dica: "Uma linha. Aparece embaixo do nome na lista." }));
  f.append(campo("Área", it.area, v => { it.area = v; salvarLeve(); }));
  f.append(campo("Termos de busca", it.sigla, v => { it.sigla = v; salvarLeve(); },
    { dica: "Siglas e sinônimos separados por espaço — como você chamaria isso no plantão." }));
  f.append(campo("Referência", it.fonte, v => { it.fonte = v; salvarLeve(); },
    { longo: true, dica: "Autor, publicação, ano. É o que sustenta o conteúdo se alguém questionar." }));

  if (it.tipo === "criterios") editaCriterios(it, f);
  if (it.tipo === "infusao") editaDrogas(it, f);
  if (it.tipo === "dosepeso") editaDosePeso(it, f);
  if (it.tipo === "checklist") editaChecklist(it, f);
  if (it.faixas) editaFaixas(it, f);

  t.append(f);
  validar(false);
}

/* Salva sem redesenhar — senao o campo perde o foco a cada tecla. */
function salvarLeve(){
  try { localStorage.setItem(RASCUNHO, JSON.stringify(dados)); } catch {}
}

function editaCriterios(it, f){
  titulo("Critérios e pontuação", f);
  it.itens.forEach((c, i) => {
    const l = document.createElement("div");
    l.className = "linha-ed";
    const txt = document.createElement("input");
    txt.value = c.txt; txt.oninput = () => { c.txt = txt.value; salvarLeve(); };
    const pts = document.createElement("input");
    pts.type = "number"; pts.value = c.pts;
    pts.oninput = () => {
      c.pts = parseFloat(pts.value) || 0;
      recalcMax(it);   // tem que vir ANTES de salvar, senao o rascunho guarda o max velho
      salvarLeve();
      validar(false);
    };
    const del = document.createElement("button");
    del.className = "mini"; del.textContent = "×";
    del.onclick = () => { it.itens.splice(i, 1); recalcMax(it); guardar(); };
    l.append(txt, pts, del);
    f.append(l);
  });
  botaoAdd("+ Adicionar critério", () => {
    it.itens.push({ id: "c" + Date.now().toString(36), txt: "Novo critério", pts: 1 });
    recalcMax(it); guardar();
  }, f);
}

/* O max tem que acompanhar os pontos — senao o validador reprova. */
function recalcMax(it){ it.max = maxAlcancavel(it); }

function editaFaixas(it, f){
  titulo("Faixas de risco e conduta", f);
  it.faixas.forEach((fx, i) => {
    const l = document.createElement("div");
    l.className = "linha-ed tres";
    const ate = document.createElement("input");
    ate.type = "number"; ate.value = fx.ate;
    ate.oninput = () => { fx.ate = parseFloat(ate.value) || 0; salvarLeve(); };
    const nome = document.createElement("input");
    nome.value = fx.nome; nome.oninput = () => { fx.nome = nome.value; salvarLeve(); };
    const nota = document.createElement("input");
    nota.value = fx.nota; nota.placeholder = "conduta";
    nota.oninput = () => { fx.nota = nota.value; salvarLeve(); };
    const del = document.createElement("button");
    del.className = "mini"; del.textContent = "×";
    del.onclick = () => { it.faixas.splice(i, 1); guardar(); };
    l.append(ate, nome, nota, del);
    f.append(l);
  });
  botaoAdd("+ Adicionar faixa", () => {
    const ult = it.faixas.at(-1);
    it.faixas.push({ ate: (ult?.ate ?? 0) + 1, nome: "Nova faixa", nota: "Conduta.", cor: "mid" });
    guardar();
  }, f);
}

function editaDrogas(it, f){
  titulo("Drogas em bomba", f);
  it.drogas.forEach((d, i) => {
    const bloco = document.createElement("div");
    bloco.style.cssText = "border:1px solid var(--linha);border-radius:9px;padding:12px;margin-bottom:9px";
    bloco.append(campo("Nome", d.nome, v => { d.nome = v; salvarLeve(); }));
    bloco.append(campo("Diluição", d.diluicao, v => { d.diluicao = v; salvarLeve(); },
      { dica: "Confira contra a diluição usada no seu serviço." }));
    bloco.append(campo("Concentração (mcg/mL)", d.conc, v => { d.conc = v; salvarLeve(); }, { numero: true, passo: "0.1" }));
    bloco.append(campo("Dose mínima usual", d.min, v => { d.min = v; salvarLeve(); }, { numero: true, passo: "0.01" }));
    bloco.append(campo("Dose máxima usual", d.max, v => { d.max = v; salvarLeve(); }, { numero: true, passo: "0.01" }));
    bloco.append(campo("Alerta", d.alerta, v => { d.alerta = v; salvarLeve(); }, { longo: true }));
    const del = document.createElement("button");
    del.className = "add"; del.textContent = "Remover " + d.nome;
    del.onclick = () => { it.drogas.splice(i, 1); guardar(); };
    bloco.append(del);
    f.append(bloco);
  });
}

function editaDosePeso(it, f){
  it.grupos.forEach(g => {
    titulo(g.titulo, f);
    g.drogas.forEach((d, i) => {
      const l = document.createElement("div");
      l.className = "linha-ed tres";
      const dose = document.createElement("input");
      dose.type = "number"; dose.step = "0.01"; dose.value = d.dose;
      dose.oninput = () => { d.dose = parseFloat(dose.value) || 0; salvarLeve(); };
      const nome = document.createElement("input");
      nome.value = d.nome; nome.oninput = () => { d.nome = nome.value; salvarLeve(); };
      const apres = document.createElement("input");
      apres.value = d.apres; apres.placeholder = "apresentação";
      apres.oninput = () => { d.apres = apres.value; salvarLeve(); };
      const del = document.createElement("button");
      del.className = "mini"; del.textContent = "×";
      del.onclick = () => { g.drogas.splice(i, 1); guardar(); };
      l.append(dose, nome, apres, del);
      f.append(l);
    });
  });
}

function editaChecklist(it, f){
  it.secoes.forEach(s => {
    titulo(s.titulo, f);
    s.itens.forEach((i, k) => {
      const l = document.createElement("div");
      l.className = "linha-ed";
      const txt = document.createElement("input");
      txt.value = i.txt; txt.oninput = () => { i.txt = txt.value; salvarLeve(); };
      const cr = document.createElement("button");
      cr.className = "mini";
      cr.textContent = i.critico ? "crítico" : "normal";
      cr.style.fontSize = "11px";
      cr.style.color = i.critico ? "var(--alto)" : "var(--fraco)";
      cr.onclick = () => { i.critico = !i.critico; guardar(); };
      const del = document.createElement("button");
      del.className = "mini"; del.textContent = "×";
      del.onclick = () => { s.itens.splice(k, 1); guardar(); };
      l.append(txt, cr, del);
      f.append(l);
    });
    botaoAdd("+ Item em " + s.titulo, () => {
      s.itens.push({ id: "i" + Date.now().toString(36), txt: "Novo item" });
      guardar();
    }, f);
  });
}

/* ---------- acoes ---------- */
$("#b-lista").onclick = () => { vendo = "lista"; editando = null; marcarAba("b-lista"); render(); };
$("#b-json").onclick = () => { vendo = "json"; marcarAba("b-json"); render(); };
function marcarAba(id){
  ["b-lista", "b-json"].forEach(x => $("#" + x).classList.toggle("forte", x === id));
}

$("#b-restaurar").onclick = () => {
  if (!alterado()) return;
  if (!confirm("Descartar todas as alterações e voltar ao conteúdo publicado?")) return;
  localStorage.removeItem(RASCUNHO);
  dados = JSON.parse(JSON.stringify(original));
  editando = null;
  render();
};

$("#b-validar").onclick = () => validar(true);

$("#b-baixar").onclick = () => {
  if (!validar(true)){
    alert("Corrija os problemas antes de baixar. Conteúdo com erro reprova nos testes e não deve ir para o app.");
    return;
  }
  dados.atualizado = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "conteudo.json";
  a.click();
  URL.revokeObjectURL(a.href);
};

carregar();
