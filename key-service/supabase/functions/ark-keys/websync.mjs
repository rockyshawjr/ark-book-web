// generated from web/websync.js by svc/build.mjs
const module={exports:{}};
// Ark-Book web sync engine (browser and node). Same data merge as the Mac app (Core.stamp / adoptIds / mergeData / validate),
// same repo layout: data.json + roster/<name>/promo.* + archive/<year>/<MM-DD event>/{posters,matchcards}/<file>, one atomic commit per sync.
// Phone scope for media: promo pictures and archive images/PDF only. Intro videos and intro music are never touched (left as they are on the branch).
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ArkWebSync=factory()})(typeof self!=='undefined'?self:this,function(){
const PROMO=/^roster\/[^/]+\/promo\.[^/.]+$/i,ARCH=/^archive\/[^/]+\/[^/]+\/(posters|matchcards)\/[^/]+\.(png|jpe?g|gif|webp|heic|pdf)$/i;
const handled=p=>PROMO.test(p)||ARCH.test(p);
const KEXT=['png','jpg','jpeg','gif','webp','heic'],AEXT=['png','jpg','jpeg','gif','webp','heic','pdf'];
const rsafe=n=>String(n).replace(/[\/\\:*?"<>|]/g,'_').replace(/^\.+/,'_').trim()||'_';          // electron/media.cjs safe()
const asafe=n=>String(n||'').replace(/[\/\\:*?"<>|\x00-\x1f]/g,'_').replace(/^\.+/,'_').replace(/[. ]+$/,'').trim()||'_'; // electron/archive.cjs safe()
const ayear=ev=>/^\d{4}/.test(ev.date||'')?ev.date.slice(0,4):'Undated';
const afolder=ev=>(/^\d{4}-\d\d-\d\d/.test(ev.date||'')?ev.date.slice(5,10):'00-00')+' '+asafe(ev.name);
const adir=(ev,kind)=>`archive/${ayear(ev)}/${afolder(ev)}/${kind}`;
const ext=n=>(n.split('.').pop()||'').toLowerCase();
const hex=u8=>[...u8].map(b=>b.toString(16).padStart(2,'0')).join('');
async function gitSha(u8){const h=new TextEncoder().encode('blob '+u8.length+'\0');const all=new Uint8Array(h.length+u8.length);all.set(h);all.set(u8,h.length);return hex(new Uint8Array(await crypto.subtle.digest('SHA-1',all)))}
const b64=u8=>{if(typeof Buffer!=='undefined')return Buffer.from(u8).toString('base64');let s='';for(let i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));return btoa(s)};
const unb64=s=>{if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(s,'base64'));const b=atob(s.replace(/\s/g,'')),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
class WebSync{
 // o: {Core, kv:{get(k),set(k,v)}, blobs:{get(sha),put(sha,u8)}, token, owner, repo, branch, fetch, now, notify, log}
 constructor(o){Object.assign(this,{Core:o.Core,kv:o.kv,blobs:o.blobs,token:o.token||'',owner:o.owner||'rockyshawjr',repo:o.repo||'g12-updates',branch:o.branch||'ark-book-data',fetch:o.fetch||((...a)=>fetch(...a)),now:o.now||(()=>Date.now()),notify:o.notify||(()=>{}),log:o.log||(()=>{})});
  this.busy=false;this.pending=false;this.status={state:this.token?'idle':'off',msg:this.token?'':'Sync is off (no sync token on this phone)',last:null,warnings:[]}}
 set(state,msg,extra={}){this.status=Object.assign({},this.status,{state,msg:msg||''},extra);this.notify({type:'status',status:this.status})}
 async gh(method,p,body,raw){const r=await this.fetch(`https://api.github.com/repos/${this.owner}/${this.repo}${p}`,{method,headers:{Authorization:'Bearer '+this.token,Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(r.status===404&&method==='GET')return null;if(raw){if(!r.ok){const e=new Error('HTTP '+r.status);e.status=r.status;throw e}return new Uint8Array(await r.arrayBuffer())}
  const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch(_){}if(!r.ok){const e=new Error((j&&j.message)||('HTTP '+r.status));e.status=r.status;throw e}return j}
 st(){return this.kv.get('syncState')||{joined:false,tree:{},dataSha:null,last:0}}
 // ---- media view = last known remote tree (phone-scope files) + pending local changes
 pend(){return this.kv.get('pending')||{}}
 view(){const t={...(this.st().tree||{})};const p=this.pend();for(const k of Object.keys(p)){if(p[k]===null)delete t[k];else t[k]=p[k].sha}return t}
 async putFile(path,u8,sha){sha=sha||await gitSha(u8);await this.blobs.put(sha,u8);const p=this.pend();p[path]={sha};this.kv.set('pending',p);return sha}
 copyFile(from,to){const v=this.view();if(!v[from])return false;const p=this.pend();p[to]={sha:v[from]};this.kv.set('pending',p);return true}
 delFile(path){const p=this.pend(),inTree=!!(this.st().tree||{})[path];if(inTree)p[path]=null;else delete p[path];this.kv.set('pending',p)}
 async getFile(path){const sha=this.view()[path];if(!sha)return null;let u=await this.blobs.get(sha);if(u)return u;if(!this.token)return null;u=await this.gh('GET',`/git/blobs/${sha}`,null,true);if(u){await this.blobs.put(sha,u)}return u}
 backup(label,json){const k='backups';const b=this.kv.get(k)||[];b.push({at:this.now(),label,json});while(b.length>8)b.shift();try{this.kv.set(k,b)}catch(_){b.splice(0,b.length-2);try{this.kv.set(k,b)}catch(__){}}}
 async syncNow(){if(!this.token){this.set('off','Sync is off (no sync token on this phone)');return this.status}
  if(this.busy){this.pending_=true;return this.status}this.busy=true;this.set('syncing','Syncing...');
  try{for(let i=0;i<3;i++){try{const r=await this.once();this.set('synced',r.summary,{last:this.now(),warnings:r.warn});break}catch(e){if(e.status===422&&i<2)continue;throw e}}}
  catch(e){const off=!e.status&&/fetch|network|Failed|load failed|ENOTFOUND|ECONN|offline|socket/i.test(String(e.message)+String(e.cause&&e.cause.code));
   if(off)this.set('offline','Offline. Changes stay on this phone and sync when you are back online.');else if(e.status===401||e.status===403)this.set('error','GitHub refused the token (needs read and write access to the repo): '+e.message);else this.set('error','Sync problem: '+e.message);this.log('sync error',e.status||'',String(e.message).slice(0,200))}
  this.busy=false;if(this.pending_){this.pending_=false;setTimeout(()=>this.syncNow(),500)}return this.status}
 async once(){const C=this.Core,st=this.st(),warn=[],sum=[];
  let local=this.kv.get('data');if(!local)throw new Error('No local data yet');
  const mtime=this.kv.get('dataMtime')||0;C.stamp(local,this.now(),mtime);
  const ref=await this.gh('GET',`/git/ref/heads/${this.branch}`);let headSha=null,tree={},remoteData=null,remoteDataSha=null;
  if(ref){headSha=ref.object.sha;const c=await this.gh('GET',`/git/commits/${headSha}`);const t=await this.gh('GET',`/git/trees/${c.tree.sha}?recursive=1`);if(t.truncated)throw new Error('Remote tree too large');
   for(const e of t.tree)if(e.type==='blob')tree[e.path]=e.sha;remoteDataSha=tree['data.json']||null;
   if(remoteDataSha){const u=await this.gh('GET',`/git/blobs/${remoteDataSha}`,null,true);remoteData=JSON.parse(new TextDecoder().decode(u))}}
  // ---- data: pull before push, merge per record by newest edit
  let merged=local,conflicts=[];
  if(remoteData){C.validate(remoteData);if(!st.joined){this.backup('before-first-link',JSON.stringify(local));C.adoptIds(local,remoteData);C.stamp(local,this.now(),1)} // first link: a phone that only has the starter data must not overwrite the Macs' real edits; local-only records are still kept and replaced versions are logged in conflicts
   C.stamp(remoteData,this.now(),0);const m=C.mergeData(local,remoteData);merged=C.validate(m.data);conflicts=m.conflicts.filter(c=>!c.lt||!c.rt||(c.lt>(st.last||0)&&c.rt>(st.last||0)))}
  else merged=C.validate(local);
  const mergedJson=JSON.stringify(merged,null,1),localJson=JSON.stringify(this.kv.get('data'),null,1);let applied=false;
  if(mergedJson!==localJson){this.backup('data',JSON.stringify(this.kv.get('data')));this.kv.set('data',merged);applied=true}
  if(conflicts.length){const all=this.kv.get('conflicts')||[];all.push({at:this.now(),conflicts:conflicts.map(c=>({key:c.key,kept:c.kept,lost:c.lost}))});this.kv.set('conflicts',all.slice(-20));sum.push(conflicts.length+' conflict(s) merged by newest edit')}
  const newBuf=new TextEncoder().encode(mergedJson),newSha=await gitSha(newBuf);
  // ---- media: remote tree (phone scope) + pending ops, never overwrite a file somebody else changed
  const rtree={};for(const p of Object.keys(tree))if(handled(p))rtree[p]=tree[p];
  const base=st.tree||{},pend=this.pend(),entries=[],newPend={};let sent=0;
  for(const p of Object.keys(pend)){const op=pend[p],R=rtree[p]||null,B=base[p]||null;
   if(op===null){if(R===null){continue}if(R===B){entries.push({path:p,mode:'100644',type:'blob',sha:null});delete rtree[p];sum.push('removed '+p.split('/').pop())}else warn.push(`${p} changed on another device, so it was not deleted`);continue}
   if(R===op.sha)continue;let target=p;
   if(R!==null&&R!==B){const d=p.lastIndexOf('/'),dot=p.lastIndexOf('.');target=p.slice(0,dot)+' (phone)'+p.slice(dot);warn.push(`${p.split('/').pop()} changed on another device. Your copy was saved as ${target.split('/').pop()}`);if(rtree[target]===op.sha)continue}
   let sha=op.sha;if(!Object.values(tree).includes(sha)){const u=await this.blobs.get(sha);if(!u){warn.push(`${p} is missing its data on this phone and was skipped`);continue}sha=(await this.gh('POST','/git/blobs',{content:b64(u),encoding:'base64'})).sha}
   entries.push({path:target,mode:'100644',type:'blob',sha});rtree[target]=sha;sent++}
  if(sent)sum.push('sent '+sent+' file(s)');
  if(newSha!==remoteDataSha){const b=await this.gh('POST','/git/blobs',{content:b64(newBuf),encoding:'base64'});entries.push({path:'data.json',mode:'100644',type:'blob',sha:b.sha})}
  if(entries.length||!ref){if(!entries.length)entries.push({path:'data.json',mode:'100644',type:'blob',sha:(await this.gh('POST','/git/blobs',{content:b64(newBuf),encoding:'base64'})).sha});
   const baseTree=headSha?(await this.gh('GET',`/git/commits/${headSha}`)).tree.sha:undefined;
   const t=await this.gh('POST','/git/trees',{base_tree:baseTree,tree:entries});const c=await this.gh('POST','/git/commits',{message:'Ark-Book phone sync '+new Date(this.now()).toISOString(),tree:t.sha,parents:headSha?[headSha]:[]});
   if(headSha)await this.gh('PATCH',`/git/refs/heads/${this.branch}`,{sha:c.sha,force:false});else await this.gh('POST','/git/refs',{ref:'refs/heads/'+this.branch,sha:c.sha})}
  this.kv.set('pending',newPend);this.kv.set('syncState',{joined:true,tree:rtree,dataSha:newSha,head:headSha,last:this.now()});
  const added=Object.keys(rtree).filter(p=>!base[p]&&!pend[p]).length;if(added)sum.push(added+' new file(s) available');
  if(applied)this.notify({type:'applied'});if(added||applied)this.notify({type:'media'});
  return {summary:sum.length?sum.slice(0,4).join(', '):(applied?'Updated from the other device':'Up to date'),warn}}
}
return {WebSync,gitSha,handled,PROMO,ARCH,KEXT,AEXT,rsafe,asafe,ayear,afolder,adir,ext,b64,unb64};
});

export default module.exports;
