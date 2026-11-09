# AGENTS.md — 코딩 에이전트(Codex 등) 작업 안내

이 저장소에는 학교 행사용 웹앱 두 개가 있습니다. **요청이 없으면 `jeju/`(제주 캠프 앱)만 수정**하세요.

| 위치 | 앱 | 비고 |
|---|---|---|
| `/` (index.html, teacher.html, sw.js 등) | 2026 청산고 일본 수학여행 (끝난 행사) | 요청 없으면 건드리지 않기 |
| `/jeju/` | **가쓸신제** — 제주 캠프 학생용 앱 (2026. 11. 10.~13.) | 주 작업 대상 |

- 실제 주소: https://chongsangojapan.web.app/jeju/ (Firebase Hosting, 프로젝트 `chongsangojapan`)
- 사용자: 인솔교사 1명 + 학생 6명, 휴대폰(카카오톡 단톡방 링크로 접속). 화면 글은 모두 한국어.
- **이 저장소는 공개(public)입니다.** 비밀번호·API 비밀값·학생 개인정보·드라이브 폴더 번호를 평문으로 넣지 마세요.

---

## 1. 작업·배포 흐름

1. 작업 브랜치에서 수정 → 커밋 → PR → **main에 합치면** GitHub Actions(`.github/workflows/firebase-hosting.yml`)가 자동으로
   - 호스팅 배포(사이트 파일) **와**
   - 데이터베이스 보안 규칙 배포(`database.rules.json`)를 합니다. 보통 30~60초.
2. 배포 확인: `curl -s https://chongsangojapan.web.app/jeju/sw.js | grep gsj-v` 로 새 캐시 이름이 보이는지.
3. 워크플로의 `firebaseToolsVersion: 15.34.0` 고정은 **지우지 마세요.** firebase-tools 15.35.0부터 배포 계정에 없는 권한(serviceusage.services.get)을 확인해서 호스팅 배포가 403으로 실패합니다. (Google Cloud IAM에서 서비스 계정에 'Service Usage 소비자' 역할을 주면 해제 가능)
4. `.claude/` 폴더는 다른 도구(Claude Code)용 설정이니 그대로 두세요.

## 2. 기술 구성

- **빌드 없음.** 순수 HTML/CSS/JS(ES 모듈). npm 의존성 없음. 파일을 고치면 그대로 배포됩니다.
- Firebase JS SDK 10.12.2 모듈판을 `https://www.gstatic.com/firebasejs/10.12.2/…`에서 **필요할 때만** 동적 import (입장 코드가 있을 때).
- PWA: `jeju/manifest.webmanifest`, `jeju/sw.js`(scope `/jeju/`). 한 번 열면 오프라인에서도 일정·안전 정보가 보여야 합니다.
- 시간 계산은 **기기 시간대와 무관하게 한국 시간(UTC+9)** (`jeju/js/time.js`의 `kst`, `parts`).

### 파일 구조 (`jeju/`)

| 파일 | 역할 |
|---|---|
| `index.html` | 껍데기(머리줄·main·아래 탭·시트·토스트). 테마/큰글씨를 그리기 전에 적용 |
| `app.css` | 전체 디자인 (아래 6장) |
| `js/app.js` | 시작점: 데이터 로드, 탭 전환, 클릭/입력 이벤트(`data-act`), 공유(동기화), 시트, 서비스워커 등록, 머리줄 |
| `js/views.js` | 학생 화면 4개: 오늘 / 일정 / 미션·기록 / 안내 |
| `js/teacher.js` | 선생님 탭: 입장 코드, 공지, 집결·인원 점검, 모아 보기, 공유 설정 |
| `js/plan.js` | 일정 계산: `prepare`(시각 절대값), `compute(now)`(지금·다음·집결·하루 시작/끝), `activeGather`, `shotsFor`, `missionForRow` |
| `js/live.js` | Firebase 실시간 DB 연결(공지·집결·도착·모아 보기·로그인) |
| `js/folders.js` | 장소별 드라이브 사진 폴더(암호화 풀기) + 업로드 완료 장수 확인 |
| `js/state.js` | 전역 상태 `S` + localStorage 저장 |
| `js/store.js` | localStorage 래퍼(`gsj.` 접두사, 항상 try/catch) |
| `js/time.js` | 한국 시간 도구, `?now=` 미리보기 |
| `js/ui.js` | `esc`(HTML 이스케이프 — 데이터는 항상 이걸로), 아이콘 SVG, 상태 칩, 네이버 지도 링크, 토스트 |
| `data/*.json` | 내용 데이터 (아래 3장) |
| `tools/encrypt-folders.mjs` | `data/folders.json` 다시 만들기 (아래 5장) |
| `README.md` | 선생님용 사용 안내 (호스팅에서 제외됨) |

## 3. 데이터 (`jeju/data/*.json`) — 일정이 바뀌면 여기만 고치면 됨

- `schedule.json`: 일차 배열 `{ day, date, label, stay, stayPlace, safety[], rows[] }`
  - row: `{ time:"HH:MM", end?, title, place?(places id), memo?, type, status, gather?, gatherAt?, pay? }`
  - `type`: `activity | move | meal | gather | stay` · `status`: `ok | need(확인 필요) | tbd(미정)`
  - `end` 없으면 다음 줄 시작까지. 마지막 줄은 21:00까지
  - `gather:true` → 오늘 탭 '집결' 카운트다운, `gatherAt` = 표시할 집결 장소
  - `pay:"self"` → '개인 돈' 칩. 이동(`move`이면서 `gather` 아님)은 일정에서 얇은 한 줄로 표시
- `places.json`: `{ id, name, address, day[], nid, naver, note?, rooms?, stay? }`
  - `nid` = 네이버 지도 장소 번호(`m.place.naver.com/place/<번호>`). 누르면 네이버 지도 앱에서 그 장소가 바로 열림 (`ui.js`의 `mapLinkInfo`: 아이폰 `https://app.map.naver.com/launchApp/place?...`, 안드로이드 `intent://place?...;package=com.nhn.android.nmap`, 컴퓨터 `map.naver.com/p/entry/place/<번호>`)
  - `naver` = 번호가 없을 때 쓰는 검색어. 새 장소는 네이버 지도에서 첫 결과가 맞는지 확인할 것
  - `rooms` = 숙소 방 번호(학생 이름과 연결 금지)
- `missions.json`: `{ goal, list:[{ id, day, place, title, q }], nightly }` — 지금 일정의 `place`와 같으면 오늘 탭에 미션 입력칸
- `shots.json`: `{ etiquette[], list:[{ id:"일차-HHMM", day, time, place, photo, photoBy?:"teacher", warn?, star? }] }` — **사진만**(영상 항목은 사용자가 지움)
- `rules.json`(안전 규칙), `contacts.json`(119/112·분원·병원), `checklist.json`(준비물), `roles.json`(역할), `info.json`(개인 돈·대안·제출물·마감), `camp.json`(기본 정보)
- `folders.json`: 장소별 드라이브 폴더 번호를 **암호화**한 것 (직접 편집 금지, 5장)

## 4. 화면 구조와 동작

- 아래 탭: **오늘 · 일정 · 미션·기록 · 안내** (+선생님 모드면 '선생님'). 지도 탭은 사용자가 없앴음.
- 머리줄: 로고 옆 작은 글씨가 출발 전 `D-n` / 캠프 중 `n일차 · 날짜` / 끝난 뒤 `캠프 끝`.
- **오늘 탭** (실제 한국 시각 기준 자동):
  - 출발 전(11/9까지): D-day, 출발 집결(06:50 영동역 / 07:25 옥천역) 카운트다운, 준비물, 1일차 안전
  - 캠프 중: 선생님 공지 → 인원 점검(진행 중일 때) → **지금** 카드 → **다음 | 집결** 두 칸 → 지금 장소 **미션**(바로 입력) → **지금 찍을 사진**(+사진 올리기) → 숙소 저녁(17시 이후 stay)·일정 끝·귀가 열차에서 **한 줄 소감** → 오늘 일정 목록(이동 제외) → 오늘의 안전
  - 캠프 후: 제출물·마감, 내 기록 수
- **일정 탭**: 1~4일차 탭(오늘 자동), 숙소 줄(방 번호), 지난 줄 흐리게·지금 줄 강조, 장소 줄 누르면 네이버 지도
- **미션·기록 탭**: 구분 `미션 | 소감 | 사진 | 역할`, 미션·소감·사진은 공통 1~4일차 탭(`S.ui.shotDay`, 오늘 자동). 설명 문구 없이 간단하게(사용자 요청)
  - 사진: 장소별 체크 + `올리기`(그 장소 드라이브 폴더) + "✓ 업로드 완료 · n장"
- **안내 탭**: 안전 규칙·장소별 주의·촬영 예절, 비상 연락(119/112·선생님·분원·병원), 준비물 체크, 개인 돈, 대안, 제출물, 내 설정(이름·입장 코드·화면·글자·홈 화면 추가·새로고침)
- **선생님 모드(숨김)**: 로고를 1.5초 길게 누르기 또는 안내 탭 맨 아래 글자 5번 → 선생님 계정 비밀번호(`teacher@japanchonsan.app`, 일본 앱과 같은 계정, 비밀번호는 Firebase에만 있음)
- 미리보기: 주소 끝에 `?now=2026-11-10T13:50` (한국 시각으로 간주, 위에 노란 줄 표시)

## 5. 데이터 저장 · Firebase · 드라이브

- **이 폰에만 저장(localStorage `gsj.*`)**: `me`(이름), `code`(입장 코드), `checks`, `answers`(미션 답), `refl`(소감 `d1`~`d4`), `shots`(사진 체크 `{p}`), `dirty`(아직 공유 안 된 항목), `seen`(확인한 공지), `theme`, `big`, `tab`, `seg`, `teacherUI`, 캐시(`live.*`, `data`, `folders`, `upcounts`)
- **Firebase Realtime Database** (`jeju/s/{입장코드}/…`), 규칙은 루트 `database.rules.json`의 `"jeju"` 부분
  - `jeju/keys/{코드}` 선생님만 쓰기·읽기 → 코드를 모르면 `jeju/s/{코드}` 읽기·쓰기 불가
  - `meta`(driveUrl, teacherTel, created) · `notices` · `gather` — 선생님만 쓰기
  - `arrivals/{집결id}/{이름}` — 학생 쓰기 가능(서버 시각 `now`만, 진행 중인 집결만)
  - `answers/{이름}/{미션id}`, `reflections/{이름}/d1~d4`, `shots/{이름}/{장면id}` — 학생 쓰기 가능(길이 제한)
  - 규칙을 바꾸면 반드시 학생/선생님/틀린 코드 경우를 생각할 것. Firebase 에뮬레이터로 시험 가능: `localStorage['gsj.emu']={"db":"127.0.0.1:9000","auth":"http://127.0.0.1:9099"}`
- **드라이브 사진 폴더**: 공유폴더 > `3. 사진·영상` > 장소별 하위 폴더(`1일차_자매국수` 형식)
  - 폴더 번호는 공개 저장소라 `data/folders.json`에 AES-GCM으로 암호화. **열쇠 = 선생님 탭 '공유 설정'에 넣은 드라이브 링크의 폴더 번호**(입장 코드가 있는 기기에만 내려옴). `{ "photos": 사진 폴더, "<장면id>": 폴더 }`
  - 장면을 추가/삭제하면: 드라이브에 폴더 만들기 → 원본 JSON 수정(선생님이 비공개로 보관) → `node jeju/tools/encrypt-folders.mjs 원본.json <열쇠> jeju/data/folders.json`. 원본·열쇠는 저장소에 올리지 말 것
  - '업로드 완료 · n장'은 Firebase 웹 API 키로 Google Drive API `files.list`를 호출해 폴더 파일 수를 셉니다. 프로젝트에서 Drive API를 켜야 하고, 폴더가 '링크가 있는 모든 사용자: 뷰어'여야 동작. 실패하면 조용히 표시 안 함
- **서비스워커**: `jeju/sw.js`의 `CACHE = "gsj-vN"` — **사이트 파일을 바꿀 때마다 숫자를 1 올리세요.** 새 파일을 추가하면 `SHELL` 목록에도 넣기. 같은 주소 파일은 '인터넷 먼저(3초) → 저장본', gstatic Firebase SDK는 저장본 우선.

## 6. 디자인 규칙 (`jeju/app.css`)

- 색: 제주 바다 청록 `--sea` + 감귤 주황 `--tang`, 다크 모드는 `:root` 토큰 재정의(자동/밝게/어둡게)
- 간격: 카드 안 12~14px(`--pad`), 카드 사이 10px, 둥글기 14px. 빈 공간이 많은 걸 싫어함 — 늘리지 말 것
- 글자: 본문 16px(큰 글씨 모드 18px). 제목 최대 약 19px, 카운트다운 21px, D-day 26px. **너무 큰 글자 금지**
- 공통 부품: `.card`(카드) / `.card.flush`(안쪽 목록이 가장자리까지) / `.ch`(카드 머리줄: 아이콘·제목·오른쪽 값 `.ch-r`·링크 `.ch-link`) / `.list` + `.li`(구분선 목록) / `.seg.days`(1~4일차 탭, 머리줄 아래 고정) / `.chip.st-*`(상태 칩: 색+글자 함께) / `.btn .sm .ghost .tang`
- 상태는 **색만으로 구분하지 않기**(글자 라벨 함께). 버튼·체크는 엄지로 누르기 쉬운 크기(대략 36~44px 이상)
- 320px 폭, 큰 글씨, 다크 모드에서 가로 넘침이 없어야 함
- 문구: 해요체, 짧게. **설명 문구는 최소화**(사용자가 여러 번 빼달라고 함)

## 7. 지켜야 할 것 (기획서 7장 + 사용자 결정)

- 넣지 말 것: 학생 생년월일·연락처·주소, 예산·지원금·영수증·초과근무·행정 서류, **방 배정과 학생 이름을 함께**, 학생 얼굴 사진(사진은 앱에 저장하지 않고 드라이브로만)
- 선생님 연락처·드라이브 링크는 Firebase `meta`(입장 코드 뒤)에만. 코드/JSON에 평문으로 넣지 말 것
- 사용자가 지운 것(되살리지 말 것): 지도 탭, 영상 촬영 항목, 사진 설명 한 줄 입력, 방어회·흑돼지(상원가든·홍마트) 일정, 1일차 미리보기, 각종 안내 문단
- 분원 방: 411호 여학생 · 412호 남학생 · 414호 선생님

## 8. 수정 후 확인 (최소)

```bash
for f in jeju/js/*.js jeju/sw.js; do node --check "$f" || echo "FAIL $f"; done
python3 -c "import json,glob; [json.load(open(f)) for f in glob.glob('jeju/data/*.json')]; print('json ok')"
python3 -m http.server 8765   # 저장소 루트에서 → http://127.0.0.1:8765/jeju/?now=2026-11-11T16:20
```

- 브라우저(휴대폰 크기 390px·320px)로 열어 콘솔 오류가 없는지, 아래 시각에서 오늘 탭이 맞게 바뀌는지 확인:
  `2026-11-09T20:30`(출발 전) · `2026-11-10T13:50`(해안도로: 미션+사진) · `2026-11-10T20:00`(분원: 소감·방 번호) · `2026-11-11T16:20`(차귀도) · `2026-11-13T19:40`(귀가 열차: 소감) · `2026-11-14T10:00`(캠프 후)
- 일정 데이터를 바꿨다면 일정 탭의 해당 일차도 확인
- PR 설명에 무엇을 바꿨는지와 확인한 것을 적기
