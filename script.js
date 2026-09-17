'use strict';

const STORAGE_KEY = 'mes-horaires.v2';
const DEFAULTS = { start: '00:00', lunchStart: '00:00', lunchEnd: '00:00' };
const WORK_MINUTES = 8 * 60;

function localDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function untilLocalMidnight(now = new Date()) {
  // Une date calendaire locale tient compte des journées de 23 ou 25 heures.
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
}

function toMinutes(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function calculate(values) {
  const start = toMinutes(values.start);
  const lunchStart = toMinutes(values.lunchStart);
  const lunchEnd = toMinutes(values.lunchEnd);
  const missing = Object.keys(DEFAULTS).filter(key => toMinutes(values[key]) === null);
  if (missing.length) return { error: 'Renseignez les trois horaires pour afficher votre journée.', fields: missing };
  if (lunchStart < start) return { error: 'La pause déjeuner doit commencer après le début de journée.', fields: ['lunchStart'] };
  if (lunchEnd < lunchStart) return { error: 'La fin de pause doit être égale ou postérieure au début de pause.', fields: ['lunchEnd'] };
  if (lunchStart - start > WORK_MINUTES) return { error: 'Vous dépassez déjà 8 h de travail avant la pause. Avancez le début de pause.', fields: ['lunchStart'] };
  const pause = lunchEnd - lunchStart;
  const finish = start + WORK_MINUTES + pause;
  if (finish >= 24 * 60) return { error: 'La fin de journée doit être avant minuit. Les horaires de nuit ne sont pas pris en charge.', fields: ['start', 'lunchEnd'] };
  return { start, lunchStart, lunchEnd, finish, pause };
}

// Intersections exactes : aucune heure saisie n'est arrondie au quart d'heure.
function buildSlots(day) {
  const from = Math.max(0, Math.floor((day.start - 30) / 60) * 60);
  const to = Math.min(1440, Math.ceil((day.finish + 30) / 60) * 60);
  const periods = [
    { from, to: day.start, state: 'outside' },
    { from: day.start, to: day.lunchStart, state: 'work' },
    { from: day.lunchStart, to: day.lunchEnd, state: 'pause' },
    { from: day.lunchEnd, to: day.finish, state: 'work' },
    { from: day.finish, to, state: 'outside' }
  ];
  const slots = [];
  for (let minute = from; minute < to; minute += 15) {
    const parts = periods.map(period => ({
      state: period.state, from: Math.max(minute, period.from), to: Math.min(minute + 15, period.to)
    })).filter(part => part.to > part.from);
    slots.push({ minute, parts });
  }
  return { from, to, slots };
}

function init() {
  const form = document.querySelector('#schedule');
  const inputs = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, form.elements.namedItem(key)]));
  const storageStatus = document.querySelector('#storage-status');
  let storageAvailable = true;
  let activeDate;
  let dayTimer;

  function restoreToday(date) {
    activeDate = date;
    for (const key of Object.keys(DEFAULTS)) inputs[key].value = DEFAULTS[key];
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || saved.date !== date || !saved.values || typeof saved.values !== 'object') return;
      for (const key of Object.keys(DEFAULTS)) {
        if (saved.values[key] === '' || toMinutes(saved.values[key]) !== null) inputs[key].value = saved.values[key];
      }
    } catch { storageAvailable = false; }
  }

  function render() {
    const today = localDateKey();
    // Vérifier aussi lors d'une saisie, au cas où le navigateur aurait suspendu le timer.
    if (today !== activeDate) restoreToday(today);
    const values = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: activeDate, values }));
      storageAvailable = true;
    } catch { storageAvailable = false; }
    storageStatus.hidden = storageAvailable;
    storageStatus.textContent = storageAvailable ? '' : 'Enregistrement indisponible dans ce navigateur';
    const day = calculate(values);
    const error = document.querySelector('#error');
    error.hidden = !day.error;
    error.textContent = day.error || '';
    for (const [key, input] of Object.entries(inputs)) {
      input.setAttribute('aria-invalid', String(Boolean(day.fields?.includes(key))));
      if (day.fields?.includes(key)) input.setAttribute('aria-describedby', 'error');
      else input.removeAttribute('aria-describedby');
    }
    document.querySelector('#result').hidden = Boolean(day.error);
    document.querySelector('#finish').textContent = day.error ? '—' : formatTime(day.finish);
    if (day.error) return;
    const timeline = document.querySelector('#timeline');
    timeline.setAttribute('aria-label', `Travail de ${formatTime(day.start)} à ${formatTime(day.lunchStart)}, pause déjeuner jusqu’à ${formatTime(day.lunchEnd)}, puis travail jusqu’à ${formatTime(day.finish)}. Total : 8 heures de travail effectif.`);
    const { from, to, slots } = buildSlots(day);
    const ticks = document.createElement('div');
    ticks.className = 'ticks';
    for (let minute = from; minute <= to; minute += 60) {
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.style.left = `${100 * (minute - from) / (to - from)}%`;
      tick.textContent = formatTime(minute);
      ticks.append(tick);
    }
    const track = document.createElement('div');
    track.className = 'slots';
    track.style.setProperty('--count', slots.length);
    const names = { work: 'Travail', pause: 'Pause déjeuner', outside: 'Hors travail' };
    slots.forEach(({ minute, parts }, index) => {
      const slot = document.createElement('div');
      const joinsLeft = parts[0].state === 'work' && index > 0
        && slots[index - 1].parts.some(part => part.state === 'work' && part.to === minute);
      const joinsRight = parts.some(part => part.state === 'work' && part.to === minute + 15)
        && slots[index + 1]?.parts[0].state === 'work';
      slot.className = `slot${joinsLeft ? ' join-left' : ''}${joinsRight ? ' join-right' : ''}`;
      slot.title = parts.map(part => `${formatTime(part.from)}–${formatTime(part.to)} : ${names[part.state]}`).join('\n');
      const stops = parts.map(part => `var(--${part.state}) ${(part.from - minute) / 15 * 100}% ${(part.to - minute) / 15 * 100}%`);
      slot.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
      // Un motif discret distingue aussi la pause par sa texture.
      if (parts.length === 1 && parts[0].state === 'pause') slot.style.background = 'repeating-linear-gradient(135deg, transparent 0 3px, #a6577b30 3px 4px), var(--pause)';
      track.append(slot);
    });
    ticks.setAttribute('aria-hidden', 'true');
    track.setAttribute('aria-hidden', 'true');
    timeline.replaceChildren(ticks, track);
  }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', render);

  function watchDay() {
    clearTimeout(dayTimer);
    if (localDateKey() !== activeDate) render();
    // Minuit exact, avec contrôle périodique en cas de changement d'heure ou de fuseau.
    dayTimer = setTimeout(watchDay, Math.min(untilLocalMidnight(), 60_000));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') watchDay();
  });
  window.addEventListener('focus', watchDay);
  window.addEventListener('pageshow', watchDay);
  render();
  watchDay();
}

if (typeof document !== 'undefined') init();
if (typeof module !== 'undefined') module.exports = { toMinutes, formatTime, calculate, buildSlots, localDateKey, untilLocalMidnight };
