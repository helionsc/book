# Escores — plantão e transporte inter-hospitalar

App offline de escores clínicos e ferramentas de UTI móvel.

---

## Aviso

Ferramenta de apoio. Não substitui julgamento clínico. **Todo conteúdo precisa
de revisão médica antes de qualquer uso assistencial** — especialmente as
diluições de drogas, que variam entre serviços.

---

## Rodar

```bash
npx http-server public -p 8080
# abre http://localhost:8080
```

Não funciona abrindo o `index.html` direto no navegador: o app carrega o
conteúdo por rede, e `file://` bloqueia isso.

## Publicar

```bash
npx vercel --prod
```

O app instala na tela inicial (Android e iOS) e abre offline depois da
primeira visita.

---

## Estrutura

```
public/
  index.html            estrutura da tela
  estilo.css            aparência
  app.js                motores de cálculo — não contém conteúdo clínico
  conteudo.json         TODO o conteúdo clínico vive aqui
  sw.js                 service worker (offline)
  manifest.webmanifest  instalação na tela inicial
testes/
  casos.json            casos clínicos esperados
  validar.js            validador
```

A separação é proposital: **dá pra editar o conteúdo clínico sem tocar em
código.** Só o `conteudo.json` e o `casos.json` precisam de revisão médica.

---

## Adicionar conteúdo

Edite `public/conteudo.json`, some um caso em `testes/casos.json`, rode:

```bash
node testes/validar.js
```

Se sair `REPROVADO`, não publique.

### Tipos disponíveis

| tipo | uso | exemplo |
|---|---|---|
| `criterios` | soma de pontos | CHA₂DS₂-VASc, Wells, qSOFA |
| `escolha` | uma opção por categoria | Glasgow |
| `formula` | expressão matemática | Cockcroft-Gault |
| `infusao` | dose ↔ mL/h | drogas em bomba |
| `oxigenio` | autonomia de cilindro | O₂ no transporte |
| `checklist` | conferência com itens críticos | pré-transporte |

### Escore de pontos

```json
{
  "id": "meu-escore",
  "nome": "Nome do escore",
  "sigla": "SIGLAS PARA BUSCA",
  "area": "Emergência",
  "tipo": "criterios",
  "uso": "Para que serve, em uma linha",
  "unidade": "pts",
  "max": 5,
  "itens": [
    { "id": "a", "txt": "Critério", "sub": "detalhe opcional", "pts": 1 }
  ],
  "faixas": [
    { "ate": 1, "nome": "Baixo", "nota": "Conduta.", "cor": "low" },
    { "ate": 5, "nome": "Alto",  "nota": "Conduta.", "cor": "high" }
  ],
  "fonte": "Autor, revista, ano."
}
```

Regras:

- `faixas` em ordem crescente de `ate`; a última cobre o máximo.
- `cor`: `low` verde, `mid` âmbar, `high` coral.
- Critérios mutuamente exclusivos usam `"exclui": ["outro-id"]` **nos dois
  lados** — o validador reprova exclusão unilateral.
- `max` tem que bater com o máximo realmente alcançável.

### Droga em bomba

```json
{ "id": "x", "nome": "Droga", "unidade": "mcg/kg/min",
  "conc": 64, "diluicao": "16 mg em SG5% → 250 mL",
  "min": 0.05, "max": 2, "alerta": "Cuidado relevante." }
```

`conc` em mcg/mL (ou mg/mL quando a unidade for `mg/kg/h`). Unidade terminada
em `/min` é multiplicada por 60 no cálculo.

---

## Caso de teste

```json
{ "escore": "meu-escore",
  "descricao": "Situação clínica em português",
  "marcar": ["a"],
  "esperado": 1,
  "faixaEsperada": "Baixo" }
```

Para Glasgow e fórmulas, troque `marcar` por `valores`.

O validador também checa integridade sozinho: campos obrigatórios, ids
duplicados, faixas fora de ordem, exclusões não recíprocas, `max` incoerente,
checklist sem item crítico, droga com faixa de dose inválida.

---

## Pendente

- Revisão médica de tudo, item por item
- Ampliar para ~30 escores e protocolos de transporte
- Editor visual (para não depender de editar JSON à mão)
- Enquadramento ANVISA (RDC 657/2022) antes de publicar comercialmente
- Definição societária entre os dois sócios

---

## Busca em linguagem natural

O app interpreta perguntas como "dose de rocurônio pra 80 kg" e abre a
ferramenta certa já preenchida.

Duas camadas:

**1. Resolvedor local (`public/resolver.js`) — ativo, offline, sem custo.**
Casa a pergunta contra sinônimos e extrai números (peso, idade, fluxo,
trajeto, creatinina). Exige pontuação mínima: se não tiver certeza, responde
"não encontrei" em vez de apontar a ferramenta errada.

Sinônimos novos entram em `SINONIMOS`, no topo do arquivo. É a única parte
do resolvedor que precisa de olhar clínico — como a médica chamaria aquilo
no plantão ("torpedo" para cilindro, "caiu a sat" para dessaturação).

**2. Camada de IA (`api/buscar.js`) — desligada.**
Para ativar, defina `ANTHROPIC_API_KEY` nas variáveis de ambiente da Vercel.
A chave fica só no servidor; nunca vai para o navegador.

Restrições no design, propositais:

- A IA classifica a pergunta. Ela **não** escreve dose, conduta ou diluição.
- Ela só pode devolver um id que existe no catálogo — a resposta é validada
  contra o conteúdo antes de chegar à tela.
- Não recebe dados de paciente. Só a pergunta e a lista de ferramentas.

A razão é simples: todo o valor deste app está no conteúdo revisado por
médica. Um modelo que gera texto clínico livre contorna a revisão, o
validador e os casos de teste de uma vez só.

---

## Fila de dúvidas

Quando a busca não encontra resposta, a pergunta pode ser guardada na aba
**Dúvidas**. Isso transforma a lacuna do conteúdo em pauta editorial: as
perguntas que ninguém consegue responder são exatamente o que falta escrever.

- Guardado no próprio aparelho (`localStorage`). Nada sai dali sem exportar.
- Pergunta repetida não duplica — conta quantas vezes foi feita. Frequência
  é a melhor pista de prioridade.
- **Exportar para revisão** gera um Markdown que a revisora lê e responde
  fora do app, sem precisar de ferramenta nenhuma.

Ciclo pretendido: dúvida → resposta revisada → vira conteúdo em
`conteudo.json` → deixa de ser dúvida.

## Camada de IA (desligada)

Dois endpoints prontos, inativos sem `ANTHROPIC_API_KEY`:

- `api/buscar.js` — classifica a pergunta e aponta a ferramenta. Não escreve
  conteúdo clínico.
- `api/responder.js` — responde dúvidas **apenas** a partir dos trechos
  revisados enviados junto com a pergunta.

Salvaguardas em `responder.js`, todas propositais:

- Instruído a responder `achou: false` quando o material não cobre a
  pergunta — mesmo sabendo a resposta.
- Resposta **sem fonte citada é descartada** pelo servidor antes de chegar à
  tela: ou veio do material revisado, ou o modelo completou por conta própria.
- Fonte citada que não existe entre os trechos enviados também é descartada.
- Nenhum dado de paciente é enviado.

Isso é mais restritivo que um chat clínico comum, de propósito. Um modelo
que responde de cabeça soa igualmente confiante quando acerta e quando erra —
e numa dúvida sobre dose, o segundo caso mata.
