// A wrestler's roster entry can name a manager. The field is omitted when empty so old
// saves keep the same records. A Talent booking copies that name when it is added, and
// that copy can be changed without changing the roster.
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

function loadWebCore() {
  const context = vm.createContext({module: {exports: {}}, console});
  vm.runInContext(fs.readFileSync(path.join(root, 'core.js'), 'utf8'), context, {filename: 'core.js'});
  return context.module.exports;
}
const CoreWeb = loadWebCore();

function fresh(Core) {
  return Core.validate({
    events: [{id: 'e1', name: 'November Rain', date: '2026-11-15', venueCost: 250}],
    roster: [
      {id: 'p-kj', name: 'KJ Valentine', role: 'Wrestler', alignment: 'Face'},
      {id: 'p-paul', name: 'Paul', role: 'Manager'},
      {id: 'p-dan', name: 'Dan the Manager Carter', role: 'Manager'},
      {id: 'p-bk', name: 'BK Bennett', role: 'Wrestler'}
    ],
    titles: [{id: 't1', name: 'Undisputed Championship', slots: 1, holders: ['KJ Valentine']}],
    bookings: [],
    sponsors: [{name: 'Acme Gear', amount: 500}]
  });
}

function person(d, name) {
  return d.roster.find(r => r.name === name);
}

test('web and key-service core share manager assignment', () => {
  assert.equal(typeof CoreWeb.rosterSetManager, 'function');
  assert.equal(typeof CoreServer.rosterSetManager, 'function');
  assert.equal(typeof CoreWeb.managerOf, 'function');
  assert.equal(CoreWeb.managerOf.toString(), CoreServer.managerOf.toString());
});

test('assign a roster manager, clear it, and do not let a wrestler manage themself', () => {
  for (const Core of [CoreWeb, CoreServer]) {
    const d = fresh(Core);
    assert.equal(Core.managerOf(d, 'KJ Valentine'), '');
    const kj = Core.rosterSetManager(d, 'KJ Valentine', 'Paul');
    assert.equal(kj.manager, 'Paul');
    assert.equal(Core.managerOf(d, 'KJ Valentine'), 'Paul');
    assert.equal(person(d, 'Paul').role, 'Manager');
    assert.equal(person(d, 'BK Bennett').manager, undefined);

    Core.rosterSetManager(d, 'BK Bennett', 'dan the manager carter');
    assert.equal(person(d, 'BK Bennett').manager, 'Dan the Manager Carter');

    const created = Core.rosterSetManager(d, 'KJ Valentine', 'New Manager', true);
    assert.equal(created.manager, 'New Manager');
    assert.equal(person(d, 'New Manager').role, 'Manager');
    Core.rosterSetManager(d, 'BK Bennett', 'New Manager');
    assert.equal(d.roster.filter(r => r.name === 'New Manager').length, 1);

    assert.throws(() => Core.rosterSetManager(d, 'KJ Valentine', 'Nobody'), /roster/i);
    assert.throws(() => Core.rosterSetManager(d, 'KJ Valentine', 'KJ Valentine', true), /own manager/i);

    Core.rosterSetManager(d, 'KJ Valentine', '');
    assert.equal(person(d, 'KJ Valentine').manager, undefined);
    assert.equal(Object.hasOwn(person(d, 'KJ Valentine'), 'manager'), false);
    assert.equal(Core.managerOf(d, 'KJ Valentine'), '');
    assert.equal(person(d, 'BK Bennett').manager, 'New Manager');
    assert.ok(person(d, 'New Manager'), 'clearing one wrestler does not remove the manager');
  }
});

test('old data without a manager field loads unchanged, including Mac-only fields', () => {
  for (const Core of [CoreWeb, CoreServer]) {
    const roster = Array.from({length: 45}, (_, i) => ({id: 'p' + i, name: 'Person ' + i, role: i % 7 === 0 ? 'Manager' : 'Wrestler', alignment: '', champion: '', photo: '', video: ''}));
    const events = Array.from({length: 13}, (_, i) => ({id: 'e' + i, name: 'Event ' + i, date: '2026-11-' + String(i + 1).padStart(2, '0'), venueCost: 100 + i, matches: []}));
    const titles = Array.from({length: 4}, (_, i) => ({id: 't' + i, name: 'Title ' + i, slots: 1, holders: ['']}));
    const bookings = Array.from({length: 25}, (_, i) => ({id: 'b' + i, role: ['Talent', 'Sound', 'Camera', 'Crew', 'Referee', 'Manager'][i % 6], talent: 'Person ' + (i % 45), event: 'Event ' + (i % 13), date: '2026-11-15', fee: i + 1, note: i === 3 ? 'kept' : ''}));
    const raw = {version: 1, events, roster, titles, bookings, sponsors: [{name: 'Acme Gear', amount: 500}], currentId: 'e0'};
    const before = JSON.stringify(raw);
    const opened = Core.validate(JSON.parse(before));
    assert.equal(opened.roster.length, 45);
    assert.equal(opened.bookings.length, 25);
    assert.equal(opened.events.length, 13);
    assert.equal(opened.titles.length, 4);
    assert.deepEqual(opened.sponsors, [{name: 'Acme Gear', amount: 500}]);
    assert.equal(opened.events[4].venueCost, 104);
    assert.equal(opened.events[4].name, 'Event 4');
    assert.ok(opened.roster.every(r => !Object.hasOwn(r, 'manager')));
    assert.ok(opened.bookings.every(b => !Object.hasOwn(b, 'manager')));
    assert.equal(opened.bookings[3].note, 'kept');
    assert.equal(opened.bookings[3].fee, 4);
    assert.equal(opened.roster[1].name, 'Person 1');
    assert.equal(opened.roster[1].role, 'Wrestler');
    Core.stamp(opened, 5000);
    const saved = JSON.parse(JSON.stringify(opened));
    const again = Core.validate(saved);
    Core.stamp(again, 99999);
    assert.equal(again.meta.rec['p:p0'].h, opened.meta.rec['p:p0'].h);
    assert.equal(again.meta.rec['p:p0'].t, 5000, 'loading old roster must not look like a new edit');
    assert.equal(again.meta.rec['bk:b0'].h, opened.meta.rec['bk:b0'].h);
    assert.equal(again.meta.rec['bk:b0'].t, 5000);
    assert.equal(again.roster.length, 45);
    assert.equal(again.bookings.length, 25);
  }
});

test('a talent booking copies the roster manager and can be edited on its own', () => {
  for (const Core of [CoreWeb, CoreServer]) {
    const d = fresh(Core);
    Core.rosterSetManager(d, 'KJ Valentine', 'Paul');
    const copied = Core.bookingAdd(d, {role: 'Talent', talent: 'KJ Valentine', event: 'November Rain', date: '2026-11-15', fee: 40});
    assert.equal(copied.manager, 'Paul');
    assert.equal(copied.role, 'Talent');
    assert.equal(copied.fee, 40);

    const cleared = Core.bookingAdd(d, {role: 'Talent', talent: 'KJ Valentine', event: 'Thriller', date: '2026-10-17', fee: 10, manager: ''});
    assert.equal(Object.hasOwn(cleared, 'manager'), false, 'an explicit blank manager is not filled back in');

    const other = Core.bookingAdd(d, {role: 'Talent', talent: 'BK Bennett', event: 'November Rain', date: '2026-11-15', fee: 15});
    assert.equal(Object.hasOwn(other, 'manager'), false);

    Core.bookingUpdate(d, copied.id, {manager: 'Dan the Manager Carter'});
    assert.equal(copied.manager, 'Dan the Manager Carter');
    assert.equal(Core.managerOf(d, 'KJ Valentine'), 'Paul', 'the booking edit does not change the roster');

    Core.bookingUpdate(d, copied.id, {manager: ''});
    assert.equal(Object.hasOwn(copied, 'manager'), false);
    assert.equal(Core.managerOf(d, 'KJ Valentine'), 'Paul');

    Core.bookingUpdate(d, copied.id, {manager: 'Paul'});
    Core.bookingUpdate(d, copied.id, {fee: 41});
    assert.equal(copied.manager, 'Paul');
    assert.equal(copied.fee, 41);

    Core.rosterSetManager(d, 'BK Bennett', 'Dan the Manager Carter');
    const follow = Core.bookingAdd(d, {role: 'Talent', talent: 'KJ Valentine', event: 'Brutal Love', date: '2026-09-25', fee: 1});
    assert.equal(follow.manager, 'Paul');
    Core.bookingUpdate(d, follow.id, {talent: 'BK Bennett'});
    assert.equal(follow.manager, 'Dan the Manager Carter', 'changing the wrestler prefills that wrestler\'s manager');
    Core.bookingUpdate(d, follow.id, {manager: 'Paul'});
    Core.bookingUpdate(d, follow.id, {talent: 'KJ Valentine'});
    assert.equal(follow.manager, 'Paul', 'a manager chosen on this booking stays when it is not the previous default');
    assert.equal(Core.managerOf(d, 'KJ Valentine'), 'Paul');

    const sound = Core.bookingAdd(d, {role: 'Sound', talent: 'Mic', event: 'November Rain', date: '2026-11-15', fee: 5, manager: 'Paul'});
    assert.equal(sound.role, 'Sound');
    assert.equal(Object.hasOwn(sound, 'manager'), false);

    const reopened = Core.validate(JSON.parse(JSON.stringify(d)));
    assert.equal(reopened.bookings.find(b => b.id === copied.id).manager, 'Paul');
    assert.equal(Core.managerOf(reopened, 'KJ Valentine'), 'Paul');
    assert.equal(reopened.sponsors[0].name, 'Acme Gear');
    assert.equal(reopened.events[0].venueCost, 250);

    const sheet = Core.bookingSheetHTML(reopened, 'All', '', 'All', false);
    assert.match(sheet, /Manager: Paul/);
    const refOnly = Core.bookingSheetHTML(reopened, 'All', '', 'Referee', false);
    assert.doesNotMatch(refOnly, /Manager: Paul/);
  }
});

test('rename and remove keep manager links, and a duplicate merge keeps the name', () => {
  for (const Core of [CoreWeb, CoreServer]) {
    const d = fresh(Core);
    Core.rosterSetManager(d, 'KJ Valentine', 'Paul');
    Core.rosterSetManager(d, 'BK Bennett', 'Paul');
    const booking = Core.bookingAdd(d, {role: 'Talent', talent: 'KJ Valentine', event: 'November Rain', date: '2026-11-15', fee: 10});
    Core.rosterRename(d, 'Paul', 'Paul E.');
    assert.equal(Core.managerOf(d, 'KJ Valentine'), 'Paul E.');
    assert.equal(Core.managerOf(d, 'BK Bennett'), 'Paul E.');
    assert.equal(booking.manager, 'Paul E.');
    assert.equal(person(d, 'Paul'), undefined);

    Core.rosterRemove(d, 'Paul E.');
    assert.equal(Core.managerOf(d, 'KJ Valentine'), '');
    assert.equal(Object.hasOwn(person(d, 'KJ Valentine'), 'manager'), false);
    assert.equal(booking.manager, 'Paul E.', 'a booking keeps the name from that show');

    const dup = fresh(Core);
    dup.roster.push({id: 'p-kj-2', name: 'kj valentine', role: 'Wrestler', manager: 'Paul', alignment: '', champion: '', photo: '', video: ''});
    const report = Core.dedupe(dup);
    assert.match(report.join('\n'), /KJ Valentine/);
    const left = dup.roster.filter(r => Core.norm(r.name) === Core.norm('KJ Valentine'));
    assert.equal(left.length, 1);
    assert.equal(left[0].manager, 'Paul');
  }
});

test('sync round-trip keeps a manager and an older copy without the field does not erase it', () => {
  for (const Core of [CoreWeb, CoreServer]) {
    const local = fresh(Core);
    Core.rosterSetManager(local, 'KJ Valentine', 'Paul');
    const booking = Core.bookingAdd(local, {role: 'Talent', talent: 'KJ Valentine', event: 'November Rain', date: '2026-11-15', fee: 40});
    Core.stamp(local, 2000);
    const payload = JSON.parse(JSON.stringify(local));
    const remoteOld = fresh(Core);
    Core.stamp(remoteOld, 1000);
    const merged = Core.mergeData(payload, remoteOld);
    const kept = Core.validate(merged.data);
    assert.equal(Core.managerOf(kept, 'KJ Valentine'), 'Paul');
    assert.equal(kept.bookings.find(b => b.id === booking.id).manager, 'Paul');
    assert.equal(kept.bookings.find(b => b.id === booking.id).fee, 40);

    const olderClientRecord = Object.assign(
      {id: 'p-kj', name: 'KJ Valentine', role: 'Wrestler', alignment: 'Face', champion: '', photo: '', video: ''},
      payload.roster.find(r => r.id === 'p-kj')
    );
    assert.equal(olderClientRecord.manager, 'Paul', 'an older client that copies the whole record keeps the field');

    const fromOld = fresh(Core);
    Core.stamp(fromOld, 1000);
    const fromNew = fresh(Core);
    Core.rosterSetManager(fromNew, 'BK Bennett', 'Dan the Manager Carter');
    Core.stamp(fromNew, 3000);
    const back = Core.validate(Core.mergeData(fromOld, fromNew).data);
    assert.equal(Core.managerOf(back, 'BK Bennett'), 'Dan the Manager Carter');
    assert.equal(Core.managerOf(back, 'KJ Valentine'), '');
    assert.equal(back.sponsors[0].amount, 500);
  }
});

test('crew sync round-trip stores the manager and does not drop fees or old bookings', async () => {
  const Core = CoreServer;
  const SVC_T = 'svc-token-' + 'x'.repeat(30);
  const ADMIN_T = 'admin-token-' + 'y'.repeat(30);
  const gh = mockGitHub({tokens: {[SVC_T]: {login: 'ark-bot', write: true}, [ADMIN_T]: {login: 'rockyshawjr', write: true}}});
  const d = fresh(Core);
  const existing = Core.bookingAdd(d, {role: 'Talent', talent: 'BK Bennett', event: 'November Rain', date: '2026-11-15', fee: 77, note: 'already booked'});
  existing.id = 'b-old';
  Core.stamp(d, 1000);
  assert.equal(Object.hasOwn(person(d, 'KJ Valentine'), 'manager'), false);
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
  assert.equal(data.roster.length, 4);
  assert.equal(Object.hasOwn(data.roster.find(r => r.name === 'KJ Valentine'), 'manager'), false);
  assert.equal(data.bookings.find(b => b.id === 'b-old').note, 'already booked');
  Core.rosterSetManager(data, 'KJ Valentine', 'Paul');
  const added = Core.bookingAdd(data, {role: 'Talent', talent: 'KJ Valentine', event: 'November Rain', date: '2026-11-15', fee: 9999});
  added.id = 'b-kj';
  Core.bookingUpdate(data, added.id, {manager: 'Dan the Manager Carter'});
  Core.stamp(data, 90000);
  const synced = await call('POST', '/sync', {key, body: {data, base: got.j.tree, last: 0, mtime: 90000}});
  assert.equal(synced.status, 200, JSON.stringify(synced.j));
  const saved = gh.readData();
  assert.equal(saved.roster.find(r => r.name === 'KJ Valentine').manager, 'Paul');
  assert.equal(saved.bookings.find(b => b.id === 'b-kj').manager, 'Dan the Manager Carter');
  assert.equal(saved.bookings.find(b => b.id === 'b-kj').talent, 'KJ Valentine');
  assert.equal(saved.bookings.find(b => b.id === 'b-old').fee, 77);
  assert.equal(saved.bookings.find(b => b.id === 'b-old').note, 'already booked');
  assert.equal(Object.hasOwn(saved.bookings.find(b => b.id === 'b-old'), 'manager'), false);
  assert.equal(saved.sponsors[0].name, 'Acme Gear');
  assert.equal(saved.events[0].venueCost, 250);
  const again = await call('GET', '/data', {key});
  const round = Core.validate(again.j.data);
  assert.equal(Core.managerOf(round, 'KJ Valentine'), 'Paul');
  assert.equal(round.bookings.find(b => b.id === 'b-kj').manager, 'Dan the Manager Carter');
  assert.equal(round.bookings.length, 2);
});

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
    const grab = n => { const x = new RegExp('\\b' + n + '="([^"]*)"').exec(attrs); return x && x[1]; };
    out.push({id: grab('id'), bkf: grab('data-bkf'), bkid: grab('data-bkid'), f: grab('data-f'), i: grab('data-i'), options});
  }
  return out;
}

function loadBookings(Core) {
  const listeners = {input: [], click: [], change: [], keydown: []};
  const fields = {};
  const context = {
    Core, console, S: null,
    esc: s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])),
    $: sel => fields[String(sel).replace(/^#/, '')] || null,
    mut: fn => { fn(); },
    draw() {},
    toasts: [],
    toast(m) { context.toasts.push(m); },
    confirm: () => false,
    prompt() { throw new Error('prompt() must not be used (Electron does not support it)'); },
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

const fire = (listeners, type, target, extra = {}) => listeners[type].forEach(fn => fn(Object.assign({target, preventDefault() {}}, extra)));
const clickId = (listeners, id) => fire(listeners, 'click', {id, dataset: {}, closest: () => null});

function loadRoster(data) {
  const listeners = {};
  const elements = new Map();
  const make = () => ({
    textContent: '', style: {}, innerHTML: '', value: '', scrollTop: 0, onclick: null, dataset: {}, className: '',
    classList: {add() {}, remove() {}, toggle() {}}, focus() {}, setSelectionRange() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, appendChild() {},
    closest() { return null; }, hasAttribute() { return false; }, getAttribute() { return null; }, remove() {}
  });
  const context = {
    Core: CoreWeb, console, setTimeout, clearTimeout, navigator: {},
    confirm: () => false,
    prompt() { throw new Error('prompt() must not be used (Electron does not support it)'); },
    document: {
      addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
      createElement: make,
      querySelector(sel) { const id = String(sel).replace(/^#/, ''); if (!elements.has(id)) elements.set(id, make()); return elements.get(id); },
      head: make(), body: make(), activeElement: null
    },
    vBookings: () => '',
    CSS: {escape: s => String(s)},
    location: {href: 'https://rockyshawjr.github.io/ark-book-web/'},
    URL
  };
  context.window = context;
  context.globalThis = context;
  context.sb = {
    load: async () => ({data, path: 'fixture'}), save: async () => true, syncStatus: async () => ({state: 'off'}),
    onSync() {}, mediaAll: async () => ({}), mediaRename: async () => ({}), board: async () => null,
    openFolder() {}, backupExport: async () => null, backupImport: async () => null, syncNow() {}, urlFor: () => ''
  };
  context.window.sb = context.sb;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context, {filename: 'app.js'});
  return {context, listeners};
}

async function rosterReady(context, data) {
  for (let i = 0; i < 40; i++) {
    if (typeof context.vRoster === 'function' && data.meta) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error('roster screen did not load');
}

test('the roster card lists managers, assigns one, clears it, and adds a new name inline', async () => {
  const data = fresh(CoreWeb);
  const {context, listeners} = loadRoster(data);
  await rosterReady(context, data);
  const kj = data.roster.findIndex(r => r.name === 'KJ Valentine');
  let html = context.vRoster();
  assert.match(html, /<th>Manager<\/th>/);
  assert.match(html, /No manager/);
  const sel = selects(html).find(s => s.f === 'manager' && s.i === String(kj));
  assert.ok(sel, 'KJ has a manager dropdown');
  assert.equal(sel.options[0].text, 'No manager');
  assert.deepEqual(sel.options.slice(1, -1).map(o => o.text), ['Dan the Manager Carter', 'Paul', 'BK Bennett']);
  assert.equal(sel.options.at(-1).text, '+ Add new name');
  assert.equal(sel.options.at(-1).value, '__new');
  assert.equal(selects(html).find(s => s.f === 'manager' && s.i === String(data.roster.findIndex(r => r.name === 'Paul'))).options.some(o => o.value === 'Paul'), false, 'a person is not their own manager');

  fire(listeners, 'change', {id: '', dataset: {f: 'manager', i: String(kj)}, value: 'Paul'});
  html = context.vRoster();
  assert.match(html, /Manager: Paul/);
  assert.equal(data.roster.find(r => r.name === 'KJ Valentine').manager, 'Paul');
  assert.equal(selects(html).find(s => s.f === 'manager' && s.i === String(kj)).options.find(o => o.selected).value, 'Paul');

  fire(listeners, 'change', {id: '', dataset: {f: 'manager', i: String(kj)}, value: ''});
  html = context.vRoster();
  assert.match(html, /No manager/);
  assert.equal(Object.hasOwn(data.roster.find(r => r.name === 'KJ Valentine'), 'manager'), false);

  fire(listeners, 'change', {id: '', dataset: {f: 'manager', i: String(kj)}, value: '__new'});
  html = context.vRoster();
  assert.match(html, /id="ro-mgrin"/);
  assert.equal(Object.hasOwn(data.roster.find(r => r.name === 'KJ Valentine'), 'manager'), false, 'opening the box does not assign anyone');
  fire(listeners, 'click', {id: 'ro-mgrok', dataset: {i: String(kj)}, closest: () => null});
  assert.match(context.vRoster(), /id="ro-mgrin"/, 'a blank name stays on the box');
  context.document.querySelector('#ro-mgrin').value = '  Lady Manager ';
  fire(listeners, 'click', {id: 'ro-mgrok', dataset: {i: String(kj)}, closest: () => null});
  const kjNow = data.roster.find(r => r.name === 'KJ Valentine');
  assert.equal(kjNow.manager, 'Lady Manager');
  const lady = data.roster.find(r => r.name === 'Lady Manager');
  assert.equal(lady.role, 'Manager');
  html = context.vRoster();
  assert.equal(html.includes('id="ro-mgrin"'), false);
  assert.match(html, /Manager: Lady Manager/);
  assert.equal(selects(html).find(s => s.f === 'manager' && s.i === String(data.roster.findIndex(r => r.name === 'KJ Valentine'))).options.find(o => o.selected).value, 'Lady Manager');
});

test('adding a wrestler to a booking prefills their manager and the booking can change it', () => {
  const {context, listeners, fields} = loadBookings(CoreWeb);
  const d = fresh(CoreWeb);
  CoreWeb.rosterSetManager(d, 'KJ Valentine', 'Paul');
  const existing = CoreWeb.bookingAdd(d, {role: 'Sound', talent: 'Mic', event: 'November Rain', date: '2026-11-15', fee: 5});
  context.S = d;
  let html = context.vBookings();
  assert.equal(selects(html).some(s => s.bkf === 'manager' && s.bkid === existing.id), false, 'a sound booking has no wrestler manager');
  assert.match(html, /Their manager/);
  const addMgr = selects(html).find(s => s.id === 'bk-mgr');
  assert.ok(addMgr, 'the add form has a manager dropdown for talent');
  assert.equal(addMgr.options[0].text, 'No manager');
  assert.equal(addMgr.options.at(-1).value, '__new');

  fields['bk-role'] = {value: 'Talent'};
  fields['bk-name'] = {value: 'KJ Valentine'};
  fire(listeners, 'change', {id: 'bk-name', dataset: {}, value: 'KJ Valentine'});
  html = context.vBookings();
  assert.equal(selects(html).find(s => s.id === 'bk-mgr').options.find(o => o.selected).value, 'Paul');

  Object.assign(fields, {'bk-role': {value: 'Talent'}, 'bk-name': {value: 'KJ Valentine'}, 'bk-mgr': {value: 'Dan the Manager Carter'}, 'bk-event': {value: 'November Rain'}, 'bk-date': {value: '2026-11-15'}, 'bk-fee': {value: '20'}});
  clickId(listeners, 'bk-addbtn');
  const booked = d.bookings.find(b => b.role === 'Talent' && b.talent === 'KJ Valentine');
  assert.ok(booked);
  assert.equal(booked.manager, 'Dan the Manager Carter');
  assert.equal(CoreWeb.managerOf(d, 'KJ Valentine'), 'Paul');

  fields['bk-mgr'] = {value: ''};
  clickId(listeners, 'bk-addbtn');
  const cleared = d.bookings.filter(b => b.role === 'Talent' && b.talent === 'KJ Valentine');
  assert.equal(cleared.length, 2);
  assert.equal(Object.hasOwn(cleared[1], 'manager'), false);

  html = context.vBookings();
  const row = selects(html).find(s => s.bkf === 'manager' && s.bkid === booked.id);
  assert.equal(row.options.find(o => o.selected).value, 'Dan the Manager Carter');
  fire(listeners, 'change', {id: '', dataset: {bkf: 'manager', bkid: booked.id}, value: ''});
  assert.equal(Object.hasOwn(booked, 'manager'), false);
  assert.equal(CoreWeb.managerOf(d, 'KJ Valentine'), 'Paul');

  fire(listeners, 'change', {id: '', dataset: {bkf: 'manager', bkid: booked.id}, value: '__new'});
  assert.match(context.vBookings(), /id="bk-newin"/);
  fields['bk-newin'] = {value: 'Pat Manager'};
  clickId(listeners, 'bk-newok');
  assert.equal(booked.manager, 'Pat Manager');
  assert.equal(d.roster.some(r => r.name === 'Pat Manager'), false, 'a booking-only manager is not added to the roster');
  assert.equal(CoreWeb.managerOf(d, 'KJ Valentine'), 'Paul');
  const saved = CoreWeb.validate(JSON.parse(JSON.stringify(d)));
  assert.equal(saved.bookings.find(b => b.id === booked.id).manager, 'Pat Manager');
});
