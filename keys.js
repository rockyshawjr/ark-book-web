// Keys page (full-access GitHub token sessions only): make, list, re-role and revoke limited Ark-Book keys.
// The key service checks the GitHub token itself (must be Rocky's account with write access), so hiding this button is not the only guard.
(()=>{
const e=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const when=t=>t?new Date(t).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Never';
const H=()=>({'x-gh-token':localStorage.getItem('ark.token')||''});
const call=(p,body)=>window.ARK.call('POST','/admin/keys/'+p,{headers:H(),body:body||{}});
const ROLE={crew:'Crew (edits everything, no fees)',viewer:'View only (no fees, no edits)'};
let box=null,made=null;
async function render(msg){if(!box)return;let keys=[],err='';try{keys=(await call('list')).keys}catch(x){err=x.message}
 box.querySelector('.kbody').innerHTML=`${msg?`<div class="note">${e(msg)}</div>`:''}${err?`<div class="note kerr">${e(err)}</div>`:''}
 ${made?`<div class="g pad knew"><h2>New key for ${e(made.info.label)}</h2><div class="note">Copy it or scan the QR code on the device now. It is shown only once and cannot be looked up later.</div>
  <div class="row"><div class="kqr">${made.qr}</div><div style="flex:1;min-width:220px"><input class="bk-in kval" readonly value="${e(made.key)}"><div class="row" style="margin-top:8px"><button class="b" id="kcopy">Copy key</button><button class="b o" id="kdone">Done, hide it</button></div><div class="note">On the device: open Ark-Book, tap Sign in to sync, paste the key. Or scan the QR code to open Ark-Book with the key filled in.</div></div></div></div>`:''}
 <div class="g pad"><h2>Make a key</h2><div class="row"><input id="klabel" class="bk-in" placeholder="Who or which device (for example Android tablet)" maxlength="60" style="flex:1;min-width:220px"><select id="krole" class="bk-in"><option value="crew">${ROLE.crew}</option><option value="viewer">${ROLE.viewer}</option></select><button class="b" id="kmake">+ Make key</button></div></div>
 <div class="g pad"><h2>Keys (${keys.filter(k=>!k.revoked_at).length} active)</h2><div class="bk-wrap"><table class="bk-tbl"><tr><th>Label</th><th>Role</th><th>Made</th><th>Last used</th><th></th></tr>
 ${keys.map(k=>`<tr class="${k.revoked_at?'krev':''}"><td>${e(k.label)}</td><td>${k.revoked_at?'Revoked '+e(when(k.revoked_at)):`<select class="bk-in" data-krole="${e(k.id)}">${Object.keys(ROLE).map(r=>`<option value="${r}" ${r===k.role?'selected':''}>${r==='crew'?'Crew':'View only'}</option>`).join('')}</select>`}</td><td>${e(when(k.created_at))}</td><td>${e(when(k.last_used))}</td><td>${k.revoked_at?'':`<button class="b o" data-krevoke="${e(k.id)}" data-klabel="${e(k.label)}">Revoke</button>`}</td></tr>`).join('')||'<tr><td colspan="5" class="note">No keys yet.</td></tr>'}</table></div>
 <div class="note">Devices signed in with the GitHub sync token (the Macs and your own devices) keep full access, fees included. Keys made here never get fees, from any screen, the PDF or the data itself.</div></div>`}
function open(){if(!window.ARK||!window.ARK.admin)return;made=null;box=document.createElement('div');box.id='keys';box.className='kov';
 box.innerHTML=`<div class="kwrap"><div class="g pad"><div class="row"><div><h1>Keys</h1><div class="sub">Limited Ark-Book keys for crew and helpers. Admin only.</div></div><span class="sp"></span><button class="b o" id="kclose">Close</button></div></div><div class="kbody"><div class="note">Loading keys...</div></div></div>`;
 document.body.appendChild(box);render()}
document.addEventListener('click',async ev=>{const t=ev.target;if(!t||!t.closest)return;
 if(t.id==='bkeys')return open();if(!box||!box.contains(t))return;
 if(t.id==='kclose'){box.remove();box=null;made=null;return}
 if(t.id==='kdone'){made=null;return render()}
 if(t.id==='kcopy'){const v=box.querySelector('.kval');v.select();try{await navigator.clipboard.writeText(v.value)}catch(_){document.execCommand('copy')}t.textContent='Copied';return}
 if(t.id==='kmake'){const label=box.querySelector('#klabel').value.trim(),role=box.querySelector('#krole').value;if(!label)return render('Give the key a label first.');
  try{const r=await call('create',{label,role});const url=location.origin+location.pathname+'#arkkey='+r.key;let qr='';try{const q=qrcode(0,'M');q.addData(url);q.make();qr=q.createSvgTag({cellSize:4,margin:2})}catch(_){qr='<div class="note">QR unavailable</div>'}
   made={key:r.key,info:r.info,qr};render()}catch(x){render(x.message)}return}
 if(t.dataset.krevoke){if(!confirm('Revoke the key for '+t.dataset.klabel+'? That device stops syncing right away.'))return;try{await call('revoke',{id:t.dataset.krevoke});render('Revoked.')}catch(x){render(x.message)}return}});
document.addEventListener('change',async ev=>{const t=ev.target;if(!box||!t||!t.dataset||!t.dataset.krole)return;try{await call('update',{id:t.dataset.krole,role:t.value});render('Role changed. The device switches on its next sync.')}catch(x){render(x.message)}});
window.arkKeys={open};
})();
