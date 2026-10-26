// Supabase Edge Function entry. Deployed with verify_jwt off (it uses Ark-Book keys, not Supabase logins).
// The GitHub token comes from the ARK_GH_TOKEN function secret if set, otherwise from Supabase Vault (ark_gh_token) through a service-role-only function.
import Core from './core.mjs';import W from './websync.mjs';import {makeHandler} from './handler.mjs';import {postgrestStore} from './store.mjs';
const env=Deno.env.toObject();env.ARK_ALLOWED_ORIGIN=env.ARK_ALLOWED_ORIGIN||'https://rockyshawjr.github.io';
const SK=env.SUPABASE_SERVICE_ROLE_KEY;
async function loadToken(){if(env.ARK_GH_TOKEN)return;try{const r=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/ark_service_secret',{method:'POST',headers:{apikey:SK,Authorization:'Bearer '+SK,'Content-Type':'application/json'},body:JSON.stringify({secret_name:'ark_gh_token'})});if(r.ok){const t=await r.json();if(typeof t==='string'&&t)env.ARK_GH_TOKEN=t}}catch(_){}}
const handle=makeHandler({Core,W,env,store:postgrestStore(env.SUPABASE_URL,SK)});
Deno.serve(async req=>{await loadToken();return handle(req)});
