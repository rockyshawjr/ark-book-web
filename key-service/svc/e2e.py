import json,re,time,urllib.request
from playwright.sync_api import sync_playwright
BASE='http://localhost:8787/';SVC='http://localhost:8787/svc/functions/v1/ark-keys';ADMIN_T='admin-token-'+'y'*30
OUT='/workspace/ark-book-bookings/';FEE=re.compile(r'4,?321|1,?234\.56|987\.65|555\.55|2,?222')
dbg=lambda:json.load(urllib.request.urlopen(BASE+'debug/data'))
res=[]
def ok(name,cond):res.append((name,bool(cond)));print(('PASS ' if cond else 'FAIL ')+name)
def ctx(b,init):
  c=b.new_context(viewport={'width':1440,'height':950})
  c.route(re.compile(r'https://api\.github\.com/.*'),lambda r:r.fulfill(response=r.fetch(url=r.request.url.replace('https://api.github.com','http://localhost:8787/gh'))))
  c.add_init_script(f"if(!sessionStorage.getItem('i')){{sessionStorage.setItem('i','1');localStorage.setItem('ark.svc','{SVC}');{init}}}")
  return c
def bookings(p):
  p.click('.tab[data-tab="bookings"]');p.wait_for_timeout(600)
with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
  # ---- admin (GitHub token, full access, as today)
  a=ctx(b,f"localStorage.setItem('ark.token','{ADMIN_T}');localStorage.setItem('ark.asked','1');");ap=a.new_page();errs=[];ap.on('pageerror',lambda e:errs.append(str(e)))
  ap.goto(BASE);ap.wait_for_timeout(2500);ap.evaluate("window.__arkWeb.sync().syncNow()");ap.wait_for_timeout(2000);bookings(ap)
  ok('admin sees fees and totals','4321.77' in ap.content() and 'fee totals by event' in ap.inner_text('#main').lower())
  ok('Keys button visible for admin',ap.is_visible('#bkeys'))
  ap.click('#bkeys');ap.wait_for_selector('#klabel');ap.fill('#klabel','Android tablet');ap.select_option('#krole','crew');ap.click('#kmake');ap.wait_for_selector('.kval')
  crew_key=ap.input_value('.kval');ok('crew key made and shown once',crew_key.startswith('ark_'))
  ok('QR code rendered',ap.locator('.kqr svg').count()==1)
  ap.screenshot(path=OUT+'keys-page-new-key.png')
  ap.click('#kdone');ap.wait_for_selector('.kval',state='detached');ap.fill('#klabel','Front door helper');ap.select_option('#krole','viewer');ap.click('#kmake');ap.wait_for_selector('.kval');viewer_key=ap.input_value('.kval');ap.click('#kdone');ap.wait_for_selector('.kval',state='detached');ap.wait_for_timeout(300)
  ok('key list shows 2 active',"keys (2 active)" in ap.inner_text('#keys').lower());ok('list never shows a key value',crew_key not in ap.content() and viewer_key not in ap.content())
  ap.screenshot(path=OUT+'keys-page-list.png');ap.click('#kclose')
  # ---- crew via QR link
  c=ctx(b,"");cp=c.new_page();cerr=[];cp.on('pageerror',lambda e:cerr.append(str(e)))
  cp.goto(BASE+'#arkkey='+crew_key);cp.wait_for_selector('#tsave');ok('QR link prefills key',cp.input_value('#tk')==crew_key)
  cp.click('#tsave');cp.wait_for_timeout(4000);bookings(cp)
  t=cp.inner_text('#main');ok('crew sees bookings',('KJ Valentine' in cp.content()) and ('DJ Mike' in cp.content()) and 'Booked (5)'.lower() in t.lower())
  ok('crew sees no fees, totals or $',not FEE.search(cp.content()) and 'Fee totals' not in t and '$' not in t and 'Agreed fee' not in t)
  ok('crew: no fee input, no fee sort',cp.locator('#bk-fee').count()==0 and cp.locator('[data-bksort="fee"]').count()==0 and cp.locator('[data-bkf="fee"]').count()==0)
  ok('Keys button hidden for crew',not cp.is_visible('#bkeys'))
  ls=cp.evaluate("JSON.stringify(Object.assign({},localStorage))");ok('crew device storage holds no fee',not FEE.search(ls))
  pdf=cp.evaluate("Core.bookingSheetHTML(S,'All','',null,!bkFees())");ok('crew PDF has no fees',not FEE.search(pdf) and '$' not in re.sub(r'<style[\s\S]*?</style>','',pdf))
  cp.screenshot(path=OUT+'crew-bookings-view.png',full_page=True)
  # crew edit: change BK Bennet show date
  sel=cp.locator('tr[data-bkrow="b1"] input[type=date]');sel.fill('2026-11-08');sel.dispatch_event('change');cp.wait_for_timeout(500)
  cp.evaluate("window.__arkWeb.sync().syncNow()");cp.wait_for_timeout(2500)
  real={x['id']:x for x in dbg()['data']['bookings']}
  ok('crew edit reached shared data',real['b1']['date']=='2026-11-08');ok('fee preserved on crew edit',real['b1']['fee']==1234.56 and real['b0']['fee']==4321.77)
  # crew tries to sneak a fee in through devtools
  cp.evaluate("S.bookings.find(b=>b.id==='b2').fee=9999;S.bookings.find(b=>b.id==='b2').note='x';Core.stamp(S);window.sb.save(S)");cp.wait_for_timeout(300);cp.evaluate("window.__arkWeb.sync().syncNow()");cp.wait_for_timeout(2500)
  real={x['id']:x for x in dbg()['data']['bookings']};ok('crew devtools fee write dropped',real['b2']['fee']==987.65 and real['b2']['note']=='x')
  # admin sees crew edit with fees intact
  ap.evaluate("window.__arkWeb.sync().syncNow()");ap.wait_for_timeout(2500);ap.reload();ap.wait_for_timeout(2500);bookings(ap)
  ok('admin still sees all fees after crew sync','4321.77' in ap.content() and '1234.56' in ap.content() and '987.65' in ap.content())
  # ---- viewer
  v=ctx(b,f"localStorage.setItem('ark.arkkey','{viewer_key}');localStorage.setItem('ark.keyRole','viewer');");vp=v.new_page();vp.goto(BASE);vp.wait_for_timeout(4000);bookings(vp)
  t=vp.inner_text('#main');ok('viewer sees bookings, no fees','KJ Valentine' in t and not FEE.search(t) and '$' not in t)
  ok('viewer inputs locked',vp.evaluate("getComputedStyle(document.querySelector('#bk-addbtn')).pointerEvents")=='none')
  before=dbg()['data'];vp.evaluate("S.bookings[0].talent='HACK';Core.stamp(S);window.sb.save(S)");vp.evaluate("window.__arkWeb.sync().syncNow()");vp.wait_for_timeout(2000)
  ok('viewer cannot change shared data',json.dumps(dbg()['data'],sort_keys=True)==json.dumps(before,sort_keys=True))
  vp.screenshot(path=OUT+'viewer-bookings-view.png')
  # ---- revoke crew
  ap.click('#bkeys');ap.wait_for_selector('[data-krevoke]');ap.once('dialog',lambda d:d.accept());ap.locator('tr',has_text='Android tablet').locator('[data-krevoke]').click();ap.wait_for_timeout(800)
  ok('revoked shows in list','Revoked' in ap.inner_text('#keys'));ap.screenshot(path=OUT+'keys-page-after-revoke.png')
  cp.evaluate("window.__arkWeb.sync().syncNow()");cp.wait_for_timeout(1500);st=cp.evaluate("window.__arkWeb.sync().status");ok('revoked crew stops syncing','revoked' in st['msg'])
  ok('no page errors',not errs and not cerr);print('errors',errs,cerr)
  b.close()
print(sum(1 for _,x in res if x),'/',len(res),'passed')
