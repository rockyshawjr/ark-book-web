// window.sb for the browser: same bridge the Electron app uses, backed by localStorage + IndexedDB + the GitHub API (websync.js).
(()=>{
const W=ArkWebSync,LS=localStorage,P='ark.';
const kv={get:k=>{try{return JSON.parse(LS.getItem(P+k))}catch(_){return null}},set:(k,v)=>LS.setItem(P+k,JSON.stringify(v))};
// blob cache in IndexedDB (sha -> bytes)
const idb=new Promise(res=>{try{const r=indexedDB.open('ark-book',1);r.onupgradeneeded=()=>r.result.createObjectStore('blobs');r.onsuccess=()=>res(r.result);r.onerror=()=>res(null)}catch(_){res(null)}});
const mem={};
const blobs={async get(sha){if(mem[sha])return mem[sha];const db=await idb;if(!db)return null;return new Promise(r=>{const q=db.transaction('blobs').objectStore('blobs').get(sha);q.onsuccess=()=>{if(q.result)mem[sha]=q.result;r(q.result||null)};q.onerror=()=>r(null)})},
 async put(sha,u8){mem[sha]=u8;const db=await idb;if(!db)return;await new Promise(r=>{const t=db.transaction('blobs','readwrite');t.objectStore('blobs').put(u8,sha);t.oncomplete=r;t.onerror=r})}};
let listeners=[];const emit=e=>listeners.forEach(f=>{try{f(e)}catch(_){}});
const cfg=()=>kv.get('cfg')||{};
let sync=null,timer=null,loop=null;
function mkSync(){const c=cfg();sync=new W.WebSync({Core,kv,blobs,token:LS.getItem(P+'token')||'',owner:c.owner,repo:c.repo,branch:c.branch,notify:emit});
 clearInterval(loop);if(sync.token){loop=setInterval(()=>sync.syncNow(),3*60*1000)}}
mkSync();
const kick=()=>{if(!sync.token)return;clearTimeout(timer);timer=setTimeout(()=>sync.syncNow(),6000)};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&sync.token)sync.syncNow()});window.addEventListener('online',()=>sync.token&&sync.syncNow());
// object URLs for cached blobs (path -> url)
const urls={},tried=new Set();let redrawT=null;const GIF='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const mime=p=>({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',heic:'image/heic',pdf:'application/pdf'})[W.ext(p)]||'application/octet-stream';
async function ensure(path){const sha=sync.view()[path];if(!sha)return null;const key=path+'@'+sha;if(urls[key])return urls[key];const u=await sync.getFile(path);if(!u)return null;return urls[key]=URL.createObjectURL(new Blob([u],{type:mime(path)}))}
function urlFor(path){const sha=sync.view()[path];if(!sha)return GIF;const key=path+'@'+sha;if(urls[key])return urls[key];if(!tried.has(key)){tried.add(key);ensure(path).then(u=>{if(u){clearTimeout(redrawT);redrawT=setTimeout(()=>emit({type:'media'}),150)}}).catch(()=>{})}return GIF}
const pick=(accept,multiple)=>new Promise(res=>{const i=document.createElement('input');i.type='file';i.accept=accept;i.multiple=!!multiple;i.style.display='none';document.body.appendChild(i);i.onchange=()=>{res([...i.files]);i.remove()};i.oncancel=()=>{res([]);i.remove()};i.click()});
const bytes=async f=>new Uint8Array(await f.arrayBuffer());
const dl=(name,text,type)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),500)};
const promoPath=n=>{const v=sync.view(),d='roster/'+W.rsafe(n)+'/';return Object.keys(v).find(p=>p.startsWith(d)&&W.PROMO.test(p))||null};
const listArch=(ev,kind)=>{const d=W.adir(ev,kind)+'/',v=sync.view();return Object.keys(v).filter(p=>p.startsWith(d)&&W.ARCH.test(p)).sort()};
async function place(ev,kind,file){const e=W.ext(file.name);if(!W.AEXT.includes(e))throw new Error(`.${e||'?'} is not supported here (use ${W.AEXT.join(', ')}). Videos are not archived.`);
 const u=await bytes(file),sha=await W.gitSha(u),d=W.adir(ev,kind),v=sync.view();
 for(const p of Object.keys(v))if(p.startsWith(d+'/')&&v[p]===sha)return {path:p,duplicate:true};
 const dot=file.name.lastIndexOf('.'),base=W.asafe(file.name.slice(0,dot>0?dot:file.name.length)),x='.'+e;let dst=`${d}/${base}${x}`,n=2;while(v[dst])dst=`${d}/${base} (${n++})${x}`;
 await sync.putFile(dst,u,sha);return {path:dst,duplicate:false}}
function settings(){const c=cfg(),has=!!LS.getItem(P+'token');const o=document.createElement('div');o.id='setup';o.innerHTML=`<div class="g pad box"><h2>Phone sync</h2><div class="note">Paste the same sync token the Macs use. It is stored only on this phone (localStorage) and is never sent anywhere except api.github.com.</div>
 <input id="tk" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${has?'Token saved (type a new one to replace)':'Sync token'}"><details><summary class="note">Advanced</summary><input id="own" placeholder="owner" value="${c.owner||'rockyshawjr'}"><input id="rep" placeholder="repo" value="${c.repo||'g12-updates'}"><input id="brn" placeholder="branch" value="${c.branch||'ark-book-data'}"></details>
 <div class="row"><button class="b" id="tsave">Save and sync</button>${has?'<button class="b o" id="tdis">Disconnect</button>':''}<button class="b o" id="tx">Close</button></div><div class="note" id="tmsg"></div></div>`;document.body.appendChild(o);
 o.querySelector('#tx').onclick=()=>o.remove();
 o.querySelector('#tsave').onclick=()=>{const t=o.querySelector('#tk').value.trim();if(t)LS.setItem(P+'token',t);kv.set('cfg',{owner:o.querySelector('#own').value.trim()||'rockyshawjr',repo:o.querySelector('#rep').value.trim()||'g12-updates',branch:o.querySelector('#brn').value.trim()||'ark-book-data'});mkSync();o.remove();sync.syncNow()};
 const d=o.querySelector('#tdis');if(d)d.onclick=()=>{if(confirm('Remove the sync token from this phone? Local data stays.')){LS.removeItem(P+'token');mkSync();o.remove();emit({type:'status',status:sync.status})}}}
const unsupported=m=>({error:m});
window.sb={
 load:async()=>({data:kv.get('data'),path:'this phone (synced through GitHub)'}),
 save:async d=>{kv.set('data',d);kv.set('dataMtime',Date.now());kick();return true},
 syncNow:()=>sync.syncNow(),syncStatus:async()=>sync.status,onSync:cb=>{listeners.push(cb);if(!sync.token)setTimeout(()=>emit({type:'status',status:sync.status}),0);else setTimeout(()=>sync.syncNow(),500)},
 openFolder:async()=>settings(),board:async()=>null,pathForFile:f=>f,urlFor,
 exportEvent:async(kind,data,id)=>{const ev=data.events.find(x=>x.id===id);if(!ev)return null;const base=(ev.name.replace(/[^\w\- ]+/g,'').trim()||'event');
  if(kind==='md'){dl(base+'.md',Core.toMarkdown(data,ev),'text/markdown');return base+'.md (downloaded)'}
  const sheet=kind.startsWith('sheet');const html=sheet?Core.toSheetHTML(data,ev):Core.toHTML(data,ev,'logo.png');const w=window.open('','_blank');if(!w)return 'Pop-up blocked. Allow pop-ups to print or save as PDF.';w.document.write(html);w.document.close();setTimeout(()=>w.print(),600);return 'opened for print / Save as PDF'},
 backupExport:async d=>{dl('Ark-Book-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(d,null,1),'application/json');return 'downloaded (JSON only, no media)'},
 backupImport:async()=>{const [f]=await pick('.json,application/json');if(!f)return null;try{return {data:Core.validate(JSON.parse(await f.text())),path:f.name}}catch(e){return {error:String(e.message||e)}}},
 mediaAll:async names=>{const out={};await Promise.all(names.map(async n=>{const p=promoPath(n);out[n]={promo:p?await ensure(p).catch(()=>null):null,video:null,music:null}}));return out},
 mediaAttach:async(n,kind,src)=>{if(kind!=='promo')return {error:'Intro '+(kind==='video'?'videos':'music')+' are added on the Mac. Only promo pictures can be attached on the phone.'};
  try{if(!src){[src]=await pick('image/*');if(!src)return {canceled:true}}const e=W.ext(src.name);if(!W.KEXT.includes(e))return {error:`.${e||'?'} is not a supported promo picture`};
   const d='roster/'+W.rsafe(n)+'/',v=sync.view();Object.keys(v).filter(p=>p.startsWith(d)&&W.PROMO.test(p)).forEach(p=>sync.delFile(p));await sync.putFile(d+'promo.'+e,await bytes(src));kick();return {path:d+'promo.'+e}}catch(err){return {error:String(err.message||err)}}},
 mediaRemove:async(n,kind)=>{if(kind!=='promo')return false;const p=promoPath(n);if(p){sync.delFile(p);kick()}return !!p},
 mediaRename:async(a,b)=>{const da='roster/'+W.rsafe(a)+'/',db='roster/'+W.rsafe(b)+'/';if(da===db)return {ok:false};let any=false;for(const p of Object.keys(sync.view()))if(p.startsWith(da)&&W.PROMO.test(p)){sync.copyFile(p,db+p.slice(da.length));sync.delFile(p);any=true}kick();return {ok:any}},
 mediaTrash:async n=>{const d='roster/'+W.rsafe(n)+'/';let any=false;for(const p of Object.keys(sync.view()))if(p.startsWith(d)&&W.PROMO.test(p)){sync.delFile(p);any=true}kick();return any},
 mediaHas:async n=>!!promoPath(n),
 archiveAll:async evs=>{const out={},used=new Set();for(const ev of evs){out[ev.id]={posters:listArch(ev,'posters'),matchcards:listArch(ev,'matchcards')};used.add(W.ayear(ev)+'/'+W.afolder(ev))}
  const orph={};for(const p of Object.keys(sync.view())){if(!W.ARCH.test(p))continue;const [,y,f]=p.split('/');if(used.has(y+'/'+f))continue;const o=orph[y+'/'+f]=orph[y+'/'+f]||{year:y,folder:f,posters:[],matchcards:[]};o[p.split('/')[3]].push(p)}
  return {events:out,orphans:Object.values(orph)}},
 archiveAttach:async(ev,kind,src,rep)=>{try{const files=src?[src]:await pick('image/*,application/pdf',true);if(!files.length)return {canceled:true};const results=[];
   for(const f of files){const r=await place(ev,kind,f);results.push(r);if(rep&&results.length===1&&r.path!==rep)sync.delFile(rep)}kick();return {results}}catch(err){return {error:String(err.message||err)}}},
 archiveRemove:async fp=>{sync.delFile(fp);kick();return true},
 archiveMove:async(a,b)=>{let any=false;for(const kind of ['posters','matchcards']){const da=W.adir(a,kind)+'/',db=W.adir(b,kind)+'/';if(da===db)continue;const v=sync.view();for(const p of Object.keys(v))if(p.startsWith(da)&&W.ARCH.test(p)){const to=db+p.slice(da.length);if(!Object.keys(v).some(q=>q.startsWith(db)&&v[q]===v[p])){sync.copyFile(p,to)}sync.delFile(p);any=true}}if(any)kick();return {ok:any}},
 archiveOpen:async fp=>{const u=await ensure(fp);if(u)window.open(u,'_blank')},archiveReveal:async()=>{},
 archiveSaveExport:async()=>unsupported('Exporting a match card into the archive is done on the Mac. On the phone, attach an image or PDF instead.'),
 archiveZipYear:async()=>unsupported('Year zip export is a Mac feature.')};
window.addEventListener('load',()=>{const b=document.getElementById('bdir');if(b)b.textContent='Phone sync token';if(!LS.getItem(P+'token')&&!LS.getItem(P+'asked')){LS.setItem(P+'asked','1');setTimeout(settings,600)}});
window.__arkWeb={sync:()=>sync,kv,blobs};
})();
