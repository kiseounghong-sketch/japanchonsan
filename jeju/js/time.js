// 시간 계산은 기기 시간대와 상관없이 한국 시간(Asia/Seoul, UTC+9, 서머타임 없음) 기준입니다.
// 주소 끝에 ?now=2026-11-10T16:40 을 붙이면 그 시각인 것처럼 미리 볼 수 있습니다(점검용).
const KST = 9 * 3600e3;
const WD = ["일", "월", "화", "수", "목", "금", "토"];

const override = (() => {
  try {
    const q = new URLSearchParams(location.search).get("now");
    if (!q) return null;
    const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(q) ? q : (q.length <= 16 ? q + ":00" : q) + "+09:00");
    return isNaN(t) ? null : { set: t, at: Date.now() };
  } catch (e) {
    return null;
  }
})();

export const isSimulated = !!override;

export function now() {
  return override ? override.set + (Date.now() - override.at) : Date.now();
}

// "2026-11-10", "12:40" → 절대 시각(ms)
export function kst(date, hm) {
  return Date.parse(`${date}T${hm}:00+09:00`);
}

export function parts(ms) {
  const d = new Date(ms + KST);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return {
    y, m, d: day, wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes(),
    date: `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

export function hm(ms) {
  const p = parts(ms);
  return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}

// "2026-11-10" → "11. 10.(화)"
export function dateLabel(date) {
  const p = parts(Date.parse(`${date}T12:00:00+09:00`));
  return `${p.m}. ${p.d}.(${WD[p.wd]})`;
}

export function todayLabel(ms) {
  const p = parts(ms);
  return `${p.m}. ${p.d}.(${WD[p.wd]})`;
}

// 남은 시간 → "32분", "1시간 5분", "곧"
export function dur(ms) {
  if (ms < 60e3) return "곧";
  const total = Math.ceil(ms / 60e3);
  const h = Math.floor(total / 60), m = total % 60;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

// 두 날짜 사이 일 수 (한국 날짜 기준)
export function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(toDate + "T00:00:00Z") - Date.parse(fromDate + "T00:00:00Z")) / 864e5);
}
