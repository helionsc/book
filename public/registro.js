/* Registro do transporte.
   Anota horarios, sinais vitais e intercorrencias durante a remocao e monta
   o texto do relatorio no fim.

   Duas razoes para existir: economiza o preenchimento manual no fim do
   plantao, e cria trilha documental — a Resolucao CFM 1.672/2003 exige
   relatorio, e o registro com horarios e o que sustenta a versao da medica
   se algo for questionado depois.

   Tudo fica no aparelho. Nada e enviado para servidor nenhum. */

const CHAVE_REG = "escores:registro";

function lerRegistro(){
  try { return JSON.parse(localStorage.getItem(CHAVE_REG)) || null; }
  catch { return null; }
}

function salvarRegistro(r){
  try { localStorage.setItem(CHAVE_REG, JSON.stringify(r)); return true; }
  catch { return false; }
}

function iniciarRegistro(){
  const r = {
    id: "t" + Date.now().toString(36),
    inicio: new Date().toISOString(),
    fim: null,
    origem: "",
    destino: "",
    eventos: [{ quando: new Date().toISOString(), tipo: "marco", txt: "Início do registro" }]
  };
  salvarRegistro(r);
  return r;
}

function anotar(tipo, txt, extra){
  const r = lerRegistro();
  if (!r) return null;
  r.eventos.push({ quando: new Date().toISOString(), tipo, txt, ...(extra || {}) });
  salvarRegistro(r);
  return r;
}

function anotarVitais(v){
  const partes = [];
  if (v.pa) partes.push(`PA ${v.pa}`);
  if (v.fc != null) partes.push(`FC ${v.fc}`);
  if (v.fr != null) partes.push(`FR ${v.fr}`);
  if (v.sat != null) partes.push(`SatO₂ ${v.sat}%`);
  if (v.temp != null) partes.push(`Tax ${v.temp}°C`);
  if (!partes.length) return null;
  return anotar("vitais", partes.join(", "), { vitais: v });
}

function encerrarRegistro(){
  const r = lerRegistro();
  if (!r) return null;
  r.fim = new Date().toISOString();
  r.eventos.push({ quando: r.fim, tipo: "marco", txt: "Chegada ao destino" });
  salvarRegistro(r);
  return r;
}

function descartarRegistro(){
  try { localStorage.removeItem(CHAVE_REG); } catch {}
}

const hhmm = iso => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function duracao(r){
  const fim = r.fim ? new Date(r.fim) : new Date();
  const min = Math.round((fim - new Date(r.inicio)) / 60000);
  const h = Math.floor(min / 60);
  return h ? `${h}h${String(min % 60).padStart(2, "0")}` : `${min} min`;
}

/* Monta o texto do relatorio. Deliberadamente sem conclusao clinica:
   o app registra o que foi anotado, quem interpreta e assina e a medica. */
function gerarRelatorio(){
  const r = lerRegistro();
  if (!r) return null;

  const d = new Date(r.inicio).toLocaleDateString("pt-BR");
  const vit = r.eventos.filter(e => e.tipo === "vitais");
  const inter = r.eventos.filter(e => e.tipo === "intercorrencia");
  const cond = r.eventos.filter(e => e.tipo === "conduta");

  const linha = e => `${hhmm(e.quando)} — ${e.txt}`;

  return [
    `RELATÓRIO DE TRANSPORTE INTER-HOSPITALAR`,
    ``,
    `Data: ${d}`,
    `Origem: ${r.origem || "—"}`,
    `Destino: ${r.destino || "—"}`,
    `Saída: ${hhmm(r.inicio)}${r.fim ? `   Chegada: ${hhmm(r.fim)}` : ""}`,
    `Duração: ${duracao(r)}`,
    ``,
    `SINAIS VITAIS`,
    vit.length ? vit.map(linha).join("\n") : "Sem registros.",
    ``,
    `INTERCORRÊNCIAS`,
    inter.length ? inter.map(linha).join("\n") : "Sem intercorrências registradas.",
    ``,
    `CONDUTAS`,
    cond.length ? cond.map(linha).join("\n") : "Sem condutas registradas.",
    ``,
    `LINHA DO TEMPO COMPLETA`,
    r.eventos.map(linha).join("\n"),
    ``,
    `_______________________________________`,
    `Médico responsável pelo transporte — assinatura e CRM`,
    ``,
    `_______________________________________`,
    `Médico receptor — assinatura, CRM e horário`,
    ``,
    `Registro gerado a partir de anotações feitas durante o transporte.`,
    `Conferir e complementar antes de assinar.`
  ].join("\n");
}

if (typeof module !== "undefined")
  module.exports = { lerRegistro, iniciarRegistro, anotar, anotarVitais,
    encerrarRegistro, descartarRegistro, gerarRelatorio, duracao, CHAVE_REG };
