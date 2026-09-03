const CACHE_NAME = "suhak-app-shell-v2";
const ASSETS = [
  "./index.html",
  "./teacher.html",
  "./manifest.json",
  "./manifest-teacher.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-teacher-192.png",
  "./icon-teacher-512.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

// 자주 안 바뀌는 정적 라이브러리라 오프라인 대비로 캐시해도 되는 외부 출처입니다.
// 구글시트·구글지도·날씨·환율 같은 실시간 데이터는 여기 포함하지 않아
// 항상 최신 값을 받아옵니다.
const CACHEABLE_HOSTS = ["unpkg.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS.map((url) => cache.add(url).catch(() => {}))
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const isSameOrigin = url.origin === location.origin;
  const isCacheableExternal = CACHEABLE_HOSTS.some((host) => url.hostname.includes(host));

  // 그 외 외부 요청(구글시트·구글지도·오픈스트리트맵 타일·날씨·환율·카카오 등)은
  // 그대로 통과시켜서 항상 최신 데이터를 받아오게 합니다.
  if (!isSameOrigin && !isCacheableExternal) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
