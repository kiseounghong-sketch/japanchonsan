import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Local emulators only: Auth :9099 (demo-jeju-budget), Database :9000.
// Run: node jeju/tools/budget-rules.test.mjs
const ns='demo-jeju-budget';
const db='http://127.0.0.1:9000';
const auth='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const project='demo-jeju-budget';
const pw=randomUUID();
async function authCall(endpoint,data,admin=false){const r=await fetch(`${auth}/${endpoint}?key=fake-api-key`,{method:'POST',headers:{'Content-Type':'application/json',...(admin?{Authorization:'Bearer owner'}:{})},body:JSON.stringify(data)});const value=await r.json();assert(r.ok,JSON.stringify(value));return value}
async function user(email,verified){
 let account=await authCall('accounts:signUp',{email,password:pw,returnSecureToken:true});
 if(verified){await authCall(`projects/${project}/accounts:update`,{localId:account.localId,emailVerified:true},true); account=await authCall('accounts:signInWithPassword',{email,password:pw,returnSecureToken:true});}
 return account;
}
async function request(path,token,method='GET',data,headers={}){
 const url=new URL(`${db}/${path}.json`);url.searchParams.set('ns',ns);if(token && token!=='owner')url.searchParams.set('auth',token); if(token==='owner')headers.Authorization='Bearer owner';
 return fetch(url,{method,headers:{'Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});
}
const reset=await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${project}/accounts`,{method:'DELETE',headers:{Authorization:'Bearer owner'}});assert(reset.ok);
const owner=await user('teacher@japanchonsan.app',false);
const editor=await user('editor@example.test',true);
const other=await user('other@example.test',true);
const pending=await user('pending@example.test',false);
const ru=await request('.settings/rules','owner','PUT',JSON.parse(await readFile(new URL('../../database.rules.json', import.meta.url),'utf8')));assert(ru.ok,await ru.text());
const fixture=await request('','owner','PUT',{jeju:{keys:{TEST123:true},s:{TEST123:{meta:{created:1}}}}});assert(fixture.ok);
let checks=0;
async function pass(p){const r=await p;assert(r.ok,await r.text());checks++;return r}
async function deny(p){const r=await p;assert([401,403].includes(r.status),'Expected denied, got '+r.status+': '+await r.text());checks++}
const data=(id)=>({items:{'item-0':{label:'검증 항목',budget:1000,spent:1200,approximate:true,note:'테스트',order:0}},pending:'확인 중',excluded:'별도 항목',updatedAt:{'.sv':'timestamp'},updatedBy:id});
await pass(request('jeju/budgetAccess',owner.idToken,'PUT',{editorEmail:'editor@example.test'}));
await pass(request('jeju/budget',owner.idToken,'PUT',data(owner.localId)));
await pass(request('jeju/budget',owner.idToken));
await pass(request('jeju/budget',editor.idToken));
await pass(request('jeju/budget',editor.idToken,'PUT',data(editor.localId)));
for(const u of [pending,other,null]){
 await deny(request('jeju/budget',u?.idToken));
 await deny(request('jeju/budget/items/item-0',u?.idToken));
 await deny(request('jeju/budget',u?.idToken,'PUT',data(u?.localId||'none')));
 await deny(request('jeju/budgetAccess',u?.idToken));
 await deny(request('jeju/budgetAccess',u?.idToken,'PUT',{editorEmail:'other@example.test'}));
}
// Even an allowlisted email cannot enter before mailbox verification.
await pass(request('jeju/budgetAccess',owner.idToken,'PUT',{editorEmail:'pending@example.test'}));
await deny(request('jeju/budget',pending.idToken));
await pass(request('jeju/budgetAccess',owner.idToken,'PUT',{editorEmail:'editor@example.test'}));
await deny(request('jeju',null));
await deny(request('jeju/budgetAccess',editor.idToken,'PUT',{editorEmail:'other@example.test'}));
await deny(request('jeju/budgetAccess',owner.idToken,'PUT',{editorEmail:'invalid'}));
await deny(request('jeju/budget',editor.idToken,'DELETE'));
await deny(request('jeju/budget',editor.idToken,'PUT',{...data(editor.localId),items:{}}));
await deny(request('jeju/budget',editor.idToken,'PUT',{...data(editor.localId),updatedBy:owner.localId}));
for(const value of [-1,1.5,1000000001,'1000']){const bad=data(editor.localId);bad.items['item-0'].spent=value;await deny(request('jeju/budget',editor.idToken,'PUT',bad));}
const extra=data(editor.localId);extra.items['item-30']=extra.items['item-0'];await deny(request('jeju/budget',editor.idToken,'PUT',extra));
await deny(request('jeju/budget',editor.idToken,'PUT',{...data(editor.localId),unexpected:true}));
await pass(request('jeju/s/TEST123',null));
await pass(request('jeju/s/TEST123/answers/test/test',null,'PUT','학생 기록'));
await deny(request('jeju/s/WRONG12/answers/test/test',null,'PUT','틀린 코드'));
await deny(request('jeju/s/TEST123/notices/test',editor.idToken,'PUT',{text:'권한 없음',ts:1}));
await pass(request('jeju/s/TEST123/notices/test',owner.idToken,'PUT',{text:'확인',ts:1}));
// Conditional writes reject a stale edit from another device.
const read=await request('jeju/budget',owner.idToken,'GET',undefined,{'X-Firebase-ETag':'true'});
const tag=read.headers.get('etag');assert(tag);
await pass(request('jeju/budget',editor.idToken,'PUT',data(editor.localId)));
const conflict=await request('jeju/budget',owner.idToken,'PUT',data(owner.localId),{'if-match':tag});assert.equal(conflict.status,412);checks++;
await pass(request('jeju/budgetAccess',owner.idToken,'PUT',{editorEmail:'other@example.test'}));
await deny(request('jeju/budget',editor.idToken));
await deny(request('jeju/budget',editor.idToken,'PUT',data(editor.localId)));
await pass(request('jeju/budgetAccess',owner.idToken,'PUT',{editorEmail:'editor@example.test'}));
// Ledger entries are private and validated independently of budget edits.
const expense={category:'item-0',amount:100,text:'테스트 결제',date:'2026-11-10',included:false,updatedAt:{'.sv':'timestamp'},updatedBy:owner.localId};
await pass(request('jeju/expenses/entry-a',owner.idToken,'PUT',expense));
await pass(request('jeju/expenses',editor.idToken));
for (const u of [null,other,pending]) {
 await deny(request('jeju/expenses',u?.idToken));
 await deny(request('jeju/expenses/entry-a',u?.idToken,'PUT',expense));
 await deny(request('jeju/expenses/entry-a',u?.idToken,'DELETE'));
}
for (const patch of [{amount:0},{amount:-1},{amount:1.5},{category:'item-29'},{text:''},{included:'yes'}]) {
 await deny(request('jeju/expenses/invalid',owner.idToken,'PUT',{...expense,...patch}));
}
const entryRead=await request('jeju/expenses/entry-a',owner.idToken,'GET',undefined,{'X-Firebase-ETag':'true'});
await pass(request('jeju/expenses/entry-a',editor.idToken,'PUT',{...expense,amount:200,updatedBy:editor.localId}));
const stale=await request('jeju/expenses/entry-a',owner.idToken,'PUT',expense,{'if-match':entryRead.headers.get('etag')});
assert.equal(stale.status,412);checks++;
await pass(request('jeju/expenses/entry-a',editor.idToken,'DELETE'));
// Empty document for browser import flow; only local emulator fixture is removed.
await pass(request('jeju/budget','owner','DELETE'));
console.log('PASS',checks,'REST database permission, validation and concurrency checks');
