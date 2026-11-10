import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBatch, matchBatch, batchFromPlan } from '../js/budget-batch.js';
const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
const data = {v:1,id:'test-batch-123',rows:[{category:'교통',text:'결제 A',amount:1000}]};
test('반복 링크의 기록 ID는 고정되며 불필요한 필드를 가져오지 않는다',()=>{
 const a=parseBatch(encode({...data,password:'ignored'}));
 assert.deepEqual(a,parseBatch(encode(data)));
 assert.equal(a.rows[0].id,'batch-test-batch-123-0');
 assert.equal(a.password,undefined);
});
test('손상된 링크와 잘못된 금액·경로·큰 자료를 거부한다',()=>{
 for(const bad of ['%', 'x'.repeat(16001),encode({...data,id:'../x'}),encode({...data,rows:[]}),encode({...data,rows:[{...data.rows[0],amount:-1}]}),encode({...data,rows:[{...data.rows[0],amount:1.5}]})]) assert.throws(()=>parseBatch(bad));
});
test('같은 링크 및 동일 비목·금액 중복을 구분하고 모호한 비목을 막는다',()=>{
 const batch=parseBatch(encode(data));
 const items={'item-0':{label:'교통'}};
 const records={manual:{category:'item-0',amount:1000,text:'이전 기록'}};
 assert.equal(matchBatch(batch.rows,items,records)[0].matches.length,1);
 records[batch.rows[0].id]={category:'item-0',amount:1500};
 assert.equal(matchBatch(batch.rows,items,records)[0].saved,true);
 assert.equal(matchBatch(batch.rows,{'item-0':{label:'교통'},'item-1':{label:'교통'}},{} )[0].categoryId,null);
});
test('예산이 없는 기기의 계획서도 검증 후 입력 초안으로만 가져온다',()=>{
 const plan='- 교통: 2,000 / 1,000 / 1,000';
 assert.equal(parseBatch(encode({...data,plan})).planText,plan);
 assert.throws(()=>parseBatch(encode({...data,plan:'invalid'})));
});
test('같은 비목의 합산 기록도 중복 후보로 표시한다',()=>{
 const batch=parseBatch(encode({...data,rows:[data.rows[0],{...data.rows[0],text:'결제 B',amount:2000}]}));
 const result=matchBatch(batch.rows,{'item-0':{label:'교통'}},{manual:{category:'item-0',amount:3000,text:'합산 결제'}});
 assert.deepEqual(result.map(row=>row.matches.length),[1,1]);
});

test('비공개 계획서의 확정 비목만 가져오고 항공 왕복 금액을 검증한다',()=>{
 const items={
  'item-0':{label:'항공료',spent:3000,note:'가는 편 1,000 + 오는 편 2,000'},
  'item-1':{label:'숙박비',spent:4000,approximate:true},
  'item-2':{label:'임차료',spent:5000},
  'item-3':{label:'급량비',spent:6000},
  'item-4':{label:'용품비',spent:null}
 };
 const draft=batchFromPlan(items);
 assert.deepEqual(draft.rows.map(r=>r.amount),[1000,2000,4000,5000]);
 assert.deepEqual(batchFromPlan(items),draft);
 items['item-0'].spent=3500;
 assert.equal(batchFromPlan(items).rows[0].amount,3500);
 assert.equal(batchFromPlan({'item-0':{label:'항공료',spent:0}}),null);
 const saved=Object.fromEntries(draft.rows.map(r=>[r.id,{category:'item-0',amount:r.amount}]));
 assert.ok(matchBatch(draft.rows,items,saved).every(r=>r.saved));
});
