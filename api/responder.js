/* Resposta a duvidas — camada OPCIONAL, desligada por padrao.
   Ative definindo ANTHROPIC_API_KEY nas variaveis de ambiente da Vercel.

   Diferenca essencial para um chat clinico comum: este endpoint responde
   SOMENTE a partir do conteudo que a revisora medica ja aprovou. Ele recebe
   os trechos relevantes junto com a pergunta e e instruido a dizer que nao
   sabe quando a resposta nao esta ali.

   Por que isso importa: todo o valor do app esta no conteudo revisado. Um
   modelo que responde de cabeca contorna o validador, os casos de teste e a
   revisao medica de uma vez so — e faz isso com a mesma confianca quando
   acerta e quando erra. Numa duvida sobre dose, o segundo caso mata. */

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo nao permitido" });

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave)
    return res.status(200).json({ ativo: false, motivo: "camada de IA nao configurada" });

  const { pergunta, trechos, historico } = req.body || {};
  if (!pergunta || !Array.isArray(trechos))
    return res.status(400).json({ erro: "pergunta e trechos sao obrigatorios" });
  if (pergunta.length > 600)
    return res.status(400).json({ erro: "pergunta longa demais" });

  const base = trechos
    .map((t, i) => `[${i + 1}] ${t.nome} (${t.area})\n${t.corpo}\nFonte: ${t.fonte}`)
    .join("\n\n---\n\n");

  const sistema = `Voce responde duvidas de uma medica de UTI movel usando EXCLUSIVAMENTE
o material abaixo, que ja passou por revisao medica.

REGRAS ABSOLUTAS:
- Responda apenas com o que esta no material. Nao complete com conhecimento proprio.
- Se a resposta nao estiver no material, responda exatamente:
  {"achou": false, "resposta": null, "fontes": []}
  Isso vale mesmo que voce saiba a resposta. Nao saber e uma resposta valida e util aqui.
- NUNCA invente ou ajuste doses, diluicoes, faixas ou condutas. Cite os numeros
  exatamente como aparecem no material.
- Cite quais trechos sustentam a resposta, pelo numero.
- Seja breve: a leitura acontece dentro de uma ambulancia.

MATERIAL:
${base}

COMO RESPONDER BEM:
- Comece pelo numero ou pela conduta. Quem le esta em pe, com o paciente na frente.
- Duas a quatro frases. Se precisar de lista, no maximo tres itens curtos.
- Traga o alerta relevante junto da dose (contraindicacao, cuidado de administracao).
- Se a resposta depende de um dado que a pessoa nao informou (peso, pressao do
  manometro, altura), diga qual dado falta em vez de assumir um valor.
- Nao repita o nome da ferramenta nem mande "consulte a calculadora": o app ja
  mostra o botao dela embaixo da sua resposta.

Responda SOMENTE com JSON, sem cercas de codigo:
{"achou": true|false, "resposta": "<texto curto ou null>", "fontes": [<numeros>]}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: sistema,
        messages: [
          // historico curto: sem ele, "e em 60 kg?" chega sem assunto
          // historico curto: sem ele, "e em 60 kg?" chega sem assunto.
          // A API exige alternancia de papeis, entao mensagens repetidas
          // do mesmo lado sao descartadas.
          ...(Array.isArray(historico) ? historico.slice(-6) : [])
            .filter(h => h && typeof h.txt === "string" && h.txt.trim())
            .map(h => ({ role: h.papel === "ia" ? "assistant" : "user", content: h.txt.slice(0, 600) }))
            .filter((m, i, arr) => i === 0 ? m.role === "user" : m.role !== arr[i - 1].role)
            .filter((m, i, arr) => !(i === arr.length - 1 && m.role === "user")),
          { role: "user", content: pergunta }
        ]
      })
    });

    if (!r.ok) return res.status(502).json({ erro: "falha na chamada ao modelo" });

    const dados = await r.json();
    const texto = (dados.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text).join("")
      .replace(/```json|```/g, "").trim();

    let saida;
    try { saida = JSON.parse(texto); }
    catch { return res.status(200).json({ ativo: true, achou: false, motivo: "resposta ilegivel" }); }

    // Uma resposta sem fonte citada nao pode aparecer na tela: ou veio do
    // material, ou o modelo completou por conta propria.
    if (saida.achou && (!Array.isArray(saida.fontes) || !saida.fontes.length))
      return res.status(200).json({ ativo: true, achou: false, motivo: "resposta sem fonte" });

    // As fontes citadas tem que existir de fato entre os trechos enviados.
    if (saida.achou && saida.fontes.some(n => !trechos[n - 1]))
      return res.status(200).json({ ativo: true, achou: false, motivo: "fonte inexistente" });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ativo: true,
      achou: !!saida.achou,
      resposta: saida.achou ? saida.resposta : null,
      fontes: (saida.fontes || []).map(n => trechos[n - 1]?.nome).filter(Boolean)
    });
  } catch {
    return res.status(500).json({ erro: "erro interno" });
  }
};
