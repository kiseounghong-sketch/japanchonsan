// 가쓸신제 서비스워커: 한 번 열면 인터넷이 없어도(비행기·해안·차귀도) 일정·안전 정보가 보이게 합니다.
// - 같은 주소의 파일(화면·일정 JSON)은 "인터넷 먼저, 3초 안에 안 오면 저장본" → 일정 JSON을 고쳐 다시 배포하면 바로 반영
// - Firebase 프로그램(gstatic, 버전 고정)은 한 번 받으면 저장본 사용
// - Firebase 실시간 연결·네이버 지도 등 그 밖의 주소는 건드리지 않습니다.
const CACHE = "gsj-v8";
const SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/state.js",
  "./js/store.js",
  "./js/time.js",
  "./js/ui.js",
  "./js/plan.js",
  "./js/live.js",
  "./js/views.js",
  "./js/teacher.js",
  "./js/folders.js",
  "./data/camp.json",
  "./data/schedule.json",
  "./data/places.json",
  "./data/rules.json",
  "./data/contacts.json",
  "./data/checklist.json",
  "./data/missions.json",
  "./data/roles.json",
  "./data/info.json",
  "./data/shots.json",
  "./data/folders.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];
const SDK = [
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(SHELL.concat(SDK).map((u) => c.add(new Request(u, { cache: "no-cache" })).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("gsj-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const key = stripQuery(req);
  const net = fetch(req, { cache: "no-cache" }).then((res) => {
    if (res && res.ok) cache.put(key, res.clone());
    return res;
  });
  const timer = new Promise((resolve) => setTimeout(() => resolve("timeout"), 3000));
  try {
    const first = await Promise.race([net, timer]);
    if (first && first !== "timeout") return first;
  } catch (e) {
    /* 인터넷 없음 → 저장본 */
  }
  const hit = (await cache.match(key)) || (req.mode === "navigate" ? await cache.match("./index.html") : null);
  if (hit) return hit;
  try {
    return await net; // 저장본도 없으면 느려도 인터넷을 기다림
  } catch (e) {
    return Response.error();
  }
}

function stripQuery(req) {
  const u = new URL(req.url);
  if (!u.search) return req;
  u.search = "";
  return new Request(u.href);
}

function cacheFirst(req) {
  return caches.open(CACHE).then((cache) =>
    cache.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }))
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (!url.pathname.startsWith(new URL("./", self.registration.scope).pathname)) return;
    e.respondWith(networkFirst(req));
  } else if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(cacheFirst(req));
  }
});
