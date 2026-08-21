/* Camada OPCIONAL de IA. Nao esta ligada ainda.
   Para ativar: defina ANTHROPIC_API_KEY nas variaveis de ambiente da Vercel.

   Por que existe um servidor no meio: a chave de API NUNCA pode ir para o
   navegador. Qualquer pessoa abre o inspetor, copia a chave e gasta na conta
   de voces. Esta funcao e o unico lugar onde a chave aparece.

   O que esta funcao faz: recebe uma pergunta e o indice do conteudo, e
   devolve QUAL ferramenta abrir. Ela nao gera texto clinico, nao sugere
   conduta e nao inventa dose. Se a pergunta nao casa com o conteudo, a
   resposta e "nao encontrado". */

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo nao permitido" });

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return res.status(200).json({ ativo: false, motivo: "camada de IA nao configurada" });

  const { pergunta, indice } = req.body || {};
  if (!pergunta || !Array.isArray(indice))
    return res.status(400).json({ erro: "pergunta e indice sao obrigatorios" });

  if (pergunta.length > 400)
    return res.status(400).json({ erro: "pergunta longa demais" });

  const catalogo = indice
    .map(i => `${i.id} | ${i.nome} | ${i.uso}`)
    .join("\n");

  const sistema = `Voce classifica perguntas de uma medica de UTI movel, apontando qual
ferramenta do aplicativo responde a pergunta.

REGRAS ABSOLUTAS:
- Voce NAO responde perguntas clinicas. NUNCA escreva doses, condutas, diluicoes
  ou interpretacoes clinicas, mesmo que a pergunta peca diretamente.
- Sua unica saida e qual ferramenta abrir e quais valores numericos a pessoa citou.
- Se nenhuma ferramenta do catalogo servir, devolva id null. Nao force uma escolha.

CATALOGO:
${catalogo}

Responda SOMENTE com JSON, sem cercas de codigo e sem texto ao redor:
{"id": "<id do catalogo ou null>", "peso": <numero ou null>, "idade": <numero ou null>,
 "fluxo": <numero ou null>, "trajeto": <numero ou null>, "droga": "<nome ou null>"}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: sistema,
        messages: [{ role: "user", content: pergunta }]
      })
    });

    if (!r.ok) return res.status(502).json({ erro: "falha na chamada ao modelo" });

    const dados = await r.json();
    const texto = (dados.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    let saida;
    try { saida = JSON.parse(texto); }
    catch { return res.status(200).json({ id: null, motivo: "resposta ilegivel" }); }

    // O modelo so pode devolver um id que realmente existe no catalogo.
    if (saida.id && !indice.some(i => i.id === saida.id)) saida.id = null;

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ativo: true, ...saida });
  } catch (e) {
    return res.status(500).json({ erro: "erro interno" });
  }
};
