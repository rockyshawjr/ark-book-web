// Ark-Book branding + theme (0.1.15). Shared by the Mac/Windows app and ark-book-web.
// Stored in the synced data at data.lists.branding = {accent:'#rrggbb', mode:'dark'|'light'|'system', logo:'data:image/...'}.
// Empty or missing = the original 12 Gauge look (gold #d8a928, dark, built-in logo).
(function(){
const DEF={accent:'#d8a928',mode:'dark',logo:''};
const PRESETS=[['12 Gauge Gold','#d8a928'],['Fire Red','#d33a3a'],['Royal Blue','#2f7fe0'],['Ring Green','#1fae5b'],['Purple','#8a5cf0'],['Silver','#b9c0c8']];
const BG={dark:'#070707',light:'#f3f0e8'};
const validHex=h=>/^#[0-9a-f]{6}$/i.test(h||'');
const hex2rgb=h=>{const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255]};
const rgb2hex=a=>'#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const lum=h=>{const c=hex2rgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
function get(d){const b=(d&&d.lists&&d.lists.branding)||{};return {accent:validHex(b.accent)?b.accent.toLowerCase():DEF.accent,mode:['dark','light','system'].includes(b.mode)?b.mode:DEF.mode,logo:(typeof b.logo==='string'&&/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(b.logo))?b.logo:''}}
function textAccent(acc,bg){let c=hex2rgb(acc),i=0;const dark=lum(bg)<.5;while(contrast(rgb2hex(c),bg)<4.5&&i<60){c=c.map(v=>dark?v+(255-v)*.06:v*.94);i++}return rgb2hex(c)}
function onAccent(acc){return contrast(acc,'#080808')>=contrast(acc,'#ffffff')?'#080808':'#ffffff'}
function resolved(mode){if(mode==='system')return (window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';return mode}
let last=null;
function apply(d){last=d;const b=get(d),m=resolved(b.mode),r=document.documentElement,s=r.style,bg=BG[m];
 r.dataset.theme=m;
 if(b.accent===DEF.accent&&m==='dark'){['--acc','--acc-rgb','--acc-text','--on-acc','--chev'].forEach(k=>s.removeProperty(k))}   // exact original look
 else{s.setProperty('--acc',b.accent);s.setProperty('--acc-rgb',hex2rgb(b.accent).join(','));s.setProperty('--acc-text',textAccent(b.accent,bg));s.setProperty('--on-acc',onAccent(b.accent));
  s.setProperty('--chev',`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%23${b.accent.slice(1)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`)}
 const img=document.querySelector('#nav img');if(img){if(!img.dataset.def)img.dataset.def=img.getAttribute('src');const want=b.logo||img.dataset.def;if(img.getAttribute('src')!==want)img.setAttribute('src',want)}
 const tc=document.querySelector('meta[name=theme-color]');if(tc)tc.content=bg;
 if(navigator.platform&&/^Win/.test(navigator.platform))document.body&&document.body.classList.add('plat-win');}
if(window.matchMedia)try{matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(last&&get(last).mode==='system')apply(last)})}catch(_){}
// resize an uploaded logo to at most 600x200 (keeps the data file small enough to sync quickly)
function resizeLogo(file){return new Promise((res,rej)=>{if(!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(file.type))return rej(new Error('Use a PNG, JPG, WEBP or SVG image'));
 const fr=new FileReader();fr.onerror=()=>rej(new Error('Could not read that file'));fr.onload=()=>{const im=new Image();im.onerror=()=>rej(new Error('That image could not be opened'));im.onload=()=>{
  const W=im.naturalWidth||600,H=im.naturalHeight||200,k=Math.min(1,600/W,200/H),w=Math.max(1,Math.round(W*k)),h=Math.max(1,Math.round(H*k));
  const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);let u=c.toDataURL('image/png');if(u.length>400000)u=c.toDataURL('image/webp',.9);if(u.length>400000)return rej(new Error('Logo is still too large after resizing'));res(u)};im.src=fr.result};fr.readAsDataURL(file)})}
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function crBadge(r,label,lo){lo=lo||[4.5,3];const cls=r>=lo[0]?'th-ok':r>=lo[1]?'th-warn':'th-bad';const word=r>=lo[0]?'Good':r>=lo[1]?'OK':'Too low';return `<span class="th-cr ${cls}">${label}: ${r.toFixed(1)}:1 ${word}</span>`}
function view(d,canEdit){const b=get(d),m=resolved(b.mode),bg=BG[m],dis=canEdit?'':'disabled';
 const crBg=contrast(b.accent,bg),crTxt=contrast(b.accent,onAccent(b.accent));
 return `<div class="g pad"><h1>Settings</h1><div class="sub">Branding and theme. Changes sync to every Mac, Windows PC, phone and the web version.${canEdit?'':' (Only the owner can change these.)'}</div></div>
 <div class="g pad"><h2>Logo</h2><div class="row"><img class="th-logo" src="${esc(b.logo||document.querySelector('#nav img')?.dataset.def||'logo.png')}" alt="Logo preview"><div><div class="sub">${b.logo?'Your logo':'Default 12 Gauge logo'}. Shown in the sidebar and on exported show and booking PDFs. Large images are resized to fit 600 x 200.</div>
 <div class="row" style="margin-top:10px"><label class="b ${dis}" ${canEdit?'':'style="opacity:.5;pointer-events:none"'}>Upload logo<input type="file" id="th-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none"></label>${b.logo?`<button class="b o" id="th-logo-clear" ${dis}>Use default logo</button>`:''}</div></div></div></div>
 <div class="g pad"><h2>Accent color</h2><div class="row">${PRESETS.map(([n,c])=>`<span class="th-sw ${c===b.accent?'on':''}" title="${n}" data-thacc="${c}" style="background:${c}"></span>`).join('')}
 <span class="sub" style="margin-left:10px">Custom</span><input type="color" id="th-custom" value="${b.accent}" ${dis}><span class="sub">${b.accent.toUpperCase()}</span></div>
 <div class="row" style="margin-top:12px">${crBadge(crBg,'Highlights on background',[3,1.8])}${crBadge(crTxt,'Button text')}</div>
 ${crBg<1.8?`<div class="note" style="margin-top:8px">This color is hard to see on the ${m} background. Headings and links are darkened or lightened automatically, but buttons and highlights may look faint. Try a stronger color.</div>`:''}</div>
 <div class="g pad"><h2>Appearance</h2><div class="row th-mode">${[['dark','Dark'],['light','Light'],['system','Match system']].map(([k,l])=>`<button class="b o ${b.mode===k?'on':''}" data-thmode="${k}" ${dis}>${l}</button>`).join('')}</div>
 <div class="note" style="margin-top:8px">Match system follows your Mac, Windows or phone light/dark setting.</div></div>
 <div class="g pad"><h2>Reset</h2><div class="row"><button class="b o" id="th-reset" ${dis}>Reset to 12 Gauge default</button><span class="sub">Gold accent, dark mode, original logo.</span></div></div>`}
function bind(o){// o: {getS, mut, draw, toast, canEdit}
 const setB=patch=>{if(!o.canEdit())return o.toast('Only the owner can change branding');o.mut(()=>{const S=o.getS();S.lists=S.lists||{};const cur=Object.assign({},S.lists.branding||{},patch);Object.keys(cur).forEach(k=>{if(cur[k]===''||cur[k]==null)delete cur[k]});if(Object.keys(cur).length)S.lists.branding=cur;else delete S.lists.branding});apply(o.getS());o.draw()};
 document.addEventListener('click',e=>{const t=e.target;if(!t||!t.closest)return;
  const sw=t.closest('[data-thacc]');if(sw)return setB({accent:sw.dataset.thacc===DEF.accent?'':sw.dataset.thacc});
  const md=t.closest('[data-thmode]');if(md)return setB({mode:md.dataset.thmode===DEF.mode?'':md.dataset.thmode});
  if(t.id==='th-logo-clear')return setB({logo:''});
  if(t.id==='th-reset'){if(confirm('Reset branding to the 12 Gauge default (gold, dark, original logo)?'))setB({accent:'',mode:'',logo:''})}});
 document.addEventListener('change',async e=>{const t=e.target;
  if(t.id==='th-custom'){const v=t.value.toLowerCase();if(validHex(v))setB({accent:v===DEF.accent?'':v})}
  if(t.id==='th-file'&&t.files&&t.files[0]){try{const u=await resizeLogo(t.files[0]);setB({logo:u});o.toast('Logo updated')}catch(err){o.toast(err.message)}t.value=''}});
 document.addEventListener('input',e=>{const t=e.target;if(t.id==='th-custom'&&validHex(t.value)){const r=document.documentElement.style,v=t.value;r.setProperty('--acc',v);r.setProperty('--acc-rgb',hex2rgb(v).join(','))}});}
function logoFor(d,fallback){return get(d).logo||fallback}
window.ArkTheme={DEF,PRESETS,get,apply,view,bind,resizeLogo,contrast,textAccent,onAccent,logoFor};
})();
