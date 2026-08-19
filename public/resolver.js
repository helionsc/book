/* Resolvedor de intencao — roda no aparelho, sem rede e sem API.
   Recebe uma pergunta em linguagem natural e devolve qual ferramenta abrir
   e com quais campos ja preenchidos.

   Nao gera resposta clinica. So aponta para o conteudo validado. */

const SINONIMOS = {
  "iot-rapida": ["intubar","intubacao","intuba","sequencia rapida","sri","induzir","inducao",
    "bloqueio","bloqueador","curare","etomidato","quetamina","ketamina","propofol","midazolam",
    "succinilcolina","succinil","rocuronio","tubo","via aerea"],
  "bic": ["bomba","bic","infusao","vasoativa","vasopressor","droga","gotejar","correr",
    "noradrenalina","noradrena","nora","adrenalina","dobutamina","dobuta","dopamina",
    "nitroprussiato","nipride","fentanil","sedacao","ml/h","mlh","vazao"],
  "o2-autonomia": ["oxigenio","o2","cilindro","torpedo","autonomia","manometro","dura",
    "acaba","gasosa","fluxo","litros","trajeto","viagem","percurso","kgf"],
  "check-transporte": ["checklist","conferir","antes de sair","embarque","saida","conferencia",
    "consentimento","termo","documentacao","relatorio","vaga"],
  "fluxo-dessat": ["dessaturou","dessaturacao","saturacao","satura","caiu a sat","hipoxemia",
    "dope","nao ventila","ventilando mal","cianose"],
  "chads-vasc": ["fibrilacao","fa","anticoagular","anticoagulacao","avc","chads","chadsvasc"],
  "wells-tvp": ["tvp","trombose","panturrilha","edema de membro","wells"],
  "qsofa": ["sepse","septico","infeccao","qsofa","sofa"],
  "curb65": ["pneumonia","pac","curb","internar pneumonia"],
  "glasgow": ["glasgow","consciencia","coma","ecg","rebaixado","rebaixamento"],
  "cockcroft": ["clearance","depuracao","creatinina","funcao renal","ajuste de dose","cockcroft"]
};

const semAcento = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/* Sinonimos curtos como "fa", "o2" e "cr" casariam como pedaco de outra palavra
   ("fa" dentro de "fazer"). Exige limite de palavra nas duas pontas. */
function contemTermo(texto, termo){
  const t = semAcento(termo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(texto);
}

/* Extrai numeros com unidade do texto livre. */
function extrairCampos(txt){
  const t = semAcento(txt);
  const num = re => { const m = t.match(re); return m ? parseFloat(m[1].replace(",", ".")) : null; };
  return {
    peso:     num(/(\d+[.,]?\d*)\s*(?:kg|quilos?|kilos?)/) ?? num(/(?:paciente|homem|mulher|pct)\s+(?:de\s+)?(\d{2,3})\b(?!\s*anos)/),
    idade:    num(/(\d+)\s*anos/),
    cr:       num(/(?:creatinina|creat|cr)\s*(?:de|=|:)?\s*(\d+[.,]?\d*)/),
    pressao:  num(/(\d+)\s*(?:kgf|bar|psi)/) ?? num(/manometro\D{0,8}(\d+)/),
    // "5 L/min", "5l/min", "fluxo de 5l", "5 litros por minuto"
    fluxo:    num(/(\d+[.,]?\d*)\s*l\s*(?:\/|por\s+)?\s*min/) ??
              num(/fluxo\s*(?:de\s*)?(\d+[.,]?\d*)\s*l?\b/) ??
              num(/(\d+[.,]?\d*)\s*litros?\s*(?:\/|por\s+)?\s*min/),
    trajeto:  num(/(\d+)\s*(?:min|minutos)/) ?? (t.match(/(\d+)\s*h(?:oras?)?/) ? parseFloat(t.match(/(\d+)\s*h(?:oras?)?/)[1]) * 60 : null),
    dose:     num(/(\d+[.,]?\d*)\s*(?:mcg|mg)\s*\/\s*kg/)
  };
}

/* Descobre a droga citada dentro de um item de infusao ou dose por peso. */
function acharDroga(item, txt){
  const t = semAcento(txt);
  const lista = item.tipo === "infusao"
    ? item.drogas.map(d => ({ id: d.id, nome: d.nome }))
    : (item.grupos || []).flatMap(g => g.drogas.map(d => ({ id: d.nome, nome: d.nome })));
  return lista.find(d => t.includes(semAcento(d.nome).split(" ")[0])) || null;
}

/* Pontua cada item do conteudo contra a pergunta. */
function resolver(pergunta, itens){
  const t = semAcento(pergunta);
  if (t.trim().length < 3) return null;
  const palavras = t.split(/\W+/).filter(p => p.length > 2);

  const pontuados = itens.map(item => {
    let p = 0;
    const alvo = semAcento(`${item.nome} ${item.sigla || ""} ${item.uso}`);

    (SINONIMOS[item.id] || []).forEach(s => { if (contemTermo(t, s)) p += 10; });
    palavras.forEach(w => { if (alvo.includes(w)) p += 4; });

    // nomes de drogas dentro do item valem muito
    if (item.tipo === "infusao")
      item.drogas.forEach(d => { if (contemTermo(t, semAcento(d.nome).split(" ")[0])) p += 12; });
    if (item.tipo === "dosepeso")
      (item.grupos || []).flatMap(g => g.drogas).forEach(d => {
        if (contemTermo(t, semAcento(d.nome).split(" ")[0])) p += 12;
      });
    if (item.tipo === "criterios")
      item.itens.forEach(i => { if (palavras.some(w => semAcento(i.txt).includes(w))) p += 2; });

    return { item, p };
  }).filter(x => x.p > 0).sort((a, b) => b.p - a.p);

  /* Piso de confianca. Apontar para a ferramenta errada e pior que nao apontar:
     numa emergencia, a medica segue o que a tela mostrou. */
  const MINIMO = 8;
  if (!pontuados.length || pontuados[0].p < MINIMO) return null;

  const melhor = pontuados[0];
  const campos = extrairCampos(pergunta);
  const droga = acharDroga(melhor.item, pergunta);

  return {
    item: melhor.item,
    confianca: melhor.p >= 10 ? "alta" : "baixa",
    campos,
    droga,
    alternativas: pontuados.slice(1, 3).map(x => x.item)
  };
}

/* Frase curta explicando o que sera aberto. Nunca contem conduta. */
function explicar(r){
  const partes = [];
  if (r.droga) partes.push(r.droga.nome);
  if (r.campos.peso) partes.push(`${r.campos.peso} kg`);
  if (r.campos.idade) partes.push(`${r.campos.idade} anos`);
  if (r.campos.fluxo) partes.push(`${r.campos.fluxo} L/min`);
  if (r.campos.trajeto) partes.push(`${r.campos.trajeto} min`);
  return partes.length ? `Abrindo com ${partes.join(", ")}` : "Abrir ferramenta";
}

if (typeof module !== "undefined") module.exports = { resolver, explicar, extrairCampos, SINONIMOS };
