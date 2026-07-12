/* =========================================================
   Steppe Vocab — Service Worker
   Зорилго:
   1) PWA болгож суулгах боломжтой болгох (install criteria)
   2) App shell-ийг кэшлэж, сүлжээгүй үед ч апп нээгдэх боломжтой болгох
   3) window.storage/showNotification-той хамт орон нутгийн мэдэгдэл харуулах боломж олгох
   Санамж: энэ бол GitHub Pages зэрэг статик хостингд зориулсан
   энгийн кэш стратеги. Бодит Push мэдэгдэл (апп хаалттай үед сервэрээс
   илгээх) авахын тулд тусдаа Push сервер + VAPID түлхүүр шаардлагатай.
   ========================================================= */

const CACHE_NAME = "steppe-vocab-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./sv-icon-192.png",
  "./sv-icon-512.png"
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(APP_SHELL).catch(function(e){
        console.warn("[sw] app shell caching failed (зарим файл дутуу байж болно)", e);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(
        names.filter(function(n){ return n !== CACHE_NAME; })
             .map(function(n){ return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

// Network-first HTML, cache-first бусад статик нөөц
self.addEventListener("fetch", function(event){
  var req = event.request;
  if(req.method !== "GET") return;

  if(req.mode === "navigate" || (req.headers.get("accept")||"").indexOf("text/html") !== -1){
    event.respondWith(
      fetch(req).then(function(res){
        var resClone = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, resClone); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(cached){ return cached || caches.match("./index.html"); });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(res){
        if(res && res.status === 200 && res.type === "basic"){
          var resClone = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, resClone); });
        }
        return res;
      }).catch(function(){ return cached; });
    })
  );
});

// Мэдэгдэл дээр дарахад апп руу шилжих
self.addEventListener("notificationclick", function(event){
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({type:"window"}).then(function(list){
      for(var i=0;i<list.length;i++){
        if("focus" in list[i]) return list[i].focus();
      }
      if(self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
