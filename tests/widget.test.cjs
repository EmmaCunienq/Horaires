const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { calculate, buildSlots, formatTime, localDateKey, untilLocalMidnight } = require('../script.js');

const values = (start, lunchStart, lunchEnd) => ({ start, lunchStart, lunchEnd });

test('calculs : journée standard, courte pause, minutes précises, sans pause et limites', () => {
  for (const [input, expected] of [
    [values('08:30', '12:30', '13:30'), '17:30'],
    [values('07:00', '11:45', '12:15'), '15:30'],
    [values('09:07', '12:23', '13:11'), '17:55'],
    [values('09:00', '12:00', '12:00'), '17:00'],
    [values('00:00', '04:00', '04:30'), '08:30'],
    [values('15:00', '19:00', '19:59'), '23:59']
  ]) {
    const day = calculate(input);
    assert.equal(formatTime(day.finish), expected);
    assert.equal(day.lunchStart - day.start + day.finish - day.lunchEnd, 480);
  }
});

test('saisies invalides rejetées', () => {
  for (const input of [
    values('', '12:30', '13:30'), values('08:30', '', '13:30'), values('08:30', '12:30', ''),
    values('08:30', '08:00', '13:30'), values('08:30', '12:30', '12:00'),
    values('06:00', '15:00', '16:00'), values('16:00', '20:00', '20:00'),
    values('25:00', '12:00', '13:00'), values('bad', '12:00', '13:00')
  ]) assert.ok(calculate(input).error);
});

test('frise : cases de 15 minutes et durée exacte de chaque état sur de nombreux horaires', () => {
  let count = 0;
  for (let start = 0; start < 950; start += 17) {
    for (const morning of [0, 193, 240, 480]) {
      for (const pause of [0, 1, 37, 60, 125]) {
        const day = calculate(values(formatTime(start), formatTime(start + morning), formatTime(start + morning + pause)));
        if (day.error) continue;
        const { from, to, slots } = buildSlots(day);
        assert.equal(from % 60, 0);
        assert.equal(to % 60, 0);
        assert.equal(slots.length, (to - from) / 15);
        const totals = { work: 0, pause: 0, outside: 0 };
        for (const slot of slots) {
          assert.equal(slot.minute % 15, 0);
          assert.equal(slot.parts.reduce((sum, p) => sum + p.to - p.from, 0), 15);
          for (const part of slot.parts) totals[part.state] += part.to - part.from;
        }
        assert.equal(totals.work, 480);
        assert.equal(totals.pause, pause);
        count++;
      }
    }
  }
  assert.ok(count > 900);
});

test('case partagée : début à 08:37 représente 7 min hors travail puis 8 min travaillées', () => {
  const { slots } = buildSlots(calculate(values('08:37', '12:23', '13:11')));
  assert.deepEqual(slots.find(s => s.minute === 510).parts, [
    { state: 'outside', from: 510, to: 517 }, { state: 'work', from: 517, to: 525 }
  ]);
});

// DOM minimal pour tester le cycle de saisie / stockage / rechargement sans navigateur.
function mount(storage, initialTime = '2026-09-17T12:00:00') {
  let now = new Date(initialTime).getTime();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
  }
  let nextTimer;
  const lifecycle = {};
  const timers = {
    setTimeout(callback, delay) { nextTimer = { callback, delay }; return 1; },
    clearTimeout() { nextTimer = null; }
  };
  function element() {
    return { value: '', textContent: '', hidden: false, attrs: {}, children: [],
      style: { setProperty() {} }, setAttribute(k,v) { this.attrs[k] = v; },
      removeAttribute(k) { delete this.attrs[k]; }, append(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; } };
  }
  const inputs = Object.fromEntries(Object.entries(values('00:00', '00:00', '00:00')).map(([key,value]) => [key, Object.assign(element(), {value})]));
  const events = {};
  const nodes = Object.fromEntries(['schedule', 'storage-status', 'error', 'result', 'finish', 'break-duration', 'timeline'].map(id => ['#' + id, element()]));
  nodes['#schedule'].elements = { namedItem: name => inputs[name] };
  nodes['#schedule'].addEventListener = (event, callback) => events[event] = callback;
  const document = { querySelector: selector => nodes[selector], createElement: element, visibilityState: 'visible', addEventListener: (event, callback) => lifecycle[event] = callback };
  const window = { addEventListener: (event, callback) => lifecycle[event] = callback };
  vm.runInNewContext(fs.readFileSync(require.resolve('../script.js'), 'utf8'), { document, window, localStorage: storage, Date: Clock, ...timers });
  return { inputs, nodes, update: events.input,
    setTime(time) { now = new Date(time).getTime(); },
    tick() { nextTimer.callback(); },
    delay() { return nextTimer.delay; },
    emit(event) { lifecycle[event](); }
  };
}


function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
function enter(widget, input = values('08:30', '12:30', '13:30')) {
  for (const [key, value] of Object.entries(input)) widget.inputs[key].value = value;
  widget.update();
}
function assertReset(widget) {
  for (const input of Object.values(widget.inputs)) assert.equal(input.value, '00:00');
  assert.equal(widget.nodes['#finish'].textContent, '08:00');
  assert.equal(widget.nodes['#result'].hidden, false);
}

test('première visite : trois champs à zéro et fin à 08:00', () => {
  assertReset(mount(memoryStorage()));
});

test('rechargement le même jour : sauvegarde datée, restauration et saisie incomplète', () => {
  const storage = memoryStorage();
  const first = mount(storage);
  enter(first);
  assert.equal(first.nodes['#finish'].textContent, '17:30');
  assert.deepEqual(JSON.parse(storage.getItem('mes-horaires.v2')), {
    date: '2026-09-17', values: values('08:30', '12:30', '13:30')
  });
  const restored = mount(storage, '2026-09-17T23:59:59');
  assert.equal(restored.inputs.start.value, '08:30');
  assert.equal(restored.nodes['#finish'].textContent, '17:30');
  restored.inputs.lunchEnd.value = '';
  restored.update();
  assert.equal(restored.nodes['#result'].hidden, true);
  assert.equal(mount(storage).inputs.lunchEnd.value, '');
});

test('réouverture un autre jour : les horaires précédents ne sont pas restaurés', () => {
  const storage = memoryStorage();
  enter(mount(storage));
  assertReset(mount(storage, '2026-09-18T00:00:00'));
  assert.equal(JSON.parse(storage.getItem('mes-horaires.v2')).date, '2026-09-18');
});

test('widget ouvert : remise à zéro à minuit, puis nouvelles saisies conservées', () => {
  const storage = memoryStorage();
  const widget = mount(storage, '2026-12-31T23:59:59.500');
  enter(widget);
  assert.equal(widget.delay(), 500);
  widget.setTime('2027-01-01T00:00:00');
  widget.tick();
  assertReset(widget);
  assert.equal(JSON.parse(storage.getItem('mes-horaires.v2')).date, '2027-01-01');
  enter(widget);
  widget.tick();
  assert.equal(widget.inputs.start.value, '08:30');
  assert.equal(widget.delay(), 60000);
});

test('page suspendue : contrôle à la reprise et avant toute nouvelle sauvegarde', () => {
  for (const trigger of ['focus', 'pageshow', 'visibilitychange', 'input', 'timer']) {
    const storage = memoryStorage();
    const widget = mount(storage);
    enter(widget);
    widget.setTime('2026-09-19T09:00:00');
    if (trigger === 'input') widget.update();
    else if (trigger === 'timer') widget.tick();
    else widget.emit(trigger);
    assertReset(widget);
    assert.equal(JSON.parse(storage.getItem('mes-horaires.v2')).date, '2026-09-19');
  }
});

test('date locale : aucun reset lors du changement de date UTC', () => {
  const storage = memoryStorage();
  const widget = mount(storage, '2026-09-17T23:59:00');
  enter(widget);
  assert.equal(JSON.parse(storage.getItem('mes-horaires.v2')).date, '2026-09-17');
  const local = new Date(2026, 8, 17, 0, 15);
  assert.equal(localDateKey(local), '2026-09-17');
  // Deux instants entourant minuit UTC, mais appartenant à la même date locale.
  const before = new Date('2026-09-17T23:59:59Z');
  const after = new Date('2026-09-18T00:00:00Z');
  if (localDateKey(before) === localDateKey(after)) {
    const acrossUTC = mount(memoryStorage(), before);
    enter(acrossUTC);
    acrossUTC.setTime(after);
    acrossUTC.tick();
    assert.equal(acrossUTC.inputs.start.value, '08:30');
  }
});

test('changements heure été/hiver : prochain minuit calendaire local', () => {
  for (const date of [new Date(2026, 2, 29), new Date(2026, 9, 25)]) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    assert.equal(untilLocalMidnight(date), next - date);
  }
  if (process.env.TZ === 'Europe/Paris') {
    assert.equal(untilLocalMidnight(new Date(2026, 2, 29)), 23 * 3600000);
    assert.equal(untilLocalMidnight(new Date(2026, 9, 25)), 25 * 3600000);
  }
});

test('sauvegardes anciennes, non datées ou corrompues ignorées', () => {
  for (const initial of [
    { 'mes-horaires.v1': JSON.stringify(values('08:30', '12:30', '13:30')) },
    { 'mes-horaires.v2': '{invalid' },
    { 'mes-horaires.v2': JSON.stringify(values('08:30', '12:30', '13:30')) },
    { 'mes-horaires.v2': JSON.stringify({ date: '2026-09-17', values: null }) }
  ]) assertReset(mount(memoryStorage(initial)));
});

test('stockage bloqué : calcul et remise à zéro fonctionnent toujours', () => {
  const widget = mount({ getItem() { throw Error(); }, setItem() { throw Error(); } });
  assertReset(widget);
  enter(widget);
  assert.equal(widget.nodes['#finish'].textContent, '17:30');
  assert.match(widget.nodes['#storage-status'].textContent, /indisponible/);
  widget.setTime('2026-09-18T00:00:00');
  widget.tick();
  assertReset(widget);
});
