// Ark-Book key service: limited Crew/Viewer keys in front of the Ark-Book GitHub data branch.
// Fees (bookings[].fee) never leave this service for a non-admin key, and a non-admin key can never set one.
// Runs on Supabase Edge Functions (Deno) and in Node for tests. No secrets are ever returned or logged.
export const ROLES=['crew','viewer'];
const enc=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
export const sha256=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const b64url=u8=>{let s='';u8.forEach(c=>s+=String.fromCharCode(c));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
export const newKey=()=>'ark_'+b64url(crypto.getRandomValues(new Uint8Array(32)));
const clone=o=>JSON.parse(JSON.stringify(o));

export function makeHandler({Core,W,env,store,fetch:F=fetch,now=()=>Date.now()}){
 const owner=env.ARK_OWNER||'rockyshawjr',repo=env.ARK_REPO||'g12-updates',branch=env.ARK_BRANCH||'ark-book-data';
 const admins=String(env.ARK_ADMIN_LOGINS||owner).toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
 const origin=env.ARK_ALLOWED_ORIGIN||'*';
 const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,x-ark-key,x-gh-token','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'};
 const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 const err=(s,m)=>json({error:m},s);
 const gh=async(token,method,p,body,raw)=>{const r=await F(`https://api.github.com${p}`,{method,headers:{Authorization:'Bearer '+token,Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json','User-Agent':'ark-book-keys',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return r};
 const ghToken=()=>{const t=env.ARK_GH_TOKEN;if(!t)throw Object.assign(new Error('Service is not configured yet (missing ARK_GH_TOKEN)'),{status:503});return t};

 // ---- fee handling. Record hashes in meta are recomputed so a hash can never be used to guess a fee.
 const hashOf=b=>{const d={events:[],roster:[],titles:[],bookings:[b],lists:{},meta:{rec:{},tomb:{}}};Core.stamp(d,1,1);return d.meta.rec['bk:'+b.id].h};
 const noFee=b=>{const x=clone(b);x.fee=0;return x};
 function strip(data){const d=clone(data);d.meta=d.meta||{rec:{},tomb:{}};d.meta.rec=d.meta.rec||{};
  d.bookings=(d.bookings||[]).map(b=>{const x=noFee(b);const k='bk:'+x.id;if(d.meta.rec[k])d.meta.rec[k]={h:hashOf(x),t:d.meta.rec[k].t};return x});
  for(const k of Object.keys(d.meta.rec))if(k.startsWith('bk:')&&!d.bookings.some(b=>'bk:'+b.id===k))delete d.meta.rec[k];
  d.feesHidden=true;return d}
 // client (no fees) -> server copy: fee always comes from the remote record (0 for a new booking); unchanged records keep remote meta
 function overlay(client,remote){const c=clone(client);delete c.feesHidden;c.meta=c.meta||{rec:{},tomb:{}};c.meta.rec=c.meta.rec||{};const rb={};(remote&&remote.bookings||[]).forEach(b=>rb[b.id]=b);const rm=(remote&&remote.meta&&remote.meta.rec)||{};
  c.bookings=(c.bookings||[]).map(b=>{const x=clone(b);const r=rb[x.id];const k='bk:'+x.id,m=c.meta.rec[k];
   const sentH=hashOf(noFee(x));x.fee=r?Core.feeNum(r.fee):0;
   if(m){if(r&&rm[k]&&m.h===hashOf(noFee(r))&&sentH===m.h)c.meta.rec[k]=rm[k];else c.meta.rec[k]={h:hashOf(x),t:m.t}}
   return x});return c}

 async function remote(){const t=ghToken(),base=`/repos/${owner}/${repo}`;
  const ref=await gh(t,'GET',`${base}/git/ref/heads/${branch}`);if(ref.status===404)return {data:null,tree:{}};if(!ref.ok)throw Object.assign(new Error('GitHub error '+ref.status),{status:502});
  const head=(await ref.json()).object.sha;const c=await (await gh(t,'GET',`${base}/git/commits/${head}`)).json();const tr=await (await gh(t,'GET',`${base}/git/trees/${c.tree.sha}?recursive=1`)).json();
  const tree={};let dsha=null;for(const e of tr.tree||[]){if(e.type!=='blob')continue;if(e.path==='data.json')dsha=e.sha;else if(W.handled(e.path))tree[e.path]=e.sha}
  let data=null;if(dsha){const r=await gh(t,'GET',`${base}/git/blobs/${dsha}`,null,true);data=JSON.parse(new TextDecoder().decode(new Uint8Array(await r.arrayBuffer())))}
  return {data,tree,head}}

 async function authKey(req){const k=req.headers.get('x-ark-key')||'';if(!/^ark_[A-Za-z0-9_-]{20,}$/.test(k))return null;const row=await store.findByHash(await sha256(k));if(!row||row.revoked_at)return null;await store.touch(row.id,new Date(now()).toISOString());return row}
 async function authAdmin(req){const t=req.headers.get('x-gh-token')||'';if(!t||t.length<20)return null;
  const u=await gh(t,'GET','/user');if(!u.ok)return null;const login=String((await u.json()).login||'').toLowerCase();if(!admins.includes(login))return null;
  const r=await gh(t,'GET',`/repos/${owner}/${repo}`);if(!r.ok)return null;const p=(await r.json()).permissions||{};if(!(p.push||p.admin||p.maintain))return null;
  // the token itself must be able to write: fine-grained tokens report the user's permissions, so also confirm it can read the data branch
  const b=await gh(t,'GET',`/repos/${owner}/${repo}/git/ref/heads/${branch}`);if(!(b.ok||b.status===404))return null;return {login}}
 const pub=r=>({id:r.id,label:r.label,role:r.role,created_at:r.created_at,last_used:r.last_used,revoked_at:r.revoked_at||null});

 return async function handle(req){
  try{
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
   const url=new URL(req.url);const path=url.pathname.replace(/^.*\/ark-keys/,'')||'/';
   if(path.startsWith('/admin/')){
    const a=await authAdmin(req);if(!a)return err(403,'Admin only: sign in with the full-access GitHub sync token');
    const body=req.method==='POST'?await req.json().catch(()=>({})):{};
    if(path==='/admin/keys/list')return json({keys:(await store.list()).map(pub)});
    if(path==='/admin/keys/create'){const label=String(body.label||'').trim().slice(0,60),role=String(body.role||'');if(!label)return err(400,'Give the key a label');if(!ROLES.includes(role))return err(400,'Role must be crew or viewer');
     const key=newKey();const row=await store.insert({key_hash:await sha256(key),label,role,created_at:new Date(now()).toISOString()});return json({key,info:pub(row)})}
    if(path==='/admin/keys/update'){if(!ROLES.includes(body.role))return err(400,'Role must be crew or viewer');const r=await store.update(body.id,{role:body.role});return r?json({info:pub(r)}):err(404,'Key not found')}
    if(path==='/admin/keys/revoke'){const r=await store.update(body.id,{revoked_at:new Date(now()).toISOString()});return r?json({info:pub(r)}):err(404,'Key not found')}
    return err(404,'Not found')}
   const k=await authKey(req);if(!k)return err(401,'This Ark-Book key is not valid or was revoked');
   if(path==='/me')return json({role:k.role,label:k.label});
   if(path==='/data'&&req.method==='GET'){const r=await remote();return json({data:r.data?strip(r.data):null,tree:r.tree,head:r.head||null})}
   if(path==='/blob'&&req.method==='GET'){const p=url.searchParams.get('path')||'';if(!W.handled(p))return err(403,'Only promo pictures and archive posters or match cards can be fetched');
    const r=await remote();const sha=r.tree[p];if(!sha)return err(404,'File not found');const b=await gh(ghToken(),'GET',`/repos/${owner}/${repo}/git/blobs/${sha}`,null,true);if(!b.ok)return err(502,'GitHub error '+b.status);
    return new Response(await b.arrayBuffer(),{status:200,headers:{...cors,'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-Sha':sha}})}
   if(path==='/sync'&&req.method==='POST'){if(k.role!=='crew')return err(403,'View-only key: changes are not saved');
    const body=await req.json();if(!body||!body.data)return err(400,'Missing data');
    const r=await remote();const local=overlay(Core.validate(body.data),r.data);
    // run the normal sync engine server-side with the service token, scoped to phone media only
    const mem={data:local,dataMtime:body.mtime||0,syncState:{joined:true,tree:body.base||{},dataSha:null,last:body.last||0},pending:{}},blobs={};
    for(const [p,op] of Object.entries(body.pending||{})){if(!W.handled(p))continue;if(op===null){mem.pending[p]=null;continue}const u=W.unb64(String(op.b64||''));const sha=await W.gitSha(u);blobs[sha]=u;mem.pending[p]={sha}}
    const kv={get:x=>mem[x]===undefined?null:mem[x],set:(x,v)=>{mem[x]=v}};
    const s=new W.WebSync({Core,kv,blobs:{get:async h=>blobs[h]||null,put:async(h,u)=>{blobs[h]=u}},token:ghToken(),owner,repo,branch,fetch:(u,o)=>F(u,{...o,headers:{...(o&&o.headers||{}),'User-Agent':'ark-book-keys'}}),now});
    let out;for(let i=0;i<3;i++){try{out=await s.once();break}catch(e){if(e.status===422&&i<2)continue;throw e}}
    const st=mem.syncState;return json({data:strip(mem.data),tree:st.tree,head:st.head||null,summary:out.summary,warn:out.warn})}
   return err(404,'Not found')}
  catch(e){return err(e.status&&e.status>=400&&e.status<600?e.status:500,String(e.message||e).replace(/(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g,'[redacted]').slice(0,300))}}}
