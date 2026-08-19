/* Diagnostico. Abra /api/status no navegador.

   Serve para separar tres falhas que, na tela do app, parecem iguais:
   - funcao nao existe        -> 404 (nao chegou no deploy)
   - funcao existe, sem chave -> {"funcoes": true, "chave": false}
   - tudo certo               -> {"funcoes": true, "chave": true}

   Nao expoe a chave, so informa se ela existe e o formato bate. */

module.exports = function handler(req, res) {
  const k = process.env.ANTHROPIC_API_KEY;
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    funcoes: true,
    chave: !!k,
    formatoOk: !!k && k.startsWith("sk-ant-"),
    tamanho: k ? k.length : 0,
    node: process.version
  });
};
