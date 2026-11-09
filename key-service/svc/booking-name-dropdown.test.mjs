// Crew, Referee, and Manager name fields are dropdowns of names already saved for that role.
// Sound and Camera use the same list. A new name can still be added. Talent stays the roster picker.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAFF = ['Sound', 'Camera', 'Crew', 'Referee', 'Manager'];

function loadWebCore() {
  const context = vm.createContext({module: {exports: {}}, console});
  vm.runInContext(fs.readFileSync(path.join(root, 'core.js'), 'utf8'), context, {filename: 'core.js'});
  return context.module.exports;
}
const Core = loadWebCore();

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
    const tag = 'select';
    out.push({tag, id: id && id[1], bkf: bkf && bkf[1], bkid: bkid && bkid[1], options});
  }
  return out;
}

function inputs(html) {
  const out = [];
  const re = /<input\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const id = /\bid="([^"]*)"/.exec(attrs);
    const bkf = /\bdata-bkf="([^"]*)"/.exec(attrs);
    const bkid = /\bdata-bkid="([^"]*)"/.exec(attrs);
    const list = /\blist="([^"]*)"/.exec(attrs);
    out.push({id: id && id[1], bkf: bkf && bkf[1], bkid: bkid && bkid[1], list: list && list[1]});
  }
  return out;
}

function loadBookings(prompt) {
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
    prompt,
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

function book() {
  const d = Core.validate({
    events: [{id: 'e1', name: 'November Rain', date: '2026-11-15'}],
    roster: ['KJ Valentine', 'BK Bennet'],
    titles: [],
    bookings: []
  });
  d.lists.crew = {Sound: ['Mic'], Camera: ['Lens'], Crew: ['Rigger'], Referee: ['Earl'], Manager: ['Paul']};
  const rows = {};
  rows.Talent = Core.bookingAdd(d, {role: 'Talent', talent: 'KJ Valentine', event: 'November Rain', date: '2026-11-15', fee: 10});
  rows.Sound = Core.bookingAdd(d, {role: 'Sound', talent: 'Mic', event: 'November Rain', date: '2026-11-15', fee: 20});
  rows.Camera = Core.bookingAdd(d, {role: 'Camera', talent: 'Lens', event: 'November Rain', date: '2026-11-15', fee: 20});
  rows.Crew = Core.bookingAdd(d, {role: 'Crew', talent: 'Grip', event: 'November Rain', date: '2026-11-15', fee: 30});
  rows.Referee = Core.bookingAdd(d, {role: 'Referee', talent: 'Earl', event: 'November Rain', date: '2026-11-15', fee: 40});
  rows.Manager = Core.bookingAdd(d, {role: 'Manager', talent: 'Paul', event: 'November Rain', date: '2026-11-15', fee: 50});
  return {d, rows};
}

function nameSelect(html, id) {
  return selects(html).find(s => s.bkf === 'talent' && s.bkid === id);
}

test('Crew, Referee, and Manager names are dropdowns of that role only, and a new name can be added', () => {
  const prompts = [];
  const {context, listeners} = loadBookings(q => { prompts.push(q); return 'Stagehand'; });
  const {d, rows} = book();
  context.S = d;
  const html = context.vBookings();
  assert.equal(html.includes('<datalist'), false, 'staff names are a dropdown, not a suggestion box');
  assert.equal(inputs(html).some(i => i.bkf === 'talent'), false, 'staff name is not a free-typed field');

  const expectNames = {
    Sound: ['Mic'],
    Camera: ['Lens'],
    Crew: ['Grip', 'Rigger'],
    Referee: ['Earl'],
    Manager: ['Paul']
  };
  for (const role of STAFF) {
    const sel = nameSelect(html, rows[role].id);
    assert.ok(sel, role + ' name dropdown');
    assert.equal(sel.options[0].text, 'Select ' + role.toLowerCase());
    assert.equal(sel.options[0].value, '');
    assert.deepEqual(sel.options.slice(1, -1).map(o => o.text), expectNames[role]);
    assert.deepEqual(sel.options.slice(1, -1).map(o => o.value), expectNames[role]);
    assert.equal(sel.options.at(-1).text, '+ Add new name');
    assert.equal(sel.options.at(-1).value, '__new');
    assert.equal(sel.options.find(o => o.selected).value, rows[role].talent);
  }
  const talent = nameSelect(html, rows.Talent.id);
  assert.ok(talent, 'Talent still uses a name dropdown');
  assert.equal(talent.options.some(o => o.value === '__new'), false, 'Talent stays the roster picker');
  assert.equal(talent.options.find(o => o.selected).value, 'KJ Valentine');
  assert.equal(nameSelect(html, rows.Crew.id).options.some(o => o.text === 'Earl'), false);
  assert.equal(nameSelect(html, rows.Referee.id).options.some(o => o.text === 'Paul'), false);

  const before = {event: rows.Crew.event, date: rows.Crew.date, fee: rows.Crew.fee, role: rows.Crew.role};
  listeners.change.forEach(fn => fn({target: {id: '', dataset: {bkf: 'talent', bkid: rows.Crew.id}, value: '__new'}}));
  assert.equal(prompts[0], 'New Crew name');
  assert.equal(rows.Crew.talent, 'Stagehand');
  assert.equal(rows.Crew.event, before.event);
  assert.equal(rows.Crew.date, before.date);
  assert.equal(rows.Crew.fee, before.fee);
  assert.equal(rows.Crew.role, before.role);
  const reopened = Core.validate(JSON.parse(JSON.stringify(d)));
  assert.equal(reopened.bookings.find(b => b.id === rows.Crew.id).talent, 'Stagehand');
  assert.equal(reopened.bookings.find(b => b.id === rows.Referee.id).talent, 'Earl');
  context.S = reopened;
  const again = nameSelect(context.vBookings(), rows.Crew.id);
  assert.equal(again.options.find(o => o.selected).value, 'Stagehand');
  assert.ok(again.options.some(o => o.value === 'Rigger'));
});

test('cancelling a new staff name leaves the booking unchanged', () => {
  const {context, listeners} = loadBookings(() => null);
  const {d, rows} = book();
  context.S = d;
  listeners.change.forEach(fn => fn({target: {id: '', dataset: {bkf: 'talent', bkid: rows.Manager.id}, value: '__new'}}));
  assert.equal(rows.Manager.talent, 'Paul');
  assert.equal(rows.Referee.talent, 'Earl');
});

test('the add form can pick a saved Referee and can type a new Manager', () => {
  let next = 'Pat';
  const {context, listeners, fields} = loadBookings(() => next);
  const {d} = book();
  context.S = d;
  context.vBookings();
  fields['bk-role'] = {value: 'Referee'};
  listeners.change.forEach(fn => fn({target: {id: 'bk-role', dataset: {}, value: 'Referee'}}));
  let html = context.vBookings();
  const addRef = selects(html).find(s => s.id === 'bk-name');
  assert.ok(addRef, 'add form name dropdown');
  assert.equal(addRef.options.some(o => o.value === 'Earl'), true);
  assert.equal(addRef.options.some(o => o.value === 'Paul'), false);
  fields['bk-role'] = {value: 'Referee'};
  fields['bk-name'] = {value: 'Earl'};
  fields['bk-event'] = {value: 'November Rain'};
  fields['bk-date'] = {value: '2026-11-15'};
  fields['bk-fee'] = {value: ''};
  listeners.click.forEach(fn => fn({target: {id: 'bk-addbtn', dataset: {}, closest: () => null}}));
  const earl = context.S.bookings.filter(b => b.talent === 'Earl');
  assert.equal(earl.length, 2);
  assert.ok(earl.every(b => b.role === 'Referee'));

  next = 'Pat';
  fields['bk-role'] = {value: 'Manager'};
  listeners.change.forEach(fn => fn({target: {id: 'bk-role', dataset: {}, value: 'Manager'}}));
  fields['bk-name'] = {value: '__new'};
  listeners.change.forEach(fn => fn({target: {id: 'bk-name', dataset: {}, value: '__new'}}));
  html = context.vBookings();
  const addMgr = selects(html).find(s => s.id === 'bk-name');
  assert.equal(addMgr.options.find(o => o.selected).value, 'Pat');
  fields['bk-role'] = {value: 'Manager'};
  fields['bk-name'] = {value: 'Pat'};
  fields['bk-event'] = {value: 'November Rain'};
  fields['bk-date'] = {value: '2026-11-15'};
  fields['bk-fee'] = {value: '12'};
  listeners.click.forEach(fn => fn({target: {id: 'bk-addbtn', dataset: {}, closest: () => null}}));
  const pat = context.S.bookings.find(b => b.talent === 'Pat');
  assert.ok(pat);
  assert.equal(pat.role, 'Manager');
  const saved = Core.validate(JSON.parse(JSON.stringify(context.S)));
  assert.equal(saved.bookings.find(b => b.id === pat.id).talent, 'Pat');
  assert.equal(saved.bookings.find(b => b.id === pat.id).role, 'Manager');
});
