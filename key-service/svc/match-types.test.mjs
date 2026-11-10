// Handicap is 2 vs 1. Ladder Match and Cage Match stay regular two-side matches.
// Existing types stay, and a saved type string is never rewritten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import CoreServer from '../supabase/functions/ark-keys/core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function loadWebCore() {
  const context = vm.createContext({module: {exports: {}}, console});
  vm.runInContext(fs.readFileSync(path.join(root, 'core.js'), 'utf8'), context, {filename: 'core.js'});
  return context.module.exports;
}
const CoreWeb = loadWebCore();
const list = a => [...a];
const HANDICAP = 'Handicap (2 vs 1)';

function namesOf(Core, types) {
  return list(types).map(t => Core.norm(t));
}

test('seed offers Handicap, Ladder Match, and Cage Match once, and keeps the older types', () => {
  for (const Core of [CoreWeb, CoreServer]) {
    const types = Core.seed().lists.types;
    const norms = namesOf(Core, types);
    for (const name of ['Singles', 'Tag Team', 'Triple Threat', 'Fatal 4-Way', 'Six Man Tag', 'Street Fight', 'Ladder Match', 'Battle Royal', HANDICAP, 'Cage Match']) {
      assert.equal(norms.filter(n => n === Core.norm(name)).length, 1, name);
    }
    assert.equal(Core.mtKind('Triple Threat'), 'triple');
    assert.equal(Core.mtKind('Fatal 4-Way'), 'fatal4');
    assert.equal(Core.mtKind('Six Man Tag'), 'six');
    assert.equal(Core.mtKind('Tag Team'), 'std');
    assert.equal(Core.mtKind('Ladder Match'), 'std');
    assert.equal(Core.mtKind('Cage Match'), 'std');
    assert.equal(Core.mtKind(HANDICAP), 'handicap');
    const keys = m => JSON.parse(JSON.stringify(Core.sideKeys(m)));
    assert.deepEqual(keys({type: 'Tag Team'}), [['a'], ['b']]);
    assert.deepEqual(keys({type: 'Ladder Match'}), [['a'], ['b']]);
    assert.deepEqual(keys({type: 'Cage Match'}), [['a'], ['b']]);
    assert.deepEqual(keys({type: 'Triple Threat'}), [['a'], ['b'], ['c']]);
    assert.deepEqual(keys({type: 'Fatal 4-Way'}), [['a'], ['b'], ['c'], ['d']]);
    assert.deepEqual(keys({type: 'Six Man Tag'}), [['a', 'a2', 'a3'], ['b', 'b2', 'b3']]);
  }
});

test('Handicap is two wrestlers versus one, and a type change does not drop names', () => {
  for (const Core of [CoreWeb, CoreServer]) {
    const m = Core.blankMatch();
    m.type = HANDICAP;
    m.a = 'KJ Valentine';
    m.a2 = 'BK Bennett';
    m.b = 'Rico Bravo';
    m.c = 'Should stay stored but not a third side';
    const keys = mm => JSON.parse(JSON.stringify(Core.sideKeys(mm)));
    assert.deepEqual(keys(m), [['a', 'a2'], ['b']]);
    assert.equal(Core.vsLine(m), 'KJ Valentine and BK Bennett vs Rico Bravo');
    assert.ok(!Core.vsLine(m).includes('Should stay stored'));
    assert.deepEqual(JSON.parse(JSON.stringify(Core.winnerOpts(m).filter(x => x !== 'TBD (clear)' && !String(x).startsWith('DQ win:') && x !== 'Draw' && x !== 'No Contest'))), ['KJ Valentine and BK Bennett', 'Rico Bravo']);
    m.a2 = '';
    assert.equal(Core.vsLine(m), 'KJ Valentine and TBD vs Rico Bravo');
    m.a2 = 'BK Bennett';
    m.type = 'Triple Threat';
    assert.deepEqual(keys(m), [['a'], ['b'], ['c']]);
    assert.equal(m.a, 'KJ Valentine');
    assert.equal(m.a2, 'BK Bennett');
    assert.equal(m.b, 'Rico Bravo');
    assert.equal(m.c, 'Should stay stored but not a third side');
    m.type = 'Ladder Match';
    assert.deepEqual(keys(m), [['a'], ['b']]);
    assert.equal(Core.vsLine(m), 'KJ Valentine vs Rico Bravo');
    assert.equal(m.a2, 'BK Bennett');
    m.type = 'Cage Match';
    assert.deepEqual(keys(m), [['a'], ['b']]);
    m.type = HANDICAP;
    assert.equal(Core.vsLine(m), 'KJ Valentine and BK Bennett vs Rico Bravo');
  }
});

test('reload keeps Handicap sides and does not duplicate or rewrite existing types', () => {
  for (const Core of [CoreWeb, CoreServer]) {
    const raw = {
      events: [{id: 'e1', name: 'November Rain', date: '2026-11-15', matches: [
        {id: 'm1', a: 'KJ Valentine', b: 'Rico Bravo', c: '', d: '', a2: 'BK Bennett', a3: '', b2: '', b3: '', type: HANDICAP, title: '', result: '', beat: '', note: '', winner: '', method: ''},
        {id: 'm2', a: 'Troy Carter', b: 'Christian Garrett', c: '', d: '', a2: '', a3: '', b2: '', b3: '', type: 'I Quit Match', title: '', result: '', beat: '', note: '', winner: '', method: ''},
        {id: 'm3', a: 'Old A', b: 'Old B', c: 'Old C', d: '', a2: '', a3: '', b2: '', b3: '', type: 'Triple Threat', title: '', result: '', beat: '', note: '', winner: '', method: ''}
      ]}],
      roster: ['KJ Valentine'],
      titles: [],
      lists: {types: ['Singles', 'Tag Team', 'ladder match', 'Street Fight', 'Battle Royal']}
    };
    const opened = Core.validate(JSON.parse(JSON.stringify(raw)));
    const types = namesOf(Core, opened.lists.types);
    assert.equal(types.filter(n => n === Core.norm('ladder match')).length, 1);
    assert.equal(types.filter(n => n === Core.norm('Cage Match')).length, 1);
    assert.equal(types.filter(n => n === Core.norm(HANDICAP)).length, 1);
    assert.ok(types.includes(Core.norm('Singles')));
    assert.ok(types.includes(Core.norm('I Quit Match')) === false);
    assert.ok(opened.lists.types.includes('Singles'));
    assert.ok(opened.lists.types.some(t => Core.norm(t) === Core.norm('Cage Match')));
    const h = opened.events[0].matches.find(m => m.id === 'm1');
    const custom = opened.events[0].matches.find(m => m.id === 'm2');
    const triple = opened.events[0].matches.find(m => m.id === 'm3');
    assert.equal(h.type, HANDICAP);
    assert.equal(h.a, 'KJ Valentine');
    assert.equal(h.a2, 'BK Bennett');
    assert.equal(h.b, 'Rico Bravo');
    assert.equal(Core.vsLine(h), 'KJ Valentine and BK Bennett vs Rico Bravo');
    assert.equal(custom.type, 'I Quit Match');
    assert.equal(Core.mtKind(custom.type), 'std');
    assert.deepEqual(JSON.parse(JSON.stringify(Core.sideKeys(custom))), [['a'], ['b']]);
    assert.equal(triple.type, 'Triple Threat');
    assert.equal(triple.c, 'Old C');
    assert.deepEqual(JSON.parse(JSON.stringify(Core.sideKeys(triple))), [['a'], ['b'], ['c']]);
    const again = Core.validate(JSON.parse(JSON.stringify(opened)));
    assert.equal(namesOf(Core, again.lists.types).filter(n => n === Core.norm('Ladder Match')).length, 1);
    assert.equal(namesOf(Core, again.lists.types).filter(n => n === Core.norm('Cage Match')).length, 1);
    assert.equal(again.events[0].matches.find(m => m.id === 'm1').type, HANDICAP);
  }
});

test('custom handicap labels keep the old one versus one card and their saved names', () => {
  const twoVsOne = ['Handicap (2 vs 1)', 'handicap 2 vs 1', '2 vs 1', '2 on 1', '2-on-1'];
  const stayStandard = ['Handicap (3 vs 1)', 'Handicap (2 vs 2)', 'Handicap', 'Handicap Match', '12 vs 1', '2 vs 10'];
  for (const Core of [CoreWeb, CoreServer]) {
    for (const type of twoVsOne) {
      assert.equal(Core.mtKind(type), 'handicap', type);
      assert.deepEqual(JSON.parse(JSON.stringify(Core.sideKeys({type}))), [['a', 'a2'], ['b']], type);
    }
    for (const type of stayStandard) {
      assert.equal(Core.mtKind(type), 'std', type);
      assert.deepEqual(JSON.parse(JSON.stringify(Core.sideKeys({type}))), [['a'], ['b']], type);
    }
    const raw = {
      events: [{id: 'e1', name: 'November Rain', date: '2026-11-15', matches: [
        {id: 'm3', a: 'Left Three', b: 'Right One', c: 'Extra', d: '', a2: 'Hidden Partner', a3: '', b2: '', b3: '', type: 'Handicap (3 vs 1)', title: '', result: '', beat: '', note: 'kept', winner: '', method: ''},
        {id: 'm2', a: 'Left A', b: 'Right A', c: '', d: '', a2: 'Left B', a3: '', b2: 'Right B', b3: '', type: 'Handicap (2 vs 2)', title: '', result: '', beat: '', note: '', winner: '', method: ''}
      ]}],
      roster: ['Left Three'],
      titles: [],
      lists: {types: ['Singles', 'Handicap (3 vs 1)', 'Handicap (2 vs 2)', 'Ladder Match']}
    };
    const opened = Core.validate(JSON.parse(JSON.stringify(raw)));
    const three = opened.events[0].matches.find(m => m.id === 'm3');
    const two = opened.events[0].matches.find(m => m.id === 'm2');
    assert.equal(three.type, 'Handicap (3 vs 1)');
    assert.equal(three.a, 'Left Three');
    assert.equal(three.b, 'Right One');
    assert.equal(three.c, 'Extra');
    assert.equal(three.a2, 'Hidden Partner');
    assert.equal(three.note, 'kept');
    assert.equal(Core.vsLine(three), 'Left Three vs Right One');
    assert.equal(two.type, 'Handicap (2 vs 2)');
    assert.equal(two.a2, 'Left B');
    assert.equal(two.b2, 'Right B');
    assert.equal(Core.vsLine(two), 'Left A vs Right A');
    const types = namesOf(Core, opened.lists.types);
    assert.equal(types.filter(n => n === Core.norm(HANDICAP)).length, 1);
    assert.equal(types.filter(n => n === Core.norm('Handicap (3 vs 1)')).length, 1);
    assert.equal(types.filter(n => n === Core.norm('Handicap (2 vs 2)')).length, 1);
    assert.equal(types.filter(n => n === Core.norm('Ladder Match')).length, 1);
    assert.equal(types.filter(n => n === Core.norm('Cage Match')).length, 1);
    const again = JSON.parse(JSON.stringify(opened));
    assert.equal(Core.validate(again).events[0].matches.find(m => m.id === 'm3').type, 'Handicap (3 vs 1)');
    const alias = Core.validate({
      events: [{id: 'e1', name: 'November Rain', date: '2026-11-15', matches: []}],
      roster: ['KJ Valentine'],
      titles: [],
      lists: {types: ['Singles', '2 vs 1']}
    });
    assert.equal(namesOf(Core, alias.lists.types).filter(n => n === Core.norm(HANDICAP)).length, 1);
    assert.equal(namesOf(Core, alias.lists.types).filter(n => n === Core.norm('2 vs 1')).length, 1);
    assert.equal(Core.mtKind('2 vs 1'), 'handicap');
  }
});

test('the match card shows two slots versus one only for an explicit 2 vs 1', async () => {
  const data = CoreWeb.validate({
    events: [{id: 'e1', name: 'November Rain', date: '2026-11-15', matches: [
      {id: 'h', a: 'Rico Bravo', b: 'BK Bennett', a2: 'KJ Valentine', c: '', d: '', a3: '', b2: '', b3: '', type: HANDICAP, title: '', result: '', beat: '', note: '', winner: '', method: ''},
      {id: 'c3', a: 'Left Three', b: 'Right One', a2: 'Hidden Partner', c: 'Extra', d: '', a3: '', b2: '', b3: '', type: 'Handicap (3 vs 1)', title: '', result: '', beat: '', note: '', winner: '', method: ''},
      {id: 'lad', a: 'Troy Carter', b: 'Christian Garrett', a2: '', c: '', d: '', a3: '', b2: '', b3: '', type: 'Ladder Match', title: '', result: '', beat: '', note: '', winner: '', method: ''},
      {id: 'cage', a: 'Zach Dye', b: 'Diamond Roberts', a2: '', c: '', d: '', a3: '', b2: '', b3: '', type: 'Cage Match', title: '', result: '', beat: '', note: '', winner: '', method: ''}
    ]}],
    roster: ['Rico Bravo', 'BK Bennett', 'KJ Valentine', 'Left Three', 'Right One'],
    titles: [],
    currentId: 'e1'
  });
  const html = await boardHtml(data);
  const rows = html.split('<div class="m"').slice(1);
  assert.equal(rows.length, 4);
  const slots = row => [...row.matchAll(/data-k="events\.0\.matches\.(\d+)\.([a-z0-9]+)"/g)].filter(m => ['a', 'b', 'c', 'd', 'a2', 'a3', 'b2', 'b3'].includes(m[2])).map(m => m[2]);
  assert.deepEqual(slots(rows[0]), ['a', 'a2', 'b']);
  assert.match(rows[0], /Rico Bravo/);
  assert.match(rows[0], /KJ Valentine/);
  assert.match(rows[0], /BK Bennett/);
  assert.match(rows[0], /Handicap \(2 vs 1\)/);
  assert.deepEqual(slots(rows[1]), ['a', 'b']);
  assert.match(rows[1], /Left Three/);
  assert.match(rows[1], /Right One/);
  assert.equal(rows[1].includes('Hidden Partner'), false);
  assert.equal(rows[1].includes('>Extra<'), false);
  assert.deepEqual(slots(rows[2]), ['a', 'b']);
  assert.match(rows[2], /Ladder Match/);
  assert.deepEqual(slots(rows[3]), ['a', 'b']);
  assert.match(rows[3], /Cage Match/);
  const saved = JSON.parse(JSON.stringify(data));
  assert.equal(saved.events[0].matches[0].type, HANDICAP);
  assert.equal(saved.events[0].matches[0].a2, 'KJ Valentine');
  assert.equal(saved.events[0].matches[1].type, 'Handicap (3 vs 1)');
  assert.equal(saved.events[0].matches[1].a2, 'Hidden Partner');
  assert.equal(saved.events[0].matches[1].c, 'Extra');
});

async function boardHtml(data) {
  const elements = new Map();
  const make = () => ({textContent: '', style: {}, innerHTML: '', value: '', scrollTop: 0, onclick: null, dataset: {}, className: '', classList: {add() {}, remove() {}, toggle() {}}, focus() {}, setSelectionRange() {}, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, appendChild() {}, closest() { return null; }});
  const document = {
    addEventListener() {},
    createElement: make,
    querySelector(sel) { const id = String(sel).replace(/^#/, ''); if (!elements.has(id)) elements.set(id, make()); return elements.get(id); },
    body: make(),
    head: make()
  };
  const context = {console, document, Core: CoreWeb, setTimeout, clearTimeout, navigator: {}, vBookings: () => ''};
  context.window = context;
  context.globalThis = context;
  context.sb = {load: async () => ({data, path: 'fixture'}), save: async () => true, syncStatus: async () => ({state: 'off'}), onSync() {}, mediaAll: async () => ({}), mediaRename: async () => ({}), board: async () => null, openFolder() {}, backupExport: async () => null, backupImport: async () => null, syncNow() {}, urlFor: () => ''};
  context.window.sb = context.sb;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context, {filename: 'app.js'});
  await new Promise(r => setTimeout(r, 50));
  if (typeof context.vBoard !== 'function') throw new Error('match card renderer did not load');
  return context.vBoard();
}
