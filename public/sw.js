/* Service worker.
   Regra: o app tem que abrir dentro da ambulancia, sem sinal.
   Casco (HTML/CSS/JS): cache primeiro, sempre.
   Conteudo clinico: cache primeiro, atualiza em segundo plano.
   Uma versao nova do conteudo so entra depois de baixada com sucesso. */

const VERSAO = "v0.9.0";
const CASCO = `casco-${VERSAO}`;
const DADOS = `dados-${VERSAO}`;

const ARQUIVOS = [
  "./",
  "index.html",
  "estilo.css",
  "app.js",
  "resolver.js",
  "duvidas.js",
  "regras.js",
  "manifest.webmanifest",
  "icone-192.png",
  "icone-512.png"
];

self.addEventListener("install", ev => {
  ev.waitUntil(
    caches.open(CASCO)
      .then(c => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", ev => {
  ev.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes.filter(n => n !== CASCO && n !== DADOS).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Conteudo clinico: entrega o cache na hora, revalida em segundo plano.
  if (url.pathname.endsWith("conteudo.json")) {
    ev.respondWith(
      caches.open(DADOS).then(async cache => {
        const salvo = await cache.match(req);
        const rede = fetch(req)
          .then(resp => { if (resp.ok) cache.put(req, resp.clone()); return resp; })
          .catch(() => null);
        return salvo || rede || new Response(
          JSON.stringify({ versao: "offline", itens: [] }),
          { headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  /* Casco: rede primeiro, cache como rede de seguranca.
     Cache primeiro deixava o usuario preso numa versao antiga ate limpar o
     navegador — inaceitavel quando a correcao publicada pode ser uma dose.
     Offline continua funcionando: sem rede, cai no cache na hora. */
  ev.respondWith(
    fetch(req)
      .then(resp => {
        if (resp.ok) caches.open(CASCO).then(c => c.put(req, resp.clone()));
        return resp;
      })
      .catch(() => caches.match(req).then(salvo => salvo || caches.match("index.html")))
  );
});
