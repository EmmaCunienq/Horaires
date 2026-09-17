const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { calculate, buildSlots, formatTime } = require('../script.js');

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
function mount(storage) {
  function element() {
    return { value: '', textContent: '', hidden: false, attrs: {}, children: [],
      style: { setProperty() {} }, setAttribute(k,v) { this.attrs[k] = v; },
      removeAttribute(k) { delete this.attrs[k]; }, append(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; } };
  }
  const inputs = Object.fromEntries(Object.entries(values('08:30', '12:30', '13:30')).map(([key,value]) => [key, Object.assign(element(), {value})]));
  const events = {};
  const nodes = Object.fromEntries(['schedule', 'storage-status', 'error', 'result', 'finish', 'break-duration', 'timeline'].map(id => ['#' + id, element()]));
  nodes['#schedule'].elements = { namedItem: name => inputs[name] };
  nodes['#schedule'].addEventListener = (event, callback) => events[event] = callback;
  const document = { querySelector: selector => nodes[selector], createElement: element };
  vm.runInNewContext(fs.readFileSync(require.resolve('../script.js'), 'utf8'), { document, localStorage: storage });
  return { inputs, nodes, update: events.input };
}

test('persistance, restauration et mise à jour immédiate du résultat', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value) };
  const first = mount(storage);
  assert.equal(first.nodes['#finish'].textContent, '17:30');
  first.inputs.start.value = '07:00';
  first.update();
  assert.equal(first.nodes['#finish'].textContent, '16:00');
  const restored = mount(storage);
  assert.equal(restored.inputs.start.value, '07:00');
  assert.equal(restored.nodes['#finish'].textContent, '16:00');
  restored.inputs.lunchEnd.value = '';
  restored.update();
  assert.equal(restored.nodes['#result'].hidden, true);
  assert.equal(restored.nodes['#finish'].textContent, '—');
  assert.equal(mount(storage).inputs.lunchEnd.value, '');
});

test('stockage inaccessible ou JSON corrompu : le widget reste utilisable', () => {
  const blocked = mount({ getItem() { throw Error(); }, setItem() { throw Error(); } });
  assert.equal(blocked.nodes['#finish'].textContent, '17:30');
  assert.match(blocked.nodes['#storage-status'].textContent, /indisponible/);
  const corrupted = mount({ getItem: () => '{invalid', setItem() {} });
  assert.equal(corrupted.nodes['#finish'].textContent, '17:30');
});
