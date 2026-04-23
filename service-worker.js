/*
  SERVICE WORKER — service-worker.js
  ====================================================================
  O que é um Service Worker?
  Um Service Worker é um script JavaScript que o navegador executa em
  segundo plano, separado da página principal (em uma "thread" própria).

  Ele funciona como um PROXY entre a aplicação web e a internet:
  intercepta as requisições de rede e decide se vai buscar do servidor
  ou entregar do cache local.

  Por que isso é importante?
  → Permite que o app funcione OFFLINE (sem internet)
  → Melhora a performance (carrega do cache em vez do servidor)
  → É o componente que viabiliza o PWA (Progressive Web App)

  Ciclo de vida de um Service Worker:
  1. install → primeira instalação (baixa e cacheia os arquivos)
  2. activate → ativa e assume o controle (limpa caches antigos)
  3. fetch → intercepta cada requisição de rede da página
  ====================================================================
*/

/* =====================================================================
   CONFIGURAÇÃO DO CACHE
====================================================================== */

const CACHE_NAME = "escolar-v5";
const RUNTIME_CACHE = "escolar-runtime-v1";
/*
  Nome único para identificar esta versão do cache.
  Convenção: nome-do-app + versão.
  
  Por que versionar?
  Ao atualizar o app (mudar CSS, JS, etc.), precisamos limpar o cache
  antigo e criar um novo. O número da versão serve como identificador.
  
  Quando mudar: incremente a versão (v4 → v5) sempre que atualizar os arquivos.
  Isso garante que usuários recebam as atualizações.
*/

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png",
  "./libs/chart.umd.min.js",
  "./libs/jspdf.umd.min.js"
];
/*
  Lista de arquivos que serão armazenados no cache.
  São os arquivos essenciais para a aplicação funcionar offline.
  
  "/" → a raiz do servidor (geralmente serve o index.html)
  Cada item é uma URL relativa à origem do servidor.
  
  Importante: todos os arquivos listados DEVEM existir e estar acessíveis.
  Um arquivo 404 causará falha na instalação do Service Worker.
*/

/* =====================================================================
   EVENTO: INSTALL
   Disparado uma vez quando o Service Worker é instalado pela primeira vez.
   Responsável por baixar e cachear os arquivos essenciais.
====================================================================== */

self.addEventListener("install", e => {
  /*
    "self" em um Service Worker refere-se ao próprio Service Worker
    (equivalente ao "window" na página principal, mas em outro contexto).
    
    "install" é o primeiro evento do ciclo de vida.
    
    e.waitUntil(): garante que o SW não avance para a fase "activate"
    antes que a Promise seja resolvida (antes de terminar o cache).
    Sem isso, o SW poderia ativar com o cache incompleto.
  */
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
    /*
      caches.open(nome): abre (ou cria) um cache com esse nome.
      Retorna uma Promise com o objeto do cache.
      
      cache.addAll(array): baixa e armazena todos os arquivos da lista.
      Se QUALQUER arquivo falhar (404, erro de rede), o addAll falha inteiro
      e o Service Worker não é instalado.
    */
  );
  self.skipWaiting();
  /*
    Por padrão, um novo SW instalado fica em espera até que todas as
    abas com a versão antiga sejam fechadas.
    
    skipWaiting() ignora essa espera e força a ativação imediata.
    Útil para garantir que atualizações sejam aplicadas rapidamente.
  */
});

/* =====================================================================
   EVENTO: ACTIVATE
   Disparado quando o SW assume o controle das páginas.
   Responsável por limpar caches de versões antigas.
====================================================================== */

self.addEventListener("activate", e => {
  /*
    Após a instalação, o SW precisa "ativar" para começar a controlar as páginas.
    
    Aqui limpamos caches de versões antigas para liberar espaço em disco
    e garantir que o usuário use a versão mais recente.
  */
  e.waitUntil(
    caches.keys().then(keys =>
      /*
        caches.keys(): retorna uma Promise com array de nomes de todos os caches.
        Ex: ["escolar-v2", "escolar-v3", "escolar-v4"]
      */
      Promise.all(
        /*
          Promise.all(): executa um array de Promises em paralelo.
          Aguarda TODAS terminarem antes de continuar.
        */
        keys
          .filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          /*
            .filter(): cria novo array com apenas os itens que satisfazem a condição.
            k !== CACHE_NAME → mantém apenas os caches de versões ANTERIORES
            (descarta o cache atual "escolar-v4", que queremos preservar).
            Resultado: ["escolar-v2", "escolar-v3"]
          */
          .map(k => caches.delete(k))
          /*
            .map(): transforma cada nome de cache em uma Promise de exclusão.
            caches.delete(k): apaga o cache com aquele nome.
            Retorna array de Promises: [Promise<delete v2>, Promise<delete v3>]
          */
      )
    )
  );
  self.clients.claim();
  /*
    Faz o SW assumir o controle imediato de todas as páginas abertas,
    sem precisar recarregar.
    
    Combina com skipWaiting() para uma troca de versão totalmente transparente.
  */
});

function fromNetworkToCache(request, cacheName) {
  return fetch(request).then(response => {
    if (!response || response.status !== 200) return response;

    const copy = response.clone();
    caches.open(cacheName).then(cache => cache.put(request, copy));
    return response;
  });
}

/* =====================================================================
   EVENTO: FETCH
   Intercepta TODAS as requisições de rede feitas pela aplicação.
   É o coração do Service Worker — decide como cada recurso é entregue.
====================================================================== */

self.addEventListener("fetch", e => {
  /*
    Disparado para cada requisição: HTML, CSS, JS, imagens, fontes, APIs...
    
    e.request: objeto com informações da requisição (URL, método, headers...).
    
    e.respondWith(): instrui o navegador a usar a resposta fornecida
    em vez de ir direto ao servidor.
  */
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  if (e.request.mode === "navigate") {
    e.respondWith(
      fromNetworkToCache(e.request, RUNTIME_CACHE)
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fromNetworkToCache(e.request, RUNTIME_CACHE);
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fromNetworkToCache(e.request, RUNTIME_CACHE);
    })
  );
});
