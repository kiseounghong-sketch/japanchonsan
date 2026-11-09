// 화면 그리기에 쓰는 작은 도구들
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const P = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  schedule: '<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3.5 10h17M7.5 14h4M7.5 17h7"/>',
  map: '<path d="M12 21s-6.5-5.8-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  record: '<path d="M4 20h4L19.5 8.5l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  info: '<path d="M12 3l7.5 3v5.6c0 4.6-3.2 8.3-7.5 9.4-4.3-1.1-7.5-4.8-7.5-9.4V6L12 3z"/><path d="M12 8.5v4.5M12 16.2v.3"/>',
  teacher: '<rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 4.5V3h6v1.5M8.8 11.5l2 2 4.2-4.2M8.5 17h7"/>',
  phone: '<path d="M6.6 3.5h2.6l1.4 4-2 1.3a11 11 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
  pin: '<path d="M12 21s-6.5-5.8-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.2"/>',
  video: '<rect x="3.5" y="6.5" width="12" height="11" rx="2"/><path d="M15.5 10.5l5-3v9l-5-3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  wifiOff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.6M14 10.4A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4.5-2.8M10.5 5.6A15 15 0 0 1 22 9.5"/><circle cx="12" cy="19.5" r=".6"/>',
  cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.6a4.5 4.5 0 0 0 1 8.9z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5zM10 20.5a2 2 0 0 0 4 0"/>',
  flag: '<path d="M5 21V4M5 4.5h11l-2 3.5 2 3.5H5"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  folder: '<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.5l2 2.5H19A1.5 1.5 0 0 1 20.5 9.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
  chevron: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
  home: '<path d="M4 11l8-6.5 8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  alert: '<path d="M12 4l9 16H3L12 4z"/><path d="M12 10v4.5M12 17.3v.2"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
};

export function icon(name, cls = "") {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;
}

// 상태 표시는 색만이 아니라 글자 라벨을 함께 씁니다.
export const STATUS = {
  ok: { label: "확정", cls: "st-ok" },
  need: { label: "확인 필요", cls: "st-need" },
  tbd: { label: "미정", cls: "st-tbd" },
  move: { label: "이동", cls: "st-move" },
};

export function statusChip(row) {
  if (row.status && row.status !== "ok") {
    const s = STATUS[row.status];
    return s ? `<span class="chip ${s.cls}">${s.label}</span>` : "";
  }
  return "";
}

// 네이버 지도 검색 링크. 휴대폰에서는 네이버 지도 앱(없으면 모바일 웹)으로 열립니다.
// places.json의 "naver"는 검색어이며, 첫 결과가 맞는 장소인지 확인해 둔 값입니다.
export function mapUrl(place, fallbackName) {
  const q = (place && place.naver) || ((place && place.name) || fallbackName || "").replace(/\s*\(.*?\)\s*/g, " ").trim();
  return "https://map.naver.com/p/search/" + encodeURIComponent(q);
}

let toastTimer = null;
export function toast(msg, ms = 2600) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}
