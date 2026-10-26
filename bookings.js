// Bookings tab: talent, annual event, show date, agreed fee. Data lives in S.bookings and syncs as bk:<id> records (see core.js).
// Uses app.js globals at call time: S, mut, draw, esc, toast, $.
let bkFilter='All',bkSort='event';
const bkEvDate=n=>{if(!n)return '';const e=S.events.find(x=>Core.sameName(x.name,n)&&x.date);return e?e.date:''};
const bkOpt=(list,v,ph)=>`<option value="">${esc(ph)}</option>`+list.map(x=>`<option ${x===v?'selected':''} value="${esc(x)}">${esc(x)}</option>`).join('');
const bkEvOpts=v=>bkOpt(Core.bookingEvents(S),v,'Select event')+'<option value="__new">+ Add new event name</option>';
function bkTalentOpts(v){const n=Core.namesByRole(S);const l=v&&!n.includes(v)?n.concat([v]):n;return bkOpt(l,v,'Select talent')}
function vBookings(){S.bookings=S.bookings||[];const evs=Core.bookingEvents(S);if(bkFilter!=='All'&&!evs.includes(bkFilter))bkFilter='All';
 const list=Core.bookingsList(S,bkFilter,bkSort),tot=Core.bookingTotals(list);
 const rows=list.map(b=>`<tr data-bkrow="${b.id}"><td><select class="bk-in" data-bkf="talent" data-bkid="${b.id}">${bkTalentOpts(b.talent)}</select></td><td><select class="bk-in" data-bkf="event" data-bkid="${b.id}">${bkEvOpts(b.event)}</select></td><td><input class="bk-in" type="date" data-bkf="date" data-bkid="${b.id}" value="${esc(b.date)}"></td><td><input class="bk-in bk-fee" inputmode="decimal" data-bkf="fee" data-bkid="${b.id}" value="${b.fee?Core.feeNum(b.fee).toFixed(2):''}" placeholder="0.00"></td><td><button class="b o" data-bkdel="${b.id}">Delete</button></td></tr>`).join('');
 const sortBtn=(k,l)=>`<button class="b ${bkSort===k?'':'o'}" data-bksort="${k}">${l}</button>`;
 return `<div class="g pad"><div class="row"><div><h1>Bookings</h1><div class="sub">Who is booked for which annual event, the show date and the agreed fee. Synced to your phone and tablet with the rest of Ark-Book.</div></div></div></div>
 <div class="g pad"><h2>Add booking</h2><div class="row bk-add"><select id="bk-talent" class="bk-in">${bkTalentOpts('')}</select><select id="bk-event" class="bk-in">${bkEvOpts(bkFilter!=='All'?bkFilter:'')}</select><input id="bk-date" class="bk-in" type="date" title="Show date" aria-label="Show date" value="${esc(bkEvDate(bkFilter!=='All'?bkFilter:''))}"><span class="bk-cur"><span>$</span><input id="bk-fee" class="bk-in bk-fee" inputmode="decimal" placeholder="Agreed fee"></span><button class="b" id="bk-addbtn">+ Add booking</button></div></div>
 <div class="g pad"><div class="row" style="margin-bottom:12px"><h2 style="margin:0">Booked talent (${list.length})</h2><span class="sp"></span><span class="sub">Event</span><select id="bk-filter" class="bk-in">${['All',...evs].map(o=>`<option ${o===bkFilter?'selected':''} value="${esc(o)}">${esc(o==='All'?'All events':o)}</option>`).join('')}</select><span class="sub">Sort</span>${sortBtn('event','Event')}${sortBtn('date','Date')}${sortBtn('talent','Talent')}${sortBtn('fee','Fee')}<button class="b" id="bk-pdf">Export PDF</button></div>
 <div class="bk-wrap"><table class="bk-tbl"><tr><th>Talent</th><th>Event</th><th>Show date</th><th>Agreed fee (USD)</th><th></th></tr>${rows||'<tr><td colspan="5" class="note">No bookings yet. Add one above.</td></tr>'}</table></div></div>
 <div class="g pad"><h2>Fee totals by event</h2><div class="cards">${tot.per.map(g=>`<div class="card" data-bkgo="${esc(g.event)}"><b>${esc(g.event)}</b><div class="bk-total">${Core.money(g.total)}</div><div class="sub">${g.count} booked</div></div>`).join('')||'<div class="note">Totals show here once you add bookings.</div>'}</div>${tot.per.length>1?`<div class="row" style="margin-top:12px"><b>Grand total</b><span class="bk-total">${Core.money(tot.grand)}</span></div>`:''}</div>`}
function bkNewEvent(sel,prev){const v=prompt('New event name (for example Welcome To Our House)');if(!v||!v.trim()){sel.value=prev||'';return null}let name=v.trim();const hit=Core.bookingEvents(S).find(x=>Core.sameName(x,name));if(hit)return hit;mut(()=>Core.bookingEventAdd(S,name));return name}
function bkPrint(){const logo=new URL('logo.png',location.href).href,html=Core.bookingSheetHTML(S,bkFilter,logo);
 const touch='ontouchstart' in window&&!window.sb.isElectron;
 if(touch){const w=window.open('','_blank');if(w){w.document.open();w.document.write(html.replace('</body>','<script>addEventListener("load",()=>setTimeout(()=>print(),300))<\/script></body>'));w.document.close();return}}
 const f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f);const d=f.contentWindow.document;d.open();d.write(html);d.close();
 const go=()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){toast('Print failed: '+e.message)}setTimeout(()=>f.remove(),60000)};const im=d.querySelector('img');if(im&&!im.complete){im.onload=im.onerror=go}else setTimeout(go,200);toast('Choose Save as PDF in the print dialog')}
document.addEventListener('click',e=>{const t=e.target;if(!t||!t.closest)return;
 if(t.id==='bk-addbtn'){const talent=$('#bk-talent').value,event=$('#bk-event').value,date=$('#bk-date').value,fee=$('#bk-fee').value;if(!talent)return toast('Pick a talent');if(!event||event==='__new')return toast('Pick an event');return mut(()=>Core.bookingAdd(S,{talent,event,date,fee}))}
 if(t.dataset.bkdel){const b=S.bookings.find(x=>x.id===t.dataset.bkdel);if(b&&confirm('Delete the booking for '+(b.talent||'this talent')+(b.event?' at '+b.event:'')+'? You can undo.'))mut(()=>Core.bookingRemove(S,b.id));return}
 if(t.dataset.bksort){bkSort=t.dataset.bksort;return draw()}
 if(t.id==='bk-pdf')return bkPrint();
 const go=t.closest('[data-bkgo]');if(go){bkFilter=go.dataset.bkgo;return draw()}});
document.addEventListener('change',e=>{const t=e.target;if(!t||!t.dataset)return;
 if(t.id==='bk-filter'){bkFilter=t.value;return draw()}
 if(t.id==='bk-event'){let n=t.value;if(n==='__new'){n=bkNewEvent(t,'');if(!n)return;draw();$('#bk-event').value=n}const dt=bkEvDate(n);if(dt)$('#bk-date').value=dt;return}
 if(t.dataset.bkf){const id=t.dataset.bkid,f=t.dataset.bkf;let v=t.value;if(f==='event'&&v==='__new'){const b=S.bookings.find(x=>x.id===id);v=bkNewEvent(t,b&&b.event);if(!v)return}const o={[f]:v};if(f==='event'){const b=S.bookings.find(x=>x.id===id),dt=bkEvDate(v);if(b&&!b.date&&dt)o.date=dt}return mut(()=>Core.bookingUpdate(S,id,o))}});
