// In-memory GitHub git data API, enough for websync.js and the key service. Keeps full history.
import crypto from 'crypto';
export function mockGitHub({owner='rockyshawjr',repo='g12-updates',tokens={}}={}){
 const blobs={},trees={},commits={},refs={};const calls=[];
 const sha=s=>crypto.createHash('sha1').update(s).digest('hex');
 const putBlob=u8=>{const b=Buffer.from(u8);const h=sha(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b]));blobs[h]=b;return h};
 const mkTree=(entries)=>{const h=sha(JSON.stringify(entries)+Math.random());trees[h]=entries;return h};
 const flat=t=>trees[t].slice();
 function commitFiles(files,msg){const base=refs.main0?flat(commits[refs.main0].tree):[];const m=new Map(base.map(e=>[e.path,e]));for(const [p,c] of Object.entries(files))m.set(p,{path:p,type:'blob',sha:putBlob(typeof c==='string'?Buffer.from(c):c)});const t=mkTree([...m.values()]);const c=sha(t+msg+Math.random());commits[c]={tree:t,parents:refs.main0?[refs.main0]:[]};refs.main0=c;return c}
 const res=(s,o,raw)=>new Response(raw?o:JSON.stringify(o),{status:s,headers:{'Content-Type':raw?'application/octet-stream':'application/json'}});
 async function fetch(u,o={}){const url=new URL(u);const m=(o.method||'GET').toUpperCase();const auth=(o.headers&&o.headers.Authorization)||'';const tok=auth.replace(/^Bearer /,'');const who=tokens[tok];calls.push({m,p:url.pathname,tok:tok?'set':'none'});
  if(!who)return res(401,{message:'Bad credentials'});const raw=/raw/.test((o.headers&&o.headers.Accept)||'');
  if(url.pathname==='/user')return res(200,{login:who.login});
  const pre=`/repos/${owner}/${repo}`;if(!url.pathname.startsWith(pre))return res(404,{message:'Not Found'});const p=url.pathname.slice(pre.length);
  if(p===''||p==='/')return res(200,{permissions:{push:!!who.write,admin:!!who.write,pull:true}});
  const body=o.body?JSON.parse(o.body):null;
  if(m!=='GET'&&!who.write)return res(403,{message:'Resource not accessible'});
  let r;
  if(m==='GET'&&(r=p.match(/^\/git\/ref\/heads\/(.+)$/))){return refs.main0?res(200,{object:{sha:refs.main0}}):res(404,{message:'Not Found'})}
  if(m==='GET'&&(r=p.match(/^\/git\/commits\/(\w+)$/)))return res(200,{tree:{sha:commits[r[1]].tree},parents:commits[r[1]].parents.map(s=>({sha:s}))});
  if(m==='GET'&&(r=p.match(/^\/git\/trees\/(\w+)$/)))return res(200,{tree:flat(r[1]),truncated:false});
  if(m==='GET'&&(r=p.match(/^\/git\/blobs\/(\w+)$/))){const b=blobs[r[1]];if(!b)return res(404,{message:'Not Found'});return raw?res(200,b,true):res(200,{content:b.toString('base64'),encoding:'base64'})}
  if(m==='POST'&&p==='/git/blobs')return res(201,{sha:putBlob(Buffer.from(body.content,'base64'))});
  if(m==='POST'&&p==='/git/trees'){const base=body.base_tree?flat(body.base_tree):[];const mm=new Map(base.map(e=>[e.path,e]));for(const e of body.tree){if(e.sha===null)mm.delete(e.path);else mm.set(e.path,{path:e.path,type:'blob',sha:e.sha})}return res(201,{sha:mkTree([...mm.values()])})}
  if(m==='POST'&&p==='/git/commits'){const c=sha(body.tree+body.message+Math.random());commits[c]={tree:body.tree,parents:(body.parents||[])};return res(201,{sha:c})}
  if(m==='PATCH'&&(r=p.match(/^\/git\/refs\/heads\/(.+)$/))){if(!commits[body.sha].parents.includes(refs.main0))return res(422,{message:'Update is not a fast forward'});refs.main0=body.sha;return res(200,{object:{sha:body.sha}})}
  if(m==='POST'&&p==='/git/refs'){refs.main0=body.sha;return res(201,{})}
  return res(404,{message:'Not Found '+p})}
 const readData=()=>{const t=flat(commits[refs.main0].tree);const e=t.find(x=>x.path==='data.json');return JSON.parse(blobs[e.sha].toString())};
 const readFile=p=>{const e=flat(commits[refs.main0].tree).find(x=>x.path===p);return e?blobs[e.sha]:null};
 const allBlobs=()=>Object.values(blobs);
 return {fetch,commitFiles,readData,readFile,allBlobs,calls,commits,refs}}
