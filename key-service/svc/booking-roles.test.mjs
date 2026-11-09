// Booking role allowlist: Referee and Manager must show in the role dropdowns and survive save, edit, reload, and crew sync.
// Existing Talent, Sound, Camera, and Crew values stay valid. Unknown roles still normalize to Talent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import CoreServer from '../supabase/functions/ark-keys/core.mjs';
import W from '../supabase/functions/ark-keys/websync.mjs';
import {makeHandler} from '../supabase/functions/ark-keys/handler.mjs';
import {memoryStore} from './store-postgrest.mjs';
import {mockGitHub} from './mockgh.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXISTING = ['Talent', 'Sound', 'Camera', 'Crew'];
const ADDED = ['Referee', 'Manager'];
const ALL = EXISTING.concat(ADDED);

function loadWebCore() {
  const context = vm.createContext({module: {exports: {}}, console});
  vm.runInContext(fs.readFileSync(path.join(root, 'core.js'), 'utf8'), context, {filename: 'core.js'});
  return context.module.exports;
}

const CoreWeb = loadWebCore();

function fresh(Core) {
  return Core.validate({
    events: [{id: 'e1', name: 'November Rain', date: '2026-11-15'}],
    roster: ['KJ Valentine', 'BK Bennet'],
    titles: [],
    bookings: []
  });
}

function reopen(Core, data) {
  return Core.validate(JSON.parse(JSON.stringify(data)));
}

function selects(html) {
  const out = [];
  const re = /<select\b([^>]*)>([\s\S]*?)<\/select>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const options = [];
    const or = /<option\b([^>]*)>([^<]*)<\/option>/g;
    let o;
    while ((o = or.exec(m[2]))) {
      const a = o[1];
      const text = o[2];
      const value = /\bvalue="([^"]*)"/.exec(a);
      options.push({text, value: value ? value[1] : text, selected: /\bselected\b/.test(a)});
    }
    const id = /\bid="([^"]*)"/.exec(attrs);
    const bkf = /\bdata-bkf="([^"]*)"/.exec(attrs);
    const bkid = /\bdata-bkid="([^"]*)"/.exec(attrs);
    out.push({id: id && id[1], bkf: bkf && bkf[1], bkid: bkid && bkid[1], options});
  }
  return out;
}

function optionTexts(select) {
  return select.options.map(o => o.text);
}

function loadBookings(Core) {
  const listeners = {input: [], click: [], change: []};
  const fields = {};
  const context = {
    Core,
    console,
    S: null,
    esc: s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])),
    $: sel => fields[String(sel).replace(/^#/, '')] || null,
    mut: fn => { fn(); },
    draw() {},
    toast() {},
    confirm: () => false,
    prompt: () => null,
    fields,
    document: {
      addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
      createElement() { return {style: {}}; },
      body: {appendChild() {}}
    }
  };
  context.window = context;
  context.globalThis = context;
  context.ARK = {fees: true, edit: true, mode: 'token', role: 'admin'};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'bookings.js'), 'utf8'), context, {filename: 'bookings.js'});
  return {context, listeners, fields};
}

const list = a => [...a];
function assertRoleList(Core, label) {
  assert.deepEqual(list(Core.BK_ROLES).slice(0, EXISTING.length), EXISTING, label + ' keeps existing booking roles in order');
  assert.deepEqual(list(Core.BK_ROLES).slice(EXISTING.length), ADDED, label + ' adds Referee and Manager');
  for (const role of ALL) assert.equal(Core.bkRole(role), role, label + ' ' + role);
  assert.equal(Core.bkRole('referee'), 'Referee', label + ' canonical display');
  assert.equal(Core.bkRole('MANAGER'), 'Manager', label + ' canonical display');
  assert.equal(Core.bkRole('Ring Announcer'), 'Talent', label + ' unknown role still Talent');
}

test('web and key-service core allow Referee and Manager without dropping existing booking roles', () => {
  assert.deepEqual(list(CoreWeb.BK_ROLES), list(CoreServer.BK_ROLES), 'key-service core.mjs must be rebuilt from core.js');
  assertRoleList(CoreWeb, 'web');
  assertRoleList(CoreServer, 'server');
});

test('save, edit, and reopen keep Referee, Manager, and the existing booking roles', () => {
  for (const Core of [CoreWeb, CoreServer]) {
    const stored = {
      events: [{id: 'e1', name: 'November Rain', date: '2026-11-15'}],
      roster: ['KJ Valentine'],
      titles: [],
      bookings: [
        {id: 'b-talent', role: 'Talent', talent: 'KJ Valentine', event: 'November Rain', date: '2026-11-15', fee: 10, note: 'kept'},
        {id: 'b-sound', role: 'Sound', talent: 'Mic', event: 'November Rain', date: '2026-11-15', fee: 20, note: ''},
        {id: 'b-camera', role: 'Camera', talent: 'Cam', event: 'November Rain', date: '2026-11-15', fee: 30, note: ''},
        {id: 'b-crew', role: 'Crew', talent: 'Grip', event: 'November Rain', date: '2026-11-15', fee: 40, note: ''},
        {id: 'b-ref', role: 'Referee', talent: 'Earl', event: 'November Rain', date: '2026-11-15', fee: 50, note: 'ringside'},
        {id: 'b-mgr', role: 'manager', talent: 'Paul', event: 'November Rain', date: '2026-11-15', fee: 60, note: ''},
        {id: 'b-old', role: 'Ring Announcer', talent: 'Howard', event: 'November Rain', date: '2026-11-15', fee: 5, note: 'legacy'}
      ]
    };
    const opened = Core.validate(JSON.parse(JSON.stringify(stored)));
    const roleOf = id => opened.bookings.find(b => b.id === id).role;
    assert.equal(roleOf('b-talent'), 'Talent');
    assert.equal(roleOf('b-sound'), 'Sound');
    assert.equal(roleOf('b-camera'), 'Camera');
    assert.equal(roleOf('b-crew'), 'Crew');
    assert.equal(roleOf('b-ref'), 'Referee');
    assert.equal(roleOf('b-mgr'), 'Manager');
    assert.equal(roleOf('b-old'), 'Talent');
    assert.equal(opened.bookings.find(b => b.id === 'b-ref').talent, 'Earl');
    assert.equal(opened.bookings.find(b => b.id === 'b-ref').note, 'ringside');
    assert.equal(opened.bookings.find(b => b.id === 'b-talent').fee, 10);

    const d = fresh(Core);
    const added = {};
    for (const role of ALL) {
      added[role] = Core.bookingAdd(d, {role, talent: role + ' Name', event: 'November Rain', date: '2026-11-15', fee: 12});
      assert.equal(added[role].role, role);
    }
    Core.bookingUpdate(d, added.Talent.id, {role: 'Referee', talent: 'Earl'});
    assert.equal(added.Talent.role, 'Referee');
    assert.equal(added.Talent.talent, 'Earl');
    Core.bookingUpdate(d, added.Talent.id, {role: 'Manager'});
    assert.equal(added.Talent.role, 'Manager');
    assert.equal(added.Talent.talent, 'Earl');
    const again = reopen(Core, d);
    assert.equal(again.bookings.find(b => b.id === added.Talent.id).role, 'Manager');
    assert.equal(again.bookings.find(b => b.id === added.Sound.id).role, 'Sound');
    assert.equal(again.bookings.find(b => b.id === added.Referee.id).role, 'Referee');
    assert.deepEqual(list(Core.bookingsList(again, 'All', 'role', 'Referee').map(b => b.id)), [added.Referee.id]);
    assert.equal(Core.bookingsList(again, 'All', 'role', 'Manager').length, 2);
    assert.equal(Core.bookingsList(again, 'All', 'role', 'Crew')[0].role, 'Crew');

    const ref = Core.bookingAdd(d, {role: 'Referee', talent: 'Earl', event: 'November Rain', date: '2026-11-15', fee: 50});
    const mgr = Core.bookingAdd(d, {role: 'Manager', talent: 'Paul', event: 'November Rain', date: '2026-11-15', fee: 60});
    assert.deepEqual(list(Core.crewNames(d, 'Referee')), ['Earl', 'Referee Name']);
    assert.deepEqual(list(Core.crewNames(d, 'Manager')), ['Earl', 'Manager Name', 'Paul']);
    assert.deepEqual(list(Core.crewNames(d, 'Sound')), ['Sound Name']);
    assert.ok(!Core.crewNames(d, 'Sound').includes('Earl'));
    const totals = Core.bookingTotals(Core.bookingsList(d, 'All', 'event', 'All'));
    assert.ok(totals.byRole.some(r => r.role === 'Referee' && r.count >= 1));
    assert.ok(totals.byRole.some(r => r.role === 'Manager' && r.count >= 1));
    assert.ok(totals.byRole.some(r => r.role === 'Camera' && r.count === 1));
    const sheet = Core.bookingSheetHTML(d, 'All', '', 'All', false);
    assert.match(sheet, />Referee</);
    assert.match(sheet, />Manager</);
    assert.match(sheet, /Earl/);
    assert.match(sheet, /Paul/);
    assert.match(sheet, />Sound</);
    assert.match(sheet, />Camera</);
    assert.match(sheet, />Crew</);
    const refOnly = Core.bookingSheetHTML(d, 'All', '', 'Referee', false);
    assert.match(refOnly, /Referee/);
    assert.match(refOnly, /Earl/);
    assert.doesNotMatch(refOnly, /Paul/);
    assert.equal(ref.role, 'Referee');
    assert.equal(mgr.role, 'Manager');
  }
});

test('booking role dropdowns list Referee and Manager and the existing roles, and a role edit reopens', () => {
  const {context, listeners, fields} = loadBookings(CoreWeb);
  const d = fresh(CoreWeb);
  const talent = CoreWeb.bookingAdd(d, {role: 'Talent', talent: 'KJ Valentine', event: 'November Rain', date: '2026-11-15', fee: 10});
  const sound = CoreWeb.bookingAdd(d, {role: 'Sound', talent: 'Mic', event: 'November Rain', date: '2026-11-15', fee: 20});
  context.S = d;
  let html = context.vBookings();
  let found = selects(html);
  const add = found.find(s => s.id === 'bk-role');
  const filter = found.find(s => s.id === 'bk-rolef');
  const rows = found.filter(s => s.bkf === 'role');
  assert.ok(add, 'add booking role dropdown');
  assert.ok(filter, 'booked list role filter');
  assert.equal(rows.length, 2, 'each booking row has a role dropdown');
  assert.deepEqual(optionTexts(add), ALL);
  assert.deepEqual(add.options.map(o => o.value), ALL);
  assert.equal(add.options.find(o => o.selected).text, 'Talent');
  assert.deepEqual(optionTexts(filter), ['All roles'].concat(ALL));
  assert.deepEqual(filter.options.map(o => o.value), ['All'].concat(ALL));
  for (const row of rows) {
    assert.deepEqual(optionTexts(row), ALL);
    assert.deepEqual(row.options.map(o => o.value), ALL);
  }
  assert.equal(rows.find(s => s.bkid === talent.id).options.find(o => o.selected).text, 'Talent');
  assert.equal(rows.find(s => s.bkid === sound.id).options.find(o => o.selected).text, 'Sound');
  assert.match(html, /id="bk-name"/);
  assert.match(html, new RegExp(`data-bkid="${sound.id}"[^>]*list="bk-dl-Sound"`));
  assert.match(html, /<datalist id="bk-dl-Sound">/);
  assert.match(html, /<datalist id="bk-dl-Camera">/);
  assert.match(html, /<datalist id="bk-dl-Crew">/);

  listeners.change.forEach(fn => fn({target: {id: '', dataset: {bkf: 'role', bkid: talent.id}, value: 'Referee'}}));
  assert.equal(talent.role, 'Referee');
  assert.equal(talent.talent, '', 'changing role still clears the name, same as the other non-talent roles');
  CoreWeb.bookingUpdate(d, talent.id, {talent: 'Earl'});
  const reopened = reopen(CoreWeb, d);
  const kept = reopened.bookings.find(b => b.id === talent.id);
  assert.equal(kept.role, 'Referee');
  assert.equal(kept.talent, 'Earl');
  assert.equal(reopened.bookings.find(b => b.id === sound.id).role, 'Sound');

  context.S = reopened;
  html = context.vBookings();
  found = selects(html);
  const refRow = found.find(s => s.bkf === 'role' && s.bkid === talent.id);
  assert.equal(refRow.options.find(o => o.selected).text, 'Referee');
  assert.match(html, new RegExp(`data-bkid="${talent.id}"[^>]*list="bk-dl-Referee"`));
  assert.match(html, /<datalist id="bk-dl-Referee">/);
  assert.match(html, /<datalist id="bk-dl-Manager">/);

  fields['bk-role'] = {value: 'Manager'};
  fields['bk-name'] = {value: 'Paul'};
  fields['bk-event'] = {value: 'November Rain'};
  fields['bk-date'] = {value: '2026-11-15'};
  fields['bk-fee'] = {value: '15'};
  listeners.click.forEach(fn => fn({target: {id: 'bk-addbtn', dataset: {}, closest: () => null}}));
  const mgr = context.S.bookings.find(b => b.talent === 'Paul');
  assert.ok(mgr, 'add booking saved');
  assert.equal(mgr.role, 'Manager');
  assert.equal(mgr.event, 'November Rain');
  const afterAdd = reopen(CoreWeb, context.S);
  assert.equal(afterAdd.bookings.find(b => b.id === mgr.id).role, 'Manager');
  context.S = afterAdd;
  html = context.vBookings();
  const mgrRow = selects(html).find(s => s.bkf === 'role' && s.bkid === mgr.id);
  assert.equal(mgrRow.options.find(o => o.selected).text, 'Manager');
  assert.match(html, new RegExp(`data-bkid="${mgr.id}"[^>]*list="bk-dl-Manager"`));
});

test('crew sync through the key service keeps Referee and Manager and does not rewrite existing roles', async () => {
  const Core = CoreServer;
  const SVC_T = 'svc-token-' + 'x'.repeat(30);
  const ADMIN_T = 'admin-token-' + 'y'.repeat(30);
  const gh = mockGitHub({tokens: {[SVC_T]: {login: 'ark-bot', write: true}, [ADMIN_T]: {login: 'rockyshawjr', write: true}}});
  const d = fresh(Core);
  const talent = Core.bookingAdd(d, {role: 'Talent', talent: 'KJ Valentine', event: 'November Rain', date: '2026-11-15', fee: 10});
  const sound = Core.bookingAdd(d, {role: 'Sound', talent: 'Mic', event: 'November Rain', date: '2026-11-15', fee: 20});
  talent.id = 'b-talent';
  sound.id = 'b-sound';
  Core.stamp(d, 1000);
  gh.commitFiles({'data.json': JSON.stringify(d)}, 'seed');
  const store = memoryStore();
  let t = 5000;
  const h = makeHandler({Core, W, env: {ARK_GH_TOKEN: SVC_T}, store, fetch: gh.fetch, now: () => (t += 1000)});
  const call = async (method, p, {key, gt, body} = {}) => {
    const headers = {};
    if (key) headers['x-ark-key'] = key;
    if (gt) headers['x-gh-token'] = gt;
    if (body) headers['content-type'] = 'application/json';
    const r = await h(new Request('https://x.supabase.co/functions/v1/ark-keys' + p, {method, headers, body: body ? JSON.stringify(body) : undefined}));
    const buf = Buffer.from(await r.arrayBuffer());
    let j = null;
    try { j = JSON.parse(buf.toString()); } catch (_) {}
    return {status: r.status, j};
  };
  const key = (await call('POST', '/admin/keys/create', {gt: ADMIN_T, body: {label: 'crew tablet', role: 'crew'}})).j.key;
  const got = await call('GET', '/data', {key});
  assert.equal(got.status, 200);
  const data = got.j.data;
  data.bookings.push({id: 'b-ref', role: 'Referee', talent: 'Earl', event: 'November Rain', date: '2026-11-15', fee: 0, note: 'ringside'});
  data.bookings.push({id: 'b-mgr', role: 'Manager', talent: 'Paul', event: 'November Rain', date: '2026-11-15', fee: 0, note: ''});
  const edited = data.bookings.find(b => b.id === 'b-sound');
  edited.date = '2026-11-16';
  Core.stamp(data, 90000);
  const synced = await call('POST', '/sync', {key, body: {data, base: got.j.tree, last: 0, mtime: 90000}});
  assert.equal(synced.status, 200, JSON.stringify(synced.j));
  const saved = gh.readData();
  const roleOf = id => saved.bookings.find(b => b.id === id);
  assert.equal(roleOf('b-talent').role, 'Talent');
  assert.equal(roleOf('b-talent').fee, 10);
  assert.equal(roleOf('b-sound').role, 'Sound');
  assert.equal(roleOf('b-sound').date, '2026-11-16');
  assert.equal(roleOf('b-sound').fee, 20);
  assert.equal(roleOf('b-ref').role, 'Referee');
  assert.equal(roleOf('b-ref').talent, 'Earl');
  assert.equal(roleOf('b-ref').note, 'ringside');
  assert.equal(roleOf('b-mgr').role, 'Manager');
  assert.equal(roleOf('b-mgr').talent, 'Paul');
  const back = await call('GET', '/data', {key});
  assert.equal(back.j.data.bookings.find(b => b.id === 'b-ref').role, 'Referee');
  assert.equal(back.j.data.bookings.find(b => b.id === 'b-mgr').role, 'Manager');
  assert.equal(back.j.data.bookings.find(b => b.id === 'b-talent').role, 'Talent');
});
