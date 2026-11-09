// 일정 데이터로 "지금 / 다음 / 집결"을 계산합니다.
import { S } from "./state.js";
import * as T from "./time.js";
import { live } from "./live.js";

export function prepare(data) {
  const all = [];
  data.schedule.forEach((day) => {
    day.rows.forEach((r, i) => {
      const next = day.rows[i + 1];
      r.day = day.day;
      r.date = day.date;
      r.idx = all.length;
      r.start = T.kst(day.date, r.time);
      r.endMs = r.end ? T.kst(day.date, r.end) : next ? T.kst(day.date, next.time) : T.kst(day.date, "21:00");
      all.push(r);
    });
  });
  data.rows = all;
  data.placeById = {};
  data.places.forEach((p) => { data.placeById[p.id] = p; });
  data.shots.list.forEach((s) => { s.at = T.kst(data.schedule[s.day - 1].date, s.time); });
  return data;
}

export function dayOf(now) {
  const d = T.parts(now).date;
  return S.data.schedule.find((x) => x.date === d) || null;
}

export function compute(now) {
  const data = S.data;
  const rows = data.rows;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const today = T.parts(now).date;
  const out = { now, first, last };
  if (today < first.date) {
    out.phase = "before";
    out.day = data.schedule[0];
  } else if (now >= last.endMs) {
    out.phase = "after";
  } else {
    out.phase = "during";
    out.day = dayOf(now) || data.schedule[0];
  }
  if (out.phase === "after") return out;

  out.cur = rows.find((r) => r.start <= now && now < r.endMs) || null;
  out.next = rows.find((r) => r.start > now) || null;
  out.nextAct = rows.find((r) => r.start > now && r.type !== "move") || out.next;
  // 다음 활동 바로 앞의 이동 (출발 시각·이동 시간 안내용)
  if (out.nextAct) {
    const before = rows[out.nextAct.idx - 1];
    if (before && before.type === "move" && before.start > now && before.day === out.nextAct.day) out.moveBefore = before;
  }
  out.prev = [...rows].reverse().find((r) => r.endMs <= now) || null;
  // 다음 집결: 집결 시각 5분 뒤까지는 "지금 집결"로 보여줍니다.
  out.gather = rows.find((r) => r.gather && r.start + 5 * 60e3 > now) || null;
  const todayRows = out.day ? out.day.rows : [];
  out.dayStarted = todayRows.length && now >= todayRows[0].start;
  out.dayDone = todayRows.length && now >= todayRows[todayRows.length - 1].endMs;
  return out;
}

// 선생님이 시작한 인원 점검 (12시간 지나면 자동으로 숨김)
export function activeGather(now) {
  const g = live.gather;
  if (!g || !g.id) return null;
  if (g.ts && Date.now() - g.ts > 12 * 3600e3) return null;
  g.at = g.date && g.time ? T.kst(g.date, g.time) : null;
  return g;
}

export function shotsFor(row) {
  if (!row) return [];
  return S.data.shots.list.filter((s) => s.at >= row.start && s.at < row.endMs);
}

export function missionsFor(day) {
  return S.data.missions.list.filter((m) => m.day === day);
}

export function missionForRow(row) {
  if (!row || !row.place || row.type === "move") return null;
  return S.data.missions.list.find((m) => m.place === row.place && m.day === row.day) || null;
}
