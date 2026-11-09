// 앱 전체가 함께 쓰는 상태. 체크·미션 답·소감은 이 폰(localStorage)에 먼저 저장합니다.
import { load, save } from "./store.js";

export const S = {
  data: null,
  tab: load("tab", "today"),
  me: load("me", ""),
  code: load("code", ""),
  checks: load("checks", {}), // 준비물 체크 { id: true }
  answers: load("answers", {}), // 미션 답 { 미션id: "..." }
  refl: load("refl", {}), // 한 줄 소감 { d1: "..." }
  shots: load("shots", {}), // 촬영 체크 { 장면id: { p, v, n } }
  dirty: load("dirty", {}), // 아직 선생님께 공유 안 된 항목 { "answers/rainbow": 번호 }
  seen: load("seen", {}), // 확인한 공지 { 공지id: 1 }
  theme: load("theme", "auto"),
  big: load("big", false),
  teacherUI: load("teacherUI", false),
  ui: { day: null, seg: load("seg", "mission"), mapDay: 0, tseg: "answers", oldNotices: false },
};

export function persist(key) {
  save(key, S[key]);
}

// 로컬 저장 이름 → Firebase 위치 이름
export const BUCKET = { answers: "answers", refl: "reflections", shots: "shots" };

let dirtySeq = Date.now();
export function markDirty(path) {
  S.dirty[path] = ++dirtySeq;
  persist("dirty");
}

export function roster() {
  const r = (S.data && S.data.roles.roles.map((x) => x.name)) || [];
  return r.concat(["선생님"]);
}
