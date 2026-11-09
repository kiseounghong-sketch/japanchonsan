// 학생 화면 4개: 오늘 / 일정 / 미션·기록 / 안내
// 공통 틀: .card(카드) · .ch(카드 머리: 아이콘+제목+오른쪽 값) · .list(구분선 있는 줄 목록)
import { S, roster } from "./state.js";
import { live } from "./live.js";
import * as T from "./time.js";
import { esc, icon, statusChip, mapAttrs } from "./ui.js";
import { compute, dayOf, activeGather, shotsFor, missionForRow } from "./plan.js";
import { folderUrl, uploadBadge } from "./folders.js";

const place = (id) => (id && S.data.placeById[id]) || null;
const has = (v) => !!(v && String(v).trim());
const payChip = (r) => (r.pay === "self" ? '<span class="chip st-pay">개인 돈</span>' : "");

function roomLabels(rooms) {
  return rooms.split(" · ").map((room) => `<span>${esc(room)}</span>`).join("");
}

function mapLink(p, label) {
  if (!p) return "";
  return `<a class="plink" ${mapAttrs(p)}>${icon("pin")}<span>${esc(label || p.name)}</span></a>`;
}

// 카드 머리줄: 아이콘 · 제목 · (오른쪽) 값/링크
function ch(ic, title, right = "") {
  return `<div class="ch">${ic ? icon(ic) : ""}<span class="ch-t">${title}</span>${right ? `<span class="ch-r">${right}</span>` : ""}</div>`;
}

// 1~4일차 탭 (act: 어떤 화면의 탭인지)
function dayTabs(act, cur) {
  return `<div class="seg days" role="tablist">${S.data.schedule.map((d) => `<button role="tab" aria-selected="${d.day === cur}" class="${d.day === cur ? "on" : ""}" data-act="${act}" data-day="${d.day}"><b>${d.day}일차</b><small>${esc(d.label)}</small></button>`).join("")}</div>`;
}

// 오늘 날짜의 일차 (캠프 전 1, 캠프 뒤 마지막 날)
function autoDay() {
  const now = T.now();
  const d = dayOf(now);
  return d ? d.day : T.parts(now).date < S.data.schedule[0].date ? 1 : S.data.schedule.length;
}

/* ---------- 저장 상태 표시 ---------- */
export function savedText(path, value) {
  if (!has(value)) return "";
  if (!S.code || !S.me) return `${icon("check")}이 폰에 저장됨`;
  if (S.dirty[path]) return `${icon("check")}저장됨 · 공유 대기`;
  return `${icon("check")}저장됨 · 선생님과 공유됨`;
}
function savedLine(path, value) {
  return `<div class="saved" data-saved="${esc(path)}">${savedText(path, value)}</div>`;
}

export function shareBar() {
  if (!S.code) {
    return `<div class="note-bar" id="share-bar">${icon("cloud")}<span>지금은 <b>이 폰에만</b> 저장돼요. 입장 코드를 넣으면 선생님과 공유돼요.</span><button class="btn sm" data-act="code">코드 넣기</button></div>`;
  }
  if (!S.me) {
    return `<div class="note-bar" id="share-bar">${icon("user")}<span>이름을 고르면 선생님과 공유돼요.</span><button class="btn sm" data-act="me">이름 고르기</button></div>`;
  }
  const pending = Object.keys(S.dirty).length;
  let st;
  if (live.status === "online") st = pending ? `공유하는 중… (${pending})` : "선생님과 공유 중";
  else if (live.status === "badcode") st = "입장 코드를 다시 확인해 주세요";
  else st = `오프라인 · 연결되면 자동 공유${pending ? ` (${pending}개 대기)` : ""}`;
  return `<div class="note-bar ${live.status === "online" ? "ok" : ""}" id="share-bar">${icon("user")}<span><b>${esc(S.me)}</b> · ${st}</span></div>`;
}

/* ---------- 오늘 ---------- */
export function viewToday() {
  const now = T.now();
  const t = compute(now);
  let h = setupCard();
  if (t.phase === "before") h += todayBefore(t, now);
  else if (t.phase === "after") h += todayAfter(now);
  else h += todayDuring(t, now);
  return h;
}

function setupCard() {
  let h = "";
  if (/KAKAOTALK/i.test(navigator.userAgent)) {
    h += `<div class="note-bar warn">${icon("alert")}<span>카카오톡 안에서 열렸어요. <b>다른 브라우저로 열고 홈 화면에 추가</b>하면 신호가 없어도 보여요.</span><button class="btn sm" data-act="external">열기</button></div>`;
  }
  if (!S.me) {
    h += `<div class="note-bar">${icon("user")}<span>처음 한 번, <b>내 이름</b>을 골라 주세요.</span><button class="btn sm" data-act="me">고르기</button></div>`;
  }
  if (live.status === "badcode") {
    h += `<div class="note-bar warn">${icon("alert")}<span>입장 코드가 맞지 않아요.</span><button class="btn sm" data-act="code">다시 넣기</button></div>`;
  }
  return h;
}

export function noticesBlock() {
  if (!S.code) return "";
  const list = live.notices || [];
  if (!list.length) return "";
  const fresh = list.filter((n) => !S.seen[n.id]);
  const old = list.filter((n) => S.seen[n.id]);
  let h = `<section class="notices" id="notices">`;
  fresh.forEach((n) => { h += noticeCard(n, true); });
  if (old.length) {
    h += `<button class="linkbtn" data-act="old-notices">${S.ui.oldNotices ? "지난 공지 접기" : `지난 공지 ${old.length}개`}</button>`;
    if (S.ui.oldNotices) old.forEach((n) => { h += noticeCard(n, false); });
  }
  return h + `</section>`;
}

function noticeCard(n, fresh) {
  const imp = n.level === "important";
  return `<article class="notice ${imp ? "imp" : ""} ${fresh ? "" : "old"}">
    <div class="n-head">${icon("bell")}<b>선생님 공지</b>${imp ? '<span class="chip st-imp">중요</span>' : ""}<time>${n.ts ? esc(T.todayLabel(n.ts) + " " + T.hm(n.ts)) : ""}</time></div>
    <p class="n-text">${esc(n.text)}</p>
    ${fresh ? `<button class="btn sm ghost" data-act="seen" data-id="${esc(n.id)}">${icon("check")}확인</button>` : ""}
  </article>`;
}

export function rollcallCard(now) {
  const g = activeGather(now);
  if (!g) return "";
  const names = roster();
  const arrived = names.filter((n) => live.arrivals[n]).length;
  const mine = S.me ? live.arrivals[S.me] : null;
  const left = g.at ? g.at - now : null;
  let btn;
  if (!S.me) btn = `<button class="btn big tang" data-act="me">이름 고르고 도착 알리기</button>`;
  else if (mine) btn = `<div class="arrived">${icon("check")}<span><b>${esc(S.me)}</b> 도착 확인 · ${esc(T.hm(mine))}</span><button class="linkbtn" data-act="arrive-undo">취소</button></div>`;
  else btn = `<button class="btn big tang" data-act="arrive">${icon("flag")}도착했어요</button>`;
  return `<section class="card rollcall" id="rollcall">
    ${ch("flag", "인원 점검 중", `<b>${arrived}</b>/${names.length}명${left != null ? ` · ${left > 0 ? T.dur(left) + " 남음" : "시간 지남"}` : ""}`)}
    <h2>${esc(g.time || "")} ${esc(g.place || "")}</h2>
    ${g.label ? `<p class="sub">${esc(g.label)}</p>` : ""}
    ${btn}
    ${live.status !== "online" ? `<p class="hint">${icon("wifiOff")}연결되면 선생님께 전달돼요.</p>` : ""}
  </section>`;
}

function todayDuring(t, now) {
  const day = t.day;
  let h = noticesBlock();
  h += rollcallCard(now);
  h += nowCard(t, now);
  h += `<div class="duo">${nextTile(t, now)}${gatherTile(t, now)}</div>`;
  h += missionNow(t);
  h += shotsNow(t);
  h += reflNow(t);
  h += todaySchedule(day, now);
  h += safetyToday(day);
  return h;
}

function nowCard(t, now) {
  const r = t.cur;
  let label = "지금", title, right = "", body = "", prog = "";
  if (r) {
    if (r.type === "move") label = "이동 중";
    title = r.title;
    right = `${esc(T.hm(r.endMs))}까지 · ${esc(T.dur(r.endMs - now))}`;
    const pct = Math.min(100, Math.max(0, ((now - r.start) / (r.endMs - r.start)) * 100));
    prog = `<div class="prog" aria-hidden="true"><i style="width:${pct.toFixed(1)}%"></i></div>`;
    const links = `${r.place ? mapLink(place(r.place)) : ""}${statusChip(r)}${payChip(r)}`;
    body = (links ? `<div class="row-links">${links}</div>` : "") + (r.memo ? `<p class="memo">${esc(r.memo)}</p>` : "");
  } else if (!t.dayStarted) {
    title = "아직 오늘 일정 전이에요";
    right = t.next ? `첫 일정 ${esc(t.next.time)}` : "";
  } else if (t.dayDone) {
    title = "오늘 일정 끝! 수고했어요";
  } else {
    title = "잠깐 쉬는 시간";
    right = t.prev ? `방금 끝: ${esc(t.prev.title)}` : "";
  }
  return `<section class="card now ${r && r.type === "move" ? "moving" : ""}">
    <div class="ch"><span class="pulse" aria-hidden="true"></span><span class="ch-t">${label}</span>${right ? `<span class="ch-r">${right}</span>` : ""}</div>
    <h2>${esc(title)}</h2>
    ${prog}${body}
  </section>`;
}

function dayWord(r, t) {
  if (!t.day || r.day === t.day.day) return "";
  return r.day === t.day.day + 1 ? "내일 " : `${r.day}일차 `;
}

function nextTile(t, now) {
  const r = t.nextAct;
  if (!r) return "";
  const mv = t.moveBefore ? `<p class="sub">${esc(t.moveBefore.time)} 출발${t.moveBefore.memo ? ` · ${esc(t.moveBefore.memo)}` : ""}</p>` : "";
  return `<section class="card tile next">
    ${ch("", "다음", esc(T.dur(r.start - now)) + " 후")}
    <p class="tile-t"><b>${esc(dayWord(r, t) + r.time)}</b> ${esc(r.title)}</p>
    ${mv}
    ${statusChip(r) || payChip(r) ? `<div class="row-links">${statusChip(r)}${payChip(r)}</div>` : ""}
  </section>`;
}

function gatherInfo(t, now) {
  const lg = activeGather(now);
  if (lg && lg.at && lg.at + 5 * 60e3 > now) {
    return { time: lg.time, where: lg.place, at: lg.at, memo: lg.label || "", live: true };
  }
  if (!t.gather) return null;
  const g = t.gather;
  const out = { time: g.time, where: g.gatherAt || g.title, at: g.start, memo: g.memo || "", row: g };
  const second = S.data.rows.find((r) => r.gather && r.start > g.start);
  if (second && second.start - g.start <= 45 * 60e3) out.also = second;
  return out;
}

function gatherTile(t, now) {
  const g = gatherInfo(t, now);
  if (!g) return "";
  const left = g.at - now;
  const urgent = left < 15 * 60e3;
  const otherDay = T.parts(g.at).date !== T.parts(now).date;
  const dayTxt = otherDay && g.row ? dayWord(g.row, t) : "";
  return `<section class="card tile gather ${urgent ? "urgent" : ""}" aria-live="polite">
    ${ch("flag", g.live ? "집결 · 선생님 지정" : "집결")}
    <p class="g-count">${left <= 0 ? "지금!" : esc(T.dur(left))}</p>
    <p class="tile-t"><b>${esc(dayTxt + g.time)}</b> ${esc(g.where)}</p>
    <p class="sub">${left > 0 ? `${esc(T.hm(g.at - 5 * 60e3))}까지 도착` : "늦으면 선생님께 전화"}</p>
    ${g.also ? `<p class="sub">또는 ${esc(g.also.time)} ${esc(g.also.gatherAt || g.also.title)}</p>` : ""}
  </section>`;
}

// 지금 일정 장소의 미션 — 오늘 화면에서 바로 쓰기
function missionNow(t) {
  const m = missionForRow(t.cur);
  if (!m) return "";
  return `<section class="card task" id="m-${m.id}">
    ${ch("record", `미션 · ${esc(m.title)}`, has(S.answers[m.id]) ? '<span class="chip st-ok">씀</span>' : "")}
    <label class="q" for="tn-${m.id}">${esc(m.q)}</label>
    <textarea id="tn-${m.id}" data-bind="answers" data-key="${m.id}" rows="2" maxlength="1000">${esc(S.answers[m.id] || "")}</textarea>
    ${savedLine("answers/" + m.id, S.answers[m.id])}
  </section>`;
}

// 숙소에 있는 저녁·일정이 끝난 뒤·마지막 귀가 길에는 그날 한 줄 소감
function reflNow(t) {
  const r = t.cur;
  const last = S.data.rows[S.data.rows.length - 1];
  const show = t.dayDone || (r && r.type === "stay" && r.time >= "17:00") || (r && r === last);
  if (!show || !t.day) return "";
  const k = "d" + t.day.day;
  return `<section class="card task" id="r-${k}">
    ${ch("record", "오늘의 한 줄 소감")}
    <textarea data-bind="refl" data-key="${k}" rows="2" maxlength="500" aria-label="오늘의 한 줄 소감">${esc(S.refl[k] || "")}</textarea>
    ${savedLine("refl/" + k, S.refl[k])}
  </section>`;
}

function shotsNow(t) {
  const list = shotsFor(t.cur).filter((s) => S.teacherUI || s.photoBy !== "teacher");
  if (!list.length) return "";
  return `<section class="card task">
    ${ch("camera", "지금 찍을 사진")}
    <div class="list">${list.map((s) => shotItem(s, true)).join("")}</div>
  </section>`;
}

// 오늘 일정 한눈에 (이동 제외, 지금 줄 강조, 지난 줄 흐리게)
function todaySchedule(day, now) {
  const rows = day.rows.filter((r) => r.type !== "move" || r.gather);
  const stayP = place(day.stayPlace);
  return `<section class="card">
    ${ch("schedule", "오늘 일정", stayP ? `<a class="ch-link" ${mapAttrs(stayP)}>${icon("home")}${esc(day.stay)}</a>` : esc(day.stay))}
    ${stayP && stayP.rooms ? `<p class="sub rooms">${roomLabels(stayP.rooms)}</p>` : ""}
    <ol class="tl-mini">${rows.map((r) => {
      const cur = r.start <= now && now < r.endMs;
      const past = r.endMs <= now;
      return `<li class="${cur ? "cur" : past ? "past" : ""}"><span class="tm">${esc(r.time)}</span><span class="tt">${esc(r.title.replace(/^이동\s*/, ""))}${payChip(r)}${statusChip(r)}</span></li>`;
    }).join("")}</ol>
  </section>`;
}

function safetyToday(day) {
  if (!day.safety || !day.safety.length) return "";
  return `<section class="card safety">
    ${ch("info", "오늘의 안전", `<button class="ch-link" data-act="goto" data-tab="info" data-anchor="i-safety">전체</button>`)}
    <ul class="dots">${day.safety.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
  </section>`;
}

function shotUp(s, label) {
  const u = folderUrl(s.id);
  return u ? `<a class="btn sm up" href="${esc(u)}" target="_blank" rel="noopener">${icon("folder")}${label}</a>` : "";
}

export function shotItem(s, compact, mark) {
  const st = S.shots[s.id] || {};
  const up = shotUp(s, compact ? "사진 올리기" : "올리기");
  return `<div class="shot li ${mark ? "focus" : ""}"${compact ? "" : ` id="s-${esc(s.id)}"`}>
    ${compact ? "" : `<div class="s-head"><span class="tm">${esc(s.label || s.time)}</span><b>${esc(s.place)}</b>${mark ? `<span class="chip st-now">${mark}</span>` : ""}${s.star ? `<span class="chip st-star">${icon("star")}꼭</span>` : ""}${up ? `<span class="s-up">${up}</span>` : ""}</div>`}
    <label class="s-line ${st.p ? "done" : ""}">
      <input type="checkbox" data-shot="${esc(s.id)}" data-kind="p" ${st.p ? "checked" : ""}>
      <span class="box">${icon("check")}</span>
      <span class="s-text">${esc(s.photo)}${s.photoBy === "teacher" ? ' <span class="chip st-t">선생님</span>' : ""}</span>
    </label>
    ${s.warn ? `<p class="warn">${icon("alert")}<span>${esc(s.warn)}</span></p>` : ""}
    ${compact ? (up ? `<div class="up-row">${up}${uploadBadge(s.id)}</div>` : "") : (up ? uploadBadge(s.id) : "")}
  </div>`;
}

function todayBefore(t, now) {
  const camp = S.data.camp;
  const d1 = S.data.schedule[0];
  const dd = T.daysBetween(T.parts(now).date, camp.start);
  const gathers = d1.rows.filter((r) => r.gather).slice(0, 2);
  const L = S.data.checklist;
  const packed = L.filter((x) => S.checks[x.id]).length;
  let h = `<section class="hero"><b class="dday">D-${dd}</b><div><b>${dd === 1 ? "내일 출발해요!" : `출발까지 ${dd}일`}</b><span>${esc(camp.period)}</span></div></section>`;
  h += noticesBlock();
  h += rollcallCard(now);
  h += `<section class="card tile gather">
    ${ch("flag", `출발 집결 · ${esc(d1.label)}`)}
    <p class="g-count">${esc(T.dur(gathers[0].start - now))}</p>
    <ul class="list">${gathers.map((g) => `<li class="li row2"><span class="tm">${esc(g.time)}</span><span><b>${esc(g.gatherAt)}</b>${g.memo ? `<small>${esc(g.memo)}</small>` : ""}</span></li>`).join("")}</ul>
    <p class="sub">출발조 시간 5분 전 도착 · 사진 있는 신분증 필수</p>
  </section>`;
  h += `<section class="card">
    ${ch("check", "준비물", `<span class="count">${packed}/${L.length}</span>`)}
    <div class="bar"><i style="width:${(packed / L.length) * 100}%"></i></div>
    ${packed < L.length ? `<p class="sub">남은 것: ${L.filter((x) => !S.checks[x.id]).map((x) => esc(x.text)).join(", ")}</p>` : `<p class="sub">다 챙겼어요!</p>`}
    <button class="btn sm" data-act="goto" data-tab="info" data-anchor="i-pack">체크하기</button>
  </section>`;
  h += safetyToday(d1);
  return h;
}

function todayAfter(now) {
  const info = S.data.info;
  const dd = T.daysBetween(T.parts(now).date, info.deadline);
  const M = S.data.missions.list;
  const answered = M.filter((m) => has(S.answers[m.id])).length;
  const refl = S.data.schedule.filter((d) => has(S.refl["d" + d.day])).length;
  let h = `<section class="hero"><b class="dday">${dd > 0 ? `D-${dd}` : dd === 0 ? "D-day" : "끝"}</b><div><b>캠프 끝! 모두 수고했어요</b><span>제출 마감 ${esc(info.deadlineLabel)}</span></div></section>`;
  h += noticesBlock();
  h += `<section class="card">
    ${ch("record", "제출물", `마감 ${esc(info.deadlineLabel)}`)}
    <ul class="list">${info.submissions.map((s) => `<li class="li"><b>${esc(s.name)} <span class="chip st-plain">${esc(s.who)}</span></b><small>${esc(s.note)}</small></li>`).join("")}</ul>
  </section>
  <section class="card">
    ${ch("record", "내 기록")}
    <ul class="stats"><li><b>${answered}</b><span>/ ${M.length} 미션</span></li><li><b>${refl}</b><span>/ 4 소감</span></li></ul>
    <button class="btn sm" data-act="goto" data-tab="record" data-seg="mission">기록 보기</button>
  </section>`;
  return h;
}

/* ---------- 일정 ---------- */
export function viewSchedule() {
  const now = T.now();
  if (S.ui.day == null) S.ui.day = autoDay();
  const day = S.data.schedule.find((d) => d.day === S.ui.day) || S.data.schedule[0];
  const stayP = place(day.stayPlace);
  let h = dayTabs("day", day.day);
  h += `<section class="card flush">
    <div class="tl-head">${icon("home")}<span>숙소</span>${stayP ? `<a class="ch-link" ${mapAttrs(stayP)}>${esc(day.stay)}</a>` : `<b>${esc(day.stay)}</b>`}${stayP && stayP.rooms ? `<small class="rooms">${roomLabels(stayP.rooms)}</small>` : ""}</div>
    <ol class="timeline">${day.rows.map((r) => rowHtml(r, now)).join("")}</ol>
  </section>`;
  return h;
}

function rowHtml(r, now) {
  const past = r.endMs <= now;
  const cur = r.start <= now && now < r.endMs;
  const p = place(r.place);
  const wrap = (cls, inner, label) => `<li class="${cls}"${cur ? ' id="cur-row"' : ""}>${p
    ? `<a ${mapAttrs(p)} aria-label="${esc(label)}">${inner}</a>`
    : `<div>${inner}</div>`}</li>`;
  const state = `${past ? " past" : ""}${cur ? " cur" : ""}`;
  if (r.type === "move" && !r.gather) {
    // 이동은 한 줄로 얇게: "12:25 → 자매국수 · 15분"
    const t = r.title.replace(/^이동\s*/, "");
    return wrap(`row slim${state}`, `<span class="r-time">${esc(r.time)}</span><span class="r-title">${esc(t)}${r.memo ? ` · ${esc(r.memo)}` : ""}</span>`, `${r.time} ${r.title}`);
  }
  const tags = [];
  if (cur) tags.push('<span class="chip st-now">지금</span>');
  if (r.gather) tags.push('<span class="chip st-gather">집결</span>');
  if (r.pay === "self") tags.push('<span class="chip st-pay">개인 돈</span>');
  const st = statusChip(r);
  if (st) tags.push(st);
  const inner = `<span class="r-time">${esc(r.time)}${r.end ? `<small>~${esc(r.end)}</small>` : ""}</span>
    <span class="r-body"><span class="r-title">${esc(r.title)}</span>${tags.length ? `<span class="r-tags">${tags.join("")}</span>` : ""}${r.memo ? `<span class="r-memo">${esc(r.memo)}</span>` : ""}</span>
    ${p ? `<span class="r-go">${icon("pin")}</span>` : ""}`;
  return wrap(`row${r.gather ? " gather" : ""}${state}`, inner, `${r.time} ${r.title}${p ? `, ${p.name} 지도` : ""}`);
}

/* ---------- 장소 줄 (안내 탭 병원 등) ---------- */
function placeRow(p, hl) {
  return `<li><a class="li place ${hl ? "hl" : ""}" ${mapAttrs(p)}>
    <span class="p-body"><b>${esc(p.name)}</b>${p.address ? `<small>${esc(p.address)}</small>` : ""}${p.note ? `<small class="p-note">${esc(p.note)}</small>` : ""}</span>
    <span class="p-go">지도${icon("ext")}</span>
  </a></li>`;
}

/* ---------- 미션·기록 ---------- */
export function viewRecord() {
  const seg = S.ui.seg;
  let h = `<div class="record-nav"><div class="seg" role="tablist" aria-label="기록 구분">${[["mission", "미션"], ["refl", "소감"], ["shots", "사진"], ["roles", "역할"]].map(([k, l]) => `<button role="tab" aria-selected="${seg === k}" class="${seg === k ? "on" : ""}" data-act="seg" data-seg="${k}">${l}</button>`).join("")}</div>`;
  if (seg === "roles") return h + `</div>` + rolesList();
  if (S.ui.shotDay == null) S.ui.shotDay = autoDay();
  h += dayTabs("shotday", S.ui.shotDay) + `</div>`;
  if (seg === "shots") return h + shotsList();
  if (!S.code || !S.me || live.status === "badcode") h += shareBar();
  return h + (seg === "refl" ? reflList() : missionsList());
}

function driveLink() {
  const u = folderUrl("photos") || live.meta.driveUrl || S.data.camp.driveUrl;
  return u ? `<a class="ch-link" href="${esc(u)}" target="_blank" rel="noopener">${icon("folder")}전체 폴더</a>` : "";
}

function missionsList() {
  const list = S.data.missions.list.filter((m) => m.day === S.ui.shotDay);
  if (!list.length) return `<p class="empty">이날은 미션이 없어요.</p>`;
  return list.map((m) => `<section class="card" id="m-${m.id}">
    ${ch("record", esc(m.title), has(S.answers[m.id]) ? '<span class="chip st-ok">씀</span>' : "")}
    <label class="q" for="ta-${m.id}">${esc(m.q)}</label>
    <textarea id="ta-${m.id}" data-bind="answers" data-key="${m.id}" rows="2" maxlength="1000">${esc(S.answers[m.id] || "")}</textarea>
    ${savedLine("answers/" + m.id, S.answers[m.id])}
  </section>`).join("");
}

function reflList() {
  const k = "d" + S.ui.shotDay;
  return `<section class="card" id="r-${k}">
    ${ch("record", "한 줄 소감")}
    <textarea data-bind="refl" data-key="${k}" rows="3" maxlength="500" aria-label="한 줄 소감">${esc(S.refl[k] || "")}</textarea>
    ${savedLine("refl/" + k, S.refl[k])}
  </section>`;
}

function shotsList() {
  const now = T.now();
  const list = S.data.shots.list.filter((s) => s.day === S.ui.shotDay);
  const curIdx = list.findIndex((s) => s.at <= now && now < s.endAt);
  const drive = driveLink();
  if (!folderUrl("photos")) {
    // 드라이브 링크가 아직 없으면 한 줄 안내
    return `<p class="empty">${S.code ? "선생님이 드라이브 링크를 넣으면 '사진 올리기'가 생겨요." : "입장 코드를 넣으면 '사진 올리기'가 생겨요."}</p>` + shotCard(list, curIdx, drive);
  }
  return shotCard(list, curIdx, drive);
}

function shotCard(list, curIdx, drive) {
  return `<section class="card flush">${ch("camera", "찍을 사진", drive)}<div class="list">${list.map((s, k) => shotItem(s, false, k === curIdx ? "지금" : "")).join("")}</div></section>`;
}

function rolesList() {
  const R = S.data.roles;
  return `<section class="card flush">${ch("user", "역할", `<small>${esc(R.note)}</small>`)}<ul class="list">${R.roles.map((r) => `<li class="li role ${r.name === S.me ? "mine" : ""}">
    <span class="role-name">${esc(r.role)}${r.confirm ? ' <span class="chip st-need">확인 필요</span>' : ""}</span>
    <b>${esc(r.name)}${r.name === S.me ? ' <span class="chip st-now">나</span>' : ""}</b>
    <small>${esc(r.todo)}</small>
  </li>`).join("")}</ul></section>`;
}

/* ---------- 안내 ---------- */
export function viewInfo(installable) {
  const jumps = [["i-safety", "안전"], ["i-call", "비상 연락"], ["i-pack", "준비물"], ["i-money", "개인 돈"], ["i-alt", "대안"], ["i-after", "제출물"], ["i-set", "설정"]];
  let h = `<nav class="jump" aria-label="안내 바로가기">${jumps.map(([id, l]) => `<button data-act="jump" data-anchor="${id}">${l}</button>`).join("")}</nav>`;
  const R = S.data.rules;
  h += `<section class="card flush" id="i-safety">
    ${ch("info", "안전 규칙")}
    <ul class="list">${R.general.map((x) => `<li class="li ico-row"><span class="r-ico" aria-hidden="true">${x.icon}</span><span>${esc(x.text)}</span></li>`).join("")}</ul>
    ${ch("pin", "장소별 주의")}
    <ul class="list">${R.places.map((p) => `<li class="li"><b>${esc(p.name)}</b><small>${p.items.map(esc).join(" · ")}</small></li>`).join("")}</ul>
    ${ch("camera", "촬영 예절")}
    <ul class="list">${S.data.shots.etiquette.map((x) => `<li class="li"><span>${esc(x)}</span></li>`).join("")}</ul>
  </section>`;

  const C = S.data.contacts;
  const tel = live.meta.teacherTel;
  h += `<section class="card" id="i-call">
    ${ch("phone", "비상 연락")}
    <div class="calls">${C.emergency.map((e) => `<a class="call sos" href="tel:${esc(e.tel)}"><b>${esc(e.name)}</b><small>${esc(e.desc)}</small></a>`).join("")}</div>
    <ul class="list">
      ${tel
        ? `<li><a class="li place" href="tel:${esc(tel)}"><span class="p-body"><b>${esc(C.teacher.name)}</b><small>${esc(tel)}</small></span><span class="p-go">${icon("phone")}전화</span></a></li>`
        : `<li class="li"><b>${esc(C.teacher.name)}</b><small>${esc(C.teacher.note)}</small></li>`}
      ${C.places.map((p) => `<li><a class="li place" href="tel:${esc(p.tel)}"><span class="p-body"><b>${esc(p.name)}</b><small>${esc(p.desc)} · ${esc(p.tel)}</small></span><span class="p-go">${icon("phone")}전화</span></a></li>`).join("")}
      ${C.hospitals.map((x) => placeRow({ name: x.name, address: x.address, nid: x.nid, naver: x.naver })).join("")}
    </ul>
  </section>`;

  const L = S.data.checklist;
  const n = L.filter((x) => S.checks[x.id]).length;
  h += `<section class="card flush" id="i-pack">
    ${ch("check", "준비물", `<span class="count">${n}/${L.length}</span>`)}
    <ul class="list checks">${L.map((x) => `<li><label class="li ${S.checks[x.id] ? "done" : ""}">
      <input type="checkbox" data-check="${esc(x.id)}" ${S.checks[x.id] ? "checked" : ""}>
      <span class="box">${icon("check")}</span>
      <span class="ct">${esc(x.text)}${x.note ? `<small>${esc(x.note)}</small>` : ""}</span>
    </label></li>`).join("")}</ul>
  </section>`;

  const I = S.data.info;
  h += `<section class="card flush" id="i-money">
    ${ch("info", "개인 돈")}
    <ul class="list">${I.money.map((m) => `<li class="li"><b>${esc(m.when)} · ${esc(m.where)}</b><small>${esc(m.text)}</small></li>`).join("")}</ul>
  </section>`;
  h += `<section class="card flush" id="i-alt">
    ${ch("alert", "결항·우천 대안")}
    <ul class="list">${I.alternatives.map((a) => `<li class="li"><b>${esc(a.if)}</b><small>${esc(a.then)}</small></li>`).join("")}</ul>
  </section>`;
  const dd = T.daysBetween(T.parts(T.now()).date, I.deadline);
  h += `<section class="card flush" id="i-after">
    ${ch("record", "캠프 후 제출물", dd >= 0 ? `마감 ${esc(I.deadlineLabel)} · D-${dd}` : "마감 지남")}
    <ul class="list">${I.submissions.map((s) => `<li class="li"><b>${esc(s.name)} <span class="chip st-plain">${esc(s.who)}</span></b><small>${esc(s.note)}</small></li>`).join("")}</ul>
  </section>`;

  const codeState = !S.code ? "없음" : live.status === "online" ? `${esc(S.code)} · 연결됨` : live.status === "badcode" ? `${esc(S.code)} · 맞지 않음` : `${esc(S.code)} · 연결 대기`;
  const seg = (act, cur, opts) => `<div class="seg mini">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? "on" : ""}" data-act="${act}" data-v="${v}">${l}</button>`).join("")}</div>`;
  h += `<section class="card flush" id="i-set">
    ${ch("user", "내 설정")}
    <ul class="list">
      <li class="li set-row"><span>내 이름</span><b>${esc(S.me || "-")}</b><button class="btn sm ghost" data-act="me">${S.me ? "바꾸기" : "고르기"}</button></li>
      <li class="li set-row"><span>입장 코드</span><b>${codeState}</b><button class="btn sm ghost" data-act="code">${S.code ? "바꾸기" : "넣기"}</button></li>
      <li class="li set-row"><span>화면</span>${seg("theme", S.theme, [["auto", "자동"], ["light", "밝게"], ["dark", "어둡게"]])}</li>
      <li class="li set-row"><span>글자</span>${seg("big", S.big ? 1 : 0, [[0, "보통"], [1, "크게"]])}</li>
      <li class="li set-row"><span>홈 화면</span><b></b><button class="btn sm ghost" data-act="install">${installable ? "추가하기" : "추가 방법"}</button></li>
      <li class="li set-row"><span>최신 일정</span><b></b><button class="btn sm ghost" data-act="reload">새로고침</button></li>
    </ul>
    <p class="ver" data-act="ver">${esc(S.data.camp.name)} · ${esc(S.data.camp.event)}</p>
  </section>`;
  return h;
}
