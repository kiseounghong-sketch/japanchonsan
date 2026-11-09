// 학생 화면 5개: 오늘 / 일정 / 지도 / 미션·기록 / 안내
import { S, roster } from "./state.js";
import { live } from "./live.js";
import * as T from "./time.js";
import { esc, icon, statusChip, kakaoUrl } from "./ui.js";
import { compute, dayOf, activeGather, shotsFor, missionsFor, missionForRow } from "./plan.js";

const place = (id) => (id && S.data.placeById[id]) || null;
const has = (v) => !!(v && String(v).trim());

function mapLink(p, label) {
  if (!p) return "";
  return `<a class="plink" href="${esc(kakaoUrl(p))}" target="_blank" rel="noopener">${icon("pin")}<span>${esc(label || p.name)}</span></a>`;
}

/* ---------- 저장 상태 표시 ---------- */
export function savedText(path, value) {
  if (!has(value)) return "";
  if (!S.code || !S.me) return `${icon("check")}이 폰에 저장됨`;
  if (S.dirty[path]) return `${icon("check")}이 폰에 저장됨 · 공유 대기`;
  return `${icon("check")}이 폰에 저장됨 · 선생님과 공유됨`;
}
function savedLine(path, value) {
  return `<div class="saved" data-saved="${esc(path)}">${savedText(path, value)}</div>`;
}

export function shareBar() {
  if (!S.code) {
    return `<div class="note-bar" id="share-bar">${icon("cloud")}<span>지금은 <b>이 폰에만</b> 저장돼요. 입장 코드를 넣으면 선생님과 공유돼요.</span><button class="btn sm" data-act="code">코드 넣기</button></div>`;
  }
  if (!S.me) {
    return `<div class="note-bar" id="share-bar">${icon("user")}<span>이름을 고르면 미션 답·소감이 선생님과 공유돼요.</span><button class="btn sm" data-act="me">이름 고르기</button></div>`;
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
    h += `<div class="note-bar warn">${icon("alert")}<span>카카오톡 안에서 열려 있어요. <b>다른 브라우저로 열고 홈 화면에 추가</b>하면 신호가 없어도 일정이 보여요.</span><button class="btn sm" data-act="external">열기</button></div>`;
  }
  if (!S.me) {
    h += `<div class="note-bar">${icon("user")}<span>처음 한 번, <b>내 이름</b>을 골라 주세요.</span><button class="btn sm" data-act="me">고르기</button></div>`;
  }
  if (live.status === "badcode") {
    h += `<div class="note-bar warn">${icon("alert")}<span>입장 코드가 맞지 않아요. 선생님께 확인해 주세요.</span><button class="btn sm" data-act="code">다시 넣기</button></div>`;
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
    h += `<button class="linkbtn" data-act="old-notices">${S.ui.oldNotices ? "지난 공지 접기" : `지난 공지 ${old.length}개 보기`}</button>`;
    if (S.ui.oldNotices) old.forEach((n) => { h += noticeCard(n, false); });
  }
  return h + `</section>`;
}

function noticeCard(n, fresh) {
  const imp = n.level === "important";
  return `<article class="notice ${imp ? "imp" : ""} ${fresh ? "" : "old"}">
    <div class="n-head">${icon("bell")}<b>선생님 공지</b>${imp ? '<span class="chip st-imp">중요</span>' : ""}<time>${n.ts ? esc(T.todayLabel(n.ts) + " " + T.hm(n.ts)) : ""}</time></div>
    <p class="n-text">${esc(n.text)}</p>
    ${fresh ? `<button class="btn sm ghost" data-act="seen" data-id="${esc(n.id)}">${icon("check")}확인했어요</button>` : ""}
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
  else if (mine) btn = `<div class="arrived">${icon("check")}<span><b>${esc(S.me)}</b> 도착 확인됨 · ${esc(T.hm(mine))}</span></div><button class="linkbtn" data-act="arrive-undo">잘못 눌렀어요 (취소)</button>`;
  else btn = `<button class="btn big tang" data-act="arrive">${icon("flag")}도착했어요</button>`;
  return `<section class="card rollcall" id="rollcall">
    <div class="label tang">${icon("flag")}인원 점검 중</div>
    <h2>${esc(g.time || "")} ${esc(g.place || "")}</h2>
    ${g.label ? `<p class="muted">${esc(g.label)}</p>` : ""}
    <p class="rc-count"><b>${arrived}</b> / ${names.length}명 도착${left != null ? ` · ${left > 0 ? T.dur(left) + " 남음" : "집결 시간 지남"}` : ""}</p>
    ${btn}
    ${live.status !== "online" ? `<p class="hint">${icon("wifiOff")}인터넷이 약해요. 누른 기록은 연결되면 선생님께 전달돼요.</p>` : ""}
  </section>`;
}

function todayDuring(t, now) {
  const day = t.day;
  let h = `<section class="hero">
    <div class="hero-day"><b>${day.day}일차</b><span>${esc(day.label)}</span></div>
    <div class="hero-stay">${icon("home")}${esc(day.stay)}</div>
  </section>`;
  h += noticesBlock();
  h += rollcallCard(now);
  h += nowCard(t, now);
  h += nextCard(t, now);
  h += gatherCard(t, now);
  h += shotsNow(t);
  h += missionsToday(day, t);
  h += mealsStay(day);
  h += safetyToday(day);
  return h;
}

function nowCard(t, now) {
  const r = t.cur;
  let label = "지금", title, meta = "", body = "", prog = "";
  if (r) {
    if (r.type === "move") label = "이동 중";
    title = r.title;
    meta = `<span>${esc(T.hm(r.endMs))}까지</span><span class="sep">·</span><span>${esc(T.dur(r.endMs - now))} 남음</span>`;
    const pct = Math.min(100, Math.max(0, ((now - r.start) / (r.endMs - r.start)) * 100));
    prog = `<div class="prog" aria-hidden="true"><i style="width:${pct.toFixed(1)}%"></i></div>`;
    const m = missionForRow(r);
    body = (r.memo ? `<p class="memo">${esc(r.memo)}</p>` : "")
      + `<div class="row-links">${r.place ? mapLink(place(r.place)) : ""}${statusChip(r)}${r.pay === "self" ? '<span class="chip st-pay">개인 돈</span>' : ""}</div>`
      + (m ? `<button class="mission-cta" data-act="goto" data-tab="record" data-seg="mission" data-anchor="m-${m.id}">${icon("record")}<span><small>여기 미션</small>${esc(m.q)}</span>${has(S.answers[m.id]) ? '<span class="chip st-ok">씀</span>' : icon("chevron")}</button>` : "");
  } else if (!t.dayStarted) {
    title = "아직 오늘 일정 전이에요";
    meta = t.next ? `<span>첫 일정 ${esc(t.next.time)} · ${esc(T.dur(t.next.start - now))} 후</span>` : "";
  } else if (t.dayDone) {
    title = "오늘 일정 끝! 수고했어요";
    body = `<p class="memo">잠들기 전에 오늘의 한 줄 소감을 남겨 주세요.</p><button class="btn sm" data-act="goto" data-tab="record" data-seg="refl">${icon("record")}소감 쓰기</button>`;
  } else {
    title = "잠깐 쉬는 시간";
    meta = t.prev ? `<span>방금 끝: ${esc(t.prev.title)}</span>` : "";
  }
  return `<section class="card now ${r && r.type === "move" ? "moving" : ""}">
    <div class="label"><span class="pulse" aria-hidden="true"></span>${label}</div>
    <h2>${esc(title)}</h2>
    ${meta ? `<div class="meta">${meta}</div>` : ""}
    ${prog}${body}
  </section>`;
}

function dayWord(r, t) {
  if (!t.day || r.day === t.day.day) return "";
  return r.day === t.day.day + 1 ? "내일 " : `${r.day}일차 `;
}

function nextCard(t, now) {
  const r = t.nextAct;
  if (!r) return "";
  const when = dayWord(r, t);
  let mv = "";
  if (t.moveBefore) {
    mv = `<p class="move-line">${icon("chevron")}<span><b>${esc(t.moveBefore.time)} 출발</b>${t.moveBefore.memo ? ` · 이동 ${esc(t.moveBefore.memo)}` : ""}</span></p>`;
  }
  return `<section class="card next">
    <div class="label">다음</div>
    <h3>${esc(r.title)}</h3>
    <div class="meta"><b>${esc(when + r.time)}</b> 시작<span class="sep">·</span>${esc(T.dur(r.start - now))} 후</div>
    ${mv}
    ${r.memo ? `<p class="memo">${esc(r.memo)}</p>` : ""}
    <div class="row-links">${r.place ? mapLink(place(r.place)) : ""}${statusChip(r)}${r.pay === "self" ? '<span class="chip st-pay">개인 돈</span>' : ""}</div>
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

function gatherCard(t, now) {
  const g = gatherInfo(t, now);
  if (!g) return "";
  const left = g.at - now;
  const urgent = left < 15 * 60e3;
  const otherDay = T.parts(g.at).date !== T.parts(now).date;
  const dayTxt = otherDay ? (g.row ? dayWord(g.row, t) : "") || "" : "";
  const line = left <= 0
    ? `${esc(g.time)} ${esc(g.where)} — 지금 집결 시간이에요!`
    : `${esc(dayTxt + g.time)} ${esc(g.where)} 집결까지`;
  return `<section class="card gather ${urgent ? "urgent" : ""}" aria-live="polite">
    <div class="g-main">
      <div class="label">${icon("flag")}다음 집결${g.live ? ' <span class="chip st-live">선생님 지정</span>' : ""}</div>
      <p class="g-line">${line}</p>
      <p class="g-sub">${left > 0 ? `<b>${esc(T.hm(g.at - 5 * 60e3))}</b>까지 도착 (5분 전)` : "늦으면 바로 선생님께 전화"}${g.memo ? ` · ${esc(g.memo)}` : ""}</p>
      ${g.also ? `<p class="g-sub also">또는 ${esc(g.also.time)} ${esc(g.also.gatherAt || g.also.title)}${g.also.memo ? ` (${esc(g.also.memo)})` : ""}</p>` : ""}
    </div>
    <div class="g-count"><b>${left <= 0 ? "지금" : esc(T.dur(left))}</b>${left > 0 ? "<small>남음</small>" : ""}</div>
  </section>`;
}

function shotsNow(t) {
  const list = shotsFor(t.cur).filter((s) => S.teacherUI || s.photoBy !== "teacher" || s.video);
  if (!list.length) return "";
  return `<section class="card shots-now">
    <div class="label">${icon("camera")}지금 찍을 장면</div>
    ${list.map((s) => shotItem(s, true)).join("")}
    <button class="linkbtn" data-act="goto" data-tab="record" data-seg="shots" data-anchor="s-${esc(s0(list))}">사진 설명 쓰기 · 촬영 목록 전체</button>
  </section>`;
}
const s0 = (list) => list[0].id;

export function shotItem(s, compact) {
  const st = S.shots[s.id] || {};
  const teacherOnly = (kind) => kind === "p" && s.photoBy === "teacher";
  const line = (kind, text) => `<label class="s-line ${st[kind] ? "done" : ""}">
      <input type="checkbox" data-shot="${esc(s.id)}" data-kind="${kind}" ${st[kind] ? "checked" : ""}>
      <span class="box">${icon("check")}</span>
      <span class="s-kind">${icon(kind === "p" ? "camera" : "video")}${kind === "p" ? "사진" : "영상"}</span>
      <span class="s-text">${esc(text)}${teacherOnly(kind) ? ' <span class="chip st-t">선생님</span>' : ""}</span>
    </label>`;
  return `<div class="shot ${s.star ? "star" : ""}">
    ${compact ? "" : `<div class="s-head"><span class="s-time">${esc(s.label || s.time)}</span><b>${esc(s.place)}</b>${s.star ? `<span class="chip st-star">${icon("star")}꼭 찍기</span>` : ""}</div>`}
    ${s.photo ? line("p", s.photo) : ""}
    ${s.video ? line("v", s.video) : ""}
    ${s.warn ? `<p class="warn">${icon("alert")}<span>${esc(s.warn)}</span></p>` : ""}
    ${compact ? "" : `<input class="s-note" type="text" maxlength="200" data-note="${esc(s.id)}" placeholder="사진 설명 한 줄 (보고서용)" value="${esc(st.n || "")}">${savedLine("shots/" + s.id, st.n)}`}
  </div>`;
}

function missionsToday(day) {
  const list = missionsFor(day.day);
  if (!list.length) return "";
  const done = list.filter((m) => has(S.answers[m.id])).length;
  return `<section class="card">
    <div class="label">${icon("record")}오늘의 미션 <span class="count">${done}/${list.length}</span></div>
    <ul class="mlist">${list.map((m) => `<li class="${has(S.answers[m.id]) ? "done" : ""}">
      <button data-act="goto" data-tab="record" data-seg="mission" data-anchor="m-${m.id}">
        <span class="mk">${has(S.answers[m.id]) ? icon("check") : ""}</span>
        <span class="mt"><b>${esc(m.title)}</b><small>${esc(m.q)}</small></span>${icon("chevron")}
      </button></li>`).join("")}</ul>
    <p class="hint">매일 밤: ${esc(S.data.missions.nightly)}</p>
  </section>`;
}

function mealsStay(day) {
  const meals = day.rows.filter((r) => r.type === "meal");
  const stayP = place(day.stayPlace);
  return `<div class="duo">
    <section class="card">
      <div class="label">오늘 식사</div>
      <ul class="meals">${meals.map((r) => `<li>
        <span class="t">${esc(r.time)}</span>
        <span class="w"><b>${esc(r.title.replace(/\s*–\s*/, " · "))}</b>${r.memo ? `<small>${esc(r.memo)}</small>` : ""}</span>
        <span class="tags">${r.pay === "self" ? '<span class="chip st-pay">개인 돈</span>' : '<span class="chip st-plain">지원</span>'}${statusChip(r)}</span>
      </li>`).join("")}</ul>
    </section>
    <section class="card stay">
      <div class="label">${icon("home")}오늘 숙소</div>
      <h3>${esc(day.stay)}</h3>
      ${stayP ? `<p class="muted">${esc(stayP.address)}${stayP.note ? `<br>${esc(stayP.note)}` : ""}</p>${mapLink(stayP, "카카오맵")}` : `<p class="muted">영동 20:55 · 옥천 20:33 하차, 보호자 인계 후 해산</p>`}
    </section>
  </div>`;
}

function safetyToday(day) {
  if (!day.safety || !day.safety.length) return "";
  return `<section class="card safety">
    <div class="label">${icon("info")}오늘의 안전</div>
    <ul class="dots">${day.safety.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    <button class="linkbtn" data-act="goto" data-tab="info" data-anchor="i-safety">안전 규칙 전체 보기</button>
  </section>`;
}

function todayBefore(t, now) {
  const camp = S.data.camp;
  const d1 = S.data.schedule[0];
  const dd = T.daysBetween(T.parts(now).date, camp.start);
  const gathers = d1.rows.filter((r) => r.gather).slice(0, 2);
  const L = S.data.checklist;
  const packed = L.filter((x) => S.checks[x.id]).length;
  let h = `<section class="hero before">
    <div class="dday">D-${dd}</div>
    <div><b>${dd === 1 ? "내일 출발해요!" : `출발까지 ${dd}일`}</b><span>${esc(camp.period)}</span></div>
  </section>`;
  h += noticesBlock();
  h += rollcallCard(now);
  const first = gathers[0];
  h += `<section class="card gather">
    <div class="g-main">
      <div class="label">${icon("flag")}출발 집결 · ${esc(d1.label)}</div>
      ${gathers.map((g) => `<p class="g-line"><b>${esc(g.time)}</b> ${esc(g.gatherAt)}${g.memo ? ` <small>${esc(g.memo)}</small>` : ""}</p>`).join("")}
      <p class="g-sub">각자 출발조 시간 <b>5분 전</b> 도착 · 사진 있는 신분증 필수</p>
    </div>
    <div class="g-count"><b>${esc(T.dur(first.start - now))}</b><small>남음</small></div>
  </section>`;
  h += `<section class="card">
    <div class="label">준비물 <span class="count">${packed}/${L.length}</span></div>
    <div class="bar"><i style="width:${(packed / L.length) * 100}%"></i></div>
    <p class="muted">${packed === L.length ? "다 챙겼어요!" : `아직 ${L.length - packed}개 남았어요: ${L.filter((x) => !S.checks[x.id]).map((x) => esc(x.text)).join(", ")}`}</p>
    <button class="btn sm" data-act="goto" data-tab="info" data-anchor="i-pack">준비물 체크하기</button>
  </section>`;
  h += `<section class="card">
    <div class="label">1일차 미리보기 · 숙소 ${esc(d1.stay)}</div>
    <ol class="mini-tl">${d1.rows.filter((r) => r.type !== "move").map((r) => `<li><span>${esc(r.time)}</span>${esc(r.title)}${r.pay === "self" ? ' <span class="chip st-pay">개인 돈</span>' : ""}</li>`).join("")}</ol>
    <button class="linkbtn" data-act="goto" data-tab="schedule" data-day="1">1일차 전체 일정 보기</button>
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
  const notes = Object.values(S.shots).filter((x) => x && has(x.n)).length;
  let h = `<section class="hero before">
    <div class="dday">${dd > 0 ? `D-${dd}` : dd === 0 ? "D-day" : "끝"}</div>
    <div><b>캠프 끝! 모두 수고했어요</b><span>제출 마감 ${esc(info.deadlineLabel)}</span></div>
  </section>`;
  h += noticesBlock();
  h += `<section class="card">
    <div class="label">캠프 후 제출물 · 마감 ${esc(info.deadlineLabel)}</div>
    <ul class="subs">${info.submissions.map((s) => `<li><b>${esc(s.name)}</b><span class="chip st-plain">${esc(s.who)}</span><small>${esc(s.note)}</small></li>`).join("")}</ul>
  </section>
  <section class="card">
    <div class="label">내 기록 (결과보고서 재료)</div>
    <ul class="stats">
      <li><b>${answered}</b><span>/ ${M.length}<br>미션 답</span></li>
      <li><b>${refl}</b><span>/ 4<br>한 줄 소감</span></li>
      <li><b>${notes}</b><span>사진 설명</span></li>
    </ul>
    <button class="btn sm" data-act="goto" data-tab="record" data-seg="mission">기록 이어서 쓰기</button>
  </section>`;
  return h;
}

/* ---------- 일정 ---------- */
export function viewSchedule() {
  const now = T.now();
  const days = S.data.schedule;
  if (S.ui.day == null) {
    const d = dayOf(now);
    S.ui.day = d ? d.day : 1;
  }
  const day = days.find((d) => d.day === S.ui.day) || days[0];
  const stayP = place(day.stayPlace);
  let h = `<div class="seg days" role="tablist">${days.map((d) => `<button role="tab" aria-selected="${d.day === day.day}" class="${d.day === day.day ? "on" : ""}" data-act="day" data-day="${d.day}"><b>${d.day}일차</b><small>${esc(d.label)}</small></button>`).join("")}</div>`;
  h += `<div class="dayhead">${icon("home")}<span>숙소</span>${stayP ? mapLink(stayP, day.stay) : `<b>${esc(day.stay)}</b>`}</div>`;
  h += `<p class="legend">표시 없는 일정은 <b>확정</b> · 흐린 줄은 <b>이동</b> · 장소가 있는 줄을 누르면 카카오맵</p>`;
  h += `<ol class="timeline">${day.rows.map((r) => rowHtml(r, now)).join("")}</ol>`;
  return h;
}

function rowHtml(r, now) {
  const past = r.endMs <= now;
  const cur = r.start <= now && now < r.endMs;
  const p = place(r.place);
  const cls = ["row", r.type === "move" ? "move" : "", past ? "past" : "", cur ? "cur" : "", r.gather ? "gather" : ""].join(" ").trim();
  const tags = [];
  if (cur) tags.push('<span class="chip st-now">지금</span>');
  if (r.type === "move") tags.push('<span class="chip st-move">이동</span>');
  if (r.gather) tags.push('<span class="chip st-gather">집결</span>');
  if (r.pay === "self") tags.push('<span class="chip st-pay">개인 돈</span>');
  const st = statusChip(r);
  if (st) tags.push(st);
  const inner = `<span class="r-time">${esc(r.time)}${r.end ? `<small>~${esc(r.end)}</small>` : ""}</span>
    <span class="r-body"><span class="r-title">${esc(r.title)}</span>${r.memo ? `<span class="r-memo">${esc(r.memo)}</span>` : ""}${tags.length ? `<span class="r-tags">${tags.join("")}</span>` : ""}</span>
    ${p ? `<span class="r-go">${icon("pin")}</span>` : ""}`;
  return `<li class="${cls}"${cur ? ' id="cur-row"' : ""}>${p
    ? `<a href="${esc(kakaoUrl(p))}" target="_blank" rel="noopener" aria-label="${esc(`${r.time} ${r.title}, ${p.name} 카카오맵 열기`)}">${inner}</a>`
    : `<div>${inner}</div>`}</li>`;
}

/* ---------- 지도 ---------- */
export function viewMap() {
  const P = S.data.places;
  let h = `<h2 class="sec-title">숙소</h2><div class="plist">${P.filter((p) => p.stay).map((p) => placeCard(p, true)).join("")}</div>`;
  const f = S.ui.mapDay;
  h += `<div class="seg">${[0, 1, 2, 3, 4].map((d) => `<button class="${f === d ? "on" : ""}" data-act="mapday" data-day="${d}">${d ? d + "일차" : "전체"}</button>`).join("")}</div>`;
  (f ? [f] : [1, 2, 3, 4]).forEach((d) => {
    const day = S.data.schedule[d - 1];
    const ids = [];
    day.rows.forEach((r) => { if (r.place && !ids.includes(r.place)) ids.push(r.place); });
    P.forEach((p) => { if (p.day.includes(d) && !ids.includes(p.id)) ids.push(p.id); });
    const list = ids.map(place).filter((p) => p && !p.stay);
    h += `<h2 class="sec-title">${d}일차 <small>${esc(day.label)}</small></h2><div class="plist">${list.map((p) => placeCard(p)).join("")}</div>`;
  });
  const C = S.data.contacts;
  h += `<h2 class="sec-title">가까운 병원</h2><div class="plist">${C.hospitals.map((x) => placeCard({ name: `${x.name} (${x.area})`, address: x.address, kakao: x.kakao, hospital: true })).join("")}</div>`;
  h += `<p class="hint">링크를 누르면 카카오맵(앱 또는 웹)이 열려요. 주소는 카카오맵 기준이에요.</p>`;
  return h;
}

function placeCard(p, big) {
  return `<a class="place ${big ? "big" : ""}" href="${esc(kakaoUrl(p))}" target="_blank" rel="noopener">
    <span class="p-ico">${icon(p.stay ? "home" : p.hospital ? "alert" : "pin")}</span>
    <span class="p-body"><b>${esc(p.name)}</b>${p.address ? `<small>${esc(p.address)}</small>` : ""}${p.note ? `<small class="p-note">${esc(p.note)}</small>` : ""}</span>
    <span class="p-go">지도${icon("ext")}</span>
  </a>`;
}

/* ---------- 미션·기록 ---------- */
export function viewRecord() {
  const seg = S.ui.seg;
  let h = shareBar() + driveCard();
  h += `<div class="seg" role="tablist">${[["mission", "미션"], ["refl", "소감"], ["shots", "촬영"], ["roles", "역할"]].map(([k, l]) => `<button role="tab" aria-selected="${seg === k}" class="${seg === k ? "on" : ""}" data-act="seg" data-seg="${k}">${l}</button>`).join("")}</div>`;
  if (seg === "refl") h += reflList();
  else if (seg === "shots") h += shotsList();
  else if (seg === "roles") h += rolesList();
  else h += missionsList();
  return h;
}

function driveCard() {
  const url = live.meta.driveUrl || S.data.camp.driveUrl;
  const camp = S.data.camp;
  if (url) {
    return `<a class="drive" href="${esc(url)}" target="_blank" rel="noopener">${icon("folder")}<span><b>사진·영상 올리기 (구글 드라이브)</b><small>${esc(camp.uploadRule)} · 파일명 예: ${esc(camp.fileName)}</small></span>${icon("ext")}</a>`;
  }
  return `<div class="drive off">${icon("folder")}<span><b>사진·영상 올릴 곳</b><small>드라이브 링크는 ${S.code ? "선생님이 곧 넣어 줄 거예요" : "입장 코드를 넣으면 보여요"}. 사진은 앱에 올리지 않아요.</small></span></div>`;
}

function missionsList() {
  const M = S.data.missions;
  let h = `<p class="lead">캠프 목표: <b>${esc(M.goal)}</b></p>`;
  [1, 2, 3, 4].forEach((d) => {
    const list = M.list.filter((m) => m.day === d);
    if (!list.length) return;
    h += `<h2 class="sec-title">${d}일차 <small>${esc(S.data.schedule[d - 1].label)}</small></h2>`;
    h += list.map((m) => `<article class="card mission" id="m-${m.id}">
      <div class="m-head"><b>${esc(m.title)}</b>${has(S.answers[m.id]) ? '<span class="chip st-ok">씀</span>' : ""}</div>
      <label class="m-q" for="ta-${m.id}">${esc(m.q)}</label>
      <textarea id="ta-${m.id}" data-bind="answers" data-key="${m.id}" rows="2" maxlength="1000" placeholder="여기에 적어요">${esc(S.answers[m.id] || "")}</textarea>
      ${savedLine("answers/" + m.id, S.answers[m.id])}
    </article>`).join("");
  });
  return h;
}

function reflList() {
  let h = `<p class="lead">매일 밤 <b>오늘 가장 기억에 남는 것 + 이유</b>를 한 문장으로. 결과보고서에 들어가요.</p>`;
  S.data.schedule.forEach((d) => {
    const k = "d" + d.day;
    h += `<article class="card refl" id="r-${k}">
      <div class="m-head"><b>${d.day}일차</b><span class="muted">${esc(d.label)}</span></div>
      <textarea data-bind="refl" data-key="${k}" rows="2" maxlength="500" aria-label="${d.day}일차 한 줄 소감" placeholder="오늘 가장 기억에 남는 것은 … 왜냐하면 …">${esc(S.refl[k] || "")}</textarea>
      ${savedLine("refl/" + k, S.refl[k])}
    </article>`;
  });
  return h;
}

function shotsList() {
  const SH = S.data.shots;
  const done = SH.list.filter((s) => { const st = S.shots[s.id] || {}; return (!s.photo || st.p) && (!s.video || st.v); }).length;
  let h = `<section class="card">
    <div class="label">${icon("camera")}찍는 이유 세 가지</div>
    <ul class="uses">${SH.uses.map((u) => `<li><b>${esc(u.use)}</b><span>${esc(u.need)}</span><small>${esc(u.who)}</small></li>`).join("")}</ul>
  </section>`;
  h += `<details class="card tips"><summary>어떻게 찍을까 (7가지)</summary><ul class="dots">${SH.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>`;
  h += `<details class="card tips"><summary>촬영 안전·예절</summary><ul class="dots">${SH.etiquette.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>`;
  h += `<p class="lead">다 찍은 장면 <b>${done}</b> / ${SH.list.length} · 사진 설명은 찍은 사람이 그날 밤에</p>`;
  [1, 2, 3, 4].forEach((d) => {
    h += `<h2 class="sec-title">${d}일차 <small>${esc(S.data.schedule[d - 1].label)}</small></h2>`;
    h += SH.list.filter((s) => s.day === d).map((s) => `<article class="card shot-card" id="s-${esc(s.id)}">${shotItem(s, false)}</article>`).join("");
  });
  return h;
}

function rolesList() {
  const R = S.data.roles;
  let h = `<p class="lead">${esc(R.note)}</p>`;
  h += R.roles.map((r) => `<article class="card role ${r.name === S.me ? "mine" : ""}">
    <div class="role-head"><span class="role-name">${esc(r.role)}</span>${r.name === S.me ? '<span class="chip st-now">나</span>' : ""}${r.confirm ? '<span class="chip st-need">확인 필요</span>' : ""}</div>
    <b class="who">${esc(r.name)}</b>
    <p>${esc(r.todo)}</p>
  </article>`).join("");
  h += `<p class="hint">모두 함께: 장소마다 미션 답 · 매일 밤 한 줄 소감 · 찍은 사진 설명 한 줄</p>`;
  return h;
}

/* ---------- 안내 ---------- */
export function viewInfo(installable) {
  const jumps = [["i-safety", "안전"], ["i-call", "비상 연락"], ["i-pack", "준비물"], ["i-money", "개인 돈"], ["i-alt", "대안"], ["i-after", "제출물"], ["i-set", "설정"]];
  let h = `<nav class="jump" aria-label="안내 바로가기">${jumps.map(([id, l]) => `<button data-act="jump" data-anchor="${id}">${l}</button>`).join("")}</nav>`;
  const R = S.data.rules;
  h += `<section class="card" id="i-safety">
    <h2>안전 규칙</h2>
    <ul class="rules">${R.general.map((x) => `<li><span class="r-ico" aria-hidden="true">${x.icon}</span><span>${esc(x.text)}</span></li>`).join("")}</ul>
    <h3>장소별 주의사항</h3>
    <ul class="rules place">${R.places.map((p) => `<li><b>${esc(p.name)}</b><span>${p.items.map(esc).join(" · ")}</span></li>`).join("")}</ul>
    <h3>촬영 안전·예절</h3>
    <ul class="dots">${S.data.shots.etiquette.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
  </section>`;

  const C = S.data.contacts;
  const tel = live.meta.teacherTel;
  h += `<section class="card" id="i-call">
    <h2>비상 연락</h2>
    <div class="calls">${C.emergency.map((e) => `<a class="call sos" href="tel:${esc(e.tel)}">${icon("phone")}<b>${esc(e.name)}</b><small>${esc(e.desc)}</small></a>`).join("")}</div>
    <div class="clist">
      ${tel
        ? `<a class="call" href="tel:${esc(tel)}">${icon("phone")}<span><b>${esc(C.teacher.name)}</b><small>${esc(C.teacher.desc)} · ${esc(tel)}</small></span></a>`
        : `<div class="call off">${icon("user")}<span><b>${esc(C.teacher.name)}</b><small>${esc(C.teacher.desc)} · ${esc(C.teacher.note)}</small></span></div>`}
      ${C.places.map((p) => `<a class="call" href="tel:${esc(p.tel)}">${icon("phone")}<span><b>${esc(p.name)}</b><small>${esc(p.desc)} · ${esc(p.tel)}</small></span></a>`).join("")}
      ${C.hospitals.map((x) => `<a class="call" href="${esc(kakaoUrl({ kakao: x.kakao, name: x.name }))}" target="_blank" rel="noopener">${icon("pin")}<span><b>${esc(x.name)}</b><small>${esc(x.area)} · ${esc(x.address)} · 지도</small></span></a>`).join("")}
    </div>
  </section>`;

  const L = S.data.checklist;
  const n = L.filter((x) => S.checks[x.id]).length;
  h += `<section class="card" id="i-pack">
    <h2>준비물 체크 <span class="count">${n}/${L.length}</span></h2>
    <div class="bar"><i style="width:${(n / L.length) * 100}%"></i></div>
    <ul class="checks">${L.map((x) => `<li><label class="${S.checks[x.id] ? "done" : ""}">
      <input type="checkbox" data-check="${esc(x.id)}" ${S.checks[x.id] ? "checked" : ""}>
      <span class="box">${icon("check")}</span>
      <span>${esc(x.text)}${x.note ? `<small>${esc(x.note)}</small>` : ""}</span>
    </label></li>`).join("")}</ul>
    <p class="hint">체크는 이 폰에만 저장돼요.</p>
  </section>`;

  const I = S.data.info;
  h += `<section class="card" id="i-money">
    <h2>개인 돈 안내</h2>
    <ul class="kv">${I.money.map((m) => `<li><span class="k">${esc(m.when)}<small>${esc(m.where)}</small></span><span class="v">${esc(m.text)}</span></li>`).join("")}</ul>
  </section>`;
  h += `<section class="card" id="i-alt">
    <h2>결항·우천 대안</h2>
    <ul class="kv">${I.alternatives.map((a) => `<li><span class="k">${esc(a.if)}</span><span class="v">${esc(a.then)}</span></li>`).join("")}</ul>
  </section>`;
  const dd = T.daysBetween(T.parts(T.now()).date, I.deadline);
  h += `<section class="card" id="i-after">
    <h2>캠프 후 제출물 <span class="count">${dd >= 0 ? `마감 ${esc(I.deadlineLabel)} · D-${dd}` : "마감 지남"}</span></h2>
    <ul class="subs">${I.submissions.map((s) => `<li><b>${esc(s.name)}</b><span class="chip st-plain">${esc(s.who)}</span><small>${esc(s.note)}</small></li>`).join("")}</ul>
  </section>`;

  const codeState = !S.code ? "없음" : live.status === "online" ? `${esc(S.code)} · 연결됨` : live.status === "badcode" ? `${esc(S.code)} · 맞지 않음` : `${esc(S.code)} · 연결 대기`;
  const seg = (act, cur, opts) => `<div class="seg mini">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? "on" : ""}" data-act="${act}" data-v="${v}">${l}</button>`).join("")}</div>`;
  h += `<section class="card" id="i-set">
    <h2>내 설정</h2>
    <div class="set-row"><span>내 이름</span><b>${esc(S.me || "아직 안 골랐어요")}</b><button class="btn sm ghost" data-act="me">${S.me ? "바꾸기" : "고르기"}</button></div>
    <div class="set-row"><span>입장 코드</span><b>${codeState}</b><button class="btn sm ghost" data-act="code">${S.code ? "바꾸기" : "넣기"}</button></div>
    <div class="set-row"><span>화면</span>${seg("theme", S.theme, [["auto", "자동"], ["light", "밝게"], ["dark", "어둡게"]])}</div>
    <div class="set-row"><span>글자 크기</span>${seg("big", S.big ? 1 : 0, [[0, "보통"], [1, "크게"]])}</div>
    <div class="set-row"><span>홈 화면에 추가</span><b></b><button class="btn sm ghost" data-act="install">${installable ? "추가하기" : "방법 보기"}</button></div>
    <div class="set-row"><span>최신 일정 받기</span><b></b><button class="btn sm ghost" data-act="reload">새로고침</button></div>
    <p class="ver" data-act="ver">${esc(S.data.camp.name)} · ${esc(S.data.camp.event)}</p>
  </section>`;
  return h;
}
