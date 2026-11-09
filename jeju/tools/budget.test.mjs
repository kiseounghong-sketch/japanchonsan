import test from 'node:test';
import assert from 'node:assert/strict';
import { amount, parseBudget, totals, validateBudget, withExpenses } from '../js/budget-model.js';

test('미정 지출과 초과 지출을 합계에 반영한다', () => {
  const data = parseBudget('- 항목 A: 1,000 / 약 1,200 / -200 — 예상\n- 항목 B: 500 / 미정 / 500\n※ 개인 부담은 별도\n■ 아직 금액 모르는 것\n- 추가 항목');
  assert.deepEqual(totals(data.items), { budget: 1500, spent: 1200, remaining: 300, unknown: 1 });
  assert.equal(data.items['item-0'].approximate, true);
  assert.equal(data.excluded, '개인 부담은 별도');
  assert.equal(data.pending, '추가 항목');
});
test('음수·소수·잘못된 숫자·안전 범위 밖 금액을 거절한다', () => {
  for (const value of ['-1', '1.5', '1e3', '1000000001', 'NaN']) assert.throws(() => amount(value));
  assert.equal(amount('1,234'), 1234);
  assert.equal(amount('', true), null);
});
test('붙여넣은 잔액이 계산과 다르면 저장하지 않는다', () => {
  assert.throws(() => parseBudget('- 항목 A: 100 / 20 / 90'), /잔액/);
});
test('JSON에서 접근 권한·수정자 등의 임의 필드는 가져오지 않는다', () => {
  const parsed = parseBudget(JSON.stringify({ items: { 'item-0': { label: '항목', budget: 100, spent: 20, order: 0, private: true } }, editorEmail: 'ignored@example.test', updatedBy: 'ignored' }));
  assert.deepEqual(Object.keys(parsed).sort(), ['excluded', 'items', 'pending']);
  assert.equal(parsed.items['item-0'].private, undefined);
});
test('비목 개수와 항목 키를 제한한다', () => {
  const item = { label: '항목', budget: 0, spent: null, note: '', approximate: false, order: 0 };
  assert.throws(() => validateBudget({ items: { 'item-30': item }, pending: '', excluded: '' }));
  assert.throws(() => validateBudget({ items: {}, pending: '', excluded: '' }));
  assert.throws(() => validateBudget({ items: { 'item-0': { ...item, note: 'x'.repeat(1001) } }, pending: '', excluded: '' }));
});

test('추가 지출만 차감하고 기존 반영 내역은 중복 차감하지 않는다', () => {
  const items = {'item-0': {budget:1000, spent:200}};
  const entries = {a:{category:'item-0',amount:100,included:false},b:{category:'item-0',amount:200,included:true}};
  assert.equal(totals(withExpenses(items, entries)).remaining, 700);
  assert.equal(items['item-0'].spent, 200);
  delete entries.a;
  assert.equal(totals(withExpenses(items, entries)).remaining, 800);
});
