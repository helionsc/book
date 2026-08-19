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

---

## Chat de dúvidas (aba Dúvidas)

O chat está na tela e ligado ao endpoint `/api/responder`. Ele se comporta de
quatro maneiras, todas testadas:

| Situação | O que acontece |
|---|---|
| IA ligada e o conteúdo cobre a pergunta | Responde citando de quais itens tirou |
| IA ligada e o conteúdo **não** cobre | "Não encontrei" + botão para guardar na fila |
| Sem `ANTHROPIC_API_KEY`, ou sem rede | Cai no resolvedor local e abre a ferramenta certa |
| Rodando local (sem `api/`) | Mesmo comportamento acima — não quebra |

Ou seja: **funciona hoje, sem chave.** Ligar a chave melhora a resposta de
texto; não é pré-requisito para o chat existir.

O que vai para o modelo são trechos serializados do `conteudo.json` (doses,
faixas, condutas, fontes) — nunca dado de paciente, nunca conhecimento
externo. Se o modelo responder sem citar fonte, o servidor descarta antes de
chegar à tela.

---

## Editor de conteúdo (`/editor.html`)

Feito para a revisora médica editar o material **sem tocar em JSON**.

```bash
npx http-server public -p 8080
# abre http://localhost:8080/editor.html
```

Fluxo de trabalho:

1. Ela abre o editor, clica num item e revisa textos, doses, faixas e condutas
2. As alterações ficam guardadas no navegador dela — pode fechar e voltar depois
3. **Validar** aponta os problemas em português, item por item
4. **Baixar conteudo.json** só funciona se estiver tudo válido
5. Ela te manda o arquivo; você substitui `public/conteudo.json`, roda
   `npm test` e publica

O que o editor faz sozinho, para ela não precisar saber:

- Recalcula o `max` do escore quando a pontuação de um critério muda
- Marca item de checklist como crítico com um clique
- Valida ao vivo e bloqueia o download enquanto houver erro
- **Descartar alterações** volta ao conteúdo publicado

As regras de validação vivem em `public/regras.js` e são as **mesmas** que a
suíte de testes usa. Fontes separadas divergiriam, e o editor acabaria
aprovando conteúdo que o teste reprova.

---

## Segurança do repositório

A chave de API **nunca** entra no código nem no Git. Ela vive só nas variáveis
de ambiente da Vercel, lida por `process.env.ANTHROPIC_API_KEY` dentro de
`api/`.

O `.gitignore` já bloqueia `.env`, `*.key` e `*.pem`. Antes de qualquer
commit, confira:

```bash
git grep -n "sk-ant" && echo "PARE: tem chave no código"
```

Se uma chave já foi exposta em algum lugar — commit, print, mensagem —
revogue no console da Anthropic e gere outra. Remover o arquivo depois não
resolve: o histórico do Git guarda tudo.

---

## Diagnóstico da camada de IA

Abra `SEU-APP.vercel.app/api/status`:

| Resultado | Significado |
|---|---|
| `404` | As funções não subiram — confira se a pasta `api/` está no repositório |
| `{"funcoes":true,"chave":false}` | Função ok, variável `ANTHROPIC_API_KEY` ausente ou sem redeploy |
| `{"funcoes":true,"chave":true,"formatoOk":false}` | Chave presente mas com formato errado (espaço, aspas, quebra de linha) |
| `{"funcoes":true,"chave":true,"formatoOk":true}` | Tudo certo — o chat deve responder em texto |

**Importante:** os arquivos em `api/` usam CommonJS (`module.exports`), não
`export default`. Como o `package.json` não declara `"type": "module"` — e não
pode, porque as suítes de teste usam `require` — um `export default` faz a
função não carregar, e o app cai silenciosamente no modo sem IA.

---

## Diferenciais (tipo `diferencial`)

Apoio ao raciocínio diagnóstico — **não** um motor de diagnóstico. A diferença
importa: software que recebe o caso e devolve o diagnóstico é dispositivo
médico sob a RDC 657/2022 e exige registro na ANVISA antes de ser vendido.
Uma lista curada de hipóteses, escrita e assinada por médico, não é.

Cada diferencial tem:

- **Sinais de alarme** — o que não pode passar batido naquela apresentação
- **Hipóteses ordenadas por risco** — a de maior gravidade primeiro, porque a
  leitura acontece sob pressão e a pessoa pode parar na primeira
- Para cada uma: o que joga **a favor**, o que joga **contra**, e o
  **primeiro passo**
- Referências `[[id]]` que viram links para o escore ou fluxograma que
  aprofunda aquela hipótese

Regras validadas automaticamente: toda hipótese precisa de risco válido,
favor, contra e primeiro passo; a primeira hipótese tem que ser de alto
risco; e toda referência `[[id]]` precisa apontar para um item existente —
link quebrado no meio de uma decisão leva a lugar nenhum.

---

## Registro do transporte (aba Registro)

Anota horários, sinais vitais e intercorrências durante a remoção e monta o
texto do relatório no fim.

Duas razões para existir: economiza o preenchimento manual no fim do plantão,
e cria trilha documental — a Resolução CFM 1.672/2003 exige relatório, e o
registro com horários é o que sustenta a versão da médica se algo for
questionado depois.

Tudo fica no aparelho (`localStorage`). Nada é enviado a servidor nenhum.

O relatório gerado **não conclui nada clinicamente** — lista o que foi
anotado, com horários, e deixa os campos de assinatura do médico do transporte
e do médico receptor. Quem interpreta e assina é a médica.

## Bomba nos dois sentidos

A calculadora de infusão agora tem um seletor:

- **Vazão (mL/h)** — informa a dose, recebe a vazão. Para programar a bomba.
- **Dose recebida** — informa a vazão que está na bomba, recebe a dose. É o
  caminho mais usado na ambulância: ela olha o equipamento correndo a 12 mL/h
  e quer saber quanto o paciente está recebendo.

## Busca por voz

Botão de microfone na busca e na anotação do registro. Usa a API de
reconhecimento do próprio navegador — nada é enviado para a nossa
infraestrutura. Onde o navegador não suporta, o botão nem aparece.

## Modo ambulância

Botão `A+` no topo. Aumenta fonte e área de toque sem mudar o conteúdo.
Ler 13px dentro de um veículo em movimento às 3h não funciona. A preferência
fica salva no aparelho.

---

## Ícones

`public/gerar-icones.py` gera todos os tamanhos. Rode depois de qualquer
ajuste de cor ou proporção.

O desenho é as três barras de risco (verde, âmbar, coral) sobre um traçado
de ECG — os dois conceitos que o app inteiro usa: estratificação de risco e
contexto clínico.

Três regras do iOS que o script respeita, e que quebram o ícone se ignoradas:

- **Sem transparência** — o iOS preenche o fundo com preto
- **Sem cantos arredondados** — o sistema aplica a própria máscara; cantos
  desenhados aparecem duplicados
- **Tamanhos exatos** — 180, 167, 152 e 120, referenciados por
  `apple-touch-icon` no HTML. O iOS ignora o `manifest.webmanifest` para o
  ícone da tela de início
