import { parseBatch, matchBatch, batchFromPlan } from "./budget-batch.js";
import * as API from "./budget-api.js";
import { amount, totals, validateBudget, parseBudget, MAX_ITEMS, ledgerItems } from "./budget-model.js";
import { esc, icon, toast } from "./ui.js";

const main = document.getElementById("main");
const logoutButton = document.getElementById("logout");
let budget = null, etag = null, editorEmail = "", generation = 0;
let expenses = {}, expenseTag = null, expenseId = "", syncing = false;
let batchDraft = null, batchError = "", batchPreview = [];
let planPreviewDismissed = false;
function readBatchLink() {
  if (!location.hash.startsWith("#add=")) return false;
  const encoded = location.hash.slice(5);
  batchDraft = null; batchError = ""; batchPreview = [];
  try { batchDraft = parseBatch(encoded); } catch (_) { batchError = "불러오기 링크를 확인해 주세요."; }
  return true;
}
readBatchLink();
function discardBatch() {
  planPreviewDismissed = true;
  batchDraft = null; batchError = ""; batchPreview = [];
  if (location.hash.startsWith("#add=")) history.replaceState(null, "", location.pathname + location.search);
}
let loginMode = "teacher", ready = false, saving = false;
const won = (value) => value == null ? "미정" : Number(value).toLocaleString("ko-KR");
const errorLine = () => '<p class="err" role="alert"></p>';
const editing = () => (!!main.querySelector('[data-form="expense"]') && changed(main.querySelector('[data-form="expense"]'))) || !!main.querySelector('[data-edit]:not([hidden]), .budget-owner[open], .budget-settings[open], [data-form=batch]');
const changed = (form) => [...form.querySelectorAll('input:not([type="file"]), textarea, select')].some((field) =>
  field.tagName === "SELECT" ? [...field.options].some(option => option.selected !== option.defaultSelected && (option.defaultSelected || option.index !== 0)) : field.type === "checkbox" ? field.checked !== field.defaultChecked : field.value !== field.defaultValue);

function amounts(b, s, remaining, actual = false) {
  return `<dl class="budget-values"><div><dt>예산</dt><dd>${won(b)}</dd></div><div><dt>${actual ? "사용액" : "계획 지출"}</dt><dd>${won(s)}</dd></div><div><dt>잔액</dt><dd class="${remaining < 0 ? "negative" : ""}">${won(remaining)}</dd></div></dl>`;
}
function clear() { expenses = {}; expenseTag = null; expenseId = ""; budget = null; etag = null; editorEmail = ""; generation++; }
function showError(error) {
  main.innerHTML = `<section class="card"><h2>예산</h2><p class="err" role="alert">${esc(API.errorText(error))}</p><button class="btn" data-act="refresh">다시 확인</button></section>`;
}
function showLogin() {
  const teacher = loginMode === "teacher", signup = loginMode === "signup";
  main.innerHTML = `<section class="card">
    <h2>예산 로그인</h2>
    <div class="seg"><button type="button" class="${teacher ? "on" : ""}" data-act="login-mode" data-mode="teacher">선생님</button><button type="button" class="${!teacher ? "on" : ""}" data-act="login-mode" data-mode="editor">공동 편집자</button></div>
    <form class="stack" data-form="login">
      ${teacher ? "" : `<label>이메일<input type="email" name="email" autocomplete="username" required maxlength="254"></label>`}
      <label>비밀번호<input type="password" name="password" autocomplete="${signup ? "new-password" : "current-password"}" required ${signup ? 'minlength="6"' : ""}></label>
      <button class="btn" type="submit">${signup ? "가입·인증 메일 보내기" : batchDraft ? "로그인하고 내역 보기" : "로그인"}</button>${errorLine()}
    </form>
    ${teacher ? "" : `<button class="linkbtn" data-act="login-mode" data-mode="${signup ? "editor" : "signup"}">${signup ? "로그인으로" : "계정 만들기"}</button>`}
  </section>`;
}
function showVerification() {
  main.innerHTML = `<section class="card"><h2>이메일 인증</h2><p class="sub">${esc(API.currentUser()?.email || "")}</p><div class="btns"><button class="btn" data-act="verified">인증 완료</button><button class="btn ghost" data-act="verify-email">인증 메일 다시 보내기</button></div>${errorLine()}</section>`;
}
function editForm(id, item) {
  return `<form class="stack budget-form" data-form="item" data-id="${esc(id)}" data-edit hidden>
    <label>비목<input name="label" value="${esc(item.label)}" maxlength="40" required></label>
    <div class="two"><label>예산<input name="budget" inputmode="numeric" value="${item.budget}" required></label><label>계획 지출<input name="spent" inputmode="numeric" value="${item.spent ?? ""}" placeholder="미정"></label></div>
    <label class="inline"><input type="checkbox" name="approximate" ${item.approximate ? "checked" : ""}>약</label>
    <label>메모<textarea name="note" rows="2" maxlength="1000">${esc(item.note)}</textarea></label>
    <div class="btns"><button class="btn sm" type="submit">저장</button><button class="btn sm ghost" type="button" data-act="cancel">취소</button></div>${errorLine()}
  </form>`;
}
function noteSection(key, title) {
  return `<section class="card"><div class="budget-head"><h2>${title}</h2><button class="btn sm ghost" data-act="edit">편집</button></div><p class="sub budget-note">${esc(budget[key] || "—")}</p><form class="stack budget-form" data-form="note" data-key="${key}" data-edit hidden><label>${title}<textarea name="text" rows="3" maxlength="5000">${esc(budget[key])}</textarea></label><div class="btns"><button class="btn sm" type="submit">저장</button><button class="btn sm ghost" type="button" data-act="cancel">취소</button></div>${errorLine()}</form></section>`;
}
function ownerSettings() {
  if (!API.isOwner()) return "";
  return `<details class="card budget-owner"><summary>공동 편집자</summary><form class="stack" data-form="access"><label>로그인 이메일<input type="email" name="email" value="${esc(editorEmail)}" maxlength="254" autocomplete="off"></label><button class="btn" type="submit">저장</button>${errorLine()}</form></details>`;
}
function render() {
  expenseId = ""; expenseTag = null;
  if (!API.currentUser()) { showLogin(); return; }
  if (budget && !batchDraft && !batchError && !planPreviewDismissed && !Object.keys(expenses).length) batchDraft = batchFromPlan(budget.items);
  let html = "";
  if (!budget) {
    html = `<section class="card" id="budget-setup"><h2>예산 불러오기</h2><form class="stack" data-form="import"><label>예산 정리<textarea name="text" rows="6" maxlength="60000">${esc(batchDraft?.planText || "")}</textarea></label><input class="budget-import" type="file" accept=".json,.txt,application/json,text/plain" aria-label="예산 파일 불러오기"><button class="btn" type="submit">저장</button>${errorLine()}</form></section>`;
  } else {
    const sum = totals(ledgerItems(budget.items, expenses));
    html = `<section class="card" id="budget-summary"><div class="budget-head"><h2>가계부 <small class="muted">원</small></h2><button class="btn sm ghost" data-act="refresh">새로고침</button></div>${amounts(sum.budget, sum.spent, sum.remaining, true)}</section>`;
    if (batchFromPlan(budget.items)) html += '<button class="btn ghost wide" data-act="plan-expenses">확정 지출 불러오기</button>';
    html += ledgerForm() + '<section class="card" id="expense-list"></section><details class="budget-settings"><summary class="btn ghost wide">예산계획서</summary>';
    const plan = totals(budget.items);
    html += `<section class="card"><h2>계획 합계</h2>${amounts(plan.budget, plan.spent, plan.remaining)}</section>`;
    for (const [id, item] of Object.entries(budget.items).sort((a, b) => a[1].order - b[1].order)) {
      html += `<section class="card"><div class="budget-head"><h2>${esc(item.label)}${item.approximate ? ' <span class="chip st-need">예상</span>' : ""}</h2><button class="btn sm ghost" data-act="edit">편집</button></div>${amounts(item.budget, item.spent, item.budget - (item.spent ?? 0))}${item.note ? `<p class="sub budget-note">${esc(item.note)}</p>` : ""}${editForm(id, item)}</section>`;
    }
    html += noteSection("pending", "금액 미정") + noteSection("excluded", "사업비 제외");
    if (Object.keys(budget.items).length < MAX_ITEMS) {
      html += `<section class="card"><button class="btn ghost" data-act="edit">${icon("record")}비목 추가</button>${editForm("", { label: "", budget: 0, spent: null, approximate: false, note: "" })}</section>`;
    }
  }
  if (budget) html += "</details>";
  main.innerHTML = batchCard() + html + ownerSettings();
  updateLedger();
}
async function refresh() {
  const user = API.currentUser();
  if (!user) { clear(); showLogin(); return; }
  if (!API.isOwner() && !user.emailVerified) { clear(); showVerification(); return; }
  const seq = ++generation;
  try {
    const result = await API.loadBudget();
    const entries = await API.loadExpenses();
    const access = API.isOwner() ? await API.loadAccess() : "";
    if (seq !== generation || API.currentUser()?.uid !== user.uid) return;
    if (result.data) validateBudget(result.data);
    expenses = entries; budget = result.data; etag = result.etag; editorEmail = access;
    render();
  } catch (error) {
    if (seq !== generation) return;
    clear(); showError(error);
  }
}
async function save(data) {
  validateBudget(data);
  await API.saveBudget(data, etag);
  await refresh();
  toast("저장했어요");
}
async function onUser(user) {
  clear(); logoutButton.hidden = !user;
  main.innerHTML = '<p class="boot">불러오는 중…</p>';
  if (user) await refresh(); else showLogin();
}
main.addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  if (saving) return;
  if (["import", "item", "note"].includes(form.dataset.form)) {
    const others = [...main.querySelectorAll('[data-edit]:not([hidden]), .budget-owner[open] form, [data-form=expense]')];
    if (others.some((other) => other !== form && changed(other)) && !confirm("다른 항목의 입력 내용을 버리고 저장할까요?")) return;
  }
  const error = form.querySelector(".err");
  error.textContent = "";
  const data = new FormData(form), kind = form.dataset.form;
  const controlStates = [...form.querySelectorAll("button, input, textarea, select")].map(field => [field, field.disabled]);
  saving = true; logoutButton.disabled = true;
  form.querySelectorAll("button, input, textarea, select").forEach((button) => { button.disabled = true; });
  try {
    if (kind === "login") {
      const email = loginMode === "teacher" ? API.TEACHER_EMAIL : String(data.get("email"));
      if (loginMode === "signup") { await API.register(email, String(data.get("password"))); toast("인증 메일을 보냈어요"); }
      else await API.login(email, String(data.get("password")));
    } else if (kind === "batch") {
      await saveBatch(data);
    } else if (kind === "expense") {
      const entry = { category: String(data.get("category")), amount: amount(data.get("amount")), text: String(data.get("text")).trim(), date: String(data.get("date")), included: expenses[expenseId]?.included ?? false };
      if (!entry.amount || !entry.text || !budget.items[entry.category]) throw new Error("금액과 내용을 확인해 주세요.");
      expenseId ||= crypto.randomUUID();
      await API.saveExpense(expenseId, entry, expenseTag);
      expenseId = ""; expenseTag = null; form.reset();
      form.querySelector('button[type="submit"]').textContent = "지출 저장";
      expenses = await API.loadExpenses(); updateLedger(); toast("저장했어요");
    } else if (kind === "import") {
      await save(parseBudget(String(data.get("text"))));
    } else if (kind === "item") {
      const next = structuredClone(budget);
      const id = form.dataset.id || Array.from({ length: MAX_ITEMS }, (_, i) => `item-${i}`).find((key) => !next.items[key]);
      next.items[id] = {
        label: String(data.get("label")).trim(), budget: amount(data.get("budget")), spent: amount(data.get("spent"), true),
        approximate: !!data.get("approximate"), note: String(data.get("note")).trim(),
        order: next.items[id]?.order ?? Object.keys(next.items).length,
      };
      await save(next);
    } else if (kind === "note") {
      await save({ ...budget, [form.dataset.key]: String(data.get("text")).trim() });
    } else if (kind === "access") {
      await API.saveAccess(String(data.get("email")));
      editorEmail = String(data.get("email")).trim().toLowerCase();
      form.elements.email.value = form.elements.email.defaultValue = editorEmail;
      toast("저장했어요");
    }
  } catch (err) {
    if (error.isConnected) error.textContent = API.errorText(err); else toast(API.errorText(err));
  } finally {
    saving = false; logoutButton.disabled = false;
    controlStates.forEach(([field, disabled]) => { field.disabled = disabled; });
  }
});
main.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-act]");
  if (!button || saving) return;
  if (!ready) { if (button.dataset.act === "refresh") location.reload(); return; }
  try {
    const act = button.dataset.act;
    if (act === "plan-expenses") {
      if (batchDraft) { document.getElementById("batch-import")?.scrollIntoView({ block: "start" }); return; }
      batchDraft = batchFromPlan(budget.items); batchError = "";
      document.getElementById("batch-import")?.remove();
      main.insertAdjacentHTML("afterbegin", batchCard());
      document.getElementById("batch-import")?.scrollIntoView({ block: "start" });
    } else if (act === "batch-cancel") {
      discardBatch(); button.closest("section").remove();
    } else if (act === "setup-plan") {
      document.getElementById("budget-setup")?.scrollIntoView({ block: "start" });
    } else if (act === "expense-edit" || act === "expense-delete") {
      const seq = ++generation;
      const id = button.dataset.id;
      const form = main.querySelector('[data-form="expense"]');
      if (act === "expense-edit" && changed(form) && !confirm("입력 중인 내용을 버리고 수정할까요?")) return;
      form.querySelectorAll("button, input, textarea, select").forEach(field => { field.disabled = true; });
      let result;
      try { result = await API.loadExpense(id); }
      finally { form.querySelectorAll("button, input, textarea, select").forEach(field => { field.disabled = false; }); }
      if (seq !== generation) return;
      if (!result.data) throw new Error("삭제된 기록이에요.");
      if (act === "expense-delete") {
        if (!confirm("이 지출 기록을 삭제할까요?")) return;
        await API.deleteExpense(id, result.etag);
        expenses = await API.loadExpenses(); updateLedger(); toast("삭제했어요");
      } else {
        expenseId = id; expenseTag = result.etag;
        for (const key of ["category", "amount", "text", "date"]) form.elements[key].value = result.data[key];
        form.querySelector('button[type="submit"]').textContent = "수정 저장";
        form.scrollIntoView({ block: "start" }); form.elements.amount.focus();
      }
    } else if (act === "expense-cancel") {
      const form = button.closest("form"); form.reset(); expenseId = ""; expenseTag = null;
      form.querySelector('button[type="submit"]').textContent = "지출 저장";
      form.querySelector('.err').textContent = "";
    } else if (act === "login-mode") { loginMode = button.dataset.mode; showLogin(); }
    else if (act === "edit") {
      generation++; // 진행 중인 조회가 편집 내용을 덮어쓰지 않게 합니다.
      const form = button.closest("section").querySelector("[data-edit]");
      form.hidden = false; form.querySelector("input, textarea")?.focus();
    } else if (act === "cancel") {
      const form = button.closest("form"); form.reset(); form.hidden = true; form.querySelector(".err").textContent = "";
    } else if (act === "refresh") {
      if (editing() && !confirm("입력 중인 내용을 버리고 새로고침할까요?")) return;
      await refresh();
    } else if (act === "verify-email") { await API.verifyEmail(); toast("인증 메일을 보냈어요"); }
    else if (act === "verified") { await API.refreshUser(); await refresh(); }
  } catch (error) { toast(API.errorText(error)); }
});
main.addEventListener("input", () => { generation++; });
main.addEventListener("toggle", (event) => {
  if (event.target.matches(".budget-owner[open]")) generation++;
}, true);
main.addEventListener("change", async (event) => {
  if (event.target.type !== "file") return;
  const file = event.target.files[0], form = event.target.closest("form");
  if (!file) return;
  try {
    if (file.size > 60000) throw new Error("자료는 60KB까지 불러올 수 있어요.");
    const text = await file.text(); parseBudget(text);
    form.elements.text.value = text;
    form.querySelector(".err").textContent = "";
  } catch (error) { form.querySelector(".err").textContent = API.errorText(error); }
});
logoutButton.addEventListener("click", async () => {
  if (saving) return;
  discardBatch(); clear(); main.innerHTML = "";
  try { await API.logout(); } catch (error) { showError(error); }
});
window.addEventListener("offline", () => { clear(); showError(new Error("인터넷 연결을 확인해 주세요.")); });
window.addEventListener("online", () => { if (ready) refresh(); });
window.addEventListener("pagehide", () => { batchDraft = null; batchError = ""; batchPreview = []; clear(); main.innerHTML = ""; });
window.addEventListener("pageshow", (event) => { if (event.persisted && ready) { readBatchLink(); refresh(); } });
setInterval(async () => {
  if (!ready || !budget || !API.currentUser() || saving || syncing || document.hidden || !navigator.onLine) return;
  syncing = true; const seq = generation;
  try {
    const next = await API.loadExpenses();
    if (seq === generation && JSON.stringify(next) !== JSON.stringify(expenses)) { expenses = next; updateLedger(); }
  } catch (error) { if (seq === generation) { clear(); showError(error); } }
  finally { syncing = false; }
}, 2000);
setInterval(() => { if (ready && API.currentUser() && budget && !saving && !editing() && !document.hidden) refresh(); }, 30000);
try { await API.connect(onUser); ready = true; }
catch (error) { showError(error); }

function ledgerForm() {
  const date = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  return `<section class="card"><h2>지출 입력</h2><form class="stack" data-form="expense">
    <label>금액<input name="amount" inputmode="numeric" required placeholder="원"></label>
    <label>내용<input name="text" maxlength="300" required></label>
    <div class="two"><label>비목<select name="category">${Object.entries(budget.items).map(([id, item]) => `<option value="${esc(id)}">${esc(item.label)}</option>`).join("")}</select></label><label>날짜<input type="date" name="date" value="${date}" required></label></div>
    <div class="btns"><button type="submit" class="btn">지출 저장</button><button type="button" class="btn ghost" data-act="expense-cancel">취소</button></div>${errorLine()}
  </form></section>`;
}
function updateLedger() {
  if (!budget) return;
  const adjusted = ledgerItems(budget.items, expenses), sum = totals(adjusted);
  const summary = document.querySelector('#budget-summary .budget-values');
  if (summary) summary.outerHTML = amounts(sum.budget, sum.spent, sum.remaining, true);
  const target = document.getElementById('expense-list');
  if (!target) return;
  const balancesOpen = target.querySelector('.budget-balances')?.open;
  target.innerHTML = `<h2>가계부 내역 <small>${won(Object.values(expenses).reduce((sum, entry) => sum + entry.amount, 0))}원</small></h2><details class="budget-balances" ${balancesOpen ? "open" : ""}><summary>비목별 잔액</summary>${Object.values(adjusted).map(item => `<div><span>${esc(item.label)}</span><b class="${item.budget - (item.spent || 0) < 0 ? 'negative' : ''}">${won(item.budget - (item.spent || 0))}원 남음</b></div>`).join('')}</details>` +
    Object.entries(expenses).sort((a,b) => b[1].date.localeCompare(a[1].date) || b[1].updatedAt-a[1].updatedAt).map(([id, e]) => `<article class="expense-row"><div class="budget-head"><b>${esc(e.text)}</b><strong>${won(e.amount)}원</strong></div><div class="sub">${esc(e.date)} · ${esc(budget.items[e.category]?.label || '미분류')}</div><div class="btns"><button class="btn sm ghost" data-act="expense-edit" data-id="${esc(id)}">수정</button><button class="btn sm ghost" data-act="expense-delete" data-id="${esc(id)}">삭제</button></div></article>`).join('');
}

function batchCard() {
  if (batchError) return `<section class="card" id="batch-import"><p class="err">${esc(batchError)}</p><button class="btn ghost" data-act="batch-cancel">닫기</button></section>`;
  if (!batchDraft) return "";
  if (!budget) {
    return `<section class="card" id="batch-import"><h2>지출 내역 추가 <small>${won(batchDraft.rows.reduce((sum, row) => sum + row.amount, 0))}원</small></h2>${batchDraft.rows.map(row => `<article class="expense-row"><div class="budget-head"><b>${esc(row.text)}</b><strong>${won(row.amount)}원</strong></div><small>${esc(row.category)}</small></article>`).join('')}<div class="btns"><button class="btn" data-act="setup-plan">계획서 확인</button><button class="btn ghost" data-act="batch-cancel">취소</button></div></section>`;
  }
  const rows = matchBatch(batchDraft.rows, budget.items, expenses);
  batchPreview = rows;
  const date = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  return `<section class="card" id="batch-import"><h2>지출 내역 추가 <small>${won(rows.reduce((sum, row) => sum + row.amount, 0))}원</small></h2><form class="stack" data-form="batch">
    ${rows.map(row => `<label class="batch-row"><input type="checkbox" name="rows" value="${esc(row.id)}" ${row.saved || !row.categoryId ? 'disabled' : row.matches.length ? '' : 'checked'}><span><b>${esc(row.text)} · ${won(row.amount)}원</b><small>${esc(row.category)}${row.saved ? ' · 이미 추가됨' : !row.categoryId ? ' · 비목 확인 필요' : row.matches.length ? ' · 동일 금액 내역 있음' : ''}</small>${row.matches.length && !row.saved ? `<small>${row.matches.map(e => esc(e.text) + ' · ' + esc(e.date)).join('<br>')}</small>` : ''}</span></label>`).join('')}
    <label>기록 날짜<input type="date" name="date" value="${date}" required></label>
    <div class="btns"><button class="btn" type="submit">선택 내역 추가</button><button class="btn ghost" type="button" data-act="batch-cancel">취소</button></div>${errorLine()}
  </form></section>`;
}
async function saveBatch(formData) {
  if (!batchDraft) return;
  const draft = batchDraft;
  const selected = new Set(formData.getAll('rows'));
  if (!selected.size) throw new Error('추가할 내역을 선택해 주세요.');
  const before = batchPreview;
  const latestBudget = await API.loadBudget();
  if (!latestBudget.data) throw new Error('예산계획서를 먼저 불러와 주세요.');
  const latest = await API.loadExpenses();
  const rows = matchBatch(draft.rows, latestBudget.data.items, latest);
  let added = 0;
  for (const row of rows.filter(row => selected.has(row.id))) {
    if (row.saved) continue;
    if (!row.categoryId) throw new Error('비목을 확인해 주세요.');
    const old = before.find(e => e.id === row.id);
    if (row.matches.length > (old?.matches.length || 0)) throw new Error('같은 금액의 내역이 추가됐어요. 다시 확인해 주세요.');
    try {
      await API.saveExpense(row.id, { category: row.categoryId, text: row.text, amount: row.amount, date: String(formData.get('date')), included: false });
      added++;
    } catch (error) {
      // 같은 링크의 동시 저장·응답 유실 후 재시도는 기존 기록을 덮어쓰지 않습니다.
      if (!(await API.loadExpense(row.id)).data) throw error;
    }
  }
  if (batchDraft === draft) discardBatch();
  await refresh(); toast(added ? `${added}건 추가했어요` : '이미 추가된 내역이에요');
}

window.addEventListener('hashchange', () => {
  if (!readBatchLink()) return;
  generation++;
  if (budget) {
    document.getElementById('batch-import')?.remove();
    main.insertAdjacentHTML('afterbegin', batchCard());
  } else if (!API.currentUser()) {
    showLogin();
  } else if (main.querySelector('[data-form=import]')) {
    render();
  }
});
