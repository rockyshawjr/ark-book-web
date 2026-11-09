// Crew, Referee, and Manager name fields are dropdowns of names saved for that role, names already booked in that role,
// and roster people whose Roster role matches (roster Referees show for Referee, Managers for Manager).
// Sound and Camera use the same list. "+ Add new" opens an inline text box (no window.prompt: the Electron Mac app does not support it).
// Talent stays the roster picker.
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

function loadBookings() {
  const listeners = {input: [], click: [], change: [], keydown: []};
  const fields = {};
  const context = {
    Core,
    console,
    S: null,
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

const fire = (listeners, type, target, extra = {}) => listeners[type].forEach(fn => fn({target, preventDefault() {}, ...extra}));
const pickNew = (listeners, id, f = 'talent') => fire(listeners, 'change', {id: '', dataset: {bkf: f, bkid: id}, value: '__new'});
const clickId = (listeners, id) => fire(listeners, 'click', {id, dataset: {}, closest: () => null});
const newBox = html => inputs(html).find(i => i.id === 'bk-newin');

function book() {
  const d = Core.validate({
    events: [{id: 'e1', name: 'November Rain', date: '2026-11-15'}],
    roster: ['KJ Valentine', 'BK Bennet', {name: 'David Madden', role: 'Referee'}, {name: 'Nick Atchley', role: 'Referee'}, {name: 'Dan the Manager Carter', role: 'Manager'}, {name: 'earl', role: 'Referee'}],
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


test('staff names are dropdowns of that role (saved, booked, and roster people with that role), with + Add new name', () => {
  const {context} = loadBookings();
  const {d, rows} = book();
  context.S = d;
  const html = context.vBookings();
  assert.equal(html.includes('<datalist'), false, 'staff names are a dropdown, not a suggestion box');
  assert.equal(inputs(html).some(i => i.bkf === 'talent'), false, 'staff name is not a free-typed field');
  const expectNames = {
    Sound: ['Mic'],
    Camera: ['Lens'],
    Crew: ['Grip', 'Rigger'],
    Referee: ['David Madden', 'Earl', 'Nick Atchley'],
    Manager: ['Dan the Manager Carter', 'Paul']
  };
  for (const role of STAFF) {
    const sel = nameSelect(html, rows[role].id);
    assert.ok(sel, role + ' name dropdown');
    assert.equal(sel.options[0].text, 'Select ' + role.toLowerCase());
    assert.equal(sel.options[0].value, '');
    assert.deepEqual(sel.options.slice(1, -1).map(o => o.text), expectNames[role], role + ' names');
    assert.equal(sel.options.at(-1).text, '+ Add new name');
    assert.equal(sel.options.at(-1).value, '__new');
    assert.equal(sel.options.find(o => o.selected).value, rows[role].talent);
  }
  const talent = nameSelect(html, rows.Talent.id);
  assert.ok(talent, 'Talent still uses a name dropdown');
  assert.equal(talent.options.some(o => o.value === '__new'), false, 'Talent stays the roster picker');
  assert.equal(talent.options.find(o => o.selected).value, 'KJ Valentine');
  assert.equal(nameSelect(html, rows.Crew.id).options.some(o => o.text === 'David Madden'), false, 'roster refs only under Referee');
  assert.equal(nameSelect(html, rows.Manager.id).options.some(o => o.text === 'Nick Atchley'), false);
  assert.equal(nameSelect(html, rows.Referee.id).options.some(o => o.text === 'Dan the Manager Carter'), false);
});

test('+ Add new name opens an inline box (no prompt); Save sets the name and keeps the rest of the booking', () => {
  const {context, listeners, fields} = loadBookings();
  const {d, rows} = book();
  context.S = d;
  const before = {event: rows.Crew.event, date: rows.Crew.date, fee: rows.Crew.fee, role: rows.Crew.role};
  pickNew(listeners, rows.Crew.id);
  let html = context.vBookings();
  assert.ok(newBox(html), 'inline name box shown');
  assert.equal(nameSelect(html, rows.Crew.id), undefined, 'that row shows the box instead of the dropdown');
  assert.ok(nameSelect(html, rows.Referee.id), 'other rows unchanged');
  assert.equal(rows.Crew.talent, 'Grip', 'nothing saved yet');
  fields['bk-newin'] = {value: '  '};
  clickId(listeners, 'bk-newok');
  assert.equal(rows.Crew.talent, 'Grip', 'blank name is not saved');
  assert.ok(newBox(context.vBookings()), 'box stays open after a blank save');
  fields['bk-newin'] = {value: ' Stagehand '};
  clickId(listeners, 'bk-newok');
  assert.equal(rows.Crew.talent, 'Stagehand');
  assert.deepEqual({event: rows.Crew.event, date: rows.Crew.date, fee: rows.Crew.fee, role: rows.Crew.role}, before);
  html = context.vBookings();
  assert.equal(newBox(html), undefined, 'box closes after save');
  assert.equal(nameSelect(html, rows.Crew.id).options.find(o => o.selected).value, 'Stagehand');
  const reopened = Core.validate(JSON.parse(JSON.stringify(d)));
  assert.equal(reopened.bookings.find(b => b.id === rows.Crew.id).talent, 'Stagehand');
  context.S = reopened;
  const again = nameSelect(context.vBookings(), rows.Crew.id);
  assert.ok(again.options.some(o => o.value === 'Stagehand'));
  assert.ok(again.options.some(o => o.value === 'Rigger'));

  pickNew(listeners, rows.Referee.id);
  fields['bk-newin'] = {value: 'Ref Two'};
  fire(listeners, 'keydown', {id: 'bk-newin'}, {key: 'Enter'});
  assert.equal(context.S.bookings.find(b => b.id === rows.Referee.id).talent, 'Ref Two', 'Enter saves');
});

test('Cancel or Escape leaves the booking unchanged', () => {
  const {context, listeners, fields} = loadBookings();
  const {d, rows} = book();
  context.S = d;
  const snap = JSON.stringify(d.bookings);
  pickNew(listeners, rows.Manager.id);
  fields['bk-newin'] = {value: 'Somebody'};
  clickId(listeners, 'bk-newx');
  assert.equal(newBox(context.vBookings()), undefined);
  pickNew(listeners, rows.Referee.id);
  fields['bk-newin'] = {value: 'Other'};
  fire(listeners, 'keydown', {id: 'bk-newin'}, {key: 'Escape'});
  assert.equal(newBox(context.vBookings()), undefined);
  assert.equal(JSON.stringify(d.bookings), snap);
  assert.equal(rows.Manager.talent, 'Paul');
  assert.equal(rows.Referee.talent, 'Earl');
});

test('the add form can pick a roster Referee and add a new Manager and a new event inline', () => {
  const {context, listeners, fields} = loadBookings();
  const {d} = book();
  context.S = d;
  context.vBookings();
  fields['bk-role'] = {value: 'Referee'};
  fire(listeners, 'change', {id: 'bk-role', dataset: {}, value: 'Referee'});
  let html = context.vBookings();
  const addRef = selects(html).find(s => s.id === 'bk-name');
  assert.ok(addRef, 'add form name dropdown');
  assert.ok(addRef.options.some(o => o.value === 'David Madden'), 'roster referee offered');
  assert.equal(addRef.options.some(o => o.value === 'Paul'), false);
  Object.assign(fields, {'bk-role': {value: 'Referee'}, 'bk-name': {value: 'David Madden'}, 'bk-event': {value: 'November Rain'}, 'bk-date': {value: '2026-11-15'}, 'bk-fee': {value: ''}});
  clickId(listeners, 'bk-addbtn');
  const dm = context.S.bookings.filter(b => b.talent === 'David Madden');
  assert.equal(dm.length, 1);
  assert.equal(dm[0].role, 'Referee');

  fields['bk-role'] = {value: 'Manager'};
  fire(listeners, 'change', {id: 'bk-role', dataset: {}, value: 'Manager'});
  fields['bk-name'] = {value: '__new'};
  fire(listeners, 'change', {id: 'bk-name', dataset: {}, value: '__new'});
  html = context.vBookings();
  assert.ok(newBox(html), 'inline box in the add form');
  assert.equal(selects(html).find(s => s.id === 'bk-name'), undefined);
  delete fields['bk-name'];
  fields['bk-newin'] = {value: 'Pat'};
  fire(listeners, 'keydown', {id: 'bk-newin'}, {key: 'Enter'});
  html = context.vBookings();
  assert.equal(selects(html).find(s => s.id === 'bk-name').options.find(o => o.selected).value, 'Pat');

  fields['bk-event'] = {value: '__new'};
  fire(listeners, 'change', {id: 'bk-event', dataset: {}, value: '__new'});
  assert.ok(newBox(context.vBookings()), 'inline event box');
  delete fields['bk-event'];
  fields['bk-newin'] = {value: 'Welcome To Our House'};
  clickId(listeners, 'bk-newok');
  assert.ok(Core.bookingEvents(context.S).includes('Welcome To Our House'));
  Object.assign(fields, {'bk-role': {value: 'Manager'}, 'bk-name': {value: 'Pat'}, 'bk-event': {value: 'Welcome To Our House'}, 'bk-date': {value: '2027-01-30'}, 'bk-fee': {value: '12'}});
  clickId(listeners, 'bk-addbtn');
  const pat = context.S.bookings.find(b => b.talent === 'Pat');
  assert.ok(pat);
  assert.equal(pat.role, 'Manager');
  assert.equal(pat.event, 'Welcome To Our House');
  const saved = Core.validate(JSON.parse(JSON.stringify(context.S)));
  assert.equal(saved.bookings.find(b => b.id === pat.id).talent, 'Pat');
});
