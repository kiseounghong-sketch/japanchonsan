// 선생님 화면: 입장 코드 · 공지 · 인원 점검 · 모아 보기 · 공유 설정
// 선생님 계정(teacher@japanchonsan.app)으로 로그인해야 쓸 수 있습니다(Firebase 규칙이 막아 줌).
import { S, roster } from "./state.js";
import { live } from "./live.js";
import * as T from "./time.js";
import { esc, icon } from "./ui.js";
import { compute } from "./plan.js";

export function randomCode() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "JEJU";
  const buf = new Uint32Array(4);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  buf.forEach((n) => { s += A[n % A.length]; });
  return s;
}

export function shareLink(code) {
  const u = new URL("./", location.href);
  u.search = "";
  u.hash = "";
  return `${u.href}?c=${encodeURIComponent(code)}`;
}

export function kakaoText(code) {
  return `[가쓸신제 제주 캠프 앱]
아래 링크를 눌러 열고, 처음 한 번 내 이름을 골라 주세요.
${shareLink(code)}

· 카카오톡 안에서 열리면 오른쪽 아래(또는 위) ⋮ → '다른 브라우저로 열기'
· 홈 화면에 추가해 두면 비행기·배에서도 일정이 보여요
· 입장 코드: ${code}`;
}

export function viewTeacher() {
  if (!live.teacher) {
    return `<section class="card">
      <h2>선생님 로그인</h2>
      <p class="muted">일본 수학여행 앱과 같은 선생님 계정이에요. 이 기기에서 한 번만 로그인하면 돼요.</p>
      <form class="stack" data-form="t-login">
        <input type="password" name="pw" autocomplete="current-password" placeholder="선생님 비밀번호" required>
        <button class="btn" type="submit">로그인</button>
        <p class="err" id="t-login-err" role="alert"></p>
      </form>
      <button class="linkbtn" data-act="t-hide">선생님 탭 숨기기</button>
    </section>`;
  }
  let h = codeCard();
  if (!S.code) return h + logoutRow();
  h += `<section class="card" id="t-notice-card">
    <h2>${icon("bell")}공지 보내기</h2>
    <form class="stack" data-form="t-notice">
      <textarea name="text" rows="3" maxlength="1000" placeholder="예) 비 때문에 수월봉 대신 그리스신화박물관 먼저 가요. 11:00 주차장 집결!" required></textarea>
      <label class="inline"><input type="checkbox" name="imp"> 중요 공지로 보내기</label>
      <button class="btn" type="submit">보내기</button>
    </form>
    <div id="t-notices">${noticesList()}</div>
  </section>`;
  h += `<section class="card" id="t-gather-card"><h2>${icon("flag")}집결·인원 점검</h2><div id="t-gather">${gatherPanel()}</div></section>`;
  h += `<section class="card" id="t-collect-card">
    <h2>${icon("record")}모아 보기 <small class="muted">결과보고서용</small></h2>
    <div class="seg">${[["answers", "미션 답"], ["reflections", "소감"]].map(([k, l]) => `<button class="${S.ui.tseg === k ? "on" : ""}" data-act="t-seg" data-v="${k}">${l}</button>`).join("")}</div>
    <div id="t-collect">${collectView()}</div>
    <button class="btn ghost" data-act="t-copy">${icon("copy")}지금 보이는 내용 전체 복사</button>
  </section>`;
  h += metaCard();
  h += logoutRow();
  return h;
}

function logoutRow() {
  return `<div class="t-foot"><button class="btn sm ghost" data-act="t-logout">로그아웃</button><button class="btn sm ghost" data-act="t-hide">선생님 탭 숨기기</button></div>`;
}

function codeCard() {
  if (!S.code) {
    return `<section class="card">
      <h2>입장 코드 만들기</h2>
      <p class="muted">코드를 아는 사람만 공지·인원 점검·모아 보기를 함께 써요. 링크에 코드가 들어가므로 단톡방에만 올려 주세요.</p>
      <form class="stack" data-form="t-code">
        <input name="code" value="${randomCode()}" maxlength="20" autocapitalize="characters" spellcheck="false" pattern="[A-Za-z0-9]{6,20}" required>
        <button class="btn" type="submit">이 코드로 만들기</button>
        <p class="err" id="t-code-err" role="alert"></p>
      </form>
      <button class="linkbtn" data-act="t-codes">이미 만든 코드 불러오기</button>
      <div id="t-codes"></div>
    </section>`;
  }
  const link = shareLink(S.code);
  return `<section class="card">
    <h2>입장 코드 <span class="count">${esc(S.code)}</span></h2>
    <p class="muted">상태: ${live.status === "online" ? "연결됨" : live.status === "badcode" ? "코드가 서버에 없어요 (다시 만들어 주세요)" : "연결 대기"}</p>
    <p class="mono">${esc(link)}</p>
    <div class="btns">
      <button class="btn sm" data-act="t-copy-link">${icon("copy")}링크 복사</button>
      <button class="btn sm" data-act="t-copy-kakao">${icon("copy")}단톡방 안내문 복사</button>
      ${live.status === "badcode" ? `<button class="btn sm tang" data-act="t-recreate">이 코드 다시 만들기</button>` : ""}
    </div>
  </section>`;
}

function metaCard() {
  const m = live.meta || {};
  return `<section class="card">
    <h2>${icon("folder")}공유 설정</h2>
    <p class="muted">입장 코드가 있는 학생에게만 보여요 (공개 주소에는 안 올라가요).</p>
    <form class="stack" data-form="t-meta">
      <label>사진 올릴 구글 드라이브 폴더 링크<input name="driveUrl" type="url" inputmode="url" placeholder="https://drive.google.com/..." value="${esc(m.driveUrl || "")}"></label>
      <label>선생님 연락처 (비상 연락에 표시)<input name="teacherTel" type="tel" inputmode="tel" placeholder="010-0000-0000" value="${esc(m.teacherTel || "")}"></label>
      <button class="btn" type="submit">저장</button>
    </form>
  </section>`;
}

export function noticesList() {
  const list = live.notices || [];
  if (!list.length) return `<p class="muted">보낸 공지가 없어요.</p>`;
  return `<ul class="t-list">${list.map((n) => `<li>
    <div><span class="muted">${n.ts ? esc(T.todayLabel(n.ts) + " " + T.hm(n.ts)) : ""}</span>${n.level === "important" ? ' <span class="chip st-imp">중요</span>' : ""}<p>${esc(n.text)}</p></div>
    <button class="btn sm ghost" data-act="t-del-notice" data-id="${esc(n.id)}">삭제</button>
  </li>`).join("")}</ul>`;
}

export function gatherPanel() {
  const g = live.gather;
  if (!g || !g.id) {
    const t = compute(T.now());
    const next = t.gather || S.data.rows.find((r) => r.gather) || {};
    const date = next.date || T.parts(T.now()).date;
    return `<p class="muted">시작하면 학생 화면 맨 위에 '도착했어요' 버튼이 떠요. 일정의 다음 집결로 미리 채워 뒀어요.</p>
    <form class="stack" data-form="t-gather">
      <div class="two">
        <label>날짜<input name="date" type="date" value="${esc(date)}" required></label>
        <label>시각<input name="time" type="time" value="${esc(next.time || "")}" required></label>
      </div>
      <label>장소<input name="place" maxlength="60" value="${esc(next.gatherAt || "")}" required></label>
      <label>메모 (선택)<input name="label" maxlength="80" value="${esc(next.title || "")}"></label>
      <button class="btn tang" type="submit">${icon("flag")}인원 점검 시작</button>
    </form>`;
  }
  const names = roster();
  const arrived = names.filter((n) => live.arrivals[n]);
  return `<div class="rc-head">
      <b>${esc(g.time)} ${esc(g.place)}</b>${g.label ? `<span class="muted">${esc(g.label)}</span>` : ""}
      <p class="rc-count"><b>${arrived.length}</b> / ${names.length}명 도착</p>
    </div>
    <div class="people">${names.map((n) => {
      const t = live.arrivals[n];
      return `<button class="person ${t ? "in" : ""}" data-act="t-mark" data-name="${esc(n)}" aria-pressed="${t ? "true" : "false"}">
        <b>${esc(n)}</b><small>${t ? `${icon("check")}도착 ${esc(T.hm(t))}` : "아직"}</small>
      </button>`;
    }).join("")}</div>
    <p class="hint">이름을 누르면 선생님이 직접 도착/취소할 수 있어요.</p>
    <button class="btn ghost" data-act="t-end-gather">점검 끝내기</button>`;
}

function people() {
  return roster().filter((n) => n !== "선생님");
}

export function collectView() {
  const all = live.all;
  if (!all) return `<p class="muted">불러오는 중…</p>`;
  const P = people();
  const k = S.ui.tseg;
  if (k === "reflections") {
    return S.data.schedule.map((d) => `<div class="col">
      <h3>${d.day}일차 <small class="muted">${esc(d.label)}</small></h3>
      ${P.map((n) => answerLine(n, ((all.reflections || {})[n] || {})["d" + d.day])).join("")}
    </div>`).join("");
  }
  if (k === "shots") {
    const rows = [];
    S.data.shots.list.forEach((s) => {
      const lines = P.map((n) => {
        const v = ((all.shots || {})[n] || {})[s.id];
        return v && (v.n || v.p) ? answerLine(n, [v.p ? "사진✓" : "", v.n || ""].filter(Boolean).join(" ")) : "";
      }).join("");
      if (lines) rows.push(`<div class="col"><h3>${s.day}일차 ${esc(s.label || s.time)} ${esc(s.place)}</h3>${lines}</div>`);
    });
    return rows.join("") || `<p class="muted">아직 사진 기록이 없어요.</p>`;
  }
  return S.data.missions.list.map((m) => `<div class="col">
    <h3>${m.day}일차 · ${esc(m.title)}</h3><p class="muted">${esc(m.q)}</p>
    ${P.map((n) => answerLine(n, ((all.answers || {})[n] || {})[m.id])).join("")}
  </div>`).join("");
}

function answerLine(name, text) {
  return `<p class="ans ${text ? "" : "empty"}"><b>${esc(name)}</b><span>${text ? esc(text) : "—"}</span></p>`;
}

export function collectText() {
  const all = live.all || {};
  const P = people();
  const k = S.ui.tseg;
  const out = [];
  if (k === "reflections") {
    S.data.schedule.forEach((d) => {
      out.push(`■ ${d.day}일차 ${d.label} 한 줄 소감`);
      P.forEach((n) => { const v = ((all.reflections || {})[n] || {})["d" + d.day]; if (v) out.push(`- ${n}: ${v}`); });
      out.push("");
    });
  } else if (k === "shots") {
    S.data.shots.list.forEach((s) => {
      const lines = [];
      P.forEach((n) => { const v = ((all.shots || {})[n] || {})[s.id]; if (v && v.n) lines.push(`- ${n}: ${v.n}`); });
      if (lines.length) out.push(`■ ${s.day}일차 ${s.label || s.time} ${s.place}`, ...lines, "");
    });
  } else {
    S.data.missions.list.forEach((m) => {
      out.push(`■ ${m.day}일차 ${m.title} — ${m.q}`);
      P.forEach((n) => { const v = ((all.answers || {})[n] || {})[m.id]; if (v) out.push(`- ${n}: ${v}`); });
      out.push("");
    });
  }
  return out.join("\n").trim();
}
