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
