/* Ficha de parada pediatrica.
   Integrado do app avulso: volumes por peso, faixa de Broselow, energia de
   choque, sinais vitais por idade, medidas de equipamento e classificacao
   nutricional pela OMS.

   Duas decisoes de integracao:
   - A tabela da OMS (13 KB) vive em oms-imc.json e so e carregada quando a
     ficha abre. Nao faz sentido baixar curvas de crescimento para quem vai
     calcular autonomia de cilindro.
   - As formulas de dose sao strings no conteudo.json, como no resto do app,
     para que a revisora consiga altera-las sem tocar em codigo. */

let OMS = null;

async function carregaOMS(){
  if (OMS) return OMS;
  try {
    const r = await fetch("oms-imc.json", { cache: "force-cache" });
    OMS = await r.json();
  } catch { OMS = null; }
  return OMS;
}

const nBR = (v, d = 2) =>
  Number(v.toFixed(d)).toLocaleString("pt-BR", { maximumFractionDigits: d });

/* Interpola o escore-z entre os cortes da OMS (-3,-2,-1,mediana,+1,+2,+3). */
function escoreZ(imc, c){
  const zs = [-3, -2, -1, 0, 1, 2, 3];
  if (imc <= c[0]) return -3 - (c[0] - imc) / Math.max(0.1, c[1] - c[0]);
  if (imc >= c[6]) return 3 + (imc - c[6]) / Math.max(0.1, c[6] - c[5]);
  for (let i = 0; i < 6; i++)
    if (imc >= c[i] && imc <= c[i + 1])
      return zs[i] + ((imc - c[i]) / (c[i + 1] - c[i])) * (zs[i + 1] - zs[i]);
  return 0;
}

const Z_MENOR5 = [
  { ate: -3, rot: "Magreza acentuada", cor: "alto" },
  { ate: -2, rot: "Magreza", cor: "medio" },
  { ate: 1,  rot: "Eutrofia", cor: "baixo" },
  { ate: 2,  rot: "Risco de sobrepeso", cor: "medio" },
  { ate: 3,  rot: "Sobrepeso", cor: "medio" },
  { ate: 99, rot: "Obesidade", cor: "alto" }
];
const Z_MAIOR5 = [
  { ate: -3, rot: "Magreza acentuada", cor: "alto" },
  { ate: -2, rot: "Magreza", cor: "medio" },
  { ate: 1,  rot: "Eutrofia", cor: "baixo" },
  { ate: 2,  rot: "Sobrepeso", cor: "medio" },
  { ate: 3,  rot: "Obesidade", cor: "medio" },
  { ate: 99, rot: "Obesidade grave", cor: "alto" }
];

/* estado local da ficha */
let ped = { peso: null, anos: null, meses: null, altura: null, sexo: "F", cat: "todas", busca: "" };

function montaPediatria(e, box){
  carregaOMS().then(() => calcPed(e));

  box.innerHTML = `
    <div class="ped-ent">
      <div class="ped-linha">
        <label class="ped-c"><span>Peso</span>
          <input id="p-peso" type="number" inputmode="decimal" step="0.1" min="0.5" max="150" placeholder="kg"></label>
        <label class="ped-c"><span>Altura</span>
          <input id="p-alt" type="number" inputmode="numeric" step="1" min="30" max="220" placeholder="cm"></label>
      </div>
      <div class="ped-linha">
        <label class="ped-c"><span>Anos</span>
          <input id="p-anos" type="number" inputmode="numeric" min="0" max="19" placeholder="0"></label>
        <label class="ped-c"><span>Meses</span>
          <input id="p-meses" type="number" inputmode="numeric" min="0" max="11" placeholder="0"></label>
        <div class="ped-c"><span>Sexo</span>
          <div class="seg ped-sexo">
            <button data-s="F" aria-pressed="true">Fem</button>
            <button data-s="M" aria-pressed="false">Masc</button>
          </div></div>
      </div>
    </div>
    <div id="ped-saida"></div>`;

  ["peso", "alt", "anos", "meses"].forEach(k => {
    box.querySelector("#p-" + k).addEventListener("input", ev => {
      const v = parseFloat(ev.target.value);
      ped[{ peso: "peso", alt: "altura", anos: "anos", meses: "meses" }[k]] = isNaN(v) ? null : v;
      calcPed(e);
    });
  });
  box.querySelectorAll(".ped-sexo button").forEach(b => {
    b.onclick = () => {
      ped.sexo = b.dataset.s;
      box.querySelectorAll(".ped-sexo button").forEach(x => x.setAttribute("aria-pressed", x === b));
      calcPed(e);
    };
  });
}

function calcPed(e){
  const saida = document.getElementById("ped-saida");
  if (!saida) return;
  const p = ped.peso;

  if (p == null || p <= 0){
    saida.innerHTML = `<p class="empty">Informe o peso. Todo o resto é calculado a partir dele.</p>`;
    return mostra(null, "", "var(--fraco)", "Informe o peso", "Volumes e energias aparecem aqui.");
  }

  const anos = ped.anos ?? 0;
  const meses = anos * 12 + (ped.meses ?? 0);
  const alt = ped.altura;

  const faixa = e.faixasPeso.find(f => p <= f.max);
  let h = "";

  /* faixa de peso (Broselow) */
  h += `<div class="ped-faixa" style="--fx:${faixa.cor}">
      <b>${faixa.kg}</b><span>faixa ${faixa.nome}</span></div>`;

  /* medidas de equipamento */
  const tubo = Math.round((anos / 4 + 3.5) / 0.5) * 0.5;
  const lamina = p > 29 ? "3 reta ou curva" : p > 11 ? "2 reta ou curva" : "1 reta";
  const sc = (p * 4 + 7) / (90 + p);
  const pcal = p > 20 ? 15 + (p - 20) / 5 : p > 10 ? 10 + (p - 10) / 2 : p;
  h += `<div class="sec">Equipamento e medidas</div><div class="ped-grade">
    ${quad("Tubo c/ cuff", nBR(tubo, 1), "mm")}
    ${quad("Lâmina", lamina, "")}
    ${quad("Superfície corporal", nBR(sc, 2), "m²")}
    ${quad("Peso calórico", nBR(pcal, 1), "kg")}</div>`;

  /* energia */
  const en = (lista) => lista.map(([rot, jkg]) =>
    `<div class="ped-j"><span>${rot}</span>
      <b>${nBR(Math.min(200, p * jkg), 1)} J</b>
      <small>${nBR(jkg, 1)} J/kg</small></div>`).join("");
  h += `<div class="sec">Cardioversão (sincronizado)</div><div class="ped-js">${en(e.cardioversao)}</div>`;
  h += `<div class="sec">Desfibrilação</div><div class="ped-js">${en(e.desfibrilacao)}</div>`;

  /* sinais vitais esperados */
  h += `<div class="sec">Sinais vitais esperados</div><div class="ped-grade">` +
    e.vitais.map(v => {
      const f = v.faixas.find(([idade]) => anos >= idade) ?? v.faixas.at(-1);
      return quad(`${v.rot} · ${v.un}`, f[1].replace("-", " – "), "");
    }).join("") + `</div>`;

  /* estado nutricional */
  h += estadoNutricional(p, alt, meses);

  /* drogas */
  h += `<div class="sec">Volumes por droga</div>
    <div class="ped-cats">
      ${["todas", ...e.categorias.map(c => c.id)].map(id => {
        const c = e.categorias.find(x => x.id === id);
        return `<button data-cat="${id}" aria-pressed="${ped.cat === id}">${c ? c.rot : "Todas"}</button>`;
      }).join("")}
    </div>
    <div class="numrow" style="margin-bottom:9px">
      <input id="p-busca" type="search" placeholder="Buscar droga" value="${ped.busca}"
        style="width:100%;background:var(--fundo);border:1px solid var(--linha);border-radius:8px;padding:11px 12px;font-size:16px;font-family:inherit;color:var(--tinta);outline:none">
    </div>`;

  const vis = e.drogas.filter(d =>
    (ped.cat === "todas" || d.cat === ped.cat) &&
    (!ped.busca || d.nome.toLowerCase().includes(ped.busca.toLowerCase())));

  h += vis.length ? vis.map(d => {
    const v = avaliaDose(d.formula, p, anos);
    const noTeto = d.max != null && v >= d.max - 1e-9;
    const cor = e.categorias.find(c => c.id === d.cat)?.cor || "var(--marca)";
    return `<div class="ped-droga" data-d="${d.nome}">
      <button class="ped-top">
        <i style="background:${cor}"></i>
        <span class="ped-nm"><b>${d.nome}</b><span>${d.apres} · ${d.dose}</span></span>
        <span class="ped-vol"><b${noTeto ? ' class="teto"' : ""}>${nBR(v, 2)}</b><span>mL${noTeto ? " · teto" : ""}</span></span>
      </button>
      <div class="ped-corpo">
        <div class="ped-kv"><span>Apresentação</span><b>${d.apres}</b></div>
        <div class="ped-kv"><span>Dose</span><b>${d.dose}</b></div>
        <div class="ped-kv"><span>Diluente</span><b>${d.diluente}</b></div>
        <div class="ped-kv"><span>Diluição</span><b>${d.proporcao}</b></div>
        <div class="ped-kv"><span>Máximo</span><b>${d.max != null ? nBR(d.max, 2) + " mL" : "—"}</b></div>
        ${d.obs ? `<div class="aviso" style="margin-top:9px">${d.obs}</div>` : ""}
      </div></div>`;
  }).join("") : `<p class="empty">Nenhuma droga com esse nome.</p>`;

  saida.innerHTML = h;

  saida.querySelectorAll(".ped-cats button").forEach(b => {
    b.onclick = () => { ped.cat = b.dataset.cat; calcPed(e); };
  });
  const bs = document.getElementById("p-busca");
  if (bs) bs.addEventListener("input", ev => {
    ped.busca = ev.target.value;
    calcPed(e);
    const n = document.getElementById("p-busca");
    if (n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
  saida.querySelectorAll(".ped-top").forEach(b => {
    b.onclick = () => b.parentElement.classList.toggle("aberta");
  });

  mostra(nBR(p, 1), "kg", "var(--marca)", `Faixa ${faixa.nome} · ${faixa.kg}`,
    `Tubo ${nBR(tubo, 1)} mm · desfibrilação inicial ${nBR(Math.min(200, p * 2), 0)} J`, 60);
}

const quad = (k, v, u) =>
  `<div class="ped-q"><span>${k}</span><b>${v}${u ? ` <small>${u}</small>` : ""}</b></div>`;

/* As formulas vem do conteudo.json como texto, para a revisora poder ajustar. */
function avaliaDose(expr, p, a){
  try { return new Function("p", "a", `"use strict"; return (${expr});`)(p, a); }
  catch { return 0; }
}

function estadoNutricional(p, alt, meses){
  if (!alt || alt < 30)
    return `<div class="sec">Estado nutricional</div>
      <div class="aviso">Informe a altura para calcular o IMC. Abaixo de 2 anos, a curva da OMS usa <b>comprimento deitado</b> — se mediu em pé, some 0,7 cm.</div>`;

  const h = alt / 100, imc = p / (h * h);

  if (meses > 228){
    const ad = [[18.5, "Baixo peso", "medio"], [25, "Eutrofia", "baixo"], [30, "Sobrepeso", "medio"],
                [35, "Obesidade I", "medio"], [40, "Obesidade II", "alto"], [999, "Obesidade III", "alto"]];
    const fx = ad.find(([lim]) => imc < lim) ?? ad.at(-1);
    return `<div class="sec">Estado nutricional</div>
      <div class="ped-imc ${fx[2]}"><b>${nBR(imc, 1)} <small>kg/m²</small></b>
        <span>${fx[1]}</span><small>classificação de adulto (≥ 19 anos)</small></div>`;
  }

  if (!OMS)
    return `<div class="sec">Estado nutricional</div>
      <div class="aviso">IMC ${nBR(imc, 1)} kg/m². Curvas da OMS indisponíveis offline nesta sessão.</div>`;

  const m = Math.max(0, Math.min(228, meses));
  const c = OMS[ped.sexo][m].map(x => x / 10);
  const z = escoreZ(imc, c);
  const tab = meses < 60 ? Z_MENOR5 : Z_MAIOR5;
  const fx = tab.find(f => z <= f.ate) ?? tab.at(-1);
  const lo = c[1] * h * h, hi = c[4] * h * h;
  const delta = p < lo ? `${nBR(lo - p, 1)} kg abaixo` : p > hi ? `${nBR(p - hi, 1)} kg acima` : "dentro da faixa";

  return `<div class="sec">Estado nutricional</div>
    <div class="ped-imc ${fx.cor}"><b>${nBR(imc, 1)} <small>kg/m²</small></b>
      <span>${fx.rot}</span>
      <small>escore-z ${z >= 0 ? "+" : "−"}${nBR(Math.abs(z), 1)} · ${ped.sexo === "F" ? "feminino" : "masculino"}, ${meses} meses</small></div>
    <div class="ped-q" style="margin-top:8px"><span>Peso esperado para a altura</span>
      <b>${nBR(lo, 1)} – ${nBR(hi, 1)} kg <small>${delta}</small></b></div>`;
}
