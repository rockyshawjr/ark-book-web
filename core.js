// Data model, story logic, summary generation and exports. No DOM access, so it is testable in Node.
(function(root){
const uid=()=>'x'+Math.random().toString(36).slice(2,9);
const ROSTER=["KJ Valentine","BK Bennett","Rico Bravo","Cory James","The CTC","Troy Carter","Christian Garrett","Zach Dye","Roxxi Redd","Diamond Roberts"];
const ROLES=['Wrestler','Manager','GM','Announcer','Referee','Team','Faction','Other'];
const person=(name,o={})=>Object.assign({id:uid(),name,role:'Wrestler',alignment:'',champion:'',photo:'',video:''},o);
const names=d=>d.roster.map(r=>r.name);
const namesByRole=d=>{const isW=r=>!r.role||r.role==='Wrestler';return d.roster.filter(isW).concat(d.roster.filter(r=>!isW(r))).map(r=>r.name)};
const byRole=(d,role)=>d.roster.filter(r=>!role||role==='All'||(r.role||'Wrestler')===role);
const slug=x=>String(x).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const defTitles=()=>[{id:'t-undisputed',name:'Undisputed Championship',slots:1,holders:['Rico Bravo']},{id:'t-openweight',name:'Openweight Championship',slots:1,holders:['BK Bennett']},{id:'t-womens',name:"Women's Championship",slots:1,holders:['']},{id:'t-tag',name:'Tag Team Championship',slots:2,holders:['','']}];
const titleNames=d=>d.titles.map(t=>t.name);
const holdersOf=(d,name)=>d.titles.filter(t=>t.holders.includes(name)).map(t=>t.name);
// match types with more than two people: Triple Threat (3 singles), Fatal 4-Way (4 singles), Six Man Tag (2 teams of 3). Extra slots c,d (singles) and a2,a3,b2,b3 (team partners).
const XKEYS=['c','d','a2','a3','b2','b3'],PKEYS=['a','b'].concat(XKEYS);
const MTYPES=['Triple Threat','Fatal 4-Way','Six Man Tag'];
const mtKind=t=>{const n=norm(t);return /triplethreat|3way|threeway/.test(n)?'triple':/fatal4way|fatalfourway|4way|fourway/.test(n)?'fatal4':/sixmantag|6mantag|sixman|6man/.test(n)?'six':'std'};
const sideKeys=m=>({triple:[['a'],['b'],['c']],fatal4:[['a'],['b'],['c'],['d']],six:[['a','a2','a3'],['b','b2','b3']]})[mtKind(m.type)]||[['a'],['b']];
const sides=m=>sideKeys(m).map(ks=>ks.map(k=>m[k]||''));
const sideLabel=s=>{if(!s.some(Boolean))return 'TBD';const x=s.map(v=>v||'TBD');return x.length<2?x[0]:x.slice(0,-1).join(', ')+' and '+x[x.length-1]};
const participants=m=>sides(m).flat().filter(Boolean);
const vsLine=m=>sides(m).map(sideLabel).join(' vs ');
const blankMatch=()=>({id:uid(),a:'',b:'',c:'',d:'',a2:'',a3:'',b2:'',b3:'',type:'',title:'',result:'',beat:'',note:'',winner:'',method:'',winnerPlanned:false,sample:false,planned:false});
const blankEvent=(o={})=>Object.assign({id:uid(),kind:'special',cycleMonth:'',segments:[],notes:'',connects:'',questions:'',name:'New Event',date:'',venue:'',months:6,placeholder:false,matches:[1,2,3,4,5].map(blankMatch),summary:{tpl:'Standard recap (placeholder)',text:''}},o);
function seed(){
 const pairs=[["Rico Bravo","BK Bennett"],["KJ Valentine","Cory James"],["Troy Carter","Christian Garrett"],["Zach Dye","Diamond Roberts"],["Roxxi Redd","The CTC"]];
 const ph=(name,date,kind,cm)=>blankEvent({id:'ev-'+slug(name),name,date,venue:'',placeholder:true,months:6,kind,cycleMonth:cm||'',matches:[]});
 const nov=blankEvent({id:'ev-november-rain',name:'November Rain',date:'2026-11-15',venue:'Summerville, GA (venue to be confirmed)',placeholder:true,months:6,kind:'annual',cycleMonth:'November'});
 nov.matches=pairs.map((p,i)=>Object.assign(blankMatch(),{id:'m-nov-'+(i+1),a:p[0],b:p[1],sample:true})).concat([Object.assign(blankMatch(),{id:'m-nov-6'})]);
 const cyc=[['No Resolutions','','January'],['Heart Breaker','','February'],['Broken Arrow','','March'],['Stay Here 4-Life','','April'],['Fighting with Spirit','','May'],['Press Play','','June'],['Unforgiving','','July'],['Bad Medicine','','August'],['Brutal Love','2026-09-25','September'],['Thriller','2026-10-17','October'],null,['A Christmas Story','','December']];
 const evs=cyc.map(c=>c?ph(c[0],c[1],'annual',c[2]):nov);
 evs.push(ph("Let's Go Aiden",'2026-10-24','special'),ph('Throw Down in T-Town','2026-11-07','special'));
 return {version:1,roster:ROSTER.map(n=>person(n,{id:'p-'+slug(n)})),titles:defTitles(),
  lists:{roles:ROLES.slice(),types:["Singles","Tag Team","Triple Threat","Fatal 4-Way","Six Man Tag","Street Fight","Ladder Match","Battle Royal"],
  methods:["Pinfall","Submission","DQ","Count-out","Knockout","Referee stoppage","Other"],results:["Result: TBD","Finish: pinfall","Finish: submission","Finish: DQ","Finish: no contest"],beats:["Story beat: placeholder","Feud begins","Rivalry continues","Blow off","Alliance forms","Betrayal","Title chase"],
  venues:["Summerville, GA (venue to be confirmed)","40 Middle School Rd, Summerville GA"],templates:["Standard recap (placeholder)","Short recap (placeholder)","Story focused recap (placeholder)"]},
  events:evs,bookings:[],currentId:nov.id};}
const fmtDate=d=>{if(!d)return 'Date TBD';const t=new Date(d+'T12:00:00');return isNaN(t)?d:t.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'})};
const sortEvents=evs=>evs.slice().sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
// events inside the story window: from (event date minus N months) up to and including the event
function storyWindow(data,ev,months){const m=months||ev.months||6;const all=sortEvents(data.events);if(!ev.date)return all.filter(e=>e.id===ev.id);
 const t=new Date(ev.date+'T12:00:00');t.setMonth(t.getMonth()-m);const from=t.toISOString().slice(0,10);
 return all.filter(e=>e.date&&e.date>=from&&e.date<=ev.date);}
const played=ev=>ev.matches.filter(m=>participants(m).length);
function wrestlerView(data,name){const rows=[];const foes={};
 sortEvents(data.events).forEach(e=>played(e).forEach(m=>{const sd=sides(m),mi=sd.findIndex(x=>x.includes(name));if(mi<0)return;const others=sd.filter((_,i)=>i!==mi);const partners=sd[mi].filter(x=>x&&x!==name);const foe=others.map(sideLabel).join(' vs ');rows.push({event:e.name,date:e.date,foe,partners,type:m.type,title:m.title,result:m.result,winner:m.winner,method:m.method,beat:m.beat,sample:m.sample});others.flat().filter(Boolean).forEach(f=>{foes[f]=(foes[f]||0)+1})}));
 return {name,appearances:rows,feuds:Object.entries(foes).sort((x,y)=>y[1]-x[1]).map(([foe,count])=>({foe,count}))};}
const NOWIN=['Draw','No Contest'];
function winnerOpts(m){const o=['TBD (clear)'],L=sides(m).filter(x=>x.some(Boolean)).map(sideLabel);L.forEach(x=>o.push(x));o.push('Draw','No Contest');L.forEach(x=>o.push('DQ win: '+x));return o}
function applyWinner(m,v){if(v==='TBD (clear)'||v===''){m.winner='';m.method='';}else if(/^DQ win: /.test(v)){m.winner=v.slice(8);m.method='DQ'}else{m.winner=v;if(NOWIN.includes(v))m.method=''}m.winnerPlanned=false}
function resultText(m){if(!m.winner)return '';const p=m.winnerPlanned?' (planned, not a result)':'';if(NOWIN.includes(m.winner))return m.winner+p;return m.winner+' wins'+(m.method?' by '+m.method:'')+p}
// title change offer: returns {title,slots} when the winner is a participant, a title is at stake, winner is not already holder, and the finish was clean (not DQ/count-out)
function titleOffer(d,m){if(!m.winner||m.winnerPlanned||NOWIN.includes(m.winner)||!m.title||/^(DQ|Count-out)$/.test(m.method||''))return null;const ws=sides(m).find(x=>x.some(Boolean)&&sideLabel(x)===m.winner);if(!ws||ws.filter(Boolean).length>1)return null;const t=d.titles.find(x=>x.name===m.title);if(!t||t.holders.includes(m.winner))return null;return {title:t.name,slots:t.slots||1}}
const clean=s=>s&&!/^(Result: TBD|Story beat: placeholder|No title)$/.test(s)?s:'';
const kindLabel=e=>e.kind==='annual'?'Annual Cycle':'Special Event';
function matchLine(m,i){const t=[clean(m.type),clean(m.title)].filter(Boolean).join(', ');return `${i+1}. ${vsLine(m)}${t?' ('+t+')':''}${m.sample?' [SAMPLE pairing, not booked]':''}${m.planned?' [PLANNED from booking notes, not a result]':''}`}
function generateSummary(data,ev){
 const L=[];const tpl=ev.summary.tpl||'';const short=/^Short/.test(tpl),story=/^Story/.test(tpl);
 L.push(`${ev.name}, ${fmtDate(ev.date)}${ev.venue?' at '+ev.venue:''}.`);
 const ms=played(ev);
 if(!ms.length)L.push('No matches entered yet.');
 else if(!story){L.push('Card:');ms.forEach((m,i)=>L.push(matchLine(m,i)+(clean(m.result)?' - '+m.result:'')+(m.winner?' - '+resultText(m):'')))}
 const missing=ms.filter(m=>!clean(m.result)&&!m.winner).length;
 if(ms.length)L.push(missing?`Results: ${ms.length-missing} of ${ms.length} entered. Remaining results to be entered, nothing is assumed.`:'Results: all entered above.');
 if(!short){const evs=sortEvents(data.events),ix=evs.findIndex(e=>e.id===ev.id),pv=ix>0?evs.slice(0,ix).reverse().find(e=>e.matches.some(m=>m.winner)):null;
  if(pv){L.push('Carry-over from '+pv.name+':');pv.matches.filter(m=>m.winner).forEach(m=>L.push('- '+vsLine(m)+': '+resultText(m)))}
  const beats=ms.filter(m=>clean(m.beat)).map(m=>`${vsLine(m)}: ${m.beat}`);
  if(beats.length){L.push('Story this show:');beats.forEach(b=>L.push('- '+b))}
  const win=storyWindow(data,ev).filter(e=>e.id!==ev.id);
  if(win.length)L.push('Story so far (last '+ev.months+' months): '+win.map(e=>e.name+(e.placeholder?' (placeholder)':'')).join(' > ')+' > '+ev.name+'.');
  const ch=(data.titles||[]).filter(t=>t.holders.some(Boolean));if(ch.length)L.push('Champions going in: '+ch.map(t=>`${t.name} ${t.holders.filter(Boolean).join(' and ')}`).join('; ')+'.');}
 if(ev.placeholder)L.push('Note: event details are placeholder until confirmed.');
 return L.join('\n');}
function toMarkdown(data,ev){const ms=played(ev);let s=`# ${ev.name}\n\n${kindLabel(ev)} | ${fmtDate(ev.date)}${ev.venue?' | '+ev.venue:''}\n\n`;
 s+='## Match Card\n\n'+(ms.length?ms.map((m,i)=>matchLine(m,i)+(clean(m.result)?'\n   - '+m.result:'')+(m.winner?'\n   - Winner: '+resultText(m):'')+(clean(m.beat)?'\n   - Angle: '+m.beat:'')).join('\n'):'No matches entered yet.')+'\n\n';
 const win=storyWindow(data,ev);s+=`## Story Arc (${ev.months} months)\n\n`+win.map(e=>`- ${e.name} (${fmtDate(e.date)})${e.placeholder?' [placeholder]':''}${e.id===ev.id?' <- this show':''}`).join('\n')+'\n\n';
 if((ev.segments||[]).length)s+='## Segments\n\n'+ev.segments.map(x=>`### ${x.title}\n${x.text}`).join('\n\n')+'\n\n';
 if(ev.sheet)s+='## Storyboard sheet\n\n'+ev.sheet.sections.map(x=>`### ${x.num}. ${x.title}\n`+x.boxes.map(b=>`**${b.code?b.code+' ':''}${b.title}**\n${b.text.replace(/^!/gm,'')}`).join('\n\n')).join('\n\n')+'\n\n';
 if(ev.connects)s+='## How it connects\n\n'+ev.connects+'\n\n';
 s+='## Summary\n\n'+(ev.summary.text||generateSummary(data,ev))+'\n';if(ev.questions)s+='\n## Open questions\n\n'+ev.questions+'\n';return s;}
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toHTML(data,ev,logo){const ms=played(ev),win=storyWindow(data,ev);
 return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:1000px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#fff;background:#070707;background-image:radial-gradient(500px 340px at 10% 0,rgba(216,169,40,.4),transparent),radial-gradient(500px 400px at 100% 60%,rgba(216,169,40,.18),transparent);padding:34px}
.g{background:linear-gradient(145deg,rgba(255,255,255,.14),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.2);border-radius:22px;padding:20px 24px;margin-bottom:16px}h1{margin:0;font-size:32px}h2{margin:0 0 12px;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#d8a928}
.s{color:#d5d0c7;font-size:14px}.y{color:#d8a928}.m{display:flex;gap:12px;align-items:center;padding:10px 0;border-top:1px solid rgba(255,255,255,.1);font-size:16px}.n{width:30px;height:30px;border-radius:50%;background:#d8a928;color:#080808;font-weight:800;display:grid;place-items:center;flex:none}
.sm{font-size:12px;color:#d5d0c7}.tl{display:flex;gap:8px;flex-wrap:wrap}.e{padding:8px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);font-size:13px}.e.c{border-color:#d8a928;color:#d8a928}pre{white-space:pre-wrap;font:14px/1.5 inherit;margin:0}</style></head><body>
<div class="g" style="display:flex;gap:18px;align-items:center">${logo?`<img src="${logo}" style="height:64px">`:''}<div><h1>${esc(ev.name)}</h1><div class="s">${esc(fmtDate(ev.date))}${ev.venue?' | '+esc(ev.venue):''}</div></div></div>
<div class="g"><h2>Match Card</h2>${ms.length?ms.map((m,i)=>`<div class="m"><div class="n">${i+1}</div><div>${sides(m).map(x=>`<b>${esc(sideLabel(x))}</b>`).join(' <span class="y">vs</span> ')}<div class="sm">${esc([clean(m.type),clean(m.title),clean(m.result),resultText(m),clean(m.beat)].filter(Boolean).join(' | '))}${m.sample?' SAMPLE pairing, not booked':''}</div></div></div>`).join(''):'<div class="s">No matches entered yet.</div>'}</div>
${(ev.segments||[]).length?`<div class="g"><h2>Segments</h2>${ev.segments.map(x=>`<div class="m" style="display:block"><b>${esc(x.title)}</b><div class="sm" style="font-size:14px;margin-top:4px">${esc(x.text)}</div></div>`).join('')}</div>`:''}
<div class="g"><h2>Story Arc, ${ev.months} months</h2><div class="tl">${win.map(e=>`<div class="e ${e.id===ev.id?'c':''}">${esc(e.name)}<div class="sm">${esc(fmtDate(e.date))}${e.placeholder?' (placeholder)':''}</div></div>`).join('')}</div></div>
${ev.connects?`<div class="g"><h2>How it connects</h2><pre>${esc(ev.connects)}</pre></div>`:''}<div class="g"><h2>Summary</h2><pre>${esc(ev.summary.text||generateSummary(data,ev))}</pre></div></body></html>`}
// migration/validation for imported backups
function titleAdd(d,name,slots){name=(name||'').trim();if(!name)throw new Error('Title name required');if(d.titles.some(t=>sameName(t.name,name)))throw new Error('Title already exists');slots=slots==2?2:1;const t={id:uid(),name,slots,holders:Array(slots).fill('')};d.titles.push(t);return t}
function titleRename(d,old,nu){nu=(nu||'').trim();if(!nu)throw new Error('Title name required');if(nu!==old&&d.titles.some(t=>t.name!==old&&sameName(t.name,nu)))throw new Error('Title already exists');const t=d.titles.find(x=>x.name===old);if(!t)throw new Error('Not found');t.name=nu;d.events.forEach(e=>e.matches.forEach(m=>{if(m.title===old)m.title=nu}))}
function titleRemove(d,name){const i=titleNames(d).indexOf(name);if(i<0)throw new Error('Not found');d.titles.splice(i,1);d.events.forEach(e=>e.matches.forEach(m=>{if(m.title===name)m.title=''}))}
function matchMove(ev,from,to){const M=ev.matches;if(from<0||from>=M.length||to<0||to>=M.length||from===to)return false;const [x]=M.splice(from,1);M.splice(to,0,x);return true}
function titleMove(d,name,dir){const i=titleNames(d).indexOf(name),j=i+dir;if(i<0||j<0||j>=d.titles.length)return;const [x]=d.titles.splice(i,1);d.titles.splice(j,0,x)}
function titleSlots(d,name,n){const t=d.titles.find(x=>x.name===name);if(!t)throw new Error('Not found');t.slots=n==2?2:1;t.holders=t.holders.slice(0,t.slots);while(t.holders.length<t.slots)t.holders.push('')}
function rosterAdd(d,name,o){name=(name||'').trim();if(!name)throw new Error('Name required');if(d.roster.some(r=>sameName(r.name,name)))throw new Error('Name already in roster');const p=person(name,o);d.roster.push(p);return p}
function refs(d,fn){d.events.forEach(e=>e.matches.forEach(m=>PKEYS.concat(['winner']).forEach(k=>fn(m,k))));d.titles.forEach(t=>t.holders.forEach((_,i)=>fn(t.holders,i)))}
function rosterRename(d,old,nu){nu=(nu||'').trim();if(!nu)throw new Error('Name required');if(nu!==old&&d.roster.some(r=>r.name!==old&&sameName(r.name,nu)))throw new Error('Name already in roster');const p=d.roster.find(r=>r.name===old);if(!p)throw new Error('Not found');p.name=nu;refs(d,(o,k)=>{if(o[k]===old)o[k]=nu})}
function rosterRemove(d,name){const i=names(d).indexOf(name);if(i<0)throw new Error('Not found');d.roster.splice(i,1);refs(d,(o,k)=>{if(o[k]===name)o[k]=''})}
function rosterMove(d,name,dir){const i=names(d).indexOf(name),j=i+dir;if(i<0||j<0||j>=d.roster.length)return;const [x]=d.roster.splice(i,1);d.roster.splice(j,0,x)}
// Load a booking board (see thriller-board.json) into an event, only if that event is still untouched. Never overwrites edits.
function applyBoard(d,b){d.imports=d.imports||{};if(d.imports[b.id])return {applied:false,reason:'already loaded'};const e=d.events.find(x=>x.id===b.eventId)||d.events.find(x=>x.name===b.eventName);if(!e)return {applied:false,reason:'event not found'};
 const touched=e.matches.some(m=>m.a||m.b||m.result||m.beat||m.note||m.winner)||(e.summary&&e.summary.text)||(e.segments&&e.segments.length)||e.notes||e.connects||e.questions||e.sheet;
 if(touched){d.imports[b.id]=true;return {applied:false,reason:'event already has content, left as is'}}
 const ev=b.event;e.matches=ev.matches.map(m=>Object.assign(blankMatch(),m));e.segments=(ev.segments||[]).map(x=>Object.assign({},x));if(ev.sheet)e.sheet=JSON.parse(JSON.stringify(ev.sheet));(b.addTitles||[]).forEach(n=>{if(!titleNames(d).includes(n)){const t=titleAdd(d,n,1);t.id='t-'+slug(n)}});e.summary=Object.assign({},e.summary,ev.summary);['connects','notes','questions'].forEach(k=>{e[k]=ev[k]||''});
 (b.addToRoster||[]).forEach(n=>{if(!d.roster.some(r=>sameName(r.name,n)))d.roster.push(person(n,{id:'p-'+slug(n)}))});d.imports[b.id]=true;stamp(d);return {applied:true}}

const bodyHTML=t=>{const L=String(t||'').split('\n').filter(x=>x!=='');let o='',ul=false;const cl=()=>{if(ul){o+='</ul>';ul=false}};L.forEach(l=>{if(/^- /.test(l)){if(!ul){o+='<ul>';ul=true}o+='<li>'+esc0(l.slice(2))+'</li>'}else{cl();o+=/^!/.test(l)?'<div class="sh-strong">'+esc0(l.slice(1))+'</div>':'<div class="sh-p">'+esc0(l)+'</div>'}});cl();return o};
const esc0=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SHEET_CSS=`.sheet{background:#fff;color:#000;font-family:"Arial Narrow",Helvetica,Arial,sans-serif;padding:14px;border:3px solid #000;text-align:left}
.sheet .sh-head{display:flex;gap:14px;align-items:stretch;margin-bottom:10px}.sheet .sh-t{flex:0 0 38%;text-align:center;font:900 28px/1.05 Impact,"Arial Black",sans-serif;letter-spacing:1px}
.sheet .sh-ep{flex:1;border:2px solid #000;padding:6px 10px;font-size:13px;font-weight:700}.sheet .sh-ep div+div{margin-top:4px}
.sheet .sh-sec{border:2px solid #000;margin-bottom:10px}.sheet .sh-sh{background:#000;color:#fff;display:flex;gap:10px;align-items:center;padding:4px 10px;font:900 16px "Arial Black",Arial,sans-serif;flex-wrap:wrap}
.sheet .sh-n{background:#fff;color:#000;padding:0 8px;font-weight:900}.sheet .sh-tag{background:#fff;color:#000;padding:1px 10px;font-size:13px;font-weight:900;border-radius:0 12px 12px 0}
.sheet .sh-win{margin-left:auto;font:700 12px Arial,sans-serif;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.sheet .sh-row{display:flex;gap:24px;padding:10px 12px;flex-wrap:wrap}
.sheet .sh-box{border:2px solid #000;flex:1 1 150px;min-width:140px;position:relative;background:#fff}
.sheet .sh-box:not(:last-child)::after{content:"\\27A4";position:absolute;right:-20px;top:40%;font-size:16px}
.sheet .sh-bh{border-bottom:2px solid #000;padding:3px 6px;font-weight:900;font-size:12px;text-transform:uppercase}.sheet .sh-bh .c{margin-right:6px}
.sheet .sh-lab{padding:4px 8px 0;font-weight:900;font-size:12px}.sheet .sh-bb{padding:2px 8px 8px;font-size:12px;line-height:1.35}
.sheet .sh-bb ul{margin:2px 0 0;padding-left:16px}.sheet .sh-strong{font:900 13px/1.25 "Arial Narrow",Arial,sans-serif;text-align:center;margin:3px 0}.sheet .sh-p{margin:3px 0}
.sheet .sh-box.result .sh-bh{text-align:center}.sheet .sh-box.result .sh-bb{text-align:center}.sheet .sh-box.result .sh-bb ul{text-align:left}
.sheet .empty{opacity:.5;font-style:italic}.sheet .sh-x{position:absolute;top:2px;right:2px;font-size:10px;padding:0 4px;cursor:pointer;opacity:.5}.sheet .sh-add{margin:0 12px 10px}
.sheet.glass{background:rgba(255,255,255,.06);color:#f3efe2;border-color:rgba(216,169,40,.6);border-radius:16px}.sheet.glass .sh-box,.sheet.glass .sh-sec,.sheet.glass .sh-ep{border-color:rgba(216,169,40,.55);background:rgba(255,255,255,.05)}
.sheet.glass .sh-bh{border-color:rgba(216,169,40,.55);color:#d8a928}.sheet.glass .sh-sh{background:rgba(216,169,40,.9);color:#080808}.sheet.glass .sh-n,.sheet.glass .sh-tag{background:#080808;color:#d8a928}.sheet.glass .sh-box::after{color:#d8a928}`;
function sheetHTML(data,ev,logo){const sh=ev.sheet;if(!sh)return '<div class="s">No storyboard sheet on this event.</div>';
 const bx=b=>`<div class="sh-box ${b.kind==='result'?'result':''}"><div class="sh-bh">${b.code?'<span class="c">'+esc0(b.code)+'</span>':''}${esc0(b.title)}</div>${b.label?'<div class="sh-lab">'+esc0(b.label)+':</div>':''}<div class="sh-bb">${bodyHTML(b.text)}</div></div>`;
 return `<div class="sheet"><div class="sh-head"><div class="sh-t">${esc0(sh.title)}</div><div class="sh-ep"><div>EPISODE: ${esc0(sh.episode)}</div><div>MATCH ORDER: ${esc0(sh.order)}</div></div></div>`+sh.sections.map(s=>{const m=s.matchId&&ev.matches.find(x=>x.id===s.matchId);return `<div class="sh-sec"><div class="sh-sh"><span class="sh-n">${s.num}</span>${esc0(s.title)}${s.tag?`<span class="sh-tag">${esc0(s.tag)}</span>`:''}${m&&m.winner?`<span class="sh-win">Winner: ${esc0(resultText(m))}</span>`:''}</div>${s.linkEvent?`<div style="padding:4px 12px;font-size:12px;font-weight:700">Leads to: ${esc0(s.linkEvent)} (Special Event)</div>`:''}<div class="sh-row">${s.boxes.map(bx).join('')}</div></div>`}).join('')+`</div>`}
function toSheetHTML(data,ev){return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:18px;background:#fff}${SHEET_CSS}.sheet .sh-win{color:#fff}</style></head><body>${sheetHTML(data,ev)}</body></html>`}

// ---- duplicate guard ----
const norm=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');
const sameName=(a,b)=>norm(a)!==''&&norm(a)===norm(b);
const richness=o=>Object.values(o).filter(v=>v!==''&&v!==null&&v!==false&&!(Array.isArray(v)&&v.every(x=>x===''))).length;
const evScore=e=>e.matches.reduce((n,m)=>n+PKEYS.concat(['type','title','result','beat','note','winner']).filter(k=>m[k]).length,0)+(e.sheet?100:0)+(e.summary&&e.summary.text?10:0)+['notes','connects','questions'].filter(k=>e[k]).length+(e.segments||[]).length;
const uniqBy=(arr,f)=>{const seen=new Set();return arr.filter(x=>{const k=f(x);if(k===undefined||k==='')return true;if(seen.has(k))return false;seen.add(k);return true})};
// Merge records that are the same thing under different ids (case/space/punctuation-insensitive names). Deterministic, so two Macs pick the same winner.
function dedupe(d){const rep=[];d.dedupeLog=d.dedupeLog||[];const pick=(g,score)=>g.slice().sort((a,b)=>score(b)-score(a)||String(a.id).localeCompare(String(b.id)))[0];
 const group=(arr,keyf)=>{const m=new Map();arr.forEach(x=>{const k=keyf(x);if(k===''){m.set(Symbol(),[x]);return}if(!m.has(k))m.set(k,[]);m.get(k).push(x)});return [...m.values()]};
 // roster
 const keepR=new Set();group(d.roster,r=>norm(r.name)).forEach(g=>{const w=pick(g,richness);g.forEach(x=>{if(x===w)return;['role','alignment','champion','photo','video'].forEach(k=>{if(!w[k]&&x[k])w[k]=x[k]});if(w.role==='Wrestler'&&x.role&&x.role!=='Wrestler')w.role=x.role;if(x.roleNote&&!w.roleNote)w.roleNote=x.roleNote;if(x.name!==w.name){refs(d,(o,k)=>{if(o[k]===x.name)o[k]=w.name});d.pendingMediaRenames=(d.pendingMediaRenames||[]).concat([[x.name,w.name]])}rep.push('roster: merged "'+x.name+'" into "'+w.name+'"')});keepR.add(w)});
 d.roster=d.roster.filter(r=>keepR.has(r)||norm(r.name)==='');
 // titles
 const keepT=new Set();group(d.titles,t=>norm(t.name)).forEach(g=>{const w=pick(g,t=>t.holders.filter(Boolean).length);g.forEach(x=>{if(x===w)return;x.holders.forEach((h,i)=>{if(h&&!w.holders[i])w.holders[i]=h});if(x.name!==w.name)d.events.forEach(e=>e.matches.forEach(m=>{if(m.title===x.name)m.title=w.name}));rep.push('title: merged "'+x.name+'" into "'+w.name+'"')});keepT.add(w)});
 d.titles=d.titles.filter(t=>keepT.has(t));
 // events (same name and date)
 const keepE=new Set(),remap={};group(d.events,e=>norm(e.name)+'|'+(e.date||'')).forEach(g=>{const w=pick(g,evScore);g.forEach(x=>{if(x===w)return;remap[x.id]=w.id;if(evScore(x)>0&&(JSON.stringify(x)!==JSON.stringify(w)))d.dedupeLog.push({at:Date.now(),kind:'event',name:x.name,lost:x});rep.push('event: merged duplicate "'+x.name+'"')});keepE.add(w)});
 d.events=d.events.filter(e=>keepE.has(e));if(remap[d.currentId])d.currentId=remap[d.currentId];
 d.events.forEach(e=>{const n0=e.matches.length;e.matches=uniqBy(e.matches,m=>m.id);if(e.matches.length<n0)rep.push('matches: removed '+(n0-e.matches.length)+' repeated match id(s) in '+e.name);e.segments=uniqBy(e.segments||[],x=>x.id);
  if(e.sheet){e.sheet.sections=uniqBy(e.sheet.sections,x=>x.id);e.sheet.sections.forEach(s=>{const b0=s.boxes.length;s.boxes=uniqBy(s.boxes,b=>b.id);if(s.boxes.length<b0)rep.push('step boxes: removed repeats in '+e.name+' section '+s.num)})}});
 d.dedupeLog=d.dedupeLog.slice(-20);if(!d.dedupeLog.length)delete d.dedupeLog;
 if(d.pendingMediaRenames)d.pendingMediaRenames=uniqBy(d.pendingMediaRenames,p=>p.join('>'));
 return rep}
// Make ids of same-named records in `local` match `remote` (keeps stamps). Used before merging in-memory data with data written by sync.
function alignIds(local,remote){const map=(a,b)=>a.forEach(x=>{const y=b.find(z=>sameName(z.name,x.name)&&(z.date||'')===(x.date||''));if(y&&y.id!==x.id){if(local.currentId===x.id)local.currentId=y.id;x.id=y.id}});map(local.roster,remote.roster);map(local.titles,remote.titles);map(local.events,remote.events)}
function validate(d){if(!d||typeof d!=='object'||!Array.isArray(d.events)||!Array.isArray(d.roster))throw new Error('Not an Ark-Book backup');
 d.roster=d.roster.map(r=>typeof r==='string'?person(r):Object.assign(person(r.name),r));d.lists=d.lists||seed().lists;if(!d.lists.methods)d.lists.methods=seed().lists.methods;d.lists.types=Array.isArray(d.lists.types)?d.lists.types:[];MTYPES.forEach(t=>{if(!d.lists.types.some(x=>mtKind(x)===mtKind(t)))d.lists.types.push(t)});if(!d.titles){const c=d.champions||{};d.titles=defTitles();d.titles[0].holders=[c.u||''];d.titles[1].holders=[c.o||'']}delete d.champions;d.bookings=Array.isArray(d.bookings)?d.bookings.filter(b=>b&&typeof b==='object').map(b=>Object.assign(blankBooking(),b,{fee:feeNum(b.fee)})):[];if(d.bookings.length)d.bookings=uniqBy(d.bookings,b=>b.id);if(d.lists)delete d.lists.titles;d.titles.forEach(t=>{t.slots=t.slots||1;t.holders=(t.holders||[]).slice(0,t.slots);while(t.holders.length<t.slots)t.holders.push('')});d.events.forEach(e=>{e.matches=e.matches||[];e.summary=e.summary||{tpl:'',text:''};e.months=e.months||6;e.kind=e.kind||'special';e.segments=e.segments||[];if(e.sheet===undefined)e.sheet=null;e.matches.forEach(m=>{XKEYS.forEach(k=>{if(m[k]===undefined)m[k]=''});if(m.winner===undefined)m.winner='';if(m.method===undefined)m.method='';m.winnerPlanned=!!m.winnerPlanned});['notes','connects','questions'].forEach(k=>{e[k]=e[k]||''})});
 if(!d.events.find(e=>e.id===d.currentId))d.currentId=d.events[0]&&d.events[0].id;
 // v0.1.5 migrations: KJ Valentine rename, 12 Gauge Heavyweight Championship = Undisputed, Throw Down is a Special event
 {const OLD='J.K. Valentine',NEW='KJ Valentine';const hasOld=d.roster.some(r=>r.name===OLD),hasNew=d.roster.some(r=>r.name===NEW);
  if(hasOld){if(hasNew){const o=d.roster.find(r=>r.name===OLD),n=d.roster.find(r=>r.name===NEW);['role','alignment','champion','photo'].forEach(k=>{if(!n[k]&&o[k])n[k]=o[k]});d.roster=d.roster.filter(r=>r!==o)}else d.roster.find(r=>r.name===OLD).name=NEW;
   refs(d,(o,k)=>{if(o[k]===OLD)o[k]=NEW});d.pendingMediaRenames=(d.pendingMediaRenames||[]).concat([[OLD,NEW]])}
  const HW='12 Gauge Heavyweight Championship',UN='Undisputed Championship';const ht=d.titles.find(t=>t.name===HW);
  if(ht){const un=d.titles.find(t=>t.name===UN);if(un&&ht.holders[0]&&!un.holders[0])un.holders[0]=ht.holders[0];d.titles=d.titles.filter(t=>t!==ht)}
  const fix=x=>typeof x==='string'?x.replace(/12 gauge heavyweight championship/gi,m=>m===m.toUpperCase()?UN.toUpperCase():UN):Array.isArray(x)?x.map(fix):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,fix(v)])):x;
  d.events.forEach(e=>{e.matches.forEach(m=>{if(m.title===HW)m.title=UN});if(e.sheet)e.sheet=fix(e.sheet);if(e.summary&&e.summary.text)e.summary.text=fix(e.summary.text);['notes','connects'].forEach(k=>{if(e[k])e[k]=fix(e[k])});
   if(e.questions&&/Rico Bravo is the Undisputed Champion in Ark-Book, but the sheet|The sheet says KJ Valentine\. The roster already has/.test(e.questions)){let n=0;e.questions=e.questions.split('\n').filter(l=>!/^\d+\. (Rico Bravo is the Undisputed Champion in Ark-Book|The sheet says KJ Valentine)/.test(l)).map(l=>/^\d+\. /.test(l)?(++n)+'. '+l.replace(/^\d+\. /,''):l).join('\n')}
   if(/^throw down in t-town$/i.test(e.name)||e.id==='ev-throw-down-in-t-town'){e.kind='special';e.cycleMonth=''}
   if(e.sheet&&/J\.K\. Valentine/.test(JSON.stringify(e.sheet)))e.sheet=JSON.parse(JSON.stringify(e.sheet).split(OLD).join(NEW))})}

 // v0.1.7: role list and per-person role. Empty role defaults to Wrestler; old free-text roles are kept as a note under Other, never guessed.
 {const cur0=Array.isArray(d.lists.roles)?d.lists.roles:[];const seen=new Set(),out=[];ROLES.concat(cur0).forEach(x=>{const k=norm(x);if(k&&!seen.has(k)){seen.add(k);out.push(ROLES.find(b=>norm(b)===k)||String(x).trim())}});d.lists.roles=out;
  d.roster.forEach(r=>{if(r.video===undefined)r.video='';const cur=(r.role||'').trim();if(!cur){r.role='Wrestler';return}const hit=d.lists.roles.find(x=>norm(x)===norm(cur));if(hit){r.role=hit;return}if(d.rolesMigrated){d.lists.roles.push(cur);return}r.roleNote=r.roleNote||cur;r.role='Other'});d.rolesMigrated=true}
dedupe(d);return d}
// ---- sync support: per-record stamps (meta.rec[key]={h,t}), tombstones (meta.tomb[key]=t), merge by newest edit ----
const cyrb=str=>{let h1=0xdeadbeef,h2=0x41c6ce57;for(let i=0;i<str.length;i++){const c=str.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677)}h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return (4294967296*(2097151&h2)+(h1>>>0)).toString(36)};
const stripIds=v=>JSON.parse(JSON.stringify(v,(k,x)=>k==='id'&&typeof x==='string'&&/^(x|m-)/.test(x)&&k==='id'?undefined:x));
function recordsOf(d){const r={};d.events.forEach(e=>r['ev:'+e.id]=e);d.roster.forEach(p=>r['p:'+p.id]=p);d.titles.forEach(t=>r['t:'+t.id]=t);(d.bookings||[]).forEach(b=>r['bk:'+b.id]=b);r['lists']=d.lists;r['order:roster']=d.roster.map(p=>p.id);r['order:titles']=d.titles.map(t=>t.id);r['order:events']=d.events.map(e=>e.id).sort();return r}
const hashRec=v=>cyrb(JSON.stringify(Array.isArray(v)?v:stripIds(v)));
function stamp(d,now,defaultT){now=now||Date.now();d.meta=d.meta||{rec:{},tomb:{}};d.meta.rec=d.meta.rec||{};d.meta.tomb=d.meta.tomb||{};const recs=recordsOf(d);let changed=false;
 for(const k of Object.keys(recs)){const h=hashRec(recs[k]),m=d.meta.rec[k];if(!m){d.meta.rec[k]={h,t:defaultT||now};changed=true}else if(m.h!==h){d.meta.rec[k]={h,t:now};changed=true}if(d.meta.tomb[k]){delete d.meta.tomb[k];changed=true}}
 for(const k of Object.keys(d.meta.rec)){if(!(k in recs)){d.meta.tomb[k]=now;delete d.meta.rec[k];changed=true}}return changed}
// first link between two machines that each seeded their own data: give local records the remote id when the name matches
function adoptIds(local,remote){const map=(a,b,key)=>a.forEach(x=>{const y=b.find(z=>z[key]===x[key]);if(y&&y.id!==x.id)x.id=y.id});map(local.roster,remote.roster,'name');map(local.titles,remote.titles,'name');map(local.events,remote.events,'name');local.meta={rec:{},tomb:{}}}
function mergeData(local,remote){const lr=recordsOf(local),rr=recordsOf(remote),lm=local.meta||{rec:{},tomb:{}},rm=remote.meta||{rec:{},tomb:{}};const win={},conflicts=[],meta={rec:{},tomb:{}};
 for(const k of new Set([...Object.keys(lr),...Object.keys(rr),...Object.keys(lm.tomb||{}),...Object.keys(rm.tomb||{})])){
  const L=lm.rec[k],R=rm.rec[k],LT=(lm.tomb||{})[k],RT=(rm.tomb||{})[k];
  if(k in lr&&k in rr){if(L&&R&&L.h===R.h){win[k]=lr[k];meta.rec[k]={h:L.h,t:Math.max(L.t,R.t)}}else{const lw=!R||(L&&L.t>=R.t);win[k]=lw?lr[k]:rr[k];meta.rec[k]=lw?L:R;conflicts.push({key:k,kept:lw?'local':'remote',lost:lw?rr[k]:lr[k],lt:L&&L.t,rt:R&&R.t})}}
  else if(k in lr){if(RT&&L&&RT>L.t){/* deleted remotely after local edit time */conflicts.push({key:k,kept:'deleted',lost:lr[k]})}else{win[k]=lr[k];meta.rec[k]=L}}
  else if(k in rr){if(LT&&R&&LT>R.t){conflicts.push({key:k,kept:'deleted',lost:rr[k]})}else{win[k]=rr[k];meta.rec[k]=R}}
  if(!(k in win)){const t=Math.max(LT||0,RT||0);if(t)meta.tomb[k]=t}}
 const out=JSON.parse(JSON.stringify(local));const pick=(prefix,ordKey)=>{const ids=(win[ordKey]||[]).slice();const have=Object.keys(win).filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length));const all=ids.filter(i=>have.includes(i)).concat(have.filter(i=>!ids.includes(i)));return all.map(i=>win[prefix+i])};
 out.events=Object.keys(win).filter(k=>k.startsWith('ev:')).map(k=>win[k]);const evOrder=(local.events.map(e=>e.id));out.events.sort((a,b)=>{const ia=evOrder.indexOf(a.id),ib=evOrder.indexOf(b.id);return (ia<0?1e9:ia)-(ib<0?1e9:ib)});
 out.roster=pick('p:','order:roster');out.bookings=Object.keys(win).filter(k=>k.startsWith('bk:')).map(k=>win[k]);out.titles=pick('t:','order:titles');if(win.lists)out.lists=win.lists;out.meta=meta;
 if(!out.events.find(e=>e.id===out.currentId)&&out.events[0])out.currentId=out.events[0].id;
 return {data:out,conflicts}}
// ---- bookings: talent fee sheet per annual event. Each booking is its own sync record (bk:<id>).
const BOOK_EVENTS=['Welcome To Our House','Brutal Love','Thriller','Throw Down in T-Town','November Rain','A Christmas Story'];
const blankBooking=(o={})=>Object.assign({id:uid(),talent:'',event:'',date:'',fee:0,note:''},o);
const feeNum=v=>{const n=parseFloat(String(v==null?'':v).replace(/[$,\s]/g,''));return isFinite(n)&&n>=0?Math.round(n*100)/100:0};
const money=n=>'$'+feeNum(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function bookingEvents(d){const seen=new Set(),out=[];BOOK_EVENTS.concat((d.lists&&d.lists.bookingEvents)||[],(d.bookings||[]).map(b=>b.event)).forEach(x=>{x=String(x||'').trim();const k=norm(x);if(k&&!seen.has(k)){seen.add(k);out.push(x)}});return out}
function bookingEventAdd(d,name){name=String(name||'').trim();if(!name)throw new Error('Event name required');if(bookingEvents(d).some(x=>sameName(x,name)))throw new Error('Event already in the list');d.lists.bookingEvents=(d.lists.bookingEvents||[]).concat([name]);return name}
function bookingAdd(d,o){d.bookings=d.bookings||[];const b=blankBooking(o);b.fee=feeNum(b.fee);d.bookings.push(b);return b}
function bookingUpdate(d,id,o){const b=(d.bookings||[]).find(x=>x.id===id);if(!b)throw new Error('Booking not found');Object.assign(b,o);if('fee' in o)b.fee=feeNum(o.fee);return b}
function bookingRemove(d,id){const n=(d.bookings||[]).length;d.bookings=(d.bookings||[]).filter(x=>x.id!==id);if(d.bookings.length===n)throw new Error('Booking not found')}
const BK_SORT={event:(a,b)=>a.event.localeCompare(b.event)||(a.date||'9999').localeCompare(b.date||'9999')||a.talent.localeCompare(b.talent),date:(a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.talent.localeCompare(b.talent),talent:(a,b)=>a.talent.localeCompare(b.talent)||(a.date||'').localeCompare(b.date||''),fee:(a,b)=>b.fee-a.fee||a.talent.localeCompare(b.talent)};
function bookingsList(d,ev,sort){const all=(d.bookings||[]).filter(b=>!ev||ev==='All'||sameName(b.event,ev)||(!b.event&&ev==='No event'));return all.slice().sort(BK_SORT[sort]||BK_SORT.event)}
function bookingTotals(list){const m=new Map();list.forEach(b=>{const k=b.event||'No event';m.set(k,(m.get(k)||0)+feeNum(b.fee))});const per=[...m.entries()].map(([event,total])=>({event,total:Math.round(total*100)/100,count:list.filter(b=>(b.event||'No event')===event).length}));return {per,grand:Math.round(per.reduce((s,x)=>s+x.total,0)*100)/100}}
function bookingSheetHTML(d,ev,logo){const list=bookingsList(d,ev,'event'),tot=bookingTotals(list),title=(!ev||ev==='All')?'All Events':ev;
 const groups=tot.per.map(g=>{const rows=list.filter(b=>(b.event||'No event')===g.event);return `<section><h2>${esc(g.event)}</h2><table><thead><tr><th>Talent</th><th>Show date</th><th class="r">Agreed fee</th></tr></thead><tbody>${rows.map(b=>`<tr><td>${esc(b.talent||'Talent TBD')}${b.note?`<div class="nt">${esc(b.note)}</div>`:''}</td><td>${esc(b.date?fmtDate(b.date):'Date TBD')}</td><td class="r">${money(b.fee)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">${esc(g.event)} total (${g.count} booked)</td><td class="r">${money(g.total)}</td></tr></tfoot></table></section>`}).join('');
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bookings, ${esc(title)}</title><style>@page{size:letter;margin:14mm}*{box-sizing:border-box}body{margin:0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#111;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hd{display:flex;align-items:center;gap:16px;background:#070707;color:#fff;padding:16px 20px;border-radius:12px;border-bottom:4px solid #d8a928}.hd img{height:56px}.hd h1{margin:0;font-size:24px;letter-spacing:1px}.hd .s{color:#d8a928;font-size:12px;letter-spacing:2px;text-transform:uppercase}.hd .dt{margin-left:auto;font-size:11px;color:#ccc;text-align:right}
section{margin-top:18px;break-inside:avoid}h2{margin:0 0 6px;font-size:15px;text-transform:uppercase;letter-spacing:1.5px;color:#8a6a10;border-bottom:2px solid #d8a928;padding-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}th:first-child{width:45%}th:last-child{width:22%}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#555;padding:6px 8px;border-bottom:1px solid #ccc}td{padding:7px 8px;border-bottom:1px solid #eee;vertical-align:top}.r{text-align:right;white-space:nowrap}.nt{font-size:11px;color:#666}
tfoot td{font-weight:700;background:#f6efd9;border-bottom:0}.grand{margin-top:18px;display:flex;justify-content:space-between;background:#070707;color:#d8a928;padding:12px 16px;border-radius:10px;font-weight:800;font-size:15px}.empty{margin-top:24px;color:#666;font-style:italic}.ft{margin-top:20px;font-size:10px;color:#888;text-align:center}</style></head><body>
<div class="hd">${logo?`<img src="${logo}" alt="12 Gauge">`:''}<div><div class="s">12 Gauge Pro Wrestling</div><h1>Talent Bookings: ${esc(title)}</h1></div><div class="dt">Prepared ${esc(new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))}<br>${list.length} booking${list.length===1?'':'s'}</div></div>
${groups||'<div class="empty">No bookings yet.</div>'}${tot.per.length>1?`<div class="grand"><span>Grand total, all events</span><span>${money(tot.grand)}</span></div>`:''}<div class="ft">Ark-Book, 12 Gauge Pro Wrestling. Confidential booking sheet.</div></body></html>`}

const api={matchMove,XKEYS,PKEYS,MTYPES,mtKind,sideKeys,sides,sideLabel,participants,vsLine,BOOK_EVENTS,blankBooking,feeNum,money,bookingEvents,bookingEventAdd,bookingAdd,bookingUpdate,bookingRemove,bookingsList,bookingTotals,bookingSheetHTML,ROLES,namesByRole,byRole,norm,sameName,dedupe,alignIds,bodyHTML,SHEET_CSS,sheetHTML,toSheetHTML,winnerOpts,applyWinner,resultText,titleOffer,applyBoard,slug,cyrb,recordsOf,stamp,adoptIds,mergeData,defTitles,titleNames,holdersOf,titleAdd,titleRename,titleRemove,titleMove,titleSlots,played,kindLabel,person,names,rosterAdd,rosterRename,rosterRemove,rosterMove,uid,seed,blankEvent,blankMatch,fmtDate,sortEvents,storyWindow,wrestlerView,generateSummary,toMarkdown,toHTML,validate,matchLine,clean,ROSTER};
if(typeof module!=='undefined')module.exports=api;else root.Core=api;
})(typeof window!=='undefined'?window:globalThis);
