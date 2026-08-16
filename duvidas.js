/* Fila de duvidas.
   Toda busca que o resolvedor nao consegue responder pode virar uma duvida.
   Isso transforma a lacuna do conteudo em pauta editorial: as perguntas que
   ninguem consegue responder sao exatamente o que falta escrever.

   Guardado no proprio aparelho. Nao sai daqui ate alguem exportar. */

const CHAVE_DUVIDAS = "escores:duvidas";

function lerDuvidas(){
  try { return JSON.parse(localStorage.getItem(CHAVE_DUVIDAS)) || []; }
  catch { return []; }
}

function salvarDuvidas(lista){
  try { localStorage.setItem(CHAVE_DUVIDAS, JSON.stringify(lista)); return true; }
  catch { return false; }
}

function novaDuvida(texto, contexto){
  const lista = lerDuvidas();
  const limpo = texto.trim();
  if (!limpo) return null;

  // Nao duplica a mesma pergunta.
  const igual = lista.find(d => d.texto.toLowerCase() === limpo.toLowerCase());
  if (igual){ igual.vezes = (igual.vezes || 1) + 1; salvarDuvidas(lista); return igual; }

  const d = {
    // Date.now() sozinho colide quando duas duvidas nascem no mesmo
    // milissegundo — e ids iguais fazem apagar uma remover as duas.
    id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    texto: limpo,
    contexto: contexto || null,
    quando: new Date().toISOString(),
    estado: "pendente",
    vezes: 1,
    resposta: null
  };
  lista.unshift(d);
  salvarDuvidas(lista);
  return d;
}

function apagarDuvida(id){
  salvarDuvidas(lerDuvidas().filter(d => d.id !== id));
}

function marcarResolvida(id){
  const l = lerDuvidas();
  const d = l.find(x => x.id === id);
  if (d) d.estado = d.estado === "resolvida" ? "pendente" : "resolvida";
  salvarDuvidas(l);
}

/* Exporta em Markdown — formato que a revisora consegue ler e responder
   fora do app, sem precisar de ferramenta nenhuma. */
function exportarDuvidas(){
  const l = lerDuvidas();
  if (!l.length) return null;

  const fmt = iso => new Date(iso).toLocaleDateString("pt-BR");
  const bloco = arr => arr.map(d =>
    `- **${d.texto}**  \n  registrada em ${fmt(d.quando)}` +
    (d.vezes > 1 ? ` · perguntada ${d.vezes}×` : "") +
    (d.contexto ? `  \n  contexto: ${d.contexto}` : "") +
    (d.resposta ? `  \n  resposta: ${d.resposta}` : "")
  ).join("\n\n");

  const pend = l.filter(d => d.estado === "pendente");
  const res = l.filter(d => d.estado === "resolvida");

  return `# Dúvidas do app\n\nExportado em ${fmt(new Date().toISOString())}\n\n` +
    `## Pendentes (${pend.length})\n\n${pend.length ? bloco(pend) : "_nenhuma_"}\n\n` +
    `## Resolvidas (${res.length})\n\n${res.length ? bloco(res) : "_nenhuma_"}\n`;
}

if (typeof module !== "undefined")
  module.exports = { lerDuvidas, novaDuvida, apagarDuvida, marcarResolvida, exportarDuvidas, CHAVE_DUVIDAS };
