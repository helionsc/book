/* Regras de validacao do conteudo, compartilhadas entre o editor (navegador)
   e a suite de testes (node). Uma fonte so — se as regras divergissem, o
   editor aprovaria conteudo que o teste reprova. */

function validarConteudo(itens){
  const erros = [];
  const e = (id, msg) => erros.push({ id, msg });
  const ids = new Set();

  for (const it of itens){
    const ctx = it.id || "(sem id)";

    ["id", "nome", "area", "tipo", "uso", "fonte"].forEach(k => {
      if (!it[k]) e(ctx, `campo obrigatório ausente: ${k}`);
    });
    if (ids.has(it.id)) e(ctx, "id duplicado");
    ids.add(it.id);
    if (it.id && !/^[a-z0-9-]+$/.test(it.id))
      e(ctx, "id só pode ter letras minúsculas, números e hífen");

    if (it.faixas){
      const lim = it.faixas.map(f => f.ate);
      lim.forEach((v, k) => {
        if (k > 0 && v <= lim[k - 1]) e(ctx, "faixas fora de ordem crescente");
      });
      it.faixas.forEach(f => {
        if (!f.nome || !f.nota) e(ctx, "faixa sem nome ou sem conduta");
        if (!["low", "mid", "high"].includes(f.cor)) e(ctx, `cor de faixa inválida: ${f.cor}`);
      });
    }

    if (it.tipo === "criterios"){
      if (!it.itens?.length) e(ctx, "escore sem critérios");
      const max = maxAlcancavel(it);
      if (it.max !== max) e(ctx, `max declarado ${it.max}, máximo alcançável ${max}`);
      (it.itens || []).filter(i => i.exclui).forEach(i =>
        i.exclui.forEach(alvo => {
          const outro = it.itens.find(x => x.id === alvo);
          if (!outro) return e(ctx, `${i.id} exclui id inexistente "${alvo}"`);
          if (!outro.exclui?.includes(i.id))
            e(ctx, `exclusão não recíproca entre ${i.id} e ${alvo}`);
        }));
      const vistos = new Set();
      (it.itens || []).forEach(i => {
        if (vistos.has(i.id)) e(ctx, `id de critério repetido: ${i.id}`);
        vistos.add(i.id);
        if (typeof i.pts !== "number") e(ctx, `critério "${i.txt}" sem pontuação numérica`);
      });
    }

    if (it.tipo === "infusao"){
      (it.drogas || []).forEach(d => {
        ["nome", "unidade", "conc", "diluicao", "min", "max", "alerta"].forEach(k => {
          if (d[k] === undefined || d[k] === "") e(ctx, `${d.nome || d.id}: falta ${k}`);
        });
        if (d.min >= d.max) e(ctx, `${d.nome}: faixa de dose inválida (${d.min}–${d.max})`);
        if (!(d.conc > 0)) e(ctx, `${d.nome}: concentração inválida`);
      });
    }

    if (it.tipo === "dosepeso"){
      (it.grupos || []).flatMap(g => g.drogas).forEach(d => {
        if (!(d.dose > 0)) e(ctx, `${d.nome}: dose inválida`);
        if (d.min >= d.max) e(ctx, `${d.nome}: faixa inválida (${d.min}–${d.max})`);
        if (d.dose < d.min || d.dose > d.max)
          e(ctx, `${d.nome}: dose padrão ${d.dose} está fora da própria faixa ${d.min}–${d.max}`);
        if (!parseFloat(d.apres)) e(ctx, `${d.nome}: apresentação precisa começar com número`);
      });
    }

    if (it.tipo === "diferencial"){
      if (!it.queixa) e(ctx, "diferencial sem queixa definida");
      if (!it.alarme?.length) e(ctx, "diferencial sem sinais de alarme");
      if (!it.hipoteses?.length) e(ctx, "diferencial sem hipóteses");
      (it.hipoteses || []).forEach(h => {
        ["nome", "risco", "favor", "contra", "passo"].forEach(k => {
          if (!h[k]) e(ctx, `hipótese "${h.nome || "?"}": falta ${k}`);
        });
        if (!["alto", "medio", "baixo"].includes(h.risco))
          e(ctx, `hipótese "${h.nome}": risco inválido (${h.risco})`);
      });
      // A primeira hipotese tem que ser de alto risco: a leitura acontece
      // sob pressao e a pessoa pode parar na primeira.
      if (it.hipoteses?.[0] && it.hipoteses[0].risco !== "alto")
        e(ctx, "primeira hipótese deveria ser de alto risco");
    }

    if (it.tipo === "checklist"){
      const vistos = new Set();
      const todos = (it.secoes || []).flatMap(s => s.itens);
      todos.forEach(i => {
        if (vistos.has(i.id)) e(ctx, `id de item repetido: ${i.id}`);
        vistos.add(i.id);
      });
      if (!todos.some(i => i.critico)) e(ctx, "checklist sem nenhum item crítico");
    }

    if (it.tipo === "fluxograma"){
      const alvos = new Set();
      Object.entries(it.nos || {}).forEach(([nid, n]) => {
        if (!n.op?.length) e(ctx, `nó ${nid} sem opções de saída`);
        (n.op || []).forEach(o => {
          alvos.add(o.ir);
          if (!it.nos[o.ir] && !it.fins[o.ir]) e(ctx, `nó ${nid} aponta para "${o.ir}", que não existe`);
        });
      });
      if (!it.nos?.[it.inicio] && !it.fins?.[it.inicio]) e(ctx, `nó inicial "${it.inicio}" não existe`);
      Object.keys(it.nos || {}).forEach(nid => {
        if (nid !== it.inicio && !alvos.has(nid)) e(ctx, `nó "${nid}" é inalcançável`);
      });
      Object.entries(it.fins || {}).forEach(([fid, f]) => {
        if (!alvos.has(fid)) e(ctx, `desfecho "${fid}" é inalcançável`);
        if (!["low", "mid", "high"].includes(f.cor)) e(ctx, `desfecho ${fid}: cor inválida`);
      });
    }
  }
  /* Referencias [[id]] entre itens: um link quebrado leva a lugar nenhum
     no meio de uma decisao. */
  const existentes = new Set(itens.map(i => i.id));
  for (const it of itens){
    const texto = JSON.stringify(it);
    for (const m of texto.matchAll(/\[\[([a-z0-9-]+)\]\]/g)){
      if (!existentes.has(m[1])) e(it.id, `referência [[${m[1]}]] aponta para item inexistente`);
    }
  }

  return erros;
}

/* Maximo real considerando criterios mutuamente exclusivos. */
function maxAlcancavel(it){
  const its = (it.itens || []).filter(i => i.pts > 0);
  if (its.length > 20) return its.reduce((s, i) => s + i.pts, 0);
  let melhor = 0;
  for (let m = 0; m < (1 << its.length); m++){
    const sel = its.filter((_, k) => m & (1 << k));
    if (sel.some(i => i.exclui?.some(x => sel.find(y => y.id === x)))) continue;
    melhor = Math.max(melhor, sel.reduce((s, i) => s + i.pts, 0));
  }
  return melhor;
}

if (typeof module !== "undefined") module.exports = { validarConteudo, maxAlcancavel };
