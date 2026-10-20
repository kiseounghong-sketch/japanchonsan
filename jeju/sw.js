// 제주 캠프 앱 전용 서비스워커 (scope: jeju/)
// 청산재팬 앱의 서비스워커와 캐시가 섞이지 않도록 이름을 따로 씁니다.
const CACHE_NAME = "jeju-app-shell-v1";
const ASSETS = [
  "./index.html",
  "./teacher.html",
  "./manifest.json",
  "./manifest-teacher.json",
  "../icon-192.png",
  "../icon-512.png",
  "../icon-teacher-192.png",
  "../icon-teacher-512.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

// 자주 안 바뀌는 정적 라이브러리만 오프라인 대비로 캐시합니다.
// 구글시트·지도 타일·날씨 같은 실시간 데이터는 항상 최신 값을 받아옵니다.
const CACHEABLE_HOSTS = ["unpkg.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("jeju-") && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const isSameOrigin = url.origin === location.origin;
  const isCacheableExternal = CACHEABLE_HOSTS.some((host) => url.hostname.includes(host));
  if (e.request.method !== "GET" || (!isSameOrigin && !isCacheableExternal)) return;

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
