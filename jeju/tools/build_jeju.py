"""청산재팬 앱(index.html, teacher.html)을 바탕으로 제주 캠프 앱(jeju/)을 만든다.
사용: python3 -I jeju/tools/build_jeju.py .   (저장소 루트에서)
※ 다시 실행하면 jeju/index.html·teacher.html을 덮어씁니다. 내용 수정은 jeju_data.py에서 한 뒤 실행하거나,
  jeju/*.html을 직접 고쳤다면 이 스크립트는 다시 돌리지 마세요.
모든 치환은 원문이 정확히 기대한 횟수만큼 있어야 진행된다(없으면 중단)."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jeju_data as D

ROOT = sys.argv[1]
OUT = os.path.join(ROOT, "jeju")


def rep(s, old, new, count=1):
    n = s.count(old)
    if n != count:
        raise SystemExit(f"[rep] expected {count}, found {n}: {old[:80]!r}")
    return s.replace(old, new)


def find_value_end(s, i):
    """s[i]가 [ 또는 { 일 때 짝이 맞는 닫는 괄호 다음 위치(문자열 리터럴 무시)."""
    depth, q = 0, None
    while i < len(s):
        c = s[i]
        if q:
            if c == "\\":
                i += 2
                continue
            if c == q:
                q = None
        elif c in "\"'`":
            q = c
        elif c in "[{":
            depth += 1
        elif c in "]}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise SystemExit("unbalanced")


def rep_const(s, name, new_decl):
    key = f"const {name} = "
    if s.count(key) != 1:
        raise SystemExit(f"[rep_const] {name}: found {s.count(key)}")
    a = s.index(key)
    v = a + len(key)
    if s[v] in "[{":
        b = find_value_end(s, v)
    else:
        b = s.index("\n", v) - 1  # 한 줄짜리 값
    if s[b] == ";":
        b += 1
    return s[:a] + new_decl + s[b:]


def cut_between(s, start, end, replacement=""):
    """start 문자열부터 end 문자열 직전까지 잘라낸다(둘 다 1회만 있어야 함)."""
    if s.count(start) != 1:
        raise SystemExit(f"[cut] start found {s.count(start)}: {start[:60]!r}")
    a = s.index(start)
    b = s.index(end, a)
    return s[:a] + replacement + s[b:]


def cut_div(s, opening):
    """opening(<div ...>)으로 시작하는 div 블록 전체를 지운다."""
    if s.count(opening) != 1:
        raise SystemExit(f"[cut_div] found {s.count(opening)}: {opening!r}")
    a = s.index(opening)
    i, depth = a, 0
    for m in re.finditer(r"<div\b|</div>", s[a:]):
        depth += 1 if m.group(0) == "<div" else -1
        if depth == 0:
            b = a + m.end()
            break
    # 줄 앞 공백과 뒤 개행까지 정리
    while a > 0 and s[a - 1] in " ":
        a -= 1
    if s[b:b + 1] == "\n":
        b += 1
    return s[:a] + s[b:]


BACK_BTN = '<button class="back-btn" data-back><svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>더보기</button>'
CHEVRON = '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'

NEW_MORE_ITEMS = f'''<button class="more-item" data-target="roles">
          <span class="more-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/></svg></span>
          <span class="more-text">역할 분담</span>
          {CHEVRON}
        </button>
        <button class="more-item" data-target="budget">
          <span class="more-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 6v.01M18 6v.01M6 18v.01M18 18v.01"/></svg></span>
          <span class="more-text">예산 집행 계획</span>
          {CHEVRON}
        </button>
        '''

NEW_SECTIONS = f'''<section id="panel-roles" class="panel sub-panel">
      {BACK_BTN}
      <h2 class="sub-title">역할 분담</h2>
      <p class="roles-question">관통 질문 · <b>제주는 무엇으로 먹고사는가</b><br>바다, 귤, 관광, 그리고 4.3</p>
      <div id="roleList"></div>
    </section>

    <section id="panel-budget" class="panel sub-panel">
      {BACK_BTN}
      <h2 class="sub-title">예산 집행 계획</h2>
      <div class="budget-total-card">
        <p class="bt-label">총 예산</p>
        <p class="bt-amount" id="budgetTotal">-</p>
        <p class="bt-note">결제는 지도교사 체크카드로만 · 영수증은 예산 담당(김하영)에게 바로 전달</p>
      </div>
      <div class="day-pills" id="budgetDayPills"></div>
      <ul class="budget-list" id="budgetList"></ul>
    </section>

    '''

EXTRA_CSS = '''
  /* ===== 역할 분담 / 예산 집행 계획 (제주 캠프) ===== */
  .roles-question{
    margin:0 0 14px;padding:12px 14px;border-radius:14px;
    background:var(--paper-dim);color:var(--ink-soft);font-size:13px;line-height:1.6;
  }
  .roles-question b{color:var(--ink);}
  .role-card{
    background:#fff;border-radius:16px;padding:14px 16px;margin-bottom:10px;
    box-shadow:0 1px 0 rgba(21,34,56,.06);
  }
  .role-card.mine{outline:2px solid var(--coral);}
  .role-card .role-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 6px;}
  .role-card .role-name{font-weight:800;color:var(--ink);font-size:15px;margin:0;}
  .role-card .role-tag{
    font-size:12px;font-weight:700;color:#fff;background:var(--navy);
    padding:3px 10px;border-radius:999px;white-space:nowrap;
  }
  .role-card .role-desc{margin:0;color:var(--ink-soft);font-size:13px;line-height:1.55;}
  .budget-total-card{
    background:var(--navy);color:#fff;border-radius:18px;padding:16px 18px;margin-bottom:12px;
  }
  .budget-total-card .bt-label{margin:0;font-size:12px;opacity:.75;}
  .budget-total-card .bt-amount{margin:2px 0 6px;font-size:26px;font-weight:900;}
  .budget-total-card .bt-note{margin:0;font-size:12px;opacity:.8;line-height:1.5;}
  .budget-list{list-style:none;margin:10px 0 0;padding:0;}
  .budget-list li{
    display:flex;justify-content:space-between;gap:12px;align-items:flex-start;
    background:#fff;border-radius:14px;padding:12px 14px;margin-bottom:8px;
  }
  .budget-list .bl-item{margin:0;font-weight:700;color:var(--ink);font-size:14px;line-height:1.4;}
  .budget-list .bl-calc{margin:2px 0 0;color:var(--ink-soft);font-size:12px;}
  .budget-list .bl-amount{margin:0;font-weight:800;color:var(--ink);font-size:14px;white-space:nowrap;}
  .budget-list li.bl-subtotal{background:var(--paper-dim);}
  .budget-list li.bl-subtotal .bl-item,.budget-list li.bl-subtotal .bl-amount{color:var(--coral-deep);}
'''

EXTRA_JS = '''/* ---- 역할 분담 ---- */
document.getElementById("roleList").innerHTML = ROLES.map(r => `
  <div class="role-card${typeof studentName === "string" && r.name === studentName ? " mine" : ""}">
    <div class="role-head">
      <p class="role-name">${r.name}</p>
      <span class="role-tag">${r.role}</span>
    </div>
    <p class="role-desc">${r.desc}</p>
  </div>`).join("");

/* ---- 예산 집행 계획 (붙임 2 예산 집행 계획서) ---- */
const won = n => n.toLocaleString("ko-KR") + "원";
document.getElementById("budgetTotal").textContent = won(BUDGET.reduce((sum, b) => sum + b.amount, 0));
let currentBudgetDay = "all";
const budgetDayPills = document.getElementById("budgetDayPills");
budgetDayPills.innerHTML = [["all", "전체"], ...dayKeys.map(k => [k, "Day " + k])].map(([k, label]) =>
  `<button class="pill${k === currentBudgetDay ? " active" : ""}" data-day="${k}">${label}</button>`
).join("");
function renderBudget(){
  const days = currentBudgetDay === "all" ? dayKeys : [currentBudgetDay];
  document.getElementById("budgetList").innerHTML = days.map(k => {
    const rows = BUDGET.filter(b => String(b.day) === String(k));
    const subtotal = rows.reduce((sum, b) => sum + b.amount, 0);
    return rows.map(b => `
      <li>
        <span><p class="bl-item">${b.item}</p><p class="bl-calc">${b.calc}</p></span>
        <p class="bl-amount">${won(b.amount)}</p>
      </li>`).join("") + `
      <li class="bl-subtotal">
        <span><p class="bl-item">Day ${k} 소계 · ${SCHEDULE[k].label.split(" · ")[0]}</p></span>
        <p class="bl-amount">${won(subtotal)}</p>
      </li>`;
  }).join("");
}
budgetDayPills.addEventListener("click", (e) => {
  const btn = e.target.closest(".pill");
  if(!btn) return;
  budgetDayPills.querySelectorAll(".pill").forEach(p => p.classList.toggle("active", p === btn));
  currentBudgetDay = btn.dataset.day;
  renderBudget();
});
renderBudget();

'''

SHEET_NOTE = '''// ▼ 제주 캠프 전용 구글시트·Apps Script 주소 (청산재팬과 데이터가 섞이지 않도록 별도로 만듭니다)
//   jeju/apps-script.gs 맨 위 설치 안내대로 시트를 만들고 배포한 뒤, 아래 두 값만 바꾸면 됩니다.
//   SHEET_ID: 시트 주소 https://docs.google.com/spreadsheets/d/<여기>/edit 의 <여기> 부분
const SHEET_ID = "여기에_제주캠프_시트_ID";
//   (아직 비어 있으면 빈 CSV를 돌려줘서, 시트 없이도 화면이 정상적으로 뜹니다)
const sheetCsv = tab => SHEET_ID.indexOf("여기에") === 0 ? "data:text/csv," :
  "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(tab);
'''

SCRIPT_URL_DECL = 'const SCRIPT_URL = "여기에_Apps_Script_웹앱_URL";'


def common(s):
    # ---- 제목·머리말
    s = rep(s, "안전하고 즐거운 오사카 수학여행", "가쓸신제 제주도 캠프")
    s = rep(s, '<span class="trip-dates">10.27 ~ 10.30</span>', '<span class="trip-dates">11.10 ~ 11.13</span>')
    s = rep(s, '<p class="weather-title">오사카 날씨</p>', '<p class="weather-title">제주 날씨</p>')
    s = rep(s, "/* ---- 오사카 날씨", "/* ---- 제주 날씨")
    s = rep(s, "/* ===== 오사카 날씨", "/* ===== 제주 날씨")
    s = rep(s, "latitude=34.6937&longitude=135.5023", "latitude=33.4996&longitude=126.5312")
    s = rep(s, "timezone=Asia%2FTokyo", "timezone=Asia%2FSeoul")

    # ---- localStorage 키: 같은 도메인(github.io)의 청산재팬과 겹치지 않게 접두어 변경
    s = s.replace('"suhak_', '"jeju_').replace('"teacher_', '"jeju_teacher_')

    # ---- 엔화 계산기 제거 (국내 캠프)
    s = cut_div(s, '<div class="notice-form-overlay" id="exchangeOverlay">')
    s = re.sub(r'\n\s*<button type="button" class="exchange-btn-standalone" id="openExchangeBtn">.*?</button>', "", s, count=1, flags=re.S)
    s = cut_between(s, "/* ---- 환율 계산기", "/* ---- 공지사항 렌더")

    # ---- 숙소 지급 품목 카드 → 팀 공용 준비물 카드
    s = re.sub(r'<p class="amenity-title">숙소 지급 품목 \(따로 안 챙겨도 돼요\)</p>\s*<div class="amenity-tags">.*?</div>',
               '''<p class="amenity-title">팀 공용으로 준비돼요 (따로 안 챙겨도 돼요)</p>
          <div class="amenity-tags">
            <span class="amenity-tag">핫팩·보온용품</span>
            <span class="amenity-tag">구급약·멀미약</span>
            <span class="amenity-tag">탐구 기록용품</span>
            <span class="amenity-tag">촬영 소품·고프로</span>
            <span class="amenity-tag">간식</span>
          </div>''', s, count=1, flags=re.S)

    # ---- 시트/스크립트 주소
    s = rep_const(s, "NOTICES_SHEET_CSV_URL", SHEET_NOTE + 'const NOTICES_SHEET_CSV_URL = sheetCsv("공지");')
    s = rep_const(s, "ASSEMBLY_SHEET_CSV_URL", 'const ASSEMBLY_SHEET_CSV_URL = sheetCsv("집합안내");')
    s = rep_const(s, "ASSIGN_SHEET_CSV_URL", 'const ASSIGN_SHEET_CSV_URL = sheetCsv("배정변경");')
    s = rep_const(s, "GROUP_CFG_SHEET_CSV_URL", 'const GROUP_CFG_SHEET_CSV_URL = sheetCsv("조편성");')
    s = rep_const(s, "SCRIPT_URL", SCRIPT_URL_DECL)

    # ---- 데이터
    s = rep_const(s, "NOTICES", '''const NOTICES = [
  { time:"11/3", important:false, title:"제주 캠프 앱에 오신 걸 환영해요", body:"일정·준비물·비상 연락망·사진 미션을 여기서 확인하세요. 새 공지가 올라오면 이 자리에 표시돼요. (사전 안전교육: 11. 3.(화) 16:10 도서실)" }
];''')
    s = rep_const(s, "DEPART_DATE", D.DEPART)
    s = rep_const(s, "RETURN_DATE", D.RETURN)
    s = rep(s, "// ※ 가정통신문에 분 단위 시간이 없는 구간(고베 관람, 교토 이동 등)은 앞뒤 시간을 참고해\n//   추정해서 채워뒀습니다. 정확한 시간이 있으면 알려주세요.\n",
            "// ※ 「제주! 내가 계획하는 캠프」 세부 일정표(수정) 기준. 좌표가 없는 곳(숙소·카약·돌고래 투어 등)은\n//   길찾기에서 장소 이름으로 검색됩니다.\n")
    s = rep_const(s, "SCHEDULE", D.SCHEDULE)
    s = rep_const(s, "SCHEDULE_NOTES", D.SCHEDULE_NOTES)
    s = rep_const(s, "CHECKLIST", D.CHECKLIST)
    s = rep_const(s, "ITEM_GUIDES", D.ITEM_GUIDES)
    s = rep_const(s, "CONTACTS", D.CONTACTS)
    s = rep_const(s, "GROUPS", D.GROUPS + "\n\n" + D.ROLES + "\n\n" + D.BUDGET)
    s = rep_const(s, "MISSIONS", D.MISSIONS)
    s = rep_const(s, "FAQS", D.FAQS)
    s = rep_const(s, "EMERGENCY_FAQS", D.EMERGENCY_FAQS)
    s = rep_const(s, "MANNER_FAQS", D.MANNER_FAQS)
    s = rep_const(s, "PHRASES", D.PHRASES)
    s = rep_const(s, "DEFAULT_CATEGORIES",
                  'const DEFAULT_CATEGORIES = ["1일차 도두봉·박물관", "2일차 수월봉·차귀도", "2일차 카약·동물원", "3일차 돌고래 투어", "3일차 박물관·감귤농장", "4일차 4·3평화공원·시장"];')

    # ---- 긴급 SOS: 지도교사 + 제주분원 + 국내 긴급번호
    s = rep_const(s, "SOS_CONTACTS", '''const SOS_CONTACTS = [
  ["경찰 (범죄·사고·실종 신고)", "112", "112"],
  ["소방·구급 (화재·응급환자)", "119", "119"]
];''')
    s = s.replace("// 아래 3개는 실제 공식 번호(일본 경찰·소방, 외교부 영사콜센터)라 그대로 두면 됩니다.\n",
            "// 아래는 국내 공식 긴급번호라 그대로 두면 됩니다.\n")
    s = s.replace("// 담임 선생님(CONTACTS[0]) + 여행사 인솔자(CONTACTS[2]) + 공식 긴급번호\n", "// 지도교사(CONTACTS[0]) + 제주분원(CONTACTS[1]) + 공식 긴급번호\n")
    s = rep(s, "const sosList = [CONTACTS[0], CONTACTS[2], ...SOS_CONTACTS]", "const sosList = [CONTACTS[0], CONTACTS[1], ...SOS_CONTACTS]")

    # ---- 제주어 카드
    s = s.replace("서바이벌 일본어 회화", "서바이벌 제주어")

    # ---- 지도 마커 분류: 호텔 → 숙소, 버스 → 렌터카
    s = rep(s, 'const CATEGORY_EMOJI = { school: "🏫", airport: "✈️", hotel: "🏨", transit: "🚌", meal: "🍴" };',
            'const CATEGORY_EMOJI = { school: "🏫", airport: "✈️", hotel: "🏨", transit: "🚐", meal: "🍴" };')
    s = rep(s, '  if(place.includes("호텔")) return "hotel";',
            '  if(place.includes("숙소") || place.includes("제주분원")) return "hotel";')
    s = rep(s, '  if(name.includes("이동")) return "transit";',
            '  if(name.includes("이동") || name.endsWith("역")) return "transit";')

    # ---- 렌터카 좌석표 (스타리아 9인승 한 대)
    s = re.sub(r"function getBusRoster\(\)\{.*?\n\}\n",
               '''function getBusRoster(){
  const cars = { "스타리아": [] };
  ROSTER.forEach(s => { cars["스타리아"].push({ name:s.name, seat:(cars["스타리아"].length + 1) + "번" }); });
  return cars;
}
''', s, count=1, flags=re.S)

    # ---- 역할 분담·예산 패널
    s = rep(s, '<section id="panel-faq" class="panel sub-panel">', NEW_SECTIONS + '<section id="panel-faq" class="panel sub-panel">')
    s = rep(s, "/* ---- 탭 & 서브패널 전환 ---- */", EXTRA_JS + "/* ---- 탭 & 서브패널 전환 ---- */")
    s = rep(s, "</style>", EXTRA_CSS + "</style>")

    s = s.replace("(예: 오사카성)", "(예: 동문재래시장)")
    s = rep(s, "가장 먼저 담임 선생님 또는 인솔 선생님께 바로 전화하세요.", "가장 먼저 지도교사(홍기성 선생님)께 바로 전화하세요.")
    s = s.replace('(currentBus || "이 버스")', '(currentBus || "렌터카")')

    return s


def student(s):
    s = rep(s, "<title>2026 청산고등학교 2학년 수학여행</title>", "<title>제주 캠프 가쓸신제</title>")
    s = rep(s, '<meta name="apple-mobile-web-app-title" content="수학여행">', '<meta name="apple-mobile-web-app-title" content="제주 캠프">')
    s = rep(s, "../icon-192.png", "../icon-192.png") if "../icon-192.png" in s else s
    s = rep(s, '<link rel="apple-touch-icon" href="icon-192.png">', '<link rel="apple-touch-icon" href="../icon-192.png">')
    s = rep_const(s, "ROSTER", D.ROSTER_STUDENT)
    s = rep(s, "// 조 편성표 (조 번호, 조장, 조원 전체) — 선생님용 화면(teacher.html)과 같은 명단입니다.\n// 버스는 학년별(1학년 1호차·2학년 2호차), 숙소는 2인 1실(여학생 마지막 3명만 3인실)로\n// 별도 배정되며, 그 내용은 선생님용 화면의 \"인원체크 및 조편성표\"에서 확인할 수 있어요.\n",
            "// 활동 조 편성 (2인 1조 원칙 · 숙소 방 기준 3인 1조) — 선생님용 화면에서 활동별로 바꿀 수 있어요.\n")
    s = rep_const(s, "ROOMS", "// 숙소 방 배정 (3박 모두 남학생 1실·여학생 1실, 호수는 체크인 후 공지)\n" + D.ROOMS)
    s = rep(s, '<div class="rc-head"><span class="rc-no">${room.no}호</span></div>',
            '<div class="rc-head"><span class="rc-no">${room.no}번 방</span></div>')
    s = rep(s, '<span class="more-text">버스좌석표</span>', '<span class="more-text">렌터카 좌석표</span>')
    s = rep(s, '<h2 class="sub-title">버스좌석표</h2>', '<h2 class="sub-title">렌터카 좌석표</h2>')
    s = rep(s, 'let currentBusName = "1호차";', 'let currentBusName = "스타리아";')
    s = rep(s, 'if(studentGrade === "1학년") currentBusName = "1호차";\nelse if(studentGrade === "2학년") currentBusName = "2호차";\n', "")
    s = rep(s, '    if(studentGrade === "1학년") currentBusName = "1호차";\n    else if(studentGrade === "2학년") currentBusName = "2호차";\n', "")
    s = rep(s, "// 버스는 1학년 전원 1호차, 2학년 전원 2호차. 학번 순서대로 좌석 번호를 매겨요.\n",
            "// 렌터카(스타리아 9인승) 한 대로 이동해요. 운전은 지도교사, 학생은 학번 순서대로 좌석 번호를 매겨요.\n")
    s = rep(s, '<button class="more-item" data-target="groups">', NEW_MORE_ITEMS + '<button class="more-item" data-target="groups">')

    # 푸시 알림(OneSignal)은 청산재팬 앱에 묶여 있어 제주 앱에서는 쓰지 않음 (6명 소규모 → 카톡 공지 병행)
    s = rep(s, '<script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>\n', "")
    s = cut_div(s, '<div class="push-enable-banner" id="pushEnableBanner">')
    a = s.index("/* ===== 공지 푸시 알림 (OneSignal) =====")
    b = s.index("</script>\n</body>", a)
    s = s[:a] + s[b:]
    return s


def teacher(s):
    s = rep(s, "<title>2026 청산고등학교 2학년 수학여행 (선생님용)</title>", "<title>제주 캠프 관리</title>")
    s = rep(s, '<meta name="apple-mobile-web-app-title" content="수학여행 관리">', '<meta name="apple-mobile-web-app-title" content="제주 캠프 관리">')
    s = rep(s, '<link rel="apple-touch-icon" href="icon-teacher-192.png">', '<link rel="apple-touch-icon" href="../icon-teacher-192.png">')
    s = rep_const(s, "STUDENT_SHEET_CSV_URL", 'const STUDENT_SHEET_CSV_URL = sheetCsv("학생현황");')
    s = rep_const(s, "ROSTER", D.ROSTER_TEACHER)
    s = rep(s, "// 조 편성표 (조 번호, 조장, 조원 전체) — 버스·숙소와 별개로 운영하는 모둠(식사·활동용)입니다.\n",
            "// 활동 조 편성 (2인 1조 원칙 · 숙소 방 기준 3인 1조)\n")
    s = re.sub(r"// 숙소 편성표 — \"방배정\.xlsx\".*?\n(?=const ROOMS)", "// 숙소 방 배정 (3박 모두 남학생 1실·여학생 1실, 호수는 체크인 후 확정)\n", s, count=1, flags=re.S)
    s = rep_const(s, "ROOMS", D.ROOMS)
    s = rep(s, '<span class="rc-no">${r.no}호실</span>', '<span class="rc-no">${r.no}번 방</span>')
    s = rep(s, "// 버스 편성표: 1학년 전원 1호차, 2학년 전원 2호차. 학번(학년→번호) 순서대로\n// 좌석 번호를 매깁니다. 학년이 바뀌면 이 함수만 보면 됩니다 — 조 편성과는 무관합니다.\n",
            "// 렌터카(스타리아 9인승) 좌석표: 학생은 학번 순서대로 좌석 번호를 매깁니다. (운전: 지도교사)\n")
    s = rep(s, '<h2 class="sub-title">버스</h2>', '<h2 class="sub-title">렌터카</h2>')
    s = re.sub(r'(<button class="more-item" data-target="bus-roster">.*?<span class="more-text">)버스(</span>)', r"\1렌터카\2", s, count=1, flags=re.S)
    # 명렬표·준비현황: 참가 학생 모두 2학년 1반
    s = rep(s, '''        <button class="pill active" data-grade="1학년">1학년</button>
        <button class="pill" data-grade="2학년">2학년</button>''',
            '''        <button class="pill active" data-grade="2학년">2학년 1반</button>''')
    s = rep(s, 'let currentNameListGrade = "1학년";', 'let currentNameListGrade = "2학년";')
    s = re.sub(r'\n\s*<button class="more-item" data-grade="1">.*?</button>', "", s, count=1, flags=re.S)
    s = rep(s, '<p class="students-note">학년을 선택하면 학생별 준비물·미션 체크 현황을 볼 수 있어요.</p>',
            '<p class="students-note">참가 학생 6명의 준비물·미션 체크 현황을 볼 수 있어요.</p>')
    s = rep(s, 'href="https://drive.google.com/drive/folders/1SjVAiSP0UobvNccVGX1pCyUjJL4P6s_Q"',
            'href="https://drive.google.com/drive/folders/1Xph7EeUMYw70kLaGXCQfO1Vx8wjpUlql"')
    s = rep(s, '<button class="more-item" data-target="missions">', NEW_MORE_ITEMS + '<button class="more-item" data-target="missions">')
    return s


def leftover_check(s):
    # 남은 일본 관련 문구가 없는지 확인
    for bad in ["오사카", "엔화", "USJ", "간사이", "도톤보리", "티웨이", "380명", "1F7vtEinJ", "AKfycbyq2z"]:
        if bad in s:
            lines = [l.strip()[:90] for l in s.splitlines() if bad in l]
            raise SystemExit(f"leftover {bad!r}: {lines[:4]}")


def main():
    os.makedirs(OUT, exist_ok=True)
    for src, fn in [("index.html", student), ("teacher.html", teacher)]:
        s = open(os.path.join(ROOT, src), encoding="utf-8").read()
        s = fn(common(s))
        leftover_check(s)
        s = s.replace('<link rel="manifest" href="manifest.json">', '<link rel="manifest" href="manifest.json">')
        open(os.path.join(OUT, src), "w", encoding="utf-8").write(s)
        print("wrote", src, len(s))


main()
