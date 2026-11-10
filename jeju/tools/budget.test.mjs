import test from 'node:test';
import assert from 'node:assert/strict';
import { amount, parseBudget, totals, validateBudget, withExpenses, existingDetails } from '../js/budget-model.js';

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

test('명시된 확정 내역만 나누고 원본 합계는 변경하지 않는다', () => {
  const items = {
    'item-0':{label:'교통',spent:3000,note:'확정(이동 A 1,000 + 이동 B 2,000)',order:0},
    'item-1':{label:'식사',spent:5000,note:'2끼 3,000 확정 + 다음 식사 2,000',order:1},
    'item-2':{label:'대여',spent:700,note:'대여 확정',order:2},
    'item-3':{label:'미정',spent:null,note:'준비 중',order:3},
  };
  const original = structuredClone(items), rows = existingDetails(items);
  assert.deepEqual(rows.filter(row => row.confirmed).map(row => row.amount), [1000,2000,3000,700]);
  assert.equal(rows.filter(row => row.confirmed).reduce((sum,row)=>sum+row.amount,0),6700);
  assert.deepEqual(items, original);
  assert.equal(rows.find(row => row.label === '다음 식사').confirmed, false);
});
test('단가·인원·불일치·예상·미확정을 확정 지출로 추측하지 않는다', () => {
  for (const note of ['7명 반영(1인 1,000)', '미확정', '확정 예정', '견적 전', '확정 전']) {
    assert.equal(existingDetails({a:{label:'체험',spent:7000,note,order:0}})[0].confirmed, false);
  }
  const mismatch = existingDetails({a:{label:'교통',spent:5000,note:'확정(이동 A 1,000 + 이동 B 2,000)',order:0}});
  assert.equal(mismatch.length,1); assert.equal(mismatch[0].amount,5000);
  assert.equal(existingDetails({a:{label:'숙박',spent:7000,note:'확정',approximate:true,order:0}})[0].confirmed,false);
});

test('부분 확정의 합계가 바뀌어도 전체 확정으로 승격하지 않는다', () => {
  const rows=existingDetails({a:{label:'식사',spent:6000,note:'첫 식사 3,000 확정 + 다음 식사 2,000',order:0}});
  assert.equal(rows.length,1); assert.equal(rows[0].confirmed,false);
  const mixed=existingDetails({a:{label:'식사',spent:5000,note:'확정(첫 식사 3,000 + 다음 식사 2,000 예상)',order:0}});
  assert.equal(mixed[1].confirmed,false);
});
