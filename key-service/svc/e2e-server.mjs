import http from 'http';import fs from 'fs';import path from 'path';
import Core from '../supabase/functions/ark-keys/core.mjs';import W from '../supabase/functions/ark-keys/websync.mjs';
import {makeHandler} from '../supabase/functions/ark-keys/handler.mjs';import {memoryStore} from './store-postgrest.mjs';import {mockGitHub} from './mockgh.mjs';
const SVC_T='svc-token-'+'x'.repeat(30),ADMIN_T='admin-token-'+'y'.repeat(30);
const gh=mockGitHub({tokens:{[SVC_T]:{login:'ark-bot',write:true},[ADMIN_T]:{login:'rockyshawjr',write:true}}});
const d=Core.validate({events:[{id:'e1',name:'Throw Down in T-Town',date:'2026-11-07'},{id:'e2',name:'November Rain',date:'2026-11-15'}],roster:['KJ Valentine','BK Bennet','Rico Bravo','Cory James'],titles:[]});
[['Talent','KJ Valentine','Throw Down in T-Town',4321.77],['Talent','BK Bennet','Throw Down in T-Town',1234.56],['Sound','DJ Mike','Throw Down in T-Town',987.65],['Camera','Cam Crew','November Rain',555.55],['Talent','Rico Bravo','November Rain',2222.22]].forEach(([role,talent,event,fee],i)=>{const b=Core.bookingAdd(d,{role,talent,event,date:event==='November Rain'?'2026-11-15':'2026-11-07',fee});b.id='b'+i});
Core.stamp(d,1000);gh.commitFiles({'data.json':JSON.stringify(d)},'seed');
const store=memoryStore();const h=makeHandler({Core,W,env:{ARK_GH_TOKEN:SVC_T},store,fetch:gh.fetch});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webmanifest':'application/json'};
http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost:8787');const chunks=[];for await(const c of req)chunks.push(c);const body=chunks.length?Buffer.concat(chunks):undefined;
 const send=async r=>{res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))};
 if(u.pathname==='/debug/data'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({data:gh.readData(),keys:store.rows.map(r=>({...r,key_hash:'(hash)'}))}))}
 if(u.pathname.startsWith('/svc/'))return send(await h(new Request('http://localhost:8787'+u.pathname+u.search,{method:req.method,headers:req.headers,body:['GET','HEAD','OPTIONS'].includes(req.method)?undefined:body})));
 if(u.pathname.startsWith('/gh/'))return send(await gh.fetch('https://api.github.com'+u.pathname.slice(3)+u.search,{method:req.method,headers:{Authorization:req.headers.authorization,Accept:req.headers.accept},body:body&&body.toString()}));
 let f=path.join('../..',u.pathname==='/'?'index.html':u.pathname);if(!fs.existsSync(f)){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f))}).listen(8787,()=>console.log('listening'));
