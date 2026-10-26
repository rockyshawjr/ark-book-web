import test from 'node:test';import assert from 'node:assert/strict';
import Core from '../supabase/functions/ark-keys/core.mjs';import W from '../supabase/functions/ark-keys/websync.mjs';
import {makeHandler,sha256} from '../supabase/functions/ark-keys/handler.mjs';import {memoryStore} from './store-postgrest.mjs';import {mockGitHub} from './mockgh.mjs';
const SVC_T='svc-token-'+'x'.repeat(30),ADMIN_T='admin-token-'+'y'.repeat(30),RO_T='readonly-token-'+'z'.repeat(30),OTHER_T='other-token-'+'w'.repeat(30);
const FEES=[4321.77,1234.56,987.65];const SECRET=/4321|1234\.56|987\.65|4,321|1,234|9999|777/;
const seen=[];
function setup(env={}){
 const gh=mockGitHub({tokens:{[SVC_T]:{login:'ark-bot',write:true},[ADMIN_T]:{login:'rockyshawjr',write:true},[RO_T]:{login:'rockyshawjr',write:false},[OTHER_T]:{login:'someone',write:true}}});
 const d=Core.validate({events:[{id:'e1',name:'Throw Down in T-Town',date:'2026-11-07'}],roster:['KJ Valentine','BK Bennet'],titles:[]});
 ['KJ Valentine','BK Bennet','Sound Guy'].forEach((n,i)=>{const b=Core.bookingAdd(d,{role:i==2?'Sound':'Talent',talent:n,event:'Throw Down in T-Town',date:'2026-11-07',fee:FEES[i]});b.id='b'+i});
 Core.stamp(d,1000);gh.commitFiles({'data.json':JSON.stringify(d),'roster/KJ Valentine/promo.png':Buffer.from('PNGDATA'),'archive/2026/11-07 Throw Down in T-Town/posters/p.png':Buffer.from('POSTER')},'seed');
 // an older commit in history also had fees; nothing may expose it
 const store=memoryStore();let t=5000;
 const h=makeHandler({Core,W,env:{ARK_GH_TOKEN:SVC_T,...env},store,fetch:gh.fetch,now:()=>(t+=1000)});
 const call=async(method,path,{key,gt,body}={})=>{const headers={};if(key)headers['x-ark-key']=key;if(gt)headers['x-gh-token']=gt;if(body)headers['content-type']='application/json';
  const r=await h(new Request('https://x.supabase.co/functions/v1/ark-keys'+path,{method,headers,body:body?JSON.stringify(body):undefined}));const buf=Buffer.from(await r.arrayBuffer());seen.push({path,key:!!key,text:buf.toString('latin1')});let j=null;try{j=JSON.parse(buf.toString())}catch(_){}return {status:r.status,j,buf}};
 const mk=async role=>(await call('POST','/admin/keys/create',{gt:ADMIN_T,body:{label:role+' tablet',role}})).j;
 return {gh,store,call,mk}}
const nonAdmin=s=>s.filter(x=>x.key);

test('admin endpoints need Rocky full-access GitHub token',async()=>{const {call,mk}=setup();const c=await mk('crew');
 assert.equal((await call('POST','/admin/keys/list')).status,403);
 assert.equal((await call('POST','/admin/keys/list',{gt:RO_T})).status,403,'read-only token');
 assert.equal((await call('POST','/admin/keys/list',{gt:OTHER_T})).status,403,'other user with write');
 assert.equal((await call('POST','/admin/keys/list',{gt:c.key})).status,403,'ark key as gh token');
 assert.equal((await call('POST','/admin/keys/list',{key:c.key})).status,403,'ark key header');
 assert.equal((await call('POST','/admin/keys/create',{gt:ADMIN_T,body:{label:'x',role:'admin'}})).status,400,'cannot mint admin keys');});

test('keys are shown once and stored only as hashes',async()=>{const {call,mk,store}=setup();const c=await mk('viewer');assert.match(c.key,/^ark_[A-Za-z0-9_-]{40,}$/);
 const l=await call('POST','/admin/keys/list',{gt:ADMIN_T});assert.equal(l.j.keys.length,1);assert.ok(!JSON.stringify(l.j).includes(c.key));assert.ok(!('key_hash' in l.j.keys[0]));
 assert.equal(store.rows[0].key_hash,await sha256(c.key));assert.ok(!JSON.stringify(store.rows).includes(c.key));
 assert.equal(l.j.keys[0].last_used,null);await call('GET','/me',{key:c.key});const l2=await call('POST','/admin/keys/list',{gt:ADMIN_T});assert.ok(l2.j.keys[0].last_used,'last used recorded')});

test('viewer reads everything but fees, cannot write, cannot reach data.json or history',async()=>{const {call,mk,gh}=setup();const v=await mk('viewer');
 const me=await call('GET','/me',{key:v.key});assert.deepEqual(me.j,{role:'viewer',label:'viewer tablet'});
 const d=await call('GET','/data',{key:v.key});assert.equal(d.status,200);assert.equal(d.j.data.bookings.length,3);assert.ok(d.j.data.bookings.every(b=>b.fee===0));assert.equal(d.j.data.roster.length,2);
 // record hashes are recomputed without the fee so they cannot be used to guess it
 for(const b of d.j.data.bookings){const real=gh.readData().meta.rec['bk:'+b.id].h;assert.notEqual(d.j.data.meta.rec['bk:'+b.id].h,real)}
 assert.ok(!('data.json' in d.j.tree));assert.deepEqual(Object.keys(d.j.tree).sort(),['archive/2026/11-07 Throw Down in T-Town/posters/p.png','roster/KJ Valentine/promo.png']);
 assert.equal((await call('GET','/blob?path=roster/KJ%20Valentine/promo.png',{key:v.key})).buf.toString(),'PNGDATA');
 for(const p of ['data.json','./data.json','roster/../data.json','roster/x/promo.png/../../../data.json','.git/config','archive/a/b/posters/x.json'])assert.equal((await call('GET','/blob?path='+encodeURIComponent(p),{key:v.key})).status,403,p);
 for(const p of ['/git/blobs/abc','/commits','/history','/data.json','/raw','/admin','/blob?sha=abc'])assert.ok([403,404].includes((await call('GET',p,{key:v.key})).status),p);
 const before=gh.refs.main0;const w=await call('POST','/sync',{key:v.key,body:{data:d.j.data}});assert.equal(w.status,403);assert.equal(gh.refs.main0,before,'no commit');});

test('crew edits keep every fee, new fees and fee edits are dropped, response stays fee free',async()=>{const {call,mk,gh}=setup();const c=await mk('crew');
 const d=(await call('GET','/data',{key:c.key})).j;const data=d.data;
 const b0=data.bookings.find(b=>b.id==='b0');b0.date='2026-11-08';b0.fee=9999;// crew edit + attempted fee change
 Core.bookingAdd(data,{role:'Camera',talent:'New Cam',event:'Throw Down in T-Town',date:'2026-11-07',fee:777});
 data.bookings=data.bookings.filter(b=>b.id!=='b2').concat([]);// delete sound booking
 Core.stamp(data,90000);
 const r=await call('POST','/sync',{key:c.key,body:{data,base:d.tree,last:0,mtime:90000}});assert.equal(r.status,200,JSON.stringify(r.j));
 const real=gh.readData();const g=id=>real.bookings.find(b=>b.id===id);
 assert.equal(g('b0').date,'2026-11-08');assert.equal(g('b0').fee,FEES[0],'fee kept on crew edit');assert.equal(g('b1').fee,FEES[1],'untouched fee kept');assert.equal(g('b2'),undefined,'crew may delete a booking');
 const nb=real.bookings.find(b=>b.talent==='New Cam');assert.equal(nb.fee,0,'crew cannot set a fee');
 assert.ok(r.j.data.bookings.every(b=>b.fee===0));assert.equal(real.meta.rec['bk:b1'].t,1000,'untouched booking keeps its edit time');});

test('stale crew data never overwrites a newer admin fee change',async()=>{const {call,mk,gh}=setup();const c=await mk('crew');const d=(await call('GET','/data',{key:c.key})).j;
 const real=gh.readData();real.bookings.find(b=>b.id==='b1').fee=1500;Core.stamp(real,50000);gh.commitFiles({'data.json':JSON.stringify(real)},'admin fee');
 const b1=d.data.bookings.find(b=>b.id==='b1');b1.date='2026-11-09';Core.stamp(d.data,60000);
 assert.equal((await call('POST','/sync',{key:c.key,body:{data:d.data,base:d.tree}})).status,200);
 const now=gh.readData().bookings.find(b=>b.id==='b1');assert.equal(now.fee,1500);assert.equal(now.date,'2026-11-09')});

test('crew can upload phone media but not data.json or other files through media',async()=>{const {call,mk,gh}=setup();const c=await mk('crew');const d=(await call('GET','/data',{key:c.key})).j;
 const pend={'roster/BK Bennet/promo.png':{b64:Buffer.from('BKPIC').toString('base64')},'data.json':{b64:Buffer.from('{"evil":1}').toString('base64')},'notes/secret.txt':{b64:'eA=='}};
 assert.equal((await call('POST','/sync',{key:c.key,body:{data:d.data,base:d.tree,pending:pend}})).status,200);
 assert.equal(gh.readFile('roster/BK Bennet/promo.png').toString(),'BKPIC');assert.equal(gh.readFile('notes/secret.txt'),null);assert.equal(gh.readData().bookings.find(b=>b.id==='b0').fee,FEES[0]);assert.ok(!gh.readData().evil)});

test('revoke and role change take effect immediately',async()=>{const {call,mk}=setup();const c=await mk('crew');const list=(await call('POST','/admin/keys/list',{gt:ADMIN_T})).j.keys;const id=list[0].id;
 assert.equal((await call('POST','/admin/keys/update',{gt:ADMIN_T,body:{id,role:'viewer'}})).j.info.role,'viewer');
 const d=(await call('GET','/data',{key:c.key})).j;assert.equal((await call('POST','/sync',{key:c.key,body:{data:d.data}})).status,403);
 assert.ok((await call('POST','/admin/keys/revoke',{gt:ADMIN_T,body:{id}})).j.info.revoked_at);
 for(const p of ['/me','/data','/blob?path=roster/KJ%20Valentine/promo.png'])assert.equal((await call('GET',p,{key:c.key})).status,401,p);
 assert.equal((await call('GET','/me',{key:'ark_'+'A'.repeat(43)})).status,401);assert.equal((await call('GET','/me')).status,401)});

test('missing service token fails closed without leaking',async()=>{const {call,mk}=setup({ARK_GH_TOKEN:''});assert.equal((await call('GET','/me',{key:'ark_'+'A'.repeat(43)})).status,401);const v=await mk('viewer');const r=await call('GET','/data',{key:v.key});assert.equal(r.status,503);assert.ok(!r.buf.toString().includes(ADMIN_T))});

test('no response to a non-admin key ever contained a fee or a token',()=>{const bad=nonAdmin(seen).filter(x=>SECRET.test(x.text)||x.text.includes(SVC_T)||x.text.includes(ADMIN_T));assert.equal(bad.length,0,bad.map(b=>b.path).join(','));assert.ok(nonAdmin(seen).length>20)});
