// 장소별 사진·영상 폴더(구글 드라이브) 링크
// data/folders.json에는 폴더 번호가 암호화되어 있고(공개 저장소라서), 열쇠는 선생님 탭 '공유 설정'에 넣은
// 드라이브 폴더 링크의 폴더 번호입니다. 그 링크는 입장 코드가 있는 기기에만 내려오므로,
// 장소별 폴더 버튼도 입장 코드가 있는 학생에게만 보입니다. 한 번 풀면 이 폰에 저장해 오프라인에서도 보여요.
import { S } from "./state.js";
import { live } from "./live.js";
import { load, save, remove } from "./store.js";

let unlocked = load("folders", null); // { root, map: { 장면id: 폴더번호, photos: 사진·영상 폴더 } }

function rootId() {
  const u = (live.meta && live.meta.driveUrl) || (S.data && S.data.camp.driveUrl) || "";
  const m = String(u).match(/\/folders\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : "";
}

function current() {
  const r = rootId();
  return r && unlocked && unlocked.root === r ? unlocked.map : null;
}

export function folderUrl(key) {
  const m = current();
  return m && m[key] ? `https://drive.google.com/drive/folders/${m[key]}` : "";
}

export function hasFolders() {
  return !!current();
}

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// 바뀌었으면 true (화면을 다시 그리라는 뜻)
export async function unlockFolders() {
  const blob = S.data && S.data.folders;
  const root = rootId();
  if (!blob || !blob.ct || !root) return false;
  if (unlocked && unlocked.root === root) return false;
  try {
    const subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return false;
    const base = await subtle.importKey("raw", new TextEncoder().encode(root), "PBKDF2", false, ["deriveKey"]);
    const key = await subtle.deriveKey(
      { name: "PBKDF2", salt: b64(blob.salt), iterations: blob.iter || 150000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
    const plain = await subtle.decrypt({ name: "AES-GCM", iv: b64(blob.iv) }, key, b64(blob.ct));
    unlocked = { root, map: JSON.parse(new TextDecoder().decode(plain)) };
    save("folders", unlocked);
    return true;
  } catch (e) {
    // 다른 드라이브 링크를 넣은 경우: 장소별 버튼 없이 전체 링크만 보여줌
    if (unlocked) { unlocked = null; remove("folders"); return true; }
    return false;
  }
}
