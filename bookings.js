// Bookings tab: Talent, Sound, Camera, Crew, Referee and Manager booked per annual event, with show date and agreed fee. Data lives in S.bookings and syncs as bk:<id> records (see core.js).
// Uses app.js globals at call time: S, mut, draw, esc, toast, $.
let bkFilter='All',bkRoleF='All',bkSort='event';
const bkFees=()=>!window.ARK||window.ARK.fees!==false; // Crew and View-only keys never get fees from the key service, so nothing about money is shown
const bkForm={role:'Talent',name:'',event:'',date:'',fee:'',manager:''}; // add form survives redraws
const bkEvDate=n=>{if(!n)return '';const e=S.events.find(x=>Core.sameName(x.name,n)&&x.date);return e?e.date:''};
const bkOpt=(list,v,ph)=>`<option value="">${esc(ph)}</option>`+list.map(x=>`<option ${x===v?'selected':''} value="${esc(x)}">${esc(x)}</option>`).join('');
const bkEvOpts=v=>bkOpt(Core.bookingEvents(S),v,'Select event')+'<option value="__new">+ Add new event name</option>';
// "+ Add new" opens an inline text box (no prompt(): Electron does not support window.prompt, so the Mac app silently did nothing).
let bkNew=null; // {kind:'name'|'event', key:'form'|booking id}
const bkNewOpen=(kind,key)=>!!bkNew&&bkNew.kind===kind&&bkNew.key===key;
const bkNewBox=ph=>`<span class="bk-newbox" style="display:inline-flex;gap:6px;align-items:center"><input id="bk-newin" class="bk-in" placeholder="${esc(ph)}" autocomplete="off"><button class="b" id="bk-newok">Save</button><button class="b o" id="bk-newx">Cancel</button></span>`;
const bkEvCtl=(v,attrs,key)=>bkNewOpen('event',key)?bkNewBox('New event name (for example Welcome To Our House)'):`<select class="bk-in" ${attrs}>${bkEvOpts(v)}</select>`;
const bkRoleOpts=v=>Core.BK_ROLES.map(r=>`<option ${r===Core.bkRole(v)?'selected':''}>${r}</option>`).join('');
function bkTalentOpts(v){const n=Core.namesByRole(S);const l=v&&!n.includes(v)?n.concat([v]):n;return bkOpt(l,v,'Select talent')}
// staff names for a booking role: saved lists.crew[role] + names already booked in that role + roster people whose Roster role matches (Referee, Manager, ...). Deduped, sorted.
function bkStaffNames(role){role=Core.bkRole(role);const seen=new Set(),out=[];Core.crewNames(S,role).concat(((S&&S.roster)||[]).filter(r=>r&&Core.sameName(r.role,role)).map(r=>r.name)).forEach(x=>{x=String(x||'').trim();const k=Core.norm(x);if(k&&!seen.has(k)){seen.add(k);out.push(x)}});return out.sort((a,b)=>a.localeCompare(b))}
function bkStaffOpts(role,v){role=Core.bkRole(role);const n=bkStaffNames(role);const l=v&&!n.includes(v)?n.concat([v]):n;return bkOpt(l,v,'Select '+role.toLowerCase())+'<option value="__new">+ Add new name</option>'}
function bkNameCtl(role,v,attrs,key){role=Core.bkRole(role);if(bkNewOpen('name',key))return bkNewBox('New '+role.toLowerCase()+' name');return `<select class="bk-in" ${attrs}>${role==='Talent'?bkTalentOpts(v):bkStaffOpts(role,v)}</select>`}
// A talent booking can name that wrestler's manager for this show. Roster managers come first. Empty is left off the saved record.
function bkMgrNames(except){const seen=new Set(),out=[];const people=(S.roster||[]).filter(r=>r&&r.name&&!Core.sameName(r.name,except));const mgr=people.filter(r=>Core.sameName(r.role,'Manager')).map(r=>r.name).sort((a,b)=>a.localeCompare(b));const rest=people.filter(r=>!Core.sameName(r.role,'Manager')).map(r=>r.name).sort((a,b)=>a.localeCompare(b));mgr.concat(rest).concat(Core.crewNames(S,'Manager')).concat((S.bookings||[]).map(b=>b&&b.manager||'')).forEach(x=>{x=String(x||'').trim();const k=Core.norm(x);if(!k||seen.has(k))return;seen.add(k);out.push(x)});return out}
function bkMgrOpts(v,except){const n=bkMgrNames(except);const l=v&&!n.some(x=>x===v)?n.concat([v]):n;return bkOpt(l,v,'No manager')+'<option value="__new">+ Add new name</option>'}
function bkMgrCtl(v,key,except){if(bkNewOpen('mgr',key))return bkNewBox('New manager name');const attrs=key==='form'?'id="bk-mgr"':`data-bkf="manager" data-bkid="${key}"`;return `<select class="bk-in" aria-label="Their manager" ${attrs}>${bkMgrOpts(v||'',except)}</select>`}
function vBookings(){S.bookings=S.bookings||[];const evs=Core.bookingEvents(S);if(bkFilter!=='All'&&!evs.includes(bkFilter))bkFilter='All';
 if(!bkFees()&&bkSort==='fee')bkSort='event';const list=Core.bookingsList(S,bkFilter,bkSort,bkRoleF),tot=Core.bookingTotals(list);
 const rows=list.map(b=>`<tr data-bkrow="${b.id}"><td><select class="bk-in" data-bkf="role" data-bkid="${b.id}">${bkRoleOpts(b.role)}</select></td><td>${bkNameCtl(b.role,b.talent,`data-bkf="talent" data-bkid="${b.id}"`,b.id)}</td><td>${Core.bkRole(b.role)==='Talent'?bkMgrCtl(b.manager,b.id,b.talent):'<span class="note"></span>'}</td><td>${bkEvCtl(b.event,`data-bkf="event" data-bkid="${b.id}"`,b.id)}</td><td><input class="bk-in" type="date" data-bkf="date" data-bkid="${b.id}" value="${esc(b.date)}"></td>${bkFees()?`<td><input class="bk-in bk-fee" inputmode="decimal" data-bkf="fee" data-bkid="${b.id}" value="${b.fee?Core.feeNum(b.fee).toFixed(2):''}" placeholder="0.00"></td>`:''}<td><button class="b o" data-bkdel="${b.id}">Delete</button></td></tr>`).join('');
 const sortBtn=(k,l)=>`<button class="b ${bkSort===k?'':'o'}" data-bksort="${k}">${l}</button>`;
 return `<div class="g pad"><div class="row"><div><h1>Bookings</h1><div class="sub">Talent, Sound, Camera, Crew, Referee and Manager booked for each annual event, with the show date${bkFees()?' and the agreed fee':''}. Synced to your phone and tablet with the rest of Ark-Book.</div></div></div></div>
 <div class="g pad"><h2>Add booking</h2><div class="row bk-add"><select id="bk-role" class="bk-in">${bkRoleOpts(bkForm.role)}</select>${bkNameCtl(bkForm.role,bkForm.name,'id="bk-name"','form')}${Core.bkRole(bkForm.role)==='Talent'?bkMgrCtl(bkForm.manager,'form',bkForm.name):''}${bkEvCtl(bkForm.event,'id="bk-event"','form')}<input id="bk-date" class="bk-in" type="date" title="Show date" aria-label="Show date" value="${esc(bkForm.date)}">${bkFees()?`<span class="bk-cur"><span>$</span><input id="bk-fee" class="bk-in bk-fee" inputmode="decimal" placeholder="Agreed fee" value="${esc(bkForm.fee)}"></span>`:''}<button class="b" id="bk-addbtn">+ Add booking</button></div></div>
 <div class="g pad"><div class="row" style="margin-bottom:12px"><h2 style="margin:0">Booked (${list.length})</h2><span class="sp"></span><span class="sub">Event</span><select id="bk-filter" class="bk-in">${['All',...evs].map(o=>`<option ${o===bkFilter?'selected':''} value="${esc(o)}">${esc(o==='All'?'All events':o)}</option>`).join('')}</select><span class="sub">Role</span><select id="bk-rolef" class="bk-in">${['All',...Core.BK_ROLES].map(o=>`<option ${o===bkRoleF?'selected':''} value="${o}">${o==='All'?'All roles':o}</option>`).join('')}</select><span class="sub">Sort</span>${sortBtn('event','Event')}${sortBtn('role','Role')}${sortBtn('date','Date')}${sortBtn('talent','Name')}${bkFees()?sortBtn('fee','Fee'):''}<button class="b" id="bk-pdf">Export PDF</button></div>
 <div class="bk-wrap"><table class="bk-tbl"><tr><th>Role</th><th>Name</th><th>Their manager</th><th>Event</th><th>Show date</th>${bkFees()?'<th>Agreed fee (USD)</th>':''}<th></th></tr>${rows||`<tr><td colspan="${bkFees()?7:6}" class="note">No bookings yet. Add one above.</td></tr>`}</table></div></div>
 ${bkFees()?`<div class="g pad"><h2>Fee totals by event</h2><div class="cards">${tot.per.map(g=>`<div class="card" data-bkgo="${esc(g.event)}"><b>${esc(g.event)}</b><div class="bk-total">${Core.money(g.total)}</div><div class="sub">${g.count} booked</div>${g.roles.map(r=>`<div class="sub bk-rl"><span>${r.role} (${r.count})</span><span>${Core.money(r.total)}</span></div>`).join('')}</div>`).join('')||'<div class="note">Totals show here once you add bookings.</div>'}</div>${list.length?`<div class="row" style="margin-top:12px"><b>Grand total</b><span class="bk-total">${Core.money(tot.grand)}</span>${tot.byRole.map(r=>`<span class="badge s">${r.role}: ${Core.money(r.total)}</span>`).join('')}</div>`:''}</div>`:''}`}
function bkNewStart(kind,key){if(key==='form')bkKeep();bkNew={kind,key};draw();const i=$('#bk-newin');if(i&&i.focus)i.focus()}
function bkNewCancel(){bkNew=null;draw()}
function bkNewSave(){const n=bkNew;if(!n)return;const i=$('#bk-newin');const v=String(i?i.value:'').trim();if(!v){toast(n.kind==='event'?'Type an event name':'Type a name');if(i&&i.focus)i.focus();return}bkNew=null;
 if(n.kind==='event'){const hit=Core.bookingEvents(S).find(x=>Core.sameName(x,v)),name=hit||v;
  if(n.key==='form'){if(!hit)mut(()=>Core.bookingEventAdd(S,name));bkForm.event=name;const dt=bkEvDate(name);if(dt)bkForm.date=dt;return draw()}
  return mut(()=>{if(!hit)Core.bookingEventAdd(S,name);const b=S.bookings.find(x=>x.id===n.key),o={event:name},dt=bkEvDate(name);if(b&&!b.date&&dt)o.date=dt;Core.bookingUpdate(S,n.key,o)})}
 if(n.kind==='mgr'){const hit=(S.roster||[]).find(r=>Core.sameName(r.name,v)),name=hit?hit.name:v;if(n.key==='form'){bkForm.manager=name;return draw()}return mut(()=>Core.bookingUpdate(S,n.key,{manager:name}))}
 if(n.key==='form'){bkForm.name=v;return draw()}
 return mut(()=>Core.bookingUpdate(S,n.key,{talent:v}))}
function bkPrint(){const logo=window.ArkTheme?ArkTheme.logoFor(S,new URL('logo.png',location.href).href):new URL('logo.png',location.href).href,html=Core.bookingSheetHTML(S,bkFilter,logo,bkRoleF,!bkFees());
 const touch='ontouchstart' in window;
 if(touch){const w=window.open('','_blank');if(w){w.document.open();w.document.write(html.replace('</body>','<script>addEventListener("load",()=>setTimeout(()=>print(),300))<\/script></body>'));w.document.close();return}}
 const f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f);const d=f.contentWindow.document;d.open();d.write(html);d.close();
 const go=()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){toast('Print failed: '+e.message)}setTimeout(()=>f.remove(),60000)};const im=d.querySelector('img');if(im&&!im.complete){im.onload=im.onerror=go}else setTimeout(go,200);toast('Choose Save as PDF in the print dialog')}
const bkKeep=()=>{const g=id=>{const e=$('#'+id);return e?e.value:undefined};['role','name','event','date','fee'].forEach(k=>{const v=g('bk-'+k);if(v!==undefined&&v!=='__new')bkForm[k]=v});const mgr=g('bk-mgr');if(mgr!==undefined&&mgr!=='__new')bkForm.manager=mgr};
document.addEventListener('input',e=>{if(e.target&&/^bk-(name|date|fee)$/.test(e.target.id))bkKeep()});
document.addEventListener('click',e=>{const t=e.target;if(!t||!t.closest)return;
 if(t.id==='bk-newok')return bkNewSave();
 if(t.id==='bk-newx')return bkNewCancel();
 if(t.id==='bk-addbtn'){bkKeep();const f=bkForm;if(!f.name.trim())return toast(f.role==='Talent'?'Pick a talent':'Enter a name');if(!f.event)return toast('Pick an event');const o={role:f.role,talent:f.name,event:f.event,date:f.date,fee:f.fee};if(Core.bkRole(f.role)==='Talent')o.manager=f.manager||'';mut(()=>Core.bookingAdd(S,o));f.name='';f.fee='';f.manager='';return draw()}
 if(t.dataset.bkdel){const b=S.bookings.find(x=>x.id===t.dataset.bkdel);if(b&&confirm('Delete the booking for '+(b.talent||'this person')+(b.event?' at '+b.event:'')+'? You can undo.'))mut(()=>Core.bookingRemove(S,b.id));return}
 if(t.dataset.bksort){bkSort=t.dataset.bksort;return draw()}
 if(t.id==='bk-pdf')return bkPrint();
 const go=t.closest('[data-bkgo]');if(go){bkFilter=go.dataset.bkgo;return draw()}});
document.addEventListener('change',e=>{const t=e.target;if(!t||!t.dataset)return;
 if(t.id==='bk-filter'){bkFilter=t.value;return draw()}
 if(t.id==='bk-rolef'){bkRoleF=t.value;return draw()}
 if(t.id==='bk-role'){bkKeep();bkForm.name='';bkForm.manager='';if(bkNew&&bkNew.key==='form'&&(bkNew.kind==='name'||bkNew.kind==='mgr'))bkNew=null;return draw()}
 if(t.id==='bk-name'){if(t.value==='__new')return bkNewStart('name','form');bkKeep();if(Core.bkRole(bkForm.role)==='Talent')bkForm.manager=Core.managerOf(S,bkForm.name);return draw()}
 if(t.id==='bk-mgr'){if(t.value==='__new')return bkNewStart('mgr','form');bkKeep();return}
 if(t.id==='bk-event'){let n=t.value;if(n==='__new')return bkNewStart('event','form');bkKeep();bkForm.event=n;const dt=bkEvDate(n);if(dt)bkForm.date=dt;return draw()}
 if(t.dataset.bkf){const id=t.dataset.bkid,f=t.dataset.bkf;if(f==='fee'&&!bkFees())return;let v=t.value;if((f==='event'||f==='talent'||f==='manager')&&v==='__new')return bkNewStart(f==='event'?'event':f==='manager'?'mgr':'name',id);const o={[f]:v};if(f==='event'){const b=S.bookings.find(x=>x.id===id),dt=bkEvDate(v);if(b&&!b.date&&dt)o.date=dt}if(f==='role'){const b=S.bookings.find(x=>x.id===id);if(b&&Core.bkRole(v)!==Core.bkRole(b.role))o.talent=''}return mut(()=>Core.bookingUpdate(S,id,o))}});
document.addEventListener('keydown',e=>{const t=e.target;if(!t||t.id!=='bk-newin')return;if(e.key==='Enter'){e.preventDefault();bkNewSave()}else if(e.key==='Escape'){e.preventDefault();bkNewCancel()}});
