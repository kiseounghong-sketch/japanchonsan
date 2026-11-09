// 가쓸신제 제주 캠프 학생용 앱 — 시작점
import { S, persist, markDirty, BUCKET, roster } from "./state.js";
import { save, load } from "./store.js";
import * as T from "./time.js";
import { esc, icon, toast, copyText } from "./ui.js";
import { prepare } from "./plan.js";
import { unlockFolders } from "./folders.js";
import * as Live from "./live.js";
import { live, CODE_RE } from "./live.js";
import { viewToday, viewSchedule, viewMap, viewRecord, viewInfo, savedText, shareBar } from "./views.js";
import { viewTeacher, noticesList, gatherPanel, collectView, collectText, shareLink, kakaoText } from "./teacher.js";

const FILES = ["camp", "schedule", "places", "rules", "contacts", "checklist", "missions", "roles", "info", "shots"];
const OPTIONAL = ["folders"]; // 없어도 앱은 동작
const TABS = [
  ["today", "오늘", "today"],
  ["schedule", "일정", "schedule"],
  ["map", "지도", "map"],
  ["record", "미션·기록", "record"],
  ["info", "안내", "info"],
];
const VIEWS = { today: viewToday, schedule: viewSchedule, map: viewMap, record: viewRecord, info: () => viewInfo(!!installEvt), teacher: viewTeacher };

const $main = document.getElementById("main");
const $tabs = document.getElementById("tabs");
const $sheet = document.getElementById("sheet");
let installEvt = null;
let dataLoadedAt = 0;

/* ---------- 데이터 ---------- */
async function fetchData() {
  const entries = await Promise.all(FILES.map(async (f) => {
    const r = await fetch(`data/${f}.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${f}.json ${r.status}`);
    return [f, await r.json()];
  }));
  const data = Object.fromEntries(entries);
  await Promise.all(OPTIONAL.map(async (f) => {
    try { const r = await fetch(`data/${f}.json`, { cache: "no-cache" }); data[f] = r.ok ? await r.json() : null; } catch (e) { data[f] = null; }
  }));
  save("data", data); // 서비스워커가 없는 브라우저(카카오톡 안 등)를 위한 예비 저장
  return data;
}

async function loadData() {
  try {
    const d = await fetchData();
    dataLoadedAt = Date.now();
    return d;
  } catch (e) {
    const cached = load("data", null);
    if (cached) return cached;
    throw e;
  }
}

/* ---------- 화면 ---------- */
function applyPrefs() {
  const root = document.documentElement;
  if (S.theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", S.theme);
  root.toggleAttribute("data-big", !!S.big);
  const dark = S.theme === "dark" || (S.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0F1A1F" : "#F5F2EC");
}

function renderTabs() {
  const tabs = TABS.slice();
  if (S.teacherUI) tabs.push(["teacher", "선생님", "teacher"]);
  $tabs.style.setProperty("--n", tabs.length);
  $tabs.innerHTML = tabs.map(([k, l, ic]) => `<button class="${S.tab === k ? "on" : ""}" data-act="tab" data-tab="${k}" aria-current="${S.tab === k ? "page" : "false"}">${icon(ic)}<span>${l}</span></button>`).join("");
}

function renderHeader() {
  const now = T.now();
  const clock = document.getElementById("clock");
  if (clock) clock.textContent = T.hm(now);
  const net = document.getElementById("net");
  if (!net) return;
  let cls = "", txt = "";
  if (S.code && live.status === "online") { cls = "on"; txt = "실시간"; }
  else if (S.code && live.status === "badcode") { cls = "bad"; txt = "코드 확인"; }
  else if (!navigator.onLine || (S.code && live.status === "offline")) { cls = "off"; txt = "오프라인"; }
  else if (S.code && live.status === "connecting") { cls = "wait"; txt = "연결 중"; }
  net.className = "net " + cls;
  net.innerHTML = txt ? `${cls === "off" ? icon("wifiOff") : '<i aria-hidden="true"></i>'}${txt}` : "";
  net.title = cls === "off" ? "인터넷이 없어도 저장된 일정·안전 정보는 그대로 보여요" : "";
  const sim = document.getElementById("sim");
  if (sim) sim.hidden = !T.isSimulated;
  if (T.isSimulated && sim) sim.textContent = `미리보기 시각 ${T.todayLabel(now)} ${T.hm(now)}`;
}

function render(keepScroll) {
  if (!S.data) return;
  if (S.tab === "teacher" && !S.teacherUI) S.tab = "today";
  const y = window.scrollY;
  $main.innerHTML = (VIEWS[S.tab] || viewToday)();
  $main.setAttribute("data-view", S.tab);
  renderTabs();
  renderHeader();
  if (keepScroll) window.scrollTo(0, y);
}

function editing() {
  const a = document.activeElement;
  return !!(a && $main.contains(a) && /^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName) && a.type !== "checkbox");
}

// 실시간 값이 바뀌면 지금 보는 화면만 다시 그립니다 (입력 중이면 해당 부분만 갱신).
function refreshLive(kind) {
  renderHeader();
  if (!S.data) return;
  if (S.tab === "teacher") {
    if (kind === "teacher" || kind === "status" || kind === "meta") { if (!editing()) render(true); return; }
    const put = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    if (kind === "notices") put("t-notices", noticesList());
    if (kind === "gather" || kind === "arrivals") {
      const el = document.getElementById("t-gather");
      if (el && !(el.contains(document.activeElement) && editing())) el.innerHTML = gatherPanel();
    }
    if (kind === "all") put("t-collect", collectView());
    return;
  }
  if (kind === "all" || kind === "connected") return;
  if (S.tab === "record") {
    const bar = document.getElementById("share-bar");
    if (bar) bar.outerHTML = shareBar();
    if (kind === "meta" && !editing()) render(true);
    return;
  }
  if (S.tab === "today" || S.tab === "info") {
    if (!editing()) render(true);
  }
}

// 선생님 탭: 모두의 미션 답·소감·사진 설명을 실시간으로 받아 옵니다.
function ensureWatchAll() {
  if (S.tab === "teacher" && live.teacher && S.code && live.status !== "badcode" && !Live.watchingAll()) Live.watchAll();
}

/* ---------- 공유(동기화) ---------- */
let syncTimer = null;
function scheduleSync(ms = 1200) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, ms);
}

function valueFor(bucket, key) {
  if (bucket === "shots") {
    const v = S.shots[key];
    if (!v) return null;
    const out = {};
    if (v.p) out.p = true;
    if (v.n && v.n.trim()) out.n = v.n.trim().slice(0, 300);
    return Object.keys(out).length ? out : null;
  }
  const v = (S[bucket] || {})[key];
  if (!v || !String(v).trim()) return null;
  return String(v).trim().slice(0, bucket === "refl" ? 500 : 1000);
}

async function syncNow() {
  if (!S.code || !S.me || live.status !== "online") { updateSaved(); return; }
  const me = S.me;
  const entries = Object.entries(S.dirty);
  if (!entries.length) return;
  await Promise.all(entries.map(async ([path, ver]) => {
    const i = path.indexOf("/");
    const bucket = path.slice(0, i), key = path.slice(i + 1);
    if (!BUCKET[bucket]) { delete S.dirty[path]; return; }
    try {
      await Live.write(`${BUCKET[bucket]}/${me}/${key}`, valueFor(bucket, key));
      if (S.me === me && S.dirty[path] === ver) delete S.dirty[path];
    } catch (e) {
      console.warn("공유 실패", path, e);
    }
  }));
  persist("dirty");
  updateSaved();
}

function markAllDirty() {
  Object.keys(S.answers).forEach((k) => { if (valueFor("answers", k)) markDirty("answers/" + k); });
  Object.keys(S.refl).forEach((k) => { if (valueFor("refl", k)) markDirty("refl/" + k); });
  Object.keys(S.shots).forEach((k) => { if (valueFor("shots", k)) markDirty("shots/" + k); });
}

function updateSaved() {
  document.querySelectorAll("[data-saved]").forEach((el) => {
    const path = el.getAttribute("data-saved");
    const i = path.indexOf("/");
    const bucket = path.slice(0, i), key = path.slice(i + 1);
    const v = bucket === "shots" ? (S.shots[key] || {}).n : (S[bucket] || {})[key];
    el.innerHTML = savedText(path, v);
  });
  const bar = document.getElementById("share-bar");
  if (bar) bar.outerHTML = shareBar();
}

/* ---------- 시트(아래에서 올라오는 창) ---------- */
function openSheet(html) {
  $sheet.innerHTML = `<div class="sheet-bg" data-act="close"></div><div class="sheet-box" role="dialog" aria-modal="true">${html}</div>`;
  $sheet.hidden = false;
  document.body.classList.add("locked");
  const f = $sheet.querySelector("[autofocus]");
  if (f) setTimeout(() => f.focus(), 60);
}
function closeSheet() {
  $sheet.hidden = true;
  $sheet.innerHTML = "";
  document.body.classList.remove("locked");
}

function nameSheet() {
  const names = roster();
  openSheet(`<h2>나는 누구예요?</h2>
    <p class="muted">인원 점검과 미션 기록에 쓰여요. 이 폰에만 저장돼요.</p>
    <div class="names">${names.map((n) => `<button class="name ${S.me === n ? "on" : ""}" data-act="set-me" data-name="${esc(n)}">${esc(n)}</button>`).join("")}</div>
    <button class="btn ghost wide" data-act="close">나중에 고를게요</button>`);
}

function codeSheet(msg) {
  openSheet(`<h2>입장 코드</h2>
    <p class="muted">선생님이 단톡방에 올린 링크로 열면 자동으로 들어가요. 코드를 넣으면 선생님 공지·인원 점검이 보이고, 미션 답·소감이 선생님과 공유돼요.</p>
    <form class="stack" data-form="code">
      <input name="code" value="${esc(S.code)}" maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="예) JEJU7K2Q" autofocus>
      <p class="err" role="alert">${esc(msg || "")}</p>
      <button class="btn wide" type="submit">확인</button>
    </form>
    ${S.code ? `<button class="btn ghost wide" data-act="code-remove">코드 빼기 (이 폰에만 저장)</button>` : ""}`);
}

function teacherSheet() {
  openSheet(`<h2>선생님 모드</h2>
    <p class="muted">선생님 계정 비밀번호를 넣으면 '선생님' 탭이 생겨요.</p>
    <form class="stack" data-form="t-login">
      <input type="password" name="pw" autocomplete="current-password" placeholder="선생님 비밀번호" required autofocus>
      <button class="btn wide" type="submit">로그인</button>
      <p class="err" id="t-login-err" role="alert"></p>
    </form>
    <button class="btn ghost wide" data-act="close">닫기</button>`);
}

function installSheet() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  openSheet(`<h2>홈 화면에 추가</h2>
    <p class="muted">홈 화면에 추가하면 앱처럼 열리고, 비행기·바닷가·섬에서 신호가 약해도 일정·안전 정보가 보여요.</p>
    ${installEvt ? `<button class="btn wide" data-act="install-now">지금 추가하기</button>` : ""}
    <ol class="steps">
      ${ios
        ? "<li><b>Safari</b>로 열기 (카카오톡 안이면 오른쪽 아래 ⋯ → Safari로 열기)</li><li>아래 가운데 <b>공유</b> 버튼 누르기</li><li><b>홈 화면에 추가</b> 누르기</li>"
        : "<li><b>Chrome</b>이나 <b>삼성 인터넷</b>으로 열기 (카카오톡 안이면 ⋮ → 다른 브라우저로 열기)</li><li>오른쪽 위 ⋮ (삼성 인터넷은 아래 ≡) 누르기</li><li><b>홈 화면에 추가</b> 또는 <b>앱 설치</b> 누르기</li>"}
    </ol>
    <button class="btn ghost wide" data-act="close">닫기</button>`);
}

/* ---------- 이벤트 ---------- */
function goto(el) {
  const tab = el.dataset.tab;
  if (el.dataset.seg) { S.ui.seg = el.dataset.seg; save("seg", S.ui.seg); }
  if (el.dataset.day) S.ui.day = Number(el.dataset.day);
  if (/^s-\d/.test(el.dataset.anchor || "")) S.ui.shotDay = Number(el.dataset.anchor[2]);
  setTab(tab, el.dataset.anchor);
}

function setTab(tab, anchor) {
  S.tab = tab;
  persist("tab");
  ensureWatchAll();
  render();
  if (anchor) {
    const el = document.getElementById(anchor);
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1400);
    }
  } else if (tab === "schedule") {
    const cur = document.getElementById("cur-row");
    if (cur) cur.scrollIntoView({ block: "center" });
    else window.scrollTo(0, 0);
  } else {
    window.scrollTo(0, 0);
  }
}

async function onAct(el, e) {
  const act = el.dataset.act;
  switch (act) {
    case "tab": return setTab(el.dataset.tab);
    case "goto": return goto(el);
    case "close": return closeSheet();
    case "day": S.ui.day = Number(el.dataset.day); render(); return;
    case "shotday": S.ui.shotDay = Number(el.dataset.day); render(true); return;
    case "mapday": S.ui.mapDay = Number(el.dataset.day); render(true); return;
    case "seg": S.ui.seg = el.dataset.seg; save("seg", S.ui.seg); render(true); return;
    case "jump": { const t = document.getElementById(el.dataset.anchor); if (t) t.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
    case "me": return nameSheet();
    case "set-me": {
      const n = el.dataset.name;
      const changed = n !== S.me;
      S.me = n;
      persist("me");
      closeSheet();
      if (changed && S.code) { markAllDirty(); scheduleSync(300); }
      toast(`${n}(으)로 저장했어요`);
      render(true);
      return;
    }
    case "code": return codeSheet();
    case "code-remove":
      S.code = "";
      persist("code");
      Live.start("");
      closeSheet();
      toast("입장 코드를 뺐어요. 기록은 이 폰에만 저장돼요.");
      render(true);
      return;
    case "seen": S.seen[el.dataset.id] = 1; persist("seen"); render(true); return;
    case "old-notices": S.ui.oldNotices = !S.ui.oldNotices; render(true); return;
    case "arrive":
    case "arrive-undo": {
      const g = live.gather;
      if (!g || !S.me) return;
      el.disabled = true;
      Live.arrive(g.id, S.me, act === "arrive").catch(() => toast("전달하지 못했어요. 선생님께 직접 말해 주세요."));
      if (act === "arrive") toast("도착을 알렸어요");
      return;
    }
    case "theme": S.theme = el.dataset.v; persist("theme"); applyPrefs(); render(true); return;
    case "big": S.big = el.dataset.v === "1"; persist("big"); applyPrefs(); render(true); return;
    case "install": return installSheet();
    case "install-now":
      if (installEvt) { installEvt.prompt(); installEvt = null; }
      closeSheet();
      return;
    case "reload": return hardReload();
    case "external": {
      const u = new URL(location.href);
      if (S.code) u.searchParams.set("c", S.code);
      if (S.me) u.searchParams.set("me", S.me);
      location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(u.href);
      return;
    }
    case "ver": return tapVersion();
    default:
      if (act.startsWith("t-")) return teacherAct(act, el, e);
  }
}

let verTaps = [];
function tapVersion() {
  const n = Date.now();
  verTaps = verTaps.filter((t) => n - t < 2500).concat(n);
  if (verTaps.length >= 5) { verTaps = []; openTeacher(); }
}

function openTeacher() {
  if (live.teacher) { S.teacherUI = true; persist("teacherUI"); setTab("teacher"); return; }
  Live.initTeacher();
  teacherSheet();
}

async function teacherAct(act, el) {
  try {
    switch (act) {
      case "t-hide":
        S.teacherUI = false; persist("teacherUI"); Live.stopAll(); setTab("today"); return;
      case "t-logout":
        await Live.logout(); S.teacherUI = false; persist("teacherUI"); setTab("today"); toast("로그아웃했어요"); return;
      case "t-seg": S.ui.tseg = el.dataset.v; render(true); return;
      case "t-copy": { const ok = await copyText(collectText()); toast(ok ? "복사했어요. 보고서·한글 문서에 붙여넣으세요." : "복사하지 못했어요"); return; }
      case "t-copy-link": { const ok = await copyText(shareLink(S.code)); toast(ok ? "링크를 복사했어요" : "복사하지 못했어요"); return; }
      case "t-copy-kakao": { const ok = await copyText(kakaoText(S.code)); toast(ok ? "단톡방 안내문을 복사했어요" : "복사하지 못했어요"); return; }
      case "t-recreate": await Live.createCode(S.code); Live.start(S.code); toast("코드를 다시 만들었어요"); return;
      case "t-codes": {
        const box = document.getElementById("t-codes");
        const codes = await Live.listCodes();
        if (box) box.innerHTML = codes.length ? `<div class="btns">${codes.map((c) => `<button class="btn sm ghost" data-act="t-use-code" data-code="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : `<p class="muted">만든 코드가 없어요.</p>`;
        return;
      }
      case "t-use-code": useCode(el.dataset.code); toast("코드를 불러왔어요"); return;
      case "t-del-notice":
        if (!confirm("이 공지를 지울까요? 학생 화면에서도 사라져요.")) return;
        await Live.deleteNotice(el.dataset.id); toast("공지를 지웠어요"); return;
      case "t-end-gather":
        if (!confirm("인원 점검을 끝낼까요? 학생 화면의 '도착했어요' 버튼이 사라져요.")) return;
        await Live.endGather(); toast("점검을 끝냈어요"); return;
      case "t-mark": {
        const g = live.gather; const n = el.dataset.name;
        if (!g) return;
        await Live.arrive(g.id, n, !live.arrivals[n]);
        return;
      }
    }
  } catch (err) {
    console.error(err);
    toast(/permission/i.test(String(err)) ? "권한이 없어요. 선생님 로그인을 다시 해 주세요." : "저장하지 못했어요. 인터넷을 확인해 주세요.");
  }
}

function useCode(code) {
  const changed = code !== S.code;
  S.code = code;
  persist("code");
  if (changed) { markAllDirty(); }
  Live.start(code);
  render(true);
}

async function onSubmit(form, e) {
  e.preventDefault();
  const kind = form.dataset.form;
  const fd = new FormData(form);
  const btn = form.querySelector('[type="submit"]');
  const errEl = form.querySelector(".err");
  if (errEl) errEl.textContent = "";
  try {
    if (btn) btn.disabled = true;
    if (kind === "code") {
      const code = String(fd.get("code") || "").trim().toUpperCase();
      if (!code) { closeSheet(); return; }
      if (!CODE_RE.test(code)) { errEl.textContent = "영어 대문자·숫자 6~20자예요"; return; }
      useCode(code);
      closeSheet();
      toast("입장 코드를 넣었어요");
      return;
    }
    if (kind === "t-login") {
      await Live.login(String(fd.get("pw") || ""));
      S.teacherUI = true; persist("teacherUI");
      S.me = "선생님"; persist("me");
      closeSheet();
      setTab("teacher");
      toast("선생님 모드가 켜졌어요");
      return;
    }
    if (kind === "t-code") {
      const code = String(fd.get("code") || "").trim().toUpperCase();
      if (!CODE_RE.test(code)) { errEl.textContent = "영어 대문자·숫자 6~20자로 정해 주세요"; return; }
      await Live.createCode(code);
      useCode(code);
      toast("입장 코드를 만들었어요. 링크를 단톡방에 올려 주세요.");
      return;
    }
    if (kind === "t-notice") {
      const text = String(fd.get("text") || "").trim();
      if (!text) return;
      await Live.postNotice(text, fd.get("imp") ? "important" : "info");
      form.reset();
      toast("공지를 보냈어요");
      return;
    }
    if (kind === "t-gather") {
      const g = { date: String(fd.get("date")), time: String(fd.get("time")), place: String(fd.get("place") || "").trim(), label: String(fd.get("label") || "").trim() };
      if (!g.label) delete g.label;
      const id = await Live.startGather(g);
      await Live.arrive(id, "선생님", true);
      toast("인원 점검을 시작했어요");
      return;
    }
    if (kind === "t-meta") {
      const driveUrl = String(fd.get("driveUrl") || "").trim();
      const teacherTel = String(fd.get("teacherTel") || "").trim();
      if (driveUrl && !/^https:\/\//.test(driveUrl)) { toast("드라이브 링크는 https:// 로 시작해야 해요"); return; }
      await Live.saveMeta({ driveUrl: driveUrl || null, teacherTel: teacherTel || null });
      toast("저장했어요");
      return;
    }
  } catch (err) {
    console.error(err);
    const msg = kind === "t-login" ? Live.loginError(err) : /permission/i.test(String(err)) ? "권한이 없어요. 선생님 로그인을 확인해 주세요." : "저장하지 못했어요. 인터넷을 확인해 주세요.";
    if (errEl) errEl.textContent = msg;
    else toast(msg);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function onInput(e) {
  const el = e.target;
  if (el.dataset.bind) {
    const bucket = el.dataset.bind, key = el.dataset.key;
    S[bucket][key] = el.value;
    persist(bucket);
    markDirty(`${bucket}/${key}`);
    const sv = document.querySelector(`[data-saved="${bucket}/${key}"]`);
    if (sv) sv.innerHTML = savedText(`${bucket}/${key}`, el.value);
    scheduleSync();
    autosize(el);
  } else if (el.dataset.note) {
    const id = el.dataset.note;
    S.shots[id] = Object.assign({}, S.shots[id], { n: el.value });
    persist("shots");
    markDirty("shots/" + id);
    const sv = document.querySelector(`[data-saved="shots/${id}"]`);
    if (sv) sv.innerHTML = savedText("shots/" + id, el.value);
    scheduleSync();
  }
}

function onChange(e) {
  const el = e.target;
  if (el.dataset.check) {
    S.checks[el.dataset.check] = el.checked;
    persist("checks");
    render(true);
  } else if (el.dataset.shot) {
    const id = el.dataset.shot;
    S.shots[id] = Object.assign({}, S.shots[id], { [el.dataset.kind]: el.checked });
    persist("shots");
    markDirty("shots/" + id);
    scheduleSync();
    const lab = el.closest(".s-line");
    if (lab) lab.classList.toggle("done", el.checked);
  }
}

function autosize(el) {
  if (el.tagName !== "TEXTAREA") return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight + 2, 320) + "px";
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  if (el.tagName === "A") return; // 링크는 그대로 열기
  e.preventDefault();
  onAct(el, e);
});
document.addEventListener("submit", (e) => {
  const f = e.target.closest("form[data-form]");
  if (f) onSubmit(f, e);
});
document.addEventListener("input", onInput);
document.addEventListener("change", onChange);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$sheet.hidden) closeSheet(); });

// 로고를 길게 누르면 선생님 모드 (숨은 버튼)
(function longPress() {
  const brand = document.getElementById("brand");
  if (!brand) return;
  let timer = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  brand.addEventListener("pointerdown", () => { cancel(); timer = setTimeout(() => { timer = null; openTeacher(); }, 1500); });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => brand.addEventListener(ev, cancel));
  brand.addEventListener("contextmenu", (e) => e.preventDefault());
  brand.addEventListener("click", () => setTab("today"));
})();

window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; });
window.addEventListener("online", () => { renderHeader(); Live.retry(); scheduleSync(300); });
window.addEventListener("offline", renderHeader);
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !S.data) return;
  // 앱을 다시 열었을 때 10분 넘게 지났으면 바뀐 일정(JSON)을 조용히 다시 받아옵니다.
  if (Date.now() - dataLoadedAt > 10 * 60e3 && navigator.onLine) {
    try {
      S.data = prepare(await fetchData());
      dataLoadedAt = Date.now();
    } catch (e) { /* 그대로 */ }
  }
  if (!editing()) render(true);
  Live.retry();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyPrefs);

async function hardReload() {
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("gsj-")).map((k) => caches.delete(k)));
    }
  } catch (e) { /* 무시 */ }
  location.reload();
}

/* ---------- 시작 ---------- */
function readParams() {
  try {
    const u = new URL(location.href);
    const c = (u.searchParams.get("c") || "").trim().toUpperCase();
    const me = u.searchParams.get("me");
    let touched = false;
    if (c && CODE_RE.test(c)) {
      if (c !== S.code) { S.code = c; persist("code"); markAllDirty(); }
      u.searchParams.delete("c");
      touched = true;
    }
    if (me) {
      if (!S.me) { S.me = me.slice(0, 12); persist("me"); }
      u.searchParams.delete("me");
      touched = true;
    }
    if (touched) history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
  } catch (e) { /* 무시 */ }
}

async function boot() {
  applyPrefs();
  readParams();
  Live.setOnChange((kind) => {
    if (kind === "connected") scheduleSync(300);
    if (kind !== "all") ensureWatchAll();
    if (kind === "meta") unlockFolders().then((changed) => { if (changed && !editing()) render(true); });
    refreshLive(kind);
  });
  try {
    S.data = prepare(await loadData());
  } catch (e) {
    $main.innerHTML = `<section class="card error"><h2>정보를 불러오지 못했어요</h2><p>인터넷에 연결한 뒤 다시 열어 주세요. 한 번 열고 나면 그다음부터는 인터넷 없이도 보여요.</p><button class="btn" onclick="location.reload()">다시 시도</button></section>`;
    return;
  }
  if (S.me && !roster().includes(S.me)) { S.me = ""; persist("me"); }
  render();
  unlockFolders().then((changed) => { if (changed && !editing()) render(true); });
  if (S.tab === "schedule") { const cur = document.getElementById("cur-row"); if (cur) cur.scrollIntoView({ block: "center" }); }
  if (S.code) Live.start(S.code);
  if (S.teacherUI) Live.initTeacher();
  if (!S.me && !load("askedName", false)) { save("askedName", true); nameSheet(); }
  setInterval(() => {
    renderHeader();
    if ((S.tab === "today" || S.tab === "schedule") && !editing() && $sheet.hidden) render(true);
  }, 20e3);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

boot();
