// 이 폰에만 저장하는 값 (localStorage). 사생활 보호 모드 등으로 막혀 있어도 앱은 그대로 동작합니다.
const P = "gsj.";

export function load(key, fallback) {
  try {
    const v = localStorage.getItem(P + key);
    return v == null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(P + key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function remove(key) {
  try { localStorage.removeItem(P + key); } catch (e) { /* 무시 */ }
}
