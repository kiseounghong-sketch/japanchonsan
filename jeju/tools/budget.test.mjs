import test from 'node:test';
import assert from 'node:assert/strict';
import { amount, parseBudget, totals, validateBudget, ledgerItems } from '../js/budget-model.js';

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

test('계획과 실제 지출을 분리하고 이전 반영 표시도 한 번만 합산한다', () => {
  const items = {'item-0': {label:'식비',budget:1000, spent:700}, 'item-1':{label:'물품',budget:500,spent:null}};
  const original = structuredClone(items);
  assert.deepEqual(totals(ledgerItems(items, {})), {budget:1500,spent:0,remaining:1500,unknown:0});
  const entries = {a:{category:'item-0',amount:100,included:false},b:{category:'item-0',amount:200,included:true}};
  assert.deepEqual(totals(ledgerItems(items, entries)), {budget:1500,spent:300,remaining:1200,unknown:0});
  assert.deepEqual(items, original);
  entries.a.amount = 1500;
  assert.equal(totals(ledgerItems(items, entries)).remaining,-200);
  delete entries.a;
  assert.equal(totals(ledgerItems(items, entries)).spent,200);
});
test('비목이 없어진 기록도 실제 사용액에서 빠뜨리지 않는다', () => {
  const result = ledgerItems({'item-0':{budget:1000,spent:900}}, {a:{category:'item-1',amount:100}});
  assert.equal(result.uncategorized.label,'미분류');
  assert.equal(totals(result).remaining,900);
});
