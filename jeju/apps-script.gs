/**
 * 제주 캠프(가쓸신제) 앱 백엔드 — Google Apps Script
 *
 * ■ 설치 방법 (한 번만)
 *  1) 구글 드라이브에서 새 구글 시트를 만듭니다. (예: "2026 제주 캠프 앱 데이터")
 *  2) 시트 메뉴 [확장 프로그램] → [Apps Script]를 열고, 이 파일 내용을 통째로 붙여넣고 저장합니다.
 *  3) 편집기 위쪽 함수 목록에서 setup 을 선택해 한 번 실행합니다. (권한 허용)
 *     → 공지 / 집합안내 / 학생현황 / 배정변경 / 조편성 탭이 자동으로 만들어집니다.
 *  4) [배포] → [새 배포] → 유형 "웹 앱"
 *       - 실행 계정: 나
 *       - 액세스 권한: 모든 사용자
 *     배포 후 나오는 URL(끝이 /exec)을 복사합니다.
 *  5) 시트 오른쪽 위 [공유] → "링크가 있는 모든 사용자 - 뷰어"로 바꿉니다. (학생 앱이 공지를 읽을 수 있게)
 *  6) jeju/index.html 과 jeju/teacher.html 두 파일에서 아래 두 줄을 바꿉니다.
 *       const SHEET_ID = "여기에_제주캠프_시트_ID";     → 시트 주소 /d/ 와 /edit 사이의 값
 *       const SCRIPT_URL = "여기에_Apps_Script_웹앱_URL"; → 4)에서 복사한 /exec 주소
 *
 * 사진(미션·공지 첨부)은 아래 PHOTO_FOLDER_ID 폴더(2026 가쓸신제 제주 캠프 공유폴더 > 3. 사진·영상)에
 * "미션 사진/미션이름/" 과 "공지 사진/" 하위 폴더로 자동 정리됩니다.
 */

const PHOTO_FOLDER_ID = "1Xph7EeUMYw70kLaGXCQfO1Vx8wjpUlql";
const TZ = "Asia/Seoul";

const SHEETS = {
  notice:   { name: "공지",     header: ["시간", "긴급", "제목", "내용"] },
  assembly: { name: "집합안내", header: ["목표시각", "장소", "등록시각", "위도", "경도"] },
  students: { name: "학생현황", header: ["이름", "최근접속", "체크리스트", "미션", "갱신시각", "필수준비물"] },
  assign:   { name: "배정변경", header: ["종류", "학생", "슬롯"] },
  groupCfg: { name: "조편성",   header: ["설정(JSON)"] }
};

function setup() {
  Object.keys(SHEETS).forEach(function (k) { sheet_(k); });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const blank = ss.getSheetByName("시트1");
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
}

function sheet_(key) {
  const def = SHEETS[key];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(def.name);
  if (!sh) sh = ss.insertSheet(def.name);
  if (sh.getLastRow() === 0) sh.appendRow(def.header);
  // 날짜·숫자 자동 변환을 막아 앱이 쓴 글자 그대로 CSV로 읽히게 합니다.
  sh.getRange(1, 1, sh.getMaxRows(), def.header.length).setNumberFormat("@");
  return sh;
}

function now_() {
  return Utilities.formatDate(new Date(), TZ, "M/d HH:mm");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function clearBody_(sh) {
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
}

function doGet() {
  return json_({ ok: true, app: "jeju-camp" });
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "bad-json" });
  }

  // 사진 업로드는 시간이 걸리고 행 순서와 무관하므로 잠금 없이 처리합니다.
  if (data.action === "missionPhoto") return json_(saveMissionPhoto_(data));
  if (data.action === "noticePhoto") return json_(saveNoticePhoto_(data));

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (data.action) {
      case "attendance":      upsertStudent_(data.name, {}); break;
      case "progress":        upsertStudent_(data.name, data); break;
      case "delete":          deleteNotice_(Number(data.row)); break;
      case "assembly":        setAssembly_(data); break;
      case "assembly_delete": clearBody_(sheet_("assembly")); break;
      case "reset_notices":   clearBody_(sheet_("notice")); clearBody_(sheet_("assembly")); break;
      case "reset_students":  clearBody_(sheet_("students")); break;
      case "saveAssignments": saveAssignments_(data.data || {}); break;
      case "saveGroupConfig": saveGroupConfig_(data.data); break;
      default:
        // action이 없으면 선생님용 앱의 새 공지 등록입니다.
        if (!data.title) return json_({ ok: false, error: "unknown-action" });
        sheet_("notice").appendRow([now_(), data.important ? "TRUE" : "FALSE", String(data.title), String(data.body || "")]);
    }
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function upsertStudent_(name, p) {
  if (!name) return;
  const sh = sheet_("students");
  const values = sh.getDataRange().getValues();
  let row = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === name) { row = i + 1; break; }
  }
  const t = now_();
  if (row === -1) {
    sh.appendRow([name, t, p.checklist || "", p.mission || "", p.checklist ? t : "", p.essential || ""]);
    return;
  }
  sh.getRange(row, 2).setValue(t);
  if (p.checklist !== undefined) {
    sh.getRange(row, 3, 1, 4).setValues([[p.checklist, p.mission || "", t, p.essential || ""]]);
  }
}

function deleteNotice_(row) {
  const sh = sheet_("notice");
  if (row >= 2 && row <= sh.getLastRow()) sh.deleteRow(row);
}

function setAssembly_(d) {
  const sh = sheet_("assembly");
  clearBody_(sh);
  sh.appendRow([String(d.targetTime || ""), String(d.place || ""), now_(),
    d.lat == null ? "" : String(d.lat), d.lng == null ? "" : String(d.lng)]);
}

function saveAssignments_(ov) {
  const sh = sheet_("assign");
  clearBody_(sh);
  const rows = [];
  ["groups", "bus", "rooms"].forEach(function (kind) {
    const m = ov[kind] || {};
    Object.keys(m).forEach(function (name) { rows.push([kind, name, String(m[name])]); });
  });
  if (rows.length) sh.getRange(2, 1, rows.length, 3).setValues(rows);
}

function saveGroupConfig_(cfg) {
  const sh = sheet_("groupCfg");
  sh.getRange(2, 1).setValue(JSON.stringify(cfg || {}));
}

function subFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function saveBlob_(folder, base64, mimeType, fileName) {
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType || "image/jpeg", fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file;
}

function saveMissionPhoto_(d) {
  try {
    const root = DriveApp.getFolderById(PHOTO_FOLDER_ID);
    const folder = subFolder_(subFolder_(root, "미션 사진"), String(d.mission || "기타"));
    const stamp = Utilities.formatDate(new Date(), TZ, "MMdd_HHmmss");
    const file = saveBlob_(folder, d.data, d.mimeType, (d.name || "이름미상") + "_" + stamp + ".jpg");
    return { ok: true, url: file.getUrl() };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function saveNoticePhoto_(d) {
  try {
    const folder = subFolder_(DriveApp.getFolderById(PHOTO_FOLDER_ID), "공지 사진");
    const stamp = Utilities.formatDate(new Date(), TZ, "MMdd_HHmmss");
    const file = saveBlob_(folder, d.data, d.mimeType, "공지_" + stamp + ".jpg");
    // 학생 앱이 이미지로 인식해 바로 보여주는 썸네일 주소
    return { ok: true, url: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1600" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
