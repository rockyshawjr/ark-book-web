// Key store on the project's own Postgres (table public.ark_keys, RLS on, no policies: only the service role can touch it).
export function postgrestStore(url,serviceKey,fetchImpl=fetch){
 const h={apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json',Prefer:'return=representation'};
 const q=async(method,p,body)=>{const r=await fetchImpl(`${url}/rest/v1/ark_keys${p}`,{method,headers:h,body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error('key store error '+r.status);const t=await r.text();return t?JSON.parse(t):null};
 const cols='select=id,label,role,created_at,last_used,revoked_at';
 return {
  findByHash:async hash=>((await q('GET',`?key_hash=eq.${encodeURIComponent(hash)}&${cols}`))||[])[0]||null,
  touch:async(id,at)=>{await q('PATCH',`?id=eq.${encodeURIComponent(id)}`,{last_used:at})},
  list:async()=>(await q('GET',`?${cols}&order=created_at.desc`))||[],
  insert:async row=>((await q('POST',`?${cols}`,row))||[])[0],
  update:async(id,patch)=>((await q('PATCH',`?id=eq.${encodeURIComponent(id)}&${cols}`,patch))||[])[0]||null};
}
export function memoryStore(){const rows=[];let n=0;return {rows,
 findByHash:async h=>{const r=rows.find(x=>x.key_hash===h);return r?{...r}:null},touch:async(id,at)=>{const r=rows.find(x=>x.id===id);if(r)r.last_used=at},
 list:async()=>rows.map(r=>({...r})),insert:async row=>{const r={id:'k'+(++n),last_used:null,revoked_at:null,...row};rows.push(r);return {...r}},
 update:async(id,p)=>{const r=rows.find(x=>x.id===id);if(!r)return null;Object.assign(r,p);return {...r}}}}
