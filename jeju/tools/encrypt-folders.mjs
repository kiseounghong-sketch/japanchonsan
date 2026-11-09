// 장소별 사진 폴더 번호를 암호화해서 jeju/data/folders.json 을 만듭니다. (Node 18 이상)
// 사용법: node jeju/tools/encrypt-folders.mjs <원본.json> <열쇠> jeju/data/folders.json
//  - 원본.json: { "photos": "사진 폴더 번호", "<shots.json의 장면 id>": "그 장소 폴더 번호", ... }  ("_"로 시작하는 키는 무시)
//  - 열쇠: 선생님 탭 '공유 설정'에 넣는 구글 드라이브 공유폴더 링크의 폴더 번호(/folders/ 뒤 부분)
// 원본.json과 열쇠는 공개 저장소에 올리지 마세요(이 저장소는 공개입니다).
import fs from "node:fs";
import path from "node:path";

const [plainPath, keyId, outPath] = process.argv.slice(2);
if (!plainPath || !keyId || !outPath) {
  console.error("사용법: node jeju/tools/encrypt-folders.mjs <원본.json> <열쇠> jeju/data/folders.json");
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(plainPath, "utf8"));
const ids = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("_")));
const shotsFile = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "data", "shots.json");
const shots = JSON.parse(fs.readFileSync(shotsFile, "utf8")).list.map((s) => s.id);
const missing = shots.filter((id) => !ids[id]);
if (missing.length) console.warn("주의: 폴더가 없는 장면 →", missing.join(", "), "(그 장면엔 '올리기' 버튼이 안 생겨요)");

const { subtle } = globalThis.crypto;
const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await subtle.importKey("raw", enc.encode(keyId), "PBKDF2", false, ["deriveKey"]);
const key = await subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(ids))));
const b64 = (u) => Buffer.from(u).toString("base64");
fs.writeFileSync(outPath, JSON.stringify({
  note: "장소별 사진·영상 폴더 링크(암호화). 열쇠는 선생님 탭 '공유 설정'에 넣은 드라이브 폴더 링크라서, 입장 코드가 있는 학생 앱에서만 풀려요. 다시 만들려면 jeju/tools/encrypt-folders.mjs",
  v: 1, kdf: "PBKDF2-SHA256", iter: 150000, salt: b64(salt), iv: b64(iv), ct: b64(ct),
}, null, 1) + "\n");
console.log("완료:", Object.keys(ids).length, "개 폴더 →", outPath);
