// 예산 금액과 합계 계산. 실제 예산·허용 계정은 공개 파일에 넣지 않습니다.
export const MAX_AMOUNT = 1000000000;
export const MAX_ITEMS = 30;

export function amount(value, optional = false) {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text && optional) return null;
  if (!/^\d+$/.test(text)) throw new Error("금액은 0 이상의 정수로 입력해 주세요.");
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number > MAX_AMOUNT) throw new Error("금액을 확인해 주세요.");
  return number;
}

export function validateItem(item) {
  if (!item || typeof item.label !== "string" || !item.label.trim() || item.label.length > 40) throw new Error("비목을 확인해 주세요.");
  if (!Number.isInteger(item.budget) || item.budget < 0 || item.budget > MAX_AMOUNT) throw new Error("예산을 확인해 주세요.");
  if (item.spent != null && (!Number.isInteger(item.spent) || item.spent < 0 || item.spent > MAX_AMOUNT)) throw new Error("지출을 확인해 주세요.");
  if (typeof item.note !== "string" || item.note.length > 1000) throw new Error("메모는 1,000자까지 입력해 주세요.");
  if (typeof item.approximate !== "boolean") throw new Error("금액 구분을 확인해 주세요.");
  if (!Number.isInteger(item.order) || item.order < 0 || item.order >= MAX_ITEMS) throw new Error("비목 순서를 확인해 주세요.");
  return item;
}

export function validateBudget(data) {
  if (!data || !data.items || typeof data.items !== "object" || Array.isArray(data.items)) throw new Error("예산 자료를 확인해 주세요.");
  const entries = Object.entries(data.items);
  if (!entries.length || entries.length > MAX_ITEMS) throw new Error("비목은 1~30개까지 저장할 수 있어요.");
  entries.forEach(([id, item]) => {
    if (!/^item-([0-9]|[12][0-9])$/.test(id)) throw new Error("비목 번호를 확인해 주세요.");
    validateItem(item);
  });
  for (const key of ["pending", "excluded"]) {
    if (typeof data[key] !== "string" || data[key].length > 5000) throw new Error("내용은 5,000자까지 입력해 주세요.");
  }
  return data;
}

export function totals(items) {
  return Object.values(items || {}).reduce((sum, item) => ({
    budget: sum.budget + item.budget,
    spent: sum.spent + (item.spent ?? 0),
    remaining: sum.remaining + item.budget - (item.spent ?? 0),
    unknown: sum.unknown + (item.spent == null ? 1 : 0),
  }), { budget: 0, spent: 0, remaining: 0, unknown: 0 });
}

export function parseBudget(text) {
  if (!text || text.length > 60000) throw new Error("불러올 자료를 확인해 주세요.");
  if (text.trim().startsWith("{")) {
    const raw = JSON.parse(text);
    const data = { items: {}, pending: raw.pending || "", excluded: raw.excluded || "" };
    Object.entries(raw.items || {}).forEach(([id, item]) => {
      data.items[id] = { label: item.label, budget: item.budget, spent: item.spent ?? null, approximate: item.approximate ?? false, note: item.note || "", order: item.order };
    });
    return validateBudget(data);
  }
  const data = { items: {}, pending: "", excluded: "" };
  const pending = [], excluded = [];
  let inPending = false;
  for (const line of text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    if (/^■.*(아직|미정)/.test(line)) { inPending = true; continue; }
    if (/^※/.test(line)) { excluded.push(line.replace(/^※\s*/, "")); continue; }
    if (inPending) { pending.push(line.replace(/^-\s*/, "")); continue; }
    const match = line.match(/^-\s*([^:]+):\s*([\d,]+)\s*\/\s*(약\s*)?([\d,]+|미정)\s*\/\s*(-?[\d,]+)(?:\s*[—–]\s*(.*))?$/);
    if (!match || match[1].trim() === "합계") continue;
    const order = Object.keys(data.items).length;
    const budget = amount(match[2]), spent = match[4] === "미정" ? null : amount(match[4]);
    if (budget - (spent ?? 0) !== Number(match[5].replace(/,/g, ""))) throw new Error(`${match[1]}의 잔액을 확인해 주세요.`);
    data.items[`item-${order}`] = { label: match[1].trim(), budget, spent, approximate: !!match[3], note: match[6] || "", order };
  }
  data.pending = pending.join("\n");
  data.excluded = excluded.join("\n");
  return validateBudget(data);
}

// 계획 금액은 참고용입니다. 가계부에는 저장된 지출을 각각 한 번만 합산합니다.
export function ledgerItems(items, expenses) {
  const result = Object.fromEntries(Object.entries(items).map(([id, item]) => [id, { ...item, spent: 0 }]));
  for (const entry of Object.values(expenses)) {
    const key = Object.hasOwn(result, entry.category) ? entry.category : 'uncategorized';
    result[key] ||= { label: '미분류', budget: 0, spent: 0 };
    result[key].spent += entry.amount;
  }
  return result;
}
