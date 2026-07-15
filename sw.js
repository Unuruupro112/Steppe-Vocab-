/* =========================================================
   Steppe Vocab — Service Worker (Offline Mode)
   ---------------------------------------------------------
   ЗОРИЛГО: интернэтгүй үед ч апп нээгдэж, сая ачаалсан
   words.json болон app shell-ийг (index.html, manifest,
   icon) кэшээс ачаалдаг байхаар зохион байгуулав.

   ЧУХАЛ: index.html эсвэл words.json-ийг ЗАСВАРЛАСАН бүр
   доорх CACHE_VERSION дугаарыг нэмэгдүүлээрэй (жишээ нь
   "v3" -> "v4"). Ингэснээр хэрэглэгчийн хөтөч хуучин кэшийг
   хаяж, шинэ хувилбарыг татаж авна. Үгүй бол хэрэглэгчид
   өөрчлөлтийг шууд харахгүй байж магадгүй.
   ========================================================= */
const CACHE_VERSION = "v3";
const CACHE_NAME = "steppevocab-" + CACHE_VERSION;

/* App shell — эхний суулгалтын үед урьдчилж кэшлэх файлууд.
   Алдаатай/байхгүй файл нэг нь бусдыг таслахгүйн тулд
   Promise.allSettled ашигласан (cache.addAll бол нэг файл 404
   өгмөгц БҮГДИЙГ цуцалдаг тул зориудлан ашиглаагүй). */
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./words.json",
  "./sv-icon-192.png",
  "./sv-icon-512.png"
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.allSettled(
        APP_SHELL.map(function(url){
          return cache.add(url).catch(function(err){
            console.warn("[sw] precache skip:", url, err && err.message);
          });
        })
      );
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

function isSameOrigin(url){
  try{ return new URL(url).origin === self.location.origin; }catch(e){ return false; }
}

self.addEventListener("fetch", function(event){
  var req = event.request;

  // Зөвхөн GET хүсэлтийг барина; бусдыг (POST, Supabase API дуудлага гэх мэт) тоохгүй
  if(req.method !== "GET") return;
  // Өөр домайн руу очих хүсэлт (Supabase, CDN гэх мэт) — SW огт оролцохгүй,
  // шууд сүлжээгээр явуулна.
  if(!isSameOrigin(req.url)) return;

  var url = new URL(req.url);
  var isNavigation = req.mode === "navigate";
  var isWordsJson = url.pathname.endsWith("/words.json") || url.pathname.endsWith("words.json");

  if(isNavigation || isWordsJson){
    // NETWORK-FIRST: боломжтой бол хамгийн шинэ хувилбарыг татаж, амжилттай
    // бол кэшийг шинэчилнэ. Сүлжээ ажиллахгүй бол кэш рүү унана.
    event.respondWith(
      fetch(req).then(function(res){
        if(res && res.ok){
          var resClone = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, resClone); });
        }
        return res;
      }).catch(function(){
        return caches.match(req).then(function(cached){
          if(cached) return cached;
          if(isNavigation){
            return caches.match("./index.html");
          }
          return new Response("", {status: 504, statusText: "Offline"});
        });
      })
    );
    return;
  }

  // Бусад статик нөөц (icon, manifest гэх мэт): CACHE-FIRST, дараа нь сүлжээ
  event.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(res){
        if(res && res.ok){
          var resClone = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, resClone); });
        }
        return res;
      }).catch(function(){
        return cached; // undefined байсан ч OK — броузер өөрөө алдаа харуулна
      });
    })
  );
});
