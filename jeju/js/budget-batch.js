import { parseBudget } from "./budget-model.js";

// 초안은 URL fragment와 메모리에서 읽고, 로그인 및 저장 버튼 확인 후 전송합니다.
export function parseBatch(encoded) {
  if (!encoded || encoded.length > 16000) throw new Error('불러오기 링크를 확인해 주세요.');
  const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
  if (raw.v !== 1 || !/^[a-zA-Z0-9-]{8,40}$/.test(raw.id) || !Array.isArray(raw.rows) || raw.rows.length < 1 || raw.rows.length > 20) throw new Error('불러오기 링크를 확인해 주세요.');
  const rows = raw.rows.map((row, index) => {
    if (typeof row.category !== 'string' || !row.category.trim() || row.category.length > 40 || typeof row.text !== 'string' || !row.text.trim() || row.text.length > 300 || !Number.isInteger(row.amount) || row.amount <= 0 || row.amount > 1000000000) throw new Error('지출 내용을 확인해 주세요.');
    return { id: `batch-${raw.id}-${index}`, category: row.category.trim(), text: row.text.trim(), amount: row.amount };
  });
  if (raw.plan !== undefined) {
    if (typeof raw.plan !== 'string') throw new Error('예산계획서를 확인해 주세요.');
    parseBudget(raw.plan);
  }
  return { rows, ...(raw.plan === undefined ? {} : { planText: raw.plan }) };
}
export function matchBatch(rows, items, expenses) {
  return rows.map(row => {
    const categories = Object.entries(items).filter(([, item]) => item.label === row.category);
    const category = categories.length === 1 ? categories[0][0] : null;
    const saved = Object.hasOwn(expenses, row.id);
    const categoryTotal = rows.filter(entry => entry.category === row.category).reduce((sum, entry) => sum + entry.amount, 0);
    const matches = Object.values(expenses).filter(e => e.category === category && (e.amount === row.amount || e.amount === categoryTotal));
    return { ...row, categoryId: category, saved, matches };
  });
}

// 사용자가 확정한 비목만 비공개 계획서에서 읽습니다. 실제 금액은 코드에 두지 않습니다.
export function batchFromPlan(items) {
  const rows = [];
  for (const [id, item] of Object.entries(items)) {
    if (!["항공료", "숙박비", "임차료"].includes(item.label) || !Number.isInteger(item.spent) || item.spent <= 0) continue;
    const outbound = item.label === "항공료" && item.note?.match(/가는\s*편\s*([\d,]+)/);
    const inbound = item.label === "항공료" && item.note?.match(/오는\s*편\s*([\d,]+)/);
    const a = outbound && Number(outbound[1].replace(/,/g, ""));
    const b = inbound && Number(inbound[1].replace(/,/g, ""));
    const entries = a > 0 && b > 0 && a + b === item.spent
      ? [{ text: "가는 편 항공료", amount: a }, { text: "오는 편 항공료", amount: b }]
      : [{ text: item.label, amount: item.spent }];
    entries.forEach((entry, index) => rows.push({ id: `plan-${id}-${index}`, category: item.label, ...entry }));
  }
  return rows.length ? { rows } : null;
}
