// Firebase 실시간 데이터베이스 연결 (선생님 공지 · 인원 점검 · 미션 답/소감 모아 보기)
// - 입장 코드를 넣은 기기만 연결합니다. 코드가 없거나 인터넷이 없으면 앱은 이 폰에 저장된 정보로 그대로 동작합니다.
// - 데이터 위치: jeju/s/{입장코드}/...  (규칙: 저장소 맨 위 database.rules.json 의 "jeju" 부분)
// - 선생님 계정은 일본 수학여행 앱과 같은 teacher@japanchonsan.app 입니다.
import { load, save, remove } from "./store.js";

const CONFIG = {
  apiKey: "AIzaSyCXNr_vRO-PaZMEuiFYdLzqNqTKRef3Yf4",
  authDomain: "chongsangojapan.firebaseapp.com",
  databaseURL: "https://chongsangojapan-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chongsangojapan",
  storageBucket: "chongsangojapan.firebasestorage.app",
  messagingSenderId: "318409475372",
  appId: "1:318409475372:web:f784ed0bd9cc44f5c89889",
};
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
export const TEACHER_EMAIL = "teacher@japanchonsan.app";
export const CODE_RE = /^[A-Z0-9]{6,20}$/;
// 점검용(개발자만): localStorage "gsj.emu" = {"db":"127.0.0.1:9000","auth":"http://127.0.0.1:9099"} 이면 에뮬레이터에 연결
const EMU = load("emu", null);

export const live = {
  code: "",
  status: "off", // off | connecting | online | offline | badcode
  meta: load("live.meta", {}),
  notices: load("live.notices", []),
  gather: load("live.gather", null),
  arrivals: load("live.arrivals", {}),
  teacher: false,
  all: null, // 선생님: 모두의 미션 답·소감·사진 설명
};

let onChange = () => {};
export function setOnChange(fn) { onChange = fn; }
function emit(kind) {
  try { onChange(kind); } catch (e) { console.error(e); }
}

let core = null;
function sdk() {
  if (!core) {
    core = Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-database.js")]).then(([A, D]) => {
      const app = A.getApps().find((a) => a.name === "gsj") || A.initializeApp(CONFIG, "gsj");
      const db = D.getDatabase(app);
      if (EMU && EMU.db) {
        const [h, p] = EMU.db.split(":");
        D.connectDatabaseEmulator(db, h, Number(p));
      }
      return { A, D, app, db };
    });
    core.catch(() => { core = null; });
  }
  return core;
}

let authCore = null;
export async function authSdk() {
  const f = await sdk();
  if (!authCore) {
    authCore = import(SDK + "firebase-auth.js");
    authCore.catch(() => { authCore = null; });
  }
  const Au = await authCore;
  const auth = Au.getAuth(f.app);
  if (EMU && EMU.auth && !auth.emulatorConfig) Au.connectAuthEmulator(auth, EMU.auth, { disableWarnings: true });
  return { ...f, Au, auth, emulator: EMU };
}

const base = () => `jeju/s/${live.code}`;
let unsubs = [];
let arrivalsUnsub = null;
let allUnsubs = [];
let watchingGid = null;

function stopListeners() {
  unsubs.forEach((u) => { try { u(); } catch (e) { /* 무시 */ } });
  unsubs = [];
  if (arrivalsUnsub) { try { arrivalsUnsub(); } catch (e) { /* 무시 */ } }
  arrivalsUnsub = null;
  watchingGid = null;
  stopAll();
}

function isDenied(err) {
  return /permission/i.test(String((err && (err.code || err.message)) || err));
}

function clearCache() {
  live.meta = {}; live.notices = []; live.gather = null; live.arrivals = {}; live.all = null;
  ["live.meta", "live.notices", "live.gather", "live.arrivals"].forEach(remove);
}

export async function start(code) {
  stopListeners();
  if (code !== live.code && live.code) clearCache();
  if (code !== load("live.code", "")) { clearCache(); save("live.code", code); }
  live.code = code || "";
  if (!live.code) { live.status = "off"; emit("status"); return; }
  live.status = "connecting";
  emit("status");
  let f;
  try {
    f = await sdk();
  } catch (e) {
    live.status = "offline"; // 인터넷이 없어 Firebase를 못 불러옴 → 온라인이 되면 다시 시도
    emit("status");
    return;
  }
  if (live.code !== code) return;
  const { D, db } = f;
  const fail = (err) => {
    if (isDenied(err)) {
      live.status = "badcode";
      stopListeners();
      emit("status");
    }
  };
  unsubs.push(D.onValue(D.ref(db, ".info/connected"), (s) => {
    if (live.status === "badcode") return;
    live.status = s.val() ? "online" : "offline";
    emit("status");
    if (s.val()) emit("connected");
  }));
  unsubs.push(D.onValue(D.ref(db, base() + "/meta"), (s) => {
    live.meta = s.val() || {};
    save("live.meta", live.meta);
    emit("meta");
  }, fail));
  unsubs.push(D.onValue(D.query(D.ref(db, base() + "/notices"), D.limitToLast(30)), (s) => {
    const arr = [];
    s.forEach((c) => { arr.push(Object.assign({ id: c.key }, c.val())); });
    arr.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    live.notices = arr;
    save("live.notices", arr);
    emit("notices");
  }, fail));
  unsubs.push(D.onValue(D.ref(db, base() + "/gather"), (s) => {
    live.gather = s.val();
    save("live.gather", live.gather);
    watchArrivals(f);
    emit("gather");
  }, fail));
}

function watchArrivals(f) {
  const gid = live.gather && live.gather.id;
  if (gid === watchingGid) return;
  if (arrivalsUnsub) { try { arrivalsUnsub(); } catch (e) { /* 무시 */ } }
  arrivalsUnsub = null;
  watchingGid = gid || null;
  if (!gid) {
    live.arrivals = {};
    save("live.arrivals", {});
    emit("arrivals");
    return;
  }
  const { D, db } = f;
  arrivalsUnsub = D.onValue(D.ref(db, `${base()}/arrivals/${gid}`), (s) => {
    live.arrivals = s.val() || {};
    save("live.arrivals", live.arrivals);
    emit("arrivals");
  }, () => {});
}

export function retry() {
  if (live.code && live.status !== "online") start(live.code);
}

// 학생 기록 하나를 올립니다 (path 예: answers/신소율/rainbow). value가 null이면 지웁니다.
export async function write(path, value) {
  const { D, db } = await sdk();
  const r = D.ref(db, `${base()}/${path}`);
  return value == null ? D.remove(r) : D.set(r, value);
}

export async function arrive(gid, name, on = true) {
  const { D, db } = await sdk();
  const r = D.ref(db, `${base()}/arrivals/${gid}/${name}`);
  return on ? D.set(r, D.serverTimestamp()) : D.remove(r);
}

/* ---------- 선생님 ---------- */
export async function initTeacher() {
  try {
    const { Au, auth } = await authSdk();
    Au.onAuthStateChanged(auth, (u) => {
      live.teacher = !!(u && u.email === TEACHER_EMAIL);
      emit("teacher");
    });
  } catch (e) {
    emit("teacher");
  }
}

export async function login(pw) {
  const { Au, auth } = await authSdk();
  await Au.signInWithEmailAndPassword(auth, TEACHER_EMAIL, pw);
  live.teacher = true;
  emit("teacher");
}

export async function logout() {
  const { Au, auth } = await authSdk();
  await Au.signOut(auth);
  live.teacher = false;
  stopAll();
  emit("teacher");
}

export function loginError(err) {
  const code = (err && err.code) || "";
  if (/wrong-password|invalid-credential|invalid-login|user-not-found/.test(code)) return "비밀번호가 틀렸어요";
  if (/too-many-requests/.test(code)) return "잠시 후 다시 시도해주세요";
  if (/network/.test(code) || !navigator.onLine) return "인터넷 연결을 확인해주세요";
  return "로그인 오류: " + (code || (err && err.message) || "알 수 없음");
}

export async function listCodes() {
  const { D, db } = await sdk();
  const s = await D.get(D.ref(db, "jeju/keys"));
  return Object.keys(s.val() || {});
}

export async function createCode(code) {
  const { D, db } = await sdk();
  await D.update(D.ref(db, "jeju"), {
    [`keys/${code}`]: true,
    [`s/${code}/meta/created`]: D.serverTimestamp(),
  });
}

export async function postNotice(text, level) {
  const { D, db } = await sdk();
  await D.push(D.ref(db, base() + "/notices"), { text, level, ts: D.serverTimestamp() });
}

export async function deleteNotice(id) {
  const { D, db } = await sdk();
  await D.remove(D.ref(db, `${base()}/notices/${id}`));
}

export async function startGather(g) {
  const { D, db } = await sdk();
  const id = "g" + Date.now().toString(36);
  await D.set(D.ref(db, base() + "/gather"), Object.assign({ id, ts: D.serverTimestamp() }, g));
  return id;
}

export async function endGather() {
  const { D, db } = await sdk();
  await D.remove(D.ref(db, base() + "/gather"));
}

export async function saveMeta(values) {
  const { D, db } = await sdk();
  await D.update(D.ref(db, base() + "/meta"), values);
}

let allOn = false;
export async function watchAll() {
  stopAll();
  allOn = true;
  const { D, db } = await sdk();
  if (!allOn) return;
  live.all = live.all || { answers: {}, reflections: {}, shots: {} };
  ["answers", "reflections", "shots"].forEach((k) => {
    allUnsubs.push(D.onValue(D.ref(db, `${base()}/${k}`), (s) => {
      live.all[k] = s.val() || {};
      emit("all");
    }, () => {}));
  });
}

export function stopAll() {
  allOn = false;
  allUnsubs.forEach((u) => { try { u(); } catch (e) { /* 무시 */ } });
  allUnsubs = [];
}

export function watchingAll() {
  return allOn;
}
