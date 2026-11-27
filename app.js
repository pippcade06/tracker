'use strict';
/* =====================================================================
   Goals & Training Tracker — version 2.4
   Everything is stored on this device (browser "localStorage").
   Sections:  1 settings · 2 helpers · 3 storage · 4 plan import
              5 training · 6 cardio · 7 rest timer · 8 checklist
              9 goals & to-do · 10 progress & weekly check-in
              11 more/backup · 12 drawing & events
   ===================================================================== */

/* ---------- 1. Settings ---------- */
const APP_VERSION = '2.4.0';
const STORE_KEY = 'tracker.data.v1'; // (name kept from v1 so your data carries over)
const UI_KEY = 'tracker.ui.v1';
const BACKUP_KEY = 'tracker.lastBackup';
const LOOK_KEY = 'tracker.look'; // light/dark and highlight color (per device)
const ACCENTS = [
  { id: 'violet', label: 'Violet', color: '#7c6cf6' },
  { id: 'blue', label: 'Blue', color: '#3b82f6' },
  { id: 'teal', label: 'Teal', color: '#14b8a6' },
  { id: 'orange', label: 'Orange', color: '#f97316' },
  { id: 'pink', label: 'Pink', color: '#ec4899' },
];
const TABS = ['train', 'check', 'goals', 'progress', 'more'];
const CATEGORIES = ['Training', 'School', 'Work', 'Side projects', 'Personal'];
const CARDIO_TYPES = [
  { id: 'bike', label: 'Bike', ico: '🚴' },
  { id: 'row', label: 'Row', ico: '🚣' },
  { id: 'swim', label: 'Swim', ico: '🏊' },
  { id: 'walk', label: 'Walk', ico: '🚶' },
  { id: 'other', label: 'Other', ico: '➕' },
];
const DIST_UNITS = ['mi', 'km', 'yd', 'm'];
const GOAL_KINDS = {
  count: { label: 'Count times (tap +1)', unit: 'times' },
  minutes: { label: 'Minutes (tap +15, +30…)', unit: 'min' },
  workouts: { label: 'Workout days (counts itself from your logs)', unit: 'days' },
};

/* ---------- 2. Helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');
// Dates are stored as "YYYY-MM-DD" in *your local time* (not UTC), so 11 pm is still "today".
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => toKey(new Date());
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const isDateKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toKey(fromKey(s)) === s;
const niceDate = (k) => { const d = fromKey(k); return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`; };
const shortDate = (k) => { const d = fromKey(k); return `${MON[d.getMonth()]} ${d.getDate()}`; };
const dayName = (k) => DOW[fromKey(k).getDay()];
const relDay = (k) => (k === todayKey() ? 'today' : k === addDays(todayKey(), -1) ? 'yesterday' : niceDate(k));
// Weeks run Monday → Sunday (same as your coach's plans).
const mondayOf = (k) => addDays(k, -((fromKey(k).getDay() + 6) % 7));
const weekDates = (mon) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(mon, i));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const fmtSec = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const num = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const show = (v) => (v === undefined ? 'nothing' : String(JSON.stringify(v)).slice(0, 40));
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const plural = (n, word) => `${fmtNum(n)} ${word}${n === 1 ? '' : 's'}`;
// Clock times are stored as "HH:MM" in 24-hour time, e.g. "08:30" or "21:30".
const isHM = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const hmMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const minHM = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const fmtHM = (s) => { if (!isHM(s)) return '–'; const h = Number(s.slice(0, 2)); return `${h % 12 || 12}:${s.slice(3)} ${h < 12 ? 'am' : 'pm'}`; };
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/* ---------- 3. Storage ---------- */
function blankData() {
  return {
    app: 'goal-tracker', version: 2, plans: {}, sets: [], cardio: [], daily: {}, todos: [], goals: [],
    dayEdits: {}, // v2.2: your swaps/adds/removes per day
    myBlocks: {}, // v2.4: schedule blocks YOU added, per day (re-importing a plan never touches these)
    times: [],    // v2.2: time goals ("out by 8:30") and what time you actually did it
    lock: null,   // v2.2: scrambled copy of your private-list PIN (never the PIN itself)
  };
}
// Cleans up data loaded from storage or a backup file so a bad entry can't crash the app.
function normalizeData(d) {
  const out = blankData();
  if (!d || typeof d !== 'object') return out;
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(d.plans)) {
    for (const [k, p] of Object.entries(d.plans)) {
      if (isObj(p) && isDateKey(p.week) && Array.isArray(p.days)) out.plans[k] = p;
    }
  }
  if (Array.isArray(d.sets)) out.sets = d.sets.filter((s) => isObj(s) && isDateKey(s.date) && typeof s.exercise === 'string');
  if (Array.isArray(d.cardio)) out.cardio = d.cardio.filter((c) => isObj(c) && isDateKey(c.date) && typeof c.type === 'string');
  if (isObj(d.daily)) out.daily = d.daily;
  if (Array.isArray(d.todos)) out.todos = d.todos.filter((t) => isObj(t) && typeof t.text === 'string' && isDateKey(t.date));
  if (Array.isArray(d.goals)) {
    out.goals = d.goals
      .filter((g) => isObj(g) && g.id && typeof g.title === 'string' && GOAL_KINDS[g.kind] && Number(g.target) > 0)
      .map((g) => ({ ...g, log: isObj(g.log) ? g.log : {} }));
  }
  if (isObj(d.dayEdits)) {
    for (const [k, v] of Object.entries(d.dayEdits)) {
      if (!isDateKey(k) || !isObj(v) || !Array.isArray(v.exercises)) continue;
      out.dayEdits[k] = {
        exercises: v.exercises.filter((e) => isObj(e) && typeof e.name === 'string' && e.name.trim()).map((e) => ({
          ...e,
          sets: Number.isInteger(Number(e.sets)) && Number(e.sets) >= 1 ? Number(e.sets) : 3,
          reps: String(e.reps ?? ''),
          restSec: Number(e.restSec) >= 0 ? Number(e.restSec) : 90,
        })),
        removed: Array.isArray(v.removed) ? v.removed.filter((x) => typeof x === 'string') : [],
      };
    }
  }
  if (Array.isArray(d.times)) {
    out.times = d.times.filter((x) => isObj(x) && x.id && typeof x.title === 'string').map((x) => ({
      ...x,
      target: isHM(x.target) ? x.target : '',
      days: Array.isArray(x.days) ? x.days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [0, 1, 2, 3, 4, 5, 6],
      once: isDateKey(x.once) ? x.once : null,
      log: isObj(x.log) ? x.log : {},
    }));
  }
  if (isObj(d.myBlocks)) {
    for (const [k, v] of Object.entries(d.myBlocks)) {
      if (!isDateKey(k) || !Array.isArray(v)) continue;
      const list = v.filter((b) => isObj(b) && b.id && isHM(b.start) && typeof b.label === 'string')
        .map((b) => ({ id: b.id, start: b.start, end: isHM(b.end) ? b.end : '', label: b.label, locked: b.locked === true }));
      if (list.length) out.myBlocks[k] = list;
    }
  }
  if (isObj(d.lock) && typeof d.lock.hash === 'string' && typeof d.lock.salt === 'string') out.lock = { hash: d.lock.hash, salt: d.lock.salt };
  return out;
}
function loadData() {
  let raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return blankData(); }
  if (!raw) return blankData();
  try { return normalizeData(JSON.parse(raw)); } catch (e) {
    // Never silently throw away data: keep the unreadable copy under another name.
    try { localStorage.setItem(`${STORE_KEY}.unreadable.${Date.now()}`, raw); } catch (_) { /* ignore */ }
    return blankData();
  }
}
let data = loadData();

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); return true; } catch (e) {
    toast('⚠️ Could not save. Storage may be full. Download a backup in More.', { ms: 6000 });
    return false;
  }
}

// Small things about the screen itself (which tab is open, open forms, the running timer).
const ui = {
  tab: 'train', planWeek: null, trainDate: null, openEx: null, checkDate: null,
  todoFilter: 'All', todoCat: 'Personal', planDraft: '',
  cardioForm: null, goalForm: null, sumWeek: null, weighOpen: false,
  exForm: null, timeForm: null, pin: null, privView: false, blockForm: null,
};
let savedUi = {};
try { savedUi = JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { savedUi = {}; }
if (savedUi.tab === 'todo') savedUi.tab = 'goals'; // v1 had a "To-Do" tab; it now lives in Goals
if (TABS.includes(savedUi.tab)) ui.tab = savedUi.tab;
if (CATEGORIES.includes(savedUi.todoCat)) ui.todoCat = savedUi.todoCat;

function saveUi() {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({
      tab: ui.tab,
      todoCat: ui.todoCat,
      timer: timer.end ? { end: timer.end, total: timer.total, label: timer.label } : null,
    }));
  } catch (e) { /* ignore */ }
}

const drafts = {};        // what's typed in each exercise's weight/reps boxes
let importResult = null;  // message shown after importing a plan
let undoFn = null;        // what "Undo" in the toast does

/* ---------- 4. Weekly plan import & validation ---------- */
function parsePlanText(text) {
  let t = String(text || '').trim();
  if (!t) return { errors: ['The box is empty. Copy the plan from your coach and paste it in first.'], warnings: [] };
  const warnings = [];
  t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim(); // remove ``` code fences
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last <= first) {
    return { errors: ["I couldn't find a plan in that text. A plan starts with { and ends with }."], warnings };
  }
  if (first > 0 || last < t.length - 1) warnings.push('Ignored some extra text before or after the plan.');
  t = t.slice(first, last + 1);

  let obj;
  try { obj = JSON.parse(t); } catch (e) {
    try {
      obj = JSON.parse(t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"));
      warnings.push('Fixed curly “smart quotes” in the pasted text.');
    } catch (e2) {
      return { errors: [jsonErrorMessage(e, t)], warnings };
    }
  }
  return validatePlanObject(obj, warnings);
}

function jsonErrorMessage(err, text) {
  const msg = String((err && err.message) || '');
  let line = null;
  let m = msg.match(/line (\d+)/i);
  if (m) line = Number(m[1]);
  else if ((m = msg.match(/position (\d+)/i))) line = text.slice(0, Number(m[1])).split('\n').length;
  let where = '';
  if (line) {
    const src = (text.split('\n')[line - 1] || '').trim().slice(0, 70);
    where = ` The problem is around line ${line}${src ? `: “${src}”` : ''}.`;
  }
  return `That text isn't valid JSON (the plan format).${where} Usually it's a missing comma, a missing quote mark, or the copy got cut off. Try copying the whole plan again.`;
}

function validatePlanObject(o, warnings = []) {
  const errors = [];
  const isText = (v) => typeof v === 'string' && v.trim() !== '';
  const txt = (v) => (v === undefined || v === null ? '' : String(v).trim());
  const isList = (v) => v === undefined || v === null || Array.isArray(v);
  const list = (v) => (Array.isArray(v) ? v : []);

  if (!o || typeof o !== 'object' || Array.isArray(o)) {
    return { errors: ['The plan should be one { … } block with "week", "title" and "days" inside.'], warnings };
  }
  if (!isDateKey(o.week)) errors.push(`"week" should be the first date of the week, like "2026-11-16" (got ${show(o.week)}).`);
  if (o.title !== undefined && typeof o.title !== 'string') errors.push('"title" should be text in quotes, like "Back Recovery Week".');
  if (!isList(o.rules)) errors.push('"rules" should be a list in [ ] brackets.');
  const rules = list(o.rules).map(txt).filter(Boolean);
  // "07:30" (or "7:30") → "07:30"; anything else → null
  const hm = (v) => {
    const m = String(v ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const out = `${pad(Number(m[1]))}:${m[2]}`;
    return isHM(out) ? out : null;
  };
  const given = (v) => v !== undefined && v !== null && v !== '';
  let targets = null;
  if (given(o.targets)) {
    if (typeof o.targets !== 'object' || Array.isArray(o.targets)) {
      errors.push('"targets" should be written as { … }, like {"bedtime": "22:30", "wake": "06:30"}.');
    } else {
      targets = {};
      for (const k of ['calories', 'proteinG', 'weeklyLossLb']) {
        if (!given(o.targets[k])) continue;
        const n = Number(o.targets[k]);
        if (!Number.isFinite(n)) errors.push(`"targets" → "${k}" should be a number (got ${show(o.targets[k])}).`);
        else targets[k] = n;
      }
      for (const k of ['bedtime', 'wake']) {
        if (!given(o.targets[k])) continue;
        const v = hm(o.targets[k]);
        if (!v) errors.push(`"targets" → "${k}" should be a 24-hour time like "22:30" (got ${show(o.targets[k])}).`);
        else targets[k] = v;
      }
    }
  }
  if (!Array.isArray(o.days) || !o.days.length) errors.push('"days" should be a list in [ ] brackets with at least one day.');

  const days = [];
  const seen = new Set();
  list(o.days).forEach((d, i) => {
    const where = `Day ${i + 1}` + (d && isText(d.name) ? ` (“${d.name.trim()}”)` : '');
    if (!d || typeof d !== 'object' || Array.isArray(d)) { errors.push(`${where} isn't written as { … }.`); return; }
    if (!isDateKey(d.date)) {
      errors.push(`${where}: "date" should look like "2026-11-16" (got ${show(d.date)}).`);
    } else {
      if (seen.has(d.date)) warnings.push(`${where}: the date ${d.date} is used by more than one day.`);
      seen.add(d.date);
      if (isDateKey(o.week) && (d.date < o.week || d.date > addDays(o.week, 6))) warnings.push(`${where}: ${d.date} isn't inside the week starting ${o.week}.`);
    }
    if (!isText(d.name)) errors.push(`${where}: needs a "name", like "Upper Strength".`);

    if (!isList(d.exercises)) errors.push(`${where}: "exercises" should be a list in [ ] brackets (use [] if there are none).`);
    const exercises = [];
    list(d.exercises).forEach((e, j) => {
      const w = `${where}, exercise ${j + 1}` + (e && isText(e.name) ? ` (“${e.name.trim()}”)` : '');
      if (!e || typeof e !== 'object' || Array.isArray(e)) { errors.push(`${w} isn't written as { … }.`); return; }
      if (!isText(e.name)) errors.push(`${w}: needs a "name".`);
      const sets = Number(e.sets);
      if (!Number.isInteger(sets) || sets < 1 || sets > 20) errors.push(`${w}: "sets" should be a whole number like 3 (got ${show(e.sets)}).`);
      if (txt(e.reps) === '') errors.push(`${w}: needs "reps", like "8-10".`);
      let rest = e.restSec;
      if (rest === undefined || rest === null || rest === '') {
        rest = 90;
        warnings.push(`${w}: no "restSec", so the rest timer will use 90 seconds.`);
      } else if (!Number.isFinite(Number(rest)) || Number(rest) < 0 || Number(rest) > 900) {
        errors.push(`${w}: "restSec" should be a number of seconds, like 120 (got ${show(e.restSec)}).`);
      }
      if (isText(e.name) && /dead\s*-?lift|\brdl\b/i.test(e.name)) {
        warnings.push(`${w}: this is a deadlift. Your notes say no deadlifts while your back heals, so double-check with your coach.`);
      }
      exercises.push({ name: txt(e.name), sets, reps: txt(e.reps), restSec: Math.round(Number(rest)) || 0, start: txt(e.start), notes: txt(e.notes) });
    });

    if (!isList(d.cardio)) errors.push(`${where}: "cardio" should be a list in [ ] brackets (use [] if there is none).`);
    const cardio = [];
    list(d.cardio).forEach((c, j) => {
      const w = `${where}, cardio ${j + 1}`;
      if (!c || typeof c !== 'object' || Array.isArray(c)) { errors.push(`${w} isn't written as { … }.`); return; }
      if (!isText(c.type)) errors.push(`${w}: needs a "type", like "bike".`);
      cardio.push({ type: txt(c.type), minutes: txt(c.minutes), optional: c.optional === true, notes: txt(c.notes) });
    });

    if (!isList(d.checklist)) errors.push(`${where}: "checklist" should be a list in [ ] brackets.`);
    const checklist = list(d.checklist).map(txt).filter(Boolean);

    if (!isList(d.schedule)) errors.push(`${where}: "schedule" should be a list in [ ] brackets (or leave it out).`);
    const schedule = [];
    list(d.schedule).forEach((b, j) => {
      const w = `${where}, schedule block ${j + 1}` + (b && isText(b.label) ? ` (“${b.label.trim()}”)` : '');
      if (!b || typeof b !== 'object' || Array.isArray(b)) { errors.push(`${w} isn't written as { … }.`); return; }
      const start = hm(b.start);
      if (!start) errors.push(`${w}: "start" should be a 24-hour time like "07:30" (got ${show(b.start)}).`);
      let end = '';
      if (given(b.end)) {
        end = hm(b.end);
        if (!end) errors.push(`${w}: "end" should be a 24-hour time like "08:30" (got ${show(b.end)}), or leave it out.`);
      }
      if (!isText(b.label)) errors.push(`${w}: needs a "label", like "Study: Analysis".`);
      if (given(b.locked) && typeof b.locked !== 'boolean') warnings.push(`${w}: "locked" should be true or false, so it was treated as false.`);
      schedule.push({ start: start || '', end: end || '', label: txt(b.label), locked: b.locked === true });
    });
    schedule.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

    // "meals" and "mealTotals" from the coach are accepted but not used (you turned meals off).

    const type = isText(d.type) ? d.type.trim().toLowerCase() : exercises.length ? 'lift' : cardio.length ? 'cardio' : 'rest';
    days.push({ date: d.date, name: txt(d.name), type, exercises, cardio, checklist, schedule });
  });

  if (errors.length) return { errors, warnings };
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    plan: { week: o.week, title: isText(o.title) ? o.title.trim() : `Week of ${niceDate(o.week)}`, rules, days, ...(targets ? { targets } : {}) },
    errors: [],
    warnings,
  };
}

function savePlan(plan) {
  const replaced = !!data.plans[plan.week];
  plan.importedAt = Date.now();
  data.plans[plan.week] = plan;
  save();
  ui.planWeek = null;
  ui.trainDate = null;
  ui.openEx = null;
  return replaced;
}

function importPlanText(text) {
  const res = parsePlanText(text);
  if (res.errors.length) {
    importResult = { ok: false, errors: res.errors, warnings: res.warnings };
  } else {
    const replaced = savePlan(res.plan);
    const nEx = res.plan.days.reduce((n, d) => n + d.exercises.length, 0);
    importResult = {
      ok: true,
      msg: `${replaced ? 'Replaced' : 'Imported'} “${res.plan.title}”: ${res.plan.days.length} days, ${nEx} exercises.`,
      warnings: res.warnings,
    };
    ui.planDraft = '';
  }
  render();
  const el = $('#import-result');
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// An example week (for trying the app out) that starts on this week's Monday.
function examplePlan() {
  const mon = mondayOf(todayKey());
  const D = (i) => addDays(mon, i);
  return {
    week: mon,
    title: 'Example Week (try it out)',
    rules: ['Pain during an exercise must stay at 3/10 or less', 'Pick dumbbells up from waist height'],
    days: [
      { date: D(0), name: 'Upper A', type: 'lift', exercises: [
        { name: 'Machine chest press', sets: 3, reps: '8-10', restSec: 150, start: '3-4 reps in reserve', notes: 'Back flat on pad' },
        { name: 'Seated cable row', sets: 3, reps: '10-12', restSec: 90, start: 'Moderate', notes: 'Chest tall, no rounding' },
        { name: 'Seated dumbbell lateral raise', sets: 3, reps: '12-15', restSec: 60, start: 'Light', notes: '' },
      ], cardio: [{ type: 'bike', minutes: '10-20', optional: true, notes: 'Easy' }], checklist: ['Walk 10,000 steps', 'Back pain today'] },
      { date: D(1), name: 'Easy Bike', type: 'cardio', exercises: [], cardio: [{ type: 'bike', minutes: '25-35', notes: 'Conversational pace' }], checklist: ['Walk 10,000 steps', 'Heat on back 15-20 min'] },
      { date: D(2), name: 'Rest', type: 'rest', exercises: [], cardio: [], checklist: ['Walk 10,000 steps'] },
      { date: D(3), name: 'Zone 2 Row', type: 'cardio', exercises: [], cardio: [{ type: 'row', minutes: '30', notes: '120-140 bpm' }], checklist: ['Walk 10,000 steps'] },
      { date: D(4), name: 'Upper B', type: 'lift', exercises: [
        { name: 'Machine shoulder press', sets: 3, reps: '8-10', restSec: 150, start: '3 reps in reserve', notes: '' },
        { name: 'Lat pulldown', sets: 3, reps: '10-12', restSec: 90, start: '', notes: '' },
        { name: 'Cable curl', sets: 2, reps: '10-12', restSec: 60, start: '', notes: '' },
        { name: 'Triceps pushdown', sets: 2, reps: '10-12', restSec: 60, start: '', notes: '' },
      ], cardio: [], checklist: ['Walk 10,000 steps'] },
      { date: D(5), name: 'Arms & Core', type: 'lift', exercises: [
        { name: 'Preacher curl machine', sets: 3, reps: '10-12', restSec: 60, start: '', notes: '' },
        { name: 'Bird dog', sets: 3, reps: '8 each side', restSec: 45, start: 'Bodyweight (enter 0)', notes: 'Slow and controlled' },
      ], cardio: [], checklist: ['Walk 10,000 steps'] },
      { date: D(6), name: 'Long Bike', type: 'cardio', exercises: [], cardio: [{ type: 'bike', minutes: '45-60', notes: 'Zone 2' }], checklist: ['Walk 10,000 steps'] },
    ],
  };
}

/* ---------- 5. Training ---------- */
const planList = () => Object.values(data.plans).sort((a, b) => (a.week < b.week ? -1 : 1));

// Which plan to show: the one covering today, else the next upcoming one, else the latest.
function defaultPlan() {
  const plans = planList();
  if (!plans.length) return null;
  const t = todayKey();
  return plans.find((p) => p.days.some((d) => d.date === t))
    || plans.find((p) => p.week <= t && t < addDays(p.week, 7))
    || plans.find((p) => p.week > t)
    || plans[plans.length - 1];
}
const activePlan = () => (ui.planWeek && data.plans[ui.planWeek]) || defaultPlan();

function activeDay(plan) {
  const t = todayKey();
  return plan.days.find((d) => d.date === ui.trainDate)
    || plan.days.find((d) => d.date === t)
    || plan.days.find((d) => d.date > t)
    || plan.days[0];
}

// The plan day for a date (newest imported plan wins if two cover the same day).
function planDayFor(date) {
  const plans = Object.values(data.plans).sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0));
  for (const p of plans) {
    const d = p.days.find((x) => x.date === date);
    if (d) return d;
  }
  return null;
}

function setsFor(date, name) {
  const n = norm(name);
  return data.sets.filter((s) => s.date === date && norm(s.exercise) === n).sort((a, b) => a.ts - b.ts);
}
function lastSession(name, beforeDate) {
  const n = norm(name);
  let best = null;
  for (const s of data.sets) if (norm(s.exercise) === n && s.date < beforeDate && (!best || s.date > best)) best = s.date;
  return best ? { date: best, sets: setsFor(best, name) } : null;
}
// "8-10" → {lo: 8, hi: 10}; "12" → {lo: 12, hi: 12}
function parseRange(reps) {
  const s = String(reps);
  let m = s.match(/(\d+)\s*(?:-|–|—|to)\s*(\d+)/i);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };
  m = s.match(/(\d+)/);
  return m ? { lo: Number(m[1]), hi: Number(m[1]) } : null;
}
// Double progression: did every planned set reach the top of the rep range?
function hitTop(sets, ex) {
  const r = parseRange(ex.reps);
  if (!r || sets.length < ex.sets) return false;
  return sets.slice(0, ex.sets).every((s) => s.reps >= r.hi);
}
const fmtWeight = (w) => (w === 0 ? 'BW' : `${fmtNum(w)} lb`);
const fmtSetShort = (s) => `${s.weight === 0 ? 'BW' : fmtNum(s.weight)}×${s.reps}`;
const didWorkout = (date) => data.sets.some((s) => s.date === date) || data.cardio.some((c) => c.date === date);

function draftFor(key, ex, done, last) {
  if (!drafts[key]) {
    const prev = done[done.length - 1] || (last && last.sets[0]);
    const r = parseRange(ex.reps);
    drafts[key] = {
      weight: prev ? fmtNum(prev.weight) : '',
      reps: prev ? String(prev.reps) : r ? String(r.lo) : '',
      rir: prev && prev.rir != null ? prev.rir : null,
    };
  }
  return drafts[key];
}

function renderTrain() {
  const plan = activePlan();
  if (!plan) {
    return `<div class="empty">
      <div class="empty-ico">📋</div>
      <h2>No plan yet</h2>
      <p>Your coach writes a new plan every Sunday. Copy it from the chat, then paste it in <b>More → Import this week's plan</b>.</p>
      <button class="btn primary big" data-action="tab" data-tab="more">Import a plan</button>
    </div>`;
  }
  const plans = planList();
  const idx = plans.findIndex((p) => p.week === plan.week);
  const prev = plans[idx - 1];
  const next = plans[idx + 1];
  const day = activeDay(plan);
  const t = todayKey();

  let h = `<section class="week-head">
    <button class="icon-btn" data-action="plan-week" data-week="${prev ? prev.week : ''}" ${prev ? '' : 'disabled'} aria-label="Previous week">‹</button>
    <div class="week-title"><h2>${esc(plan.title)}</h2><div class="muted small">Week of ${niceDate(plan.week)}</div></div>
    <button class="icon-btn" data-action="plan-week" data-week="${next ? next.week : ''}" ${next ? '' : 'disabled'} aria-label="Next week">›</button>
  </section>`;
  if (plan.rules.length) {
    h += `<details class="rules" open><summary>Rules this week</summary><ul>${plan.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>`;
  }
  h += `<div class="day-strip">${plan.days.map((d) => {
    const dt = fromKey(d.date);
    return `<button class="day-chip ${d.date === day.date ? 'active' : ''} ${d.date === t ? 'today' : ''}" data-action="train-day" data-date="${d.date}" aria-label="${esc(niceDate(d.date))}: ${esc(d.name)}">
      <span>${DOW[dt.getDay()]}</span><b>${dt.getDate()}</b><i class="dot ${didWorkout(d.date) ? 'on' : ''}"></i></button>`;
  }).join('')}</div>`;
  h += renderDay(day);
  return h;
}

function renderDay(day) {
  const label = { lift: 'Lift', cardio: 'Cardio', rest: 'Rest' }[day.type] || cap(day.type);
  let h = `<section class="day-head">
    <div><h3>${esc(day.name)}</h3><div class="muted small">${niceDate(day.date)}${day.date === todayKey() ? ' · Today' : ''}</div></div>
    <span class="badge ${esc(day.type)}">${esc(label)}</span>
  </section>`;
  const exs = dayExercises(day);
  const f = ui.exForm && ui.exForm.date === day.date ? ui.exForm : null;
  h += exs.map((ex, i) => (f && f.i === i ? renderExForm(f) : renderExercise(day, ex, i))).join('');
  if (!exs.length && !day.cardio.length) h += '<div class="card muted">Rest day. Walk, stretch, recover.</div>';
  h += f && f.i === null ? renderExForm(f)
    : `<button class="btn full add-ex" data-action="ex-add" data-date="${day.date}">+ Add exercise</button>`;
  if (data.dayEdits[day.date]) h += `<button class="link-btn" data-action="ex-reset" data-date="${day.date}">↺ Undo my changes to this day</button>`;
  h += renderCardioSection(day);
  return h;
}

function renderExercise(day, ex, i) {
  const key = `${day.date}|${i}`;
  const done = setsFor(day.date, ex.name);
  const last = lastSession(ex.name, day.date);
  const open = ui.openEx === key;
  const complete = done.length >= ex.sets;
  let flag = '';
  if (complete && hitTop(done, ex)) flag = '<div class="flag good">💪 Top of the rep range on every set. Add 5–10 lb next time.</div>';
  else if (last && hitTop(last.sets, ex)) flag = '<div class="flag">⬆️ Last time you hit the top of the range on every set. Add 5–10 lb today.</div>';

  let h = `<article class="card ex ${complete ? 'complete' : ''} ${open ? 'open' : ''}" id="ex-${slug(key)}">
    <button class="ex-head" data-action="toggle-ex" data-key="${key}" aria-expanded="${open}">
      <div class="ex-main">
        <div class="ex-name">${esc(ex.name)}</div>
        <div class="ex-meta">${ex.sets} × ${esc(ex.reps)} · rest ${fmtSec(ex.restSec)}</div>
        ${ex.from ? `<div class="ex-tag">↔ instead of ${esc(ex.from)}</div>` : ex.added ? '<div class="ex-tag">+ added by you</div>' : ''}
      </div>
      <div class="ex-count ${complete ? 'done' : ''}">${complete ? `✓ ${done.length}` : `${done.length}/${ex.sets}`}</div>
    </button>
    <div class="ex-last">${last ? `Last time (${shortDate(last.date)}): <b>${last.sets.map(fmtSetShort).join(' · ')}</b>` : 'Last time: none yet. This is your first log.'}</div>
    ${flag}`;
  if (open) h += renderLogger(day, ex, i, key, done, last);
  return h + '</article>';
}

function renderLogger(day, ex, i, key, done, last) {
  const d = draftFor(key, ex, done, last);
  let h = '<div class="ex-body">';
  if (ex.start) h += `<div class="note"><b>Start:</b> ${esc(ex.start)}</div>`;
  if (ex.notes) h += `<div class="note"><b>Notes:</b> ${esc(ex.notes)}</div>`;
  if (done.length) {
    h += `<ol class="set-list">${done.map((s, n) => `<li>
      <span class="set-n">Set ${n + 1}</span>
      <span class="set-v">${fmtWeight(s.weight)} × ${s.reps}${s.rir != null ? `<small>RIR ${s.rir === 5 ? '5+' : s.rir}</small>` : ''}</span>
      <button class="icon-btn small danger" data-action="del-set" data-id="${s.id}" aria-label="Delete set ${n + 1}">✕</button>
    </li>`).join('')}</ol>`;
  }
  h += `<label class="field-label" for="w-${slug(key)}">Weight (lb) · 0 = bodyweight</label>
    <div class="stepper">
      <button class="step" data-action="step" data-key="${key}" data-field="weight" data-by="-5">−5</button>
      <input class="num" id="w-${slug(key)}" type="number" inputmode="decimal" step="any" min="0" data-draft="${key}" data-field="weight" value="${esc(d.weight)}" placeholder="0">
      <button class="step" data-action="step" data-key="${key}" data-field="weight" data-by="5">+5</button>
    </div>
    <label class="field-label" for="r-${slug(key)}">Reps</label>
    <div class="stepper">
      <button class="step" data-action="step" data-key="${key}" data-field="reps" data-by="-1">−1</button>
      <input class="num" id="r-${slug(key)}" type="number" inputmode="numeric" step="1" min="0" data-draft="${key}" data-field="reps" value="${esc(d.reps)}" placeholder="0">
      <button class="step" data-action="step" data-key="${key}" data-field="reps" data-by="1">+1</button>
    </div>
    <span class="field-label">Reps in reserve (RIR)</span>
    <div class="rir-row">${[0, 1, 2, 3, 4, 5].map((n) => `<button class="rir ${d.rir === n ? 'active' : ''}" data-action="rir" data-key="${key}" data-n="${n}">${n === 5 ? '5+' : n}</button>`).join('')}</div>
    <button class="btn primary big full" data-action="log-set" data-key="${key}" data-date="${day.date}" data-i="${i}">Log set ${done.length + 1}</button>
    <div class="row ex-tools">
      <button class="btn" data-action="ex-edit" data-date="${day.date}" data-i="${i}">↔ Swap</button>
      <button class="btn danger" data-action="ex-remove" data-date="${day.date}" data-i="${i}">Remove</button>
    </div>
  </div>`;
  return h;
}

function logSet(key, date, i) {
  const plan = activePlan();
  const day = plan && plan.days.find((d) => d.date === date);
  const ex = day && dayExercises(day)[i];
  if (!ex) return;
  const d = drafts[key] || {};
  const w = num(d.weight);
  const r = num(d.reps);
  if (w === null || w < 0) { toast('Enter the weight first (0 for bodyweight)'); return; }
  if (r === null || r < 0 || !Number.isInteger(r)) { toast('Enter how many reps you did'); return; }
  data.sets.push({ id: uid(), date, week: plan.week, exercise: ex.name, weight: w, reps: r, rir: d.rir, ts: Date.now() });
  save();
  const n = setsFor(date, ex.name).length;
  toast(n >= ex.sets ? `✓ ${ex.name} done!` : `Set ${n} logged`);
  startTimer(ex.restSec, ex.name);
  render();
}

/* Your changes to a day's exercises (swap, add, remove). They're kept apart from the plan itself,
   so they stay put even if the same week's plan gets imported again. */
const REST_CHOICES = [45, 60, 90, 120, 150, 180];
function exercisesOn(date, pd) {
  const e = data.dayEdits[date];
  return e ? e.exercises : pd ? pd.exercises : [];
}
const dayExercises = (day) => exercisesOn(day.date, day);
// The day as the Train tab shows it.
function trainDay(date) {
  const p = activePlan();
  return (p && p.days.find((d) => d.date === date)) || planDayFor(date);
}
// First change to a day: copy the plan's list so you can edit the copy.
function editableDay(day) {
  if (!data.dayEdits[day.date]) data.dayEdits[day.date] = { exercises: day.exercises.map((x) => ({ ...x })), removed: [] };
  return data.dayEdits[day.date];
}
const snapshotEdits = (date) => (data.dayEdits[date] ? JSON.parse(JSON.stringify(data.dayEdits[date])) : null);
function restoreEdits(date, snap) {
  if (snap) data.dayEdits[date] = snap; else delete data.dayEdits[date];
}
// The typed-in weight/reps are remembered by position, so clear them when the list changes.
function clearDrafts(date) {
  Object.keys(drafts).forEach((k) => { if (k.startsWith(`${date}|`)) delete drafts[k]; });
  ui.openEx = null;
}
function knownExerciseNames() {
  const names = new Map();
  for (const p of Object.values(data.plans)) for (const d of p.days) for (const e of d.exercises) names.set(norm(e.name), e.name);
  for (const e of Object.values(data.dayEdits)) for (const x of e.exercises) names.set(norm(x.name), x.name);
  for (const s of data.sets) names.set(norm(s.exercise), s.exercise);
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

function renderExForm(f) {
  const adding = f.i === null;
  return `<div class="card ex-form" id="ex-form">
    <h3>${adding ? 'Add an exercise' : 'Swap or change'}</h3>
    ${!adding && f.orig ? `<div class="muted small">The plan says: ${esc(f.orig)}</div>` : ''}
    <label class="field-label" for="exf-name">Exercise</label>
    <input class="text" id="exf-name" type="text" list="ex-names" data-exf="name" value="${esc(f.name)}" placeholder="e.g. Preacher curl" autocomplete="off" maxlength="60">
    <datalist id="ex-names">${knownExerciseNames().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <span class="field-label">Sets</span>
    <div class="stepper">
      <button class="step" data-action="exf-sets" data-by="-1">−1</button>
      <input class="num" type="number" inputmode="numeric" min="1" max="20" step="1" data-exf="sets" value="${esc(f.sets)}" aria-label="Sets">
      <button class="step" data-action="exf-sets" data-by="1">+1</button>
    </div>
    <label class="field-label" for="exf-reps">Reps</label>
    <input class="text" id="exf-reps" type="text" data-exf="reps" value="${esc(f.reps)}" placeholder="e.g. 8-10" autocomplete="off" maxlength="20">
    <span class="field-label">Rest between sets</span>
    <div class="rir-row">${REST_CHOICES.map((s) => `<button class="rir ${Number(f.restSec) === s ? 'active' : ''}" data-action="exf-rest" data-sec="${s}">${fmtSec(s)}</button>`).join('')}</div>
    <div class="row">
      <button class="btn" data-action="exf-cancel">Cancel</button>
      <button class="btn primary" data-action="exf-save">${adding ? 'Add' : 'Save'}</button>
    </div>
  </div>`;
}

function saveExForm() {
  const f = ui.exForm;
  const day = f && trainDay(f.date);
  if (!day) { ui.exForm = null; render(); return; }
  const name = String(f.name || '').replace(/\s+/g, ' ').trim();
  const sets = num(f.sets);
  if (!name) { toast('Type the exercise name'); return; }
  if (!Number.isInteger(sets) || sets < 1 || sets > 20) { toast('Sets should be a whole number from 1 to 20'); return; }
  const reps = String(f.reps || '').trim() || '8-12';
  const restSec = Math.round(num(f.restSec)) || 90;
  const ed = editableDay(day);
  let msg = 'Saved ✓';
  if (f.i === null) {
    ed.exercises.push({ name, sets, reps, restSec, start: '', notes: '', added: true });
    msg = `Added ${name}`;
  } else {
    const ex = ed.exercises[f.i];
    if (!ex) { ui.exForm = null; render(); return; }
    const oldName = ex.name;
    if (norm(oldName) !== norm(name)) {
      if (!ex.added) {
        const orig = ex.from || oldName;
        if (norm(orig) === norm(name)) delete ex.from; else ex.from = orig;
      }
      // Sets you already logged today under the old name move over to the new name.
      const moved = data.sets.filter((s) => s.date === f.date && norm(s.exercise) === norm(oldName));
      const shared = ed.exercises.some((x, j) => j !== f.i && norm(x.name) === norm(oldName));
      if (!shared) moved.forEach((s) => { s.exercise = name; });
      msg = `Swapped to ${name}${moved.length && !shared ? ` (moved ${plural(moved.length, 'logged set')})` : ''}`;
    }
    Object.assign(ex, { name, sets, reps, restSec });
  }
  save();
  clearDrafts(f.date);
  ui.exForm = null;
  render();
  toast(msg);
}

function removeExercise(date, i) {
  const day = trainDay(date);
  if (!day) return;
  const snap = snapshotEdits(date);
  const ed = editableDay(day);
  const [ex] = ed.exercises.splice(i, 1);
  if (!ex) { restoreEdits(date, snap); return; }
  if (!ex.added) ed.removed.push(ex.from || ex.name);
  save();
  clearDrafts(date);
  render();
  const n = setsFor(date, ex.name).length;
  toast(`Removed ${ex.name}${n ? ` (your ${plural(n, 'set')} stay saved)` : ''}`, {
    undo: () => { restoreEdits(date, snap); clearDrafts(date); save(); render(); },
  });
}

/* ---------- 6. Cardio log ---------- */
const cardioFor = (date) => data.cardio.filter((c) => c.date === date).sort((a, b) => a.ts - b.ts);
const cardioIco = (type) => (CARDIO_TYPES.find((t) => t.id === norm(type)) || CARDIO_TYPES[4]).ico;
function cardioLine(c) {
  let s = `${cap(c.type)} ${fmtNum(c.minutes)} min`;
  if (c.distance != null) s += `, ${fmtNum(c.distance)} ${c.unit || 'mi'}`;
  return s;
}
function renderCardioSection(day) {
  const logged = cardioFor(day.date);
  const form = ui.cardioForm && ui.cardioForm.date === day.date ? ui.cardioForm : null;
  if (!day.cardio.length && !logged.length && !form) {
    return `<button class="btn full log-cardio-btn" data-action="cardio-open" data-date="${day.date}">🚴 Log cardio</button>`;
  }
  let h = '<h4 class="section-label">Cardio</h4>';
  // Planned cardio from the coach: shows ✓ once you've logged that type.
  const used = {};
  h += day.cardio.map((c) => {
    const k = norm(c.type);
    used[k] = (used[k] || 0) + 1;
    const done = used[k] <= logged.filter((x) => norm(x.type) === k).length;
    return `<div class="card cardio-card ${done ? 'complete' : ''}">
      <div class="row-between"><b>${cardioIco(c.type)} ${esc(cap(c.type))}</b><span>${c.minutes ? `${esc(c.minutes)} min` : ''}${c.optional ? ' · optional' : ''}</span></div>
      ${c.notes ? `<div class="muted">${esc(c.notes)}</div>` : ''}
      ${done ? '<div class="done-tag">✓ Logged</div>'
        : `<button class="btn full" data-action="cardio-open" data-date="${day.date}" data-type="${esc(c.type)}" data-minutes="${esc(c.minutes)}">Log this ${esc(c.type.toLowerCase())}</button>`}
    </div>`;
  }).join('');
  h += logged.map((c) => `<div class="card cardio-entry">
    <div class="plan-row">
      <div>
        <b>${cardioIco(c.type)} ${esc(cap(c.type))}</b> · ${fmtNum(c.minutes)} min${c.distance != null ? ` · ${fmtNum(c.distance)} ${esc(c.unit)}` : ''}
        ${c.notes ? `<div class="muted small">${esc(c.notes)}</div>` : ''}
      </div>
      <button class="icon-btn small danger" data-action="cardio-del" data-id="${c.id}" aria-label="Delete cardio">✕</button>
    </div>
  </div>`).join('');
  h += form ? renderCardioForm(form)
    : `<button class="btn full log-cardio-btn" data-action="cardio-open" data-date="${day.date}">+ Log ${day.cardio.length || logged.length ? 'other ' : ''}cardio</button>`;
  return h;
}

function renderCardioForm(f) {
  const known = CARDIO_TYPES.some((t) => t.id === f.type);
  return `<div class="card cardio-form" id="cardio-form">
    <span class="field-label">Type</span>
    <div class="type-row">${CARDIO_TYPES.map((t) => `<button class="type-chip ${f.type === t.id || (!known && t.id === 'other') ? 'active' : ''}" data-action="cf-type" data-type="${t.id}"><span>${t.ico}</span>${t.label}</button>`).join('')}</div>
    <label class="field-label" for="cf-min">Minutes</label>
    <div class="stepper">
      <button class="step" data-action="cf-step" data-by="-5">−5</button>
      <input class="num" id="cf-min" type="number" inputmode="numeric" min="0" step="any" data-cf="minutes" value="${esc(f.minutes)}" placeholder="0">
      <button class="step" data-action="cf-step" data-by="5">+5</button>
    </div>
    <label class="field-label" for="cf-dist">Distance (optional)</label>
    <div class="quick">
      <input class="num sm" id="cf-dist" type="number" inputmode="decimal" step="any" min="0" data-cf="distance" value="${esc(f.distance)}" placeholder="0">
      <select class="select unit-select" data-cf="unit" aria-label="Distance unit">${DIST_UNITS.map((u) => `<option ${u === f.unit ? 'selected' : ''}>${u}</option>`).join('')}</select>
    </div>
    <label class="field-label" for="cf-notes">Notes (optional)</label>
    <input class="text" id="cf-notes" type="text" data-cf="notes" value="${esc(f.notes)}" placeholder="e.g. felt easy, could talk the whole time" autocomplete="off" maxlength="200">
    <div class="row">
      <button class="btn" data-action="cf-cancel">Cancel</button>
      <button class="btn primary" data-action="cf-save">Save cardio</button>
    </div>
  </div>`;
}

function openCardioForm(date, type, minutes) {
  const t = norm(type) || 'bike';
  const r = parseRange(minutes || '');
  ui.cardioForm = {
    date, type: t, minutes: r ? String(r.lo) : '', distance: '', unit: t === 'swim' ? 'yd' : 'mi',
    notes: '',
  };
  render();
  const f = $('#cardio-form');
  if (f) f.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function saveCardio() {
  const f = ui.cardioForm;
  if (!f) return;
  const m = num(f.minutes);
  const dist = num(f.distance);
  if (m === null || m <= 0) { toast('Enter how many minutes'); return; }
  const entry = {
    id: uid(), date: f.date, type: f.type, minutes: m,
    distance: dist !== null && dist > 0 ? dist : null, unit: f.unit,
    notes: String(f.notes || '').trim(), ts: Date.now(),
  };
  data.cardio.push(entry);
  save();
  ui.cardioForm = null;
  render();
  toast('Cardio saved ✓');
}

/* ---------- 7. Rest timer ---------- */
const timer = { end: null, total: 0, label: '', alerted: false };
let timerInterval = null;
let wakeLock = null;
let audioCtx = null;

// Phones only allow sound after you tap something, so we "unlock" audio on the Log-set tap.
function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx && AC) audioCtx = new AC();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* no sound available */ }
}
function beep() {
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((o) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + o);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + o + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o + 0.18);
      osc.connect(g).connect(audioCtx.destination);
      osc.start(t0 + o);
      osc.stop(t0 + o + 0.2);
    });
  } catch (e) { /* ignore */ }
}
// Keeps the screen from going dark while resting (supported on most newer phones).
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { wakeLock = null; }
}

function startTimer(sec, label) {
  if (!sec) return;
  timer.end = Date.now() + sec * 1000;
  timer.total = sec;
  timer.label = label;
  timer.alerted = false;
  saveUi();
  keepAwake(true);
  runTimer();
}
function stopTimer() {
  timer.end = null;
  clearInterval(timerInterval);
  timerInterval = null;
  saveUi();
  keepAwake(false);
  renderTimer();
}
function adjustTimer(by) {
  if (!timer.end) return;
  const now = Date.now();
  timer.end = Math.max(now, timer.end) + by * 1000;
  if (timer.end > now) timer.alerted = false;
  timer.total = Math.max(timer.total, (timer.end - now) / 1000);
  saveUi();
  runTimer();
}
function runTimer() {
  clearInterval(timerInterval);
  renderTimer();
  timerInterval = setInterval(renderTimer, 250);
}
function renderTimer() {
  const el = $('#timer');
  if (!timer.end) {
    el.classList.add('hidden');
    document.body.classList.remove('has-timer');
    return;
  }
  el.classList.remove('hidden');
  document.body.classList.add('has-timer');
  const left = (timer.end - Date.now()) / 1000;
  if (left <= 0) {
    if (!timer.alerted) {
      timer.alerted = true;
      beep();
      if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    }
    el.classList.add('done');
    $('#timer-time').textContent = 'GO';
    $('#timer-label').textContent = 'Rest is over. Next set!';
    $('#timer-fill').style.width = '100%';
    if (left < -90) stopTimer(); // hide by itself 90 s after it ends
  } else {
    el.classList.remove('done');
    $('#timer-time').textContent = fmtSec(Math.ceil(left));
    $('#timer-label').textContent = `Rest · ${timer.label}`;
    $('#timer-fill').style.width = `${Math.min(100, (1 - left / timer.total) * 100)}%`;
  }
}

/* ---------- 8. Daily checklist ---------- */
const dayRec = (date) => data.daily[date] || {};
function setDaily(date, field, value) {
  const r = data.daily[date] || (data.daily[date] = {});
  if (value === null || value === undefined || value === false) delete r[field];
  else r[field] = value;
  if (!Object.keys(r).length) delete data.daily[date];
  save();
}
// Plan items the app handles itself (or that you turned off), so they don't show twice.
const isBuiltIn = (text) => /10,?000\s*steps|back pain|weigh|waist|protein|calorie/i.test(text);
function planChecklist(date) {
  const pd = planDayFor(date);
  return pd ? pd.checklist.filter((x) => !isBuiltIn(x)) : [];
}
function checklistItems(date) {
  const r = dayRec(date);
  const checks = r.checks || {};
  return [!!r.steps, ...planChecklist(date).map((x) => !!checks[x]), ...extrasFor(date).map((x) => !!x.done)];
}
function weekAvg(field, mon) {
  const vals = weekDates(mon).map((d) => dayRec(d)[field]).filter((v) => v != null && v !== 0);
  return vals.length ? { avg: sum(vals) / vals.length, n: vals.length } : null;
}
// Your most recent weigh-ins, newest first (looks back up to 60 days).
function recentWeights(date, days = 60) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(date, -i);
    const r = data.daily[d];
    if (r && r.weight != null) out.push({ date: d, weight: r.weight });
  }
  return out;
}

function summaryHtml(date) {
  const items = checklistItems(date);
  const n = items.filter(Boolean).length;
  const all = n === items.length;
  return `<div class="ring-row">
      <div class="ring ${all ? 'ok' : ''}" style="--p:${(n / items.length) * 100}"><span>${n}/${items.length}</span></div>
      <div><b class="ring-title">${all ? 'All done 🎉' : n === 0 ? 'Let\'s get going' : 'Keep it up'}</b>
        <div class="muted small">${n} of ${items.length} done today</div></div>
    </div>`;
}

function renderWeighIn(date) {
  const r = dayRec(date);
  const recent = recentWeights(date);
  const week = recent.filter((w) => w.date > addDays(date, -7));
  const avg = week.length ? sum(week.map((w) => w.weight)) / week.length : null;
  const last = recent.find((w) => w.date !== date);
  let h = `<div class="card weigh" id="weigh">
    <div class="row-between"><b>⚖️ Weigh-in <span class="muted small">(optional)</span></b>
      <span class="muted small">${avg != null ? `7-day avg <b>${fmtNum(avg)} lb</b>` : ''}</span></div>`;
  if (ui.weighOpen) {
    h += `<div class="quick">
        <input class="num sm" id="weigh-in" type="number" inputmode="decimal" step="any" min="0" value="${r.weight ?? ''}" placeholder="${last ? fmtNum(last.weight) : '165.0'}" aria-label="Weight in pounds">
        <span class="unit">lb</span>
        <button class="btn primary" data-action="weigh-save">Save</button>
      </div>
      <div class="row"><button class="btn" data-action="weigh-cancel">Cancel</button>${r.weight != null ? '<button class="btn danger" data-action="weigh-clear">Remove</button>' : ''}</div>`;
  } else if (r.weight != null) {
    h += `<button class="weigh-val" data-action="weigh-open"><b>${fmtNum(r.weight)}</b> lb <span class="muted small">· tap to change</span></button>`;
  } else {
    h += `<button class="btn full" data-action="weigh-open">+ Log my weight</button>
      <div class="muted small" style="margin-top:6px">${last ? `Last: ${fmtNum(last.weight)} lb (${relDay(last.date)})` : 'Whenever you get the chance. Morning, after the bathroom, is most consistent.'}</div>`;
  }
  return `${h}</div>`;
}

/* ---------- 8b. Today's schedule ----------
   The coach's blocks come from the plan. Blocks you add are saved separately (data.myBlocks),
   so re-importing the week only replaces the coach's blocks. Check-offs are saved per day. */
function blocksFor(date) {
  const pd = planDayFor(date);
  const coach = (pd && Array.isArray(pd.schedule) ? pd.schedule : []).filter((b) => isHM(b.start))
    .map((b) => ({ ...b, key: `c|${b.start}|${b.label}`, mine: false }));
  const mine = (data.myBlocks[date] || []).map((b) => ({ ...b, key: `m|${b.id}`, mine: true }));
  return [...coach, ...mine].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.mine - b.mine));
}
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
// Where a block is compared with the clock: 'now', 'past' or 'later'.
// A block with no end time (like "Evening milk") counts as "now" for 30 minutes.
function blockState(b, date) {
  const t = todayKey();
  if (date < t) return 'past';
  if (date > t) return 'later';
  const n = nowMin();
  const s = hmMin(b.start);
  if (n < s) return 'later';
  let e = isHM(b.end) ? hmMin(b.end) : s + 30;
  if (e <= s) e = 1440; // runs past midnight
  return n < e ? 'now' : 'past';
}
const blockTime = (b) => `${fmtHM(b.start)}${b.end ? ` – ${fmtHM(b.end)}` : ''}`;
const minsText = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);
const targetsFor = (date) => { const p = planForWeek(mondayOf(date)); return (p && p.targets) || null; };

function renderNowNext(date) {
  const bs = blocksFor(date);
  const tg = targetsFor(date);
  const bits = tg ? [tg.wake ? `⏰ Wake ${fmtHM(tg.wake)}` : '', tg.bedtime ? `🛏 Bed ${fmtHM(tg.bedtime)}` : '', tg.weeklyLossLb ? `⚖️ −${fmtNum(tg.weeklyLossLb)} lb/week` : ''].filter(Boolean) : [];
  const tgLine = bits.length ? `<div class="tg-line">${bits.join('<span class="dotsep">·</span>')}</div>` : '';
  if (date !== todayKey() || !bs.length) return tgLine ? `<div class="card nownext">${tgLine}</div>` : '';
  const now = bs.filter((b) => blockState(b, date) === 'now').pop() || null;
  const n = nowMin();
  const next = bs.find((b) => hmMin(b.start) > n && b !== now) || null;
  const line = (tag, b, sub) => `<div class="nn-row"><span class="nn-tag ${tag === 'Now' ? 'on' : ''}">${tag}</span>
    <div class="nn-main"><b>${esc(b.label)}${b.locked ? ' 🔒' : ''}</b><span class="muted small">${sub}</span></div></div>`;
  let h = '<div class="card nownext">';
  h += now ? line('Now', now, now.end ? `until ${fmtHM(now.end)}` : `at ${fmtHM(now.start)}`)
    : '<div class="nn-row"><span class="nn-tag">Now</span><div class="nn-main"><b>Free</b><span class="muted small">Nothing scheduled right now</span></div></div>';
  h += next ? line('Next', next, `${fmtHM(next.start)} · in ${minsText(hmMin(next.start) - n)}`)
    : '<div class="nn-row"><span class="nn-tag">Next</span><div class="nn-main"><span class="muted">Nothing else on the schedule today</span></div></div>';
  return `${h}${tgLine}</div>`;
}

function blockRow(b, date, done) {
  const st = blockState(b, date);
  const on = !!done[b.key];
  return `<div class="blk ${st} ${on ? 'on' : ''}">
    <button class="blk-check" data-action="block-toggle" data-key="${esc(b.key)}" aria-label="Mark ${esc(b.label)} done"><span class="box">${on ? '✓' : ''}</span></button>
    <div class="blk-main">
      <span class="blk-time">${blockTime(b)}${st === 'now' ? ' <span class="now-tag">NOW</span>' : ''}</span>
      <b>${esc(b.label)}${b.locked ? ' <span title="Locked">🔒</span>' : ''}</b>
      ${b.mine ? '<span class="mine-tag">mine</span>' : ''}
    </div>
    ${b.mine ? `<button class="icon-btn small" data-action="block-edit" data-id="${esc(b.id)}" aria-label="Edit ${esc(b.label)}">✎</button>` : ''}
  </div>`;
}

function renderBlockForm(f) {
  return `<div class="sub-form" id="block-form">
    <h3>${f.id ? 'Edit your block' : 'Add a block'}</h3>
    <label class="field-label" for="bf-label">What</label>
    <input class="text" id="bf-label" type="text" data-bf="label" value="${esc(f.label)}" placeholder="e.g. DoorDash, Call mom" maxlength="60" autocomplete="off">
    <div class="two">
      <div><label class="field-label" for="bf-start">Start</label><input class="text" id="bf-start" type="time" data-bf="start" value="${esc(f.start)}"></div>
      <div><label class="field-label" for="bf-end">End (optional)</label><input class="text" id="bf-end" type="time" data-bf="end" value="${esc(f.end)}"></div>
    </div>
    <span class="field-label">Can it move?</span>
    <div class="opts3 two-col">
      <button class="opt ${f.locked ? 'active' : ''}" data-action="bf-locked" data-v="1">🔒 Locked</button>
      <button class="opt ${!f.locked ? 'active' : ''}" data-action="bf-locked" data-v="0">Flexible</button>
    </div>
    <div class="muted small" style="margin-top:6px">Locked = class, work, things you can't move.</div>
    <div class="row">
      ${f.id ? '<button class="btn danger" data-action="bf-delete">Delete</button>' : ''}
      <button class="btn" data-action="bf-cancel">Cancel</button>
      <button class="btn primary" data-action="bf-save">Save</button>
    </div>
  </div>`;
}

function renderSchedule(date) {
  const bs = blocksFor(date);
  const done = dayRec(date).blocks || {};
  const nDone = bs.filter((b) => done[b.key]).length;
  const f = ui.blockForm && ui.blockForm.date === date ? ui.blockForm : null;
  let h = `<div class="card sched" id="sched">
    <div class="row-between"><b>🗓 Schedule</b><span class="muted small">${bs.length ? `${nDone} of ${bs.length} done` : ''}</span></div>`;
  if (!bs.length && !f) h += `<p class="muted small">Nothing scheduled${planDayFor(date) ? '' : ' (no plan covers this day)'}. Add your own blocks below.</p>`;
  h += bs.map((b) => (f && f.id && b.mine && b.id === f.id ? renderBlockForm(f) : blockRow(b, date, done))).join('');
  h += f && !f.id ? renderBlockForm(f) : '<button class="btn full" data-action="block-new">+ Add a block</button>';
  return `${h}</div>`;
}

function saveBlockForm() {
  const f = ui.blockForm;
  const label = String(f.label || '').trim();
  if (!label) { toast('Give the block a name'); return; }
  if (!isHM(f.start)) { toast('Pick a start time'); return; }
  if (f.end && !isHM(f.end)) { toast('That end time doesn\'t look right'); return; }
  const list = data.myBlocks[f.date] || (data.myBlocks[f.date] = []);
  const fields = { start: f.start, end: f.end || '', label, locked: !!f.locked };
  if (f.id) {
    const b = list.find((x) => x.id === f.id);
    if (b) Object.assign(b, fields);
  } else list.push({ id: uid(), ...fields });
  save();
  ui.blockForm = null;
  render();
  toast('Block saved ✓');
}

/* ---------- 8d. The Today tab ---------- */
const extrasFor = (date) => (Array.isArray(dayRec(date).extras) ? dayRec(date).extras : []);

function renderChecklist() {
  const t = todayKey();
  const date = ui.checkDate || t;
  const r = dayRec(date);
  const checks = r.checks || {};
  const checkRow = (on, attrs, label, extra = '') => `<div class="check-wrap"><button class="check-row ${on ? 'on' : ''}" ${attrs}><span class="box">${on ? '✓' : ''}</span><span>${label}</span></button>${extra}</div>`;
  const sub = date === t ? niceDate(date) : date < t ? 'Editing a past day' : 'Upcoming';

  let h = `<section class="date-nav">
    <button class="icon-btn" data-action="check-day" data-by="-1" aria-label="Previous day">‹</button>
    <div class="week-title"><h2>${date === t ? 'Today' : niceDate(date)}</h2><div class="muted small">${sub}</div></div>
    <button class="icon-btn" data-action="check-day" data-by="1" ${date >= addDays(t, 13) ? 'disabled' : ''} aria-label="Next day">›</button>
  </section>`;
  h += renderNowNext(date);
  h += renderSchedule(date);

  h += `<h4 class="section-label">Checklist</h4>
  <div class="card" id="check-summary">${summaryHtml(date)}</div>`;
  h += checkRow(!!r.steps, 'data-action="toggle-daily" data-field="steps"', 'Walk 10,000 steps');
  h += planChecklist(date).map((x) => checkRow(!!checks[x], `data-action="toggle-check" data-text="${esc(x)}"`, esc(x))).join('');
  h += extrasFor(date).map((x) => checkRow(!!x.done, `data-action="extra-toggle" data-id="${esc(x.id)}"`, `${esc(x.text)} <span class="mine-tag">just today</span>`,
    `<button class="icon-btn small" data-action="extra-del" data-id="${esc(x.id)}" aria-label="Remove ${esc(x.text)}">✕</button>`)).join('');
  h += `<form class="extra-form" data-form="extra">
      <input class="text" id="extra-text" type="text" placeholder="Add an item just for ${date === t ? 'today' : 'this day'}" maxlength="120" autocomplete="off" enterkeyhint="done" aria-label="New checklist item">
      <button class="btn" type="submit">Add</button>
    </form>`;

  if (date <= t) h += renderWeighIn(date);
  return h;
}

/* ---------- 9. Goals & to-do list ---------- */
const goalUnit = (g) => GOAL_KINDS[g.kind].unit;
const goalActive = (g, t = todayKey()) => !g.until || t <= g.until;
const goalAmount = (g, date) => (g.kind === 'workouts' ? (didWorkout(date) ? 1 : 0) : Number(g.log[date]) || 0);
const goalTargetText = (g) => `${fmtNum(g.target)} ${goalUnit(g)} a ${g.period === 'day' ? 'day' : 'week'}`;
// Days of a week that count for a goal (not before it started, not after it ends, not in the future).
function goalDays(g, mon, upTo) {
  return weekDates(mon).filter((d) => d <= upTo && (!g.until || d <= g.until) && (g.kind === 'workouts' || !g.created || d >= g.created));
}
function goalWeek(g, mon, upTo = todayKey()) {
  const days = goalDays(g, mon, upTo);
  if (g.period === 'day') {
    return { hit: days.filter((d) => goalAmount(g, d) >= g.target).length, days: days.length, total: sum(days.map((d) => goalAmount(g, d))) };
  }
  const done = sum(days.map((d) => goalAmount(g, d)));
  return { done, met: done >= g.target };
}

function renderGoalCard(g) {
  const t = todayKey();
  const mon = mondayOf(t);
  const active = goalActive(g, t);
  const left = g.until ? Math.round((fromKey(g.until) - fromKey(t)) / 86400000) : null;
  const when = !g.until ? 'ongoing' : active ? `until ${shortDate(g.until)} (${left === 0 ? 'last day' : plural(left, 'day') + ' left'})` : `ended ${shortDate(g.until)}`;
  let body = '';
  if (g.period === 'day') {
    const today = goalAmount(g, t);
    if (active) {
      body += `<div class="row-between goal-line"><span>Today</span><span><b>${fmtNum(today)}</b> / ${fmtNum(g.target)} ${goalUnit(g)}${today >= g.target ? ' ✓' : ''}</span></div>
        <div class="bar ${today >= g.target ? 'ok' : ''}"><i style="width:${Math.min(100, (today / g.target) * 100)}%"></i></div>`;
    }
    body += `<div class="week-dots">${weekDates(mon).map((d) => {
      const counts = goalDays(g, mon, t).includes(d);
      const state = !counts ? 'off' : goalAmount(g, d) >= g.target ? 'hit' : d === t ? 'today' : 'miss';
      return `<span class="wd ${state}"><small>${dayName(d).charAt(0)}</small>${state === 'hit' ? '✓' : ''}</span>`;
    }).join('')}</div>`;
  } else {
    const w = goalWeek(g, mon, t);
    body += `<div class="row-between goal-line"><span>This week</span><span><b>${fmtNum(w.done)}</b> / ${fmtNum(g.target)} ${goalUnit(g)}${w.met ? ' ✓' : ''}</span></div>
      <div class="bar ${w.met ? 'ok' : ''}"><i style="width:${Math.min(100, (w.done / g.target) * 100)}%"></i></div>`;
  }
  let btns = '';
  if (active && g.kind === 'minutes') btns = [-15, 15, 30, 60].map((n) => `<button class="chip-btn" data-action="goal-log" data-id="${g.id}" data-by="${n}">${n > 0 ? '+' : '−'}${Math.abs(n)}</button>`).join('');
  if (active && g.kind === 'count') btns = [-1, 1].map((n) => `<button class="chip-btn grow" data-action="goal-log" data-id="${g.id}" data-by="${n}">${n > 0 ? '+1' : '−1'}</button>`).join('');
  return `<div class="card goal cat-${slug(g.category || 'Personal')}">
    <div class="row-between"><b class="goal-title">${esc(g.title)}</b><button class="link-btn tight" data-action="goal-edit" data-id="${g.id}">Edit</button></div>
    <div class="muted small">${esc(goalTargetText(g))} · ${esc(when)}</div>
    ${body}
    ${btns ? `<div class="quick">${btns}</div>` : ''}
    ${g.kind === 'workouts' ? '<div class="muted small goal-note">Counts every day you log a lift or cardio.</div>' : ''}
  </div>`;
}

function renderGoalForm(f) {
  return `<div class="card goal-form" id="goal-form">
    <h3>${f.id ? 'Edit goal' : 'New recurring goal'}</h3>
    <label class="field-label" for="gf-title">Goal</label>
    <input class="text" id="gf-title" type="text" data-gf="title" value="${esc(f.title)}" placeholder="e.g. Study for Materials" autocomplete="off" maxlength="80">
    <label class="field-label" for="gf-cat">Category</label>
    <div class="row" style="margin-top:0"><select class="select" id="gf-cat" data-gf="category">${CATEGORIES.map((c) => `<option ${c === f.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <span class="field-label">How to track it</span>
    <div class="opts">${Object.entries(GOAL_KINDS).map(([k, v]) => `<button class="opt ${f.kind === k ? 'active' : ''}" data-action="gf-kind" data-kind="${k}">${v.label}</button>`).join('')}</div>
    <label class="field-label" for="gf-target">Target</label>
    <div class="quick">
      <input class="num sm" id="gf-target" type="number" inputmode="numeric" min="1" step="any" data-gf="target" value="${esc(f.target)}">
      <span class="unit wide">${GOAL_KINDS[f.kind].unit}</span>
      ${f.kind === 'workouts' ? '<span class="unit wide">a week</span>'
        : `<select class="select" data-gf="period" aria-label="Per day or week"><option value="day" ${f.period === 'day' ? 'selected' : ''}>a day</option><option value="week" ${f.period === 'week' ? 'selected' : ''}>a week</option></select>`}
    </div>
    <label class="field-label" for="gf-until">Until (optional)</label>
    <input class="text" id="gf-until" type="date" data-gf="until" value="${esc(f.until)}">
    <div class="row">
      ${f.id ? '<button class="btn danger" data-action="gf-delete">Delete</button>' : ''}
      <button class="btn" data-action="gf-cancel">Cancel</button>
      <button class="btn primary" data-action="gf-save">Save</button>
    </div>
  </div>`;
}

function saveGoalForm() {
  const f = ui.goalForm;
  const title = String(f.title || '').trim();
  const target = num(f.target);
  if (!title) { toast('Give the goal a name'); return; }
  if (target === null || target <= 0) { toast('Set a target above 0'); return; }
  if (f.until && !isDateKey(f.until)) { toast('That end date doesn\'t look right'); return; }
  const fields = {
    title, category: f.category, kind: f.kind,
    period: f.kind === 'workouts' ? 'week' : f.period, target, until: f.until || '',
    hidden: !!f.hidden,
  };
  if (f.id) {
    const g = data.goals.find((x) => x.id === f.id);
    if (g) Object.assign(g, fields);
  } else {
    data.goals.push({ id: uid(), created: todayKey(), log: {}, ...fields });
  }
  save();
  ui.goalForm = null;
  render();
  toast('Goal saved ✓');
}

function renderGoals() {
  if (ui.pin) return renderPinPad();
  if (ui.privView && unlocked) return renderPrivate();
  const t = todayKey();
  const goals = data.goals.filter((g) => !g.hidden);
  const active = goals.filter((g) => goalActive(g, t));
  const ended = goals.filter((g) => !goalActive(g, t));
  const form = ui.goalForm && !ui.goalForm.hidden ? ui.goalForm : null;
  let h = `<div class="row-between"><h2>Goals</h2><span class="muted small">${niceDate(t)}</span></div>`;
  h += renderTimes(false);
  if (form) h += renderGoalForm(form);
  h += active.map(renderGoalCard).join('');
  if (!goals.length && !form) {
    h += `<div class="card muted small">Recurring goals track things like “work out 4 days a week” or “study 1 hour a day”, and show how you're doing this week.
      <br><button class="link-btn" data-action="goal-examples">Add those two to start</button></div>`;
  }
  if (!form) h += '<button class="btn full" data-action="goal-new">+ New recurring goal</button>';
  if (ended.length) h += `<details class="ended"><summary>Ended goals (${ended.length})</summary>${ended.map(renderGoalCard).join('')}</details>`;
  h += `<div class="section"><h3 class="section-title">To-Do today</h3>${renderTodoBody(false)}</div>`;
  h += '<div class="lock-spot"><button class="lock-btn" data-action="priv-open" aria-label="Private">🔒</button></div>';
  return h;
}

function renderTodoBody(hidden = false) {
  const t = todayKey();
  const f = ui.todoFilter;
  const match = (x) => f === 'All' || x.category === f;
  const todos = data.todos.filter((x) => !!x.hidden === hidden);
  const open = todos.filter((x) => !x.done && x.date <= t)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created || 0) - (b.created || 0)));
  const doneToday = todos.filter((x) => x.done && x.doneDate === t);

  const row = (x) => `<div class="todo cat-${slug(x.category || 'Personal')} ${x.done ? 'done' : ''}">
    <button class="todo-check" data-action="todo-toggle" data-id="${x.id}">
      <span class="box">${x.done ? '✓' : ''}</span>
      <span class="todo-text">${esc(x.text)}<small>${esc(x.category || 'Personal')}${!x.done && x.date < t ? ` · <span class="carried">↻ carried over from ${esc(relDay(x.date))}</span>` : ''}</small></span>
    </button>
    <button class="icon-btn small" data-action="todo-del" data-id="${x.id}" aria-label="Delete">✕</button>
  </div>`;

  const shown = open.filter(match);
  let h = `<form class="card" data-form="todo">
    <input id="todo-text" class="text" type="text" placeholder="Add something to do today…" autocomplete="off" enterkeyhint="done" maxlength="200" aria-label="New to-do">
    <div class="row">
      <select id="todo-cat" class="select" aria-label="Category">${CATEGORIES.map((c) => `<option ${c === ui.todoCat ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <button class="btn primary" type="submit">Add</button>
    </div>
  </form>
  <div class="chips">${['All', ...CATEGORIES].map((c) => {
    const n = c === 'All' ? open.length : open.filter((x) => x.category === c).length;
    return `<button class="chip ${f === c ? 'active' : ''}" data-action="todo-filter" data-cat="${esc(c)}">${esc(c)}${n ? ` <small>${n}</small>` : ''}</button>`;
  }).join('')}</div>`;
  h += shown.length ? shown.map(row).join('')
    : `<div class="card muted">${open.length ? 'Nothing left in this category.' : 'Nothing on the list. Add something above.'}</div>`;
  const doneShown = doneToday.filter(match);
  if (doneShown.length) h += `<h4 class="section-label">Done today (${doneShown.length})</h4>${doneShown.map(row).join('')}`;
  h += '<p class="muted small">Anything you don\'t finish rolls over to tomorrow automatically.</p>';
  return h;
}

function addTodo() {
  const input = $('#todo-text');
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  const cat = $('#todo-cat').value;
  ui.todoCat = cat;
  if (ui.todoFilter !== 'All' && ui.todoFilter !== cat) ui.todoFilter = 'All';
  saveUi();
  const todo = { id: uid(), text, category: cat, date: todayKey(), done: false, doneDate: null, created: Date.now() };
  if (ui.privView && unlocked) todo.hidden = true;
  data.todos.push(todo);
  save();
  render();
  const again = $('#todo-text');
  if (again) again.focus(); // keep the keyboard up so you can add several in a row
}

/* ---------- 9b. Time goals ("out of the apartment by 8:30", "woke up at…") ---------- */
// A day of times runs until 4 am, so putting your phone away at 12:30 am still counts for the night before.
const TIME_DAY_ENDS_H = 4;
const timeDay = () => toKey(new Date(Date.now() - TIME_DAY_ENDS_H * 3600000));
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const timeOn = (x, date) => (x.once ? x.once === date : x.days.includes(fromKey(date).getDay()) && (!x.created || date >= x.created));
// Minutes late (+) or early (−) compared with the goal time. Works across midnight.
function minutesOff(x, actual) {
  if (!isHM(x.target) || !isHM(actual)) return null;
  let d = hmMin(actual) - hmMin(x.target);
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  return d;
}
const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
function offText(d) {
  if (d === null) return '';
  if (d === 0) return '<span class="good-text">right on time</span>';
  return d < 0 ? `<span class="good-text">${fmtMins(-d)} early</span>` : `<span class="warn-text">${fmtMins(d)} late</span>`;
}
function avgHM(list) {
  let m = list.map(hmMin);
  // Around midnight (e.g. 11:50 pm and 12:20 am), count the after-midnight ones as late night.
  if (m.some((v) => v >= 18 * 60) && m.some((v) => v < 6 * 60)) m = m.map((v) => (v < 6 * 60 ? v + 1440 : v));
  return minHM(sum(m) / m.length);
}
function timeWeek(x, mon, upTo) {
  const days = weekDates(mon).filter((d) => d <= upTo && timeOn(x, d));
  const logged = days.filter((d) => isHM(x.log[d]));
  const offs = logged.map((d) => minutesOff(x, x.log[d])).filter((v) => v !== null);
  return { days, logged, onTime: offs.filter((v) => v <= 0).length, avg: logged.length ? avgHM(logged.map((d) => x.log[d])) : null };
}
function daysText(x) {
  if (x.once) return `only ${niceDate(x.once)}`;
  const s = x.days.slice().sort().join('');
  if (s === '0123456') return 'every day';
  if (s === '12345') return 'weekdays';
  if (s === '06') return 'weekends';
  return [1, 2, 3, 4, 5, 6, 0].filter((n) => x.days.includes(n)).map((n) => DOW[n]).join(', ');
}

function timeRow(x, date, live) {
  if (ui.timeForm && ui.timeForm.id === x.id) return renderTimeForm(ui.timeForm);
  const actual = live ? x.log[date] : null;
  const off = minutesOff(x, actual);
  let sub = x.target ? `Goal ${fmtHM(x.target)}` : 'Just recording the time';
  if (off !== null) sub += ` · ${offText(off)}`;
  if (!live) sub = `${x.target ? `Goal ${fmtHM(x.target)} · ` : ''}${daysText(x)}`;
  let wk = '';
  if (live) {
    const w = timeWeek(x, mondayOf(date), date);
    if (w.logged.length >= 2) {
      wk = x.target ? `This week: on time ${w.onTime} of ${w.logged.length} · avg ${fmtHM(w.avg)}` : `This week: avg ${fmtHM(w.avg)} (${w.logged.length} days)`;
    }
  }
  const right = !live ? ''
    : isHM(actual)
      ? `<input class="time-in" type="time" data-time-id="${esc(x.id)}" value="${actual}" aria-label="Time for ${esc(x.title)}">
         <button class="icon-btn small" data-action="time-clear" data-id="${esc(x.id)}" aria-label="Clear time">✕</button>`
      : `<button class="btn primary now-btn" data-action="time-now" data-id="${esc(x.id)}">Now</button>`;
  return `<div class="time-row ${isHM(actual) ? (off !== null && off > 0 ? 'late' : 'ok') : ''}">
    <button class="time-txt" data-action="time-edit" data-id="${esc(x.id)}" aria-label="Edit ${esc(x.title)}">
      <b>${esc(x.title)} <span class="edit-ico">✎</span></b>
      <span class="muted small">${sub}</span>
      ${wk ? `<span class="muted small">${wk}</span>` : ''}
    </button>
    ${right}
  </div>`;
}

function renderTimes(hidden) {
  const date = timeDay();
  const all = data.times.filter((x) => !!x.hidden === hidden);
  const key = (x) => x.target || '00:00'; // no goal time (like "Woke up") goes first
  const todays = all.filter((x) => timeOn(x, date)).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const others = all.filter((x) => !timeOn(x, date) && !(x.once && x.once < date));
  const newForm = ui.timeForm && !ui.timeForm.id && !!ui.timeForm.hidden === hidden;
  let h = `<div class="card times">
    <div class="row-between"><b>⏰ Times</b><span class="muted small">${date === todayKey() ? 'today' : `${niceDate(date)} (until 4 am)`}</span></div>`;
  h += todays.map((x) => timeRow(x, date, true)).join('');
  if (!all.length && !newForm) {
    h += `<p class="muted small">Set a time you want to do something by, then tap <b>Now</b> when you do it. Leave the goal time empty to just record a time, like when you woke up.</p>
      ${hidden ? '' : '<button class="link-btn" data-action="time-examples">Add: Woke up · Out of the apartment by 8:30 am · Phone put away by 9:30 pm</button>'}`;
  } else if (!todays.length && !newForm) {
    h += '<p class="muted small">Nothing set for today.</p>';
  }
  h += newForm ? renderTimeForm(ui.timeForm)
    : `<button class="btn full" data-action="time-new" ${hidden ? 'data-hidden="1"' : ''}>+ Add a time</button>`;
  if (others.length) h += `<details class="ended"><summary>Not on today (${others.length})</summary>${others.map((x) => timeRow(x, date, false)).join('')}</details>`;
  return `${h}</div>`;
}

function renderTimeForm(f) {
  const presets = [['all', 'Every day', !f.once && f.days.length === 7], ['week', 'Weekdays', !f.once && f.days.slice().sort().join('') === '12345'], ['once', 'Today only', !!f.once]];
  return `<div class="time-form" id="time-form">
    <h3>${f.id ? 'Edit time' : 'New time'}</h3>
    <label class="field-label" for="tf-title">What</label>
    <input class="text" id="tf-title" type="text" data-tf="title" value="${esc(f.title)}" placeholder="e.g. Out of the apartment" maxlength="60" autocomplete="off">
    <label class="field-label" for="tf-target">Goal time (optional)</label>
    <div class="quick" style="margin-top:0">
      <input class="text time-goal" id="tf-target" type="time" data-tf="target" value="${esc(f.target)}">
      ${f.target ? '<button class="btn" data-action="tf-notarget">No goal</button>' : ''}
    </div>
    <div class="muted small" style="margin-top:6px">No goal time = just record when (like waking up).</div>
    <span class="field-label">Which days</span>
    <div class="opts3">${presets.map(([p, label, on]) => `<button class="opt ${on ? 'active' : ''}" data-action="tf-preset" data-p="${p}">${label}</button>`).join('')}</div>
    ${f.once ? '' : `<div class="dow-row">${[1, 2, 3, 4, 5, 6, 0].map((n) => `<button class="rir ${f.days.includes(n) ? 'active' : ''}" data-action="tf-day" data-n="${n}" aria-label="${DOW[n]}">${DOW[n].slice(0, 2)}</button>`).join('')}</div>`}
    <div class="row">
      ${f.id ? '<button class="btn danger" data-action="tf-delete">Delete</button>' : ''}
      <button class="btn" data-action="tf-cancel">Cancel</button>
      <button class="btn primary" data-action="tf-save">Save</button>
    </div>
  </div>`;
}

function saveTimeForm() {
  const f = ui.timeForm;
  const title = String(f.title || '').trim();
  if (!title) { toast('Give it a name, like "Out of the apartment"'); return; }
  if (f.target && !isHM(f.target)) { toast('That goal time doesn\'t look right'); return; }
  if (!f.once && !f.days.length) { toast('Pick at least one day'); return; }
  const fields = { title, target: f.target || '', days: f.days.slice().sort(), once: f.once || null, hidden: !!f.hidden };
  if (f.id) {
    const x = data.times.find((y) => y.id === f.id);
    if (x) Object.assign(x, fields);
  } else {
    data.times.push({ id: uid(), created: timeDay(), log: {}, ...fields });
  }
  save();
  ui.timeForm = null;
  render();
  toast('Saved ✓');
}

function setTimeLog(id, value) {
  const x = data.times.find((y) => y.id === id);
  if (!x) return;
  const date = timeDay();
  if (isHM(value)) x.log[date] = value; else delete x.log[date];
  save();
  render();
}

/* ---------- 9c. Private list (behind a PIN) ----------
   You choose the PIN on your phone. Only a scrambled "hash" of it is saved (a one-way fingerprint:
   the app can check a PIN against it, but nobody can turn it back into the PIN), so the PIN is
   never in the app's code, which is public on GitHub.
   This keeps out someone who picks up your phone. It is not encryption: private items are still
   inside your backup files. */
let unlocked = false;
let pinFails = 0;
let pinBlockedUntil = 0;

async function pinHash(pin, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261; // fallback for pages without https (only when testing on a laptop)
  for (const b of bytes) { h ^= b; h = Math.imul(h, 16777619); }
  return `f${(h >>> 0).toString(16)}`;
}
function lockPrivate() {
  unlocked = false;
  ui.privView = false;
  ui.pin = null;
  if (ui.goalForm && ui.goalForm.hidden) ui.goalForm = null;
  if (ui.timeForm && ui.timeForm.hidden) ui.timeForm = null;
}

function renderPinPad() {
  const p = ui.pin;
  const title = { unlock: 'Enter your PIN', set: 'Choose a 4-digit PIN', confirm: 'Type the same PIN again', old: 'Enter your current PIN' }[p.mode];
  const hint = p.msg || (p.mode === 'set' ? 'This PIN opens your private list. Only a scrambled copy is saved on this phone.' : '');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'cancel', '0', 'back'];
  return `<div class="pin-wrap">
    <div class="pin-ico">🔒</div>
    <h2>${title}</h2>
    <p class="small pin-msg ${p.bad ? 'warn-text' : 'muted'}">${esc(hint)}</p>
    <div class="pin-dots">${[0, 1, 2, 3].map((i) => `<i class="${i < p.entry.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="pin-pad">${keys.map((k) => (k === 'cancel' ? '<button class="pin-key fn" data-action="pin-cancel">Cancel</button>'
      : k === 'back' ? '<button class="pin-key fn" data-action="pin-back" aria-label="Delete a digit">⌫</button>'
        : `<button class="pin-key" data-action="pin-key" data-k="${k}">${k}</button>`)).join('')}</div>
    ${p.mode === 'unlock' ? '<button class="link-btn" data-action="pin-forgot">Forgot PIN?</button>' : ''}
  </div>`;
}

async function pinEntered() {
  const p = ui.pin;
  if (!p) return;
  const pin = p.entry;
  if (p.mode === 'unlock' || p.mode === 'old') {
    const ok = data.lock && (await pinHash(pin, data.lock.salt)) === data.lock.hash;
    if (!ok) {
      pinFails += 1;
      p.entry = '';
      p.bad = true;
      if (pinFails >= 5) { pinFails = 0; pinBlockedUntil = Date.now() + 30000; p.msg = 'Too many tries. Wait 30 seconds.'; } else p.msg = 'Wrong PIN. Try again.';
      render();
      return;
    }
    pinFails = 0;
    if (p.mode === 'old') { ui.pin = { mode: 'set', entry: '', msg: 'Now choose your new PIN.' }; render(); return; }
    unlocked = true;
    ui.pin = null;
    ui.privView = true;
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (p.mode === 'set') { ui.pin = { mode: 'confirm', entry: '', first: pin }; render(); return; }
  if (p.mode === 'confirm') {
    if (pin !== p.first) { ui.pin = { mode: 'set', entry: '', msg: 'Those didn\'t match. Choose your PIN again.', bad: true }; render(); return; }
    const salt = uid() + uid();
    data.lock = { salt, hash: await pinHash(pin, salt) };
    save();
    unlocked = true;
    ui.pin = null;
    ui.privView = true;
    render();
    window.scrollTo(0, 0);
    toast('PIN saved ✓ Remember it!', { ms: 3500 });
  }
}

function renderPrivate() {
  const t = todayKey();
  const goals = data.goals.filter((g) => g.hidden);
  const active = goals.filter((g) => goalActive(g, t));
  const ended = goals.filter((g) => !goalActive(g, t));
  const form = ui.goalForm && ui.goalForm.hidden ? ui.goalForm : null;
  let h = `<div class="row-between priv-head"><h2>🔒 Private</h2><button class="btn" data-action="priv-lock">Lock</button></div>
    <p class="muted small">Only you can open this, with your PIN. It locks itself when you switch tabs or leave the app. Nothing here goes in the coach summary.</p>`;
  h += renderTimes(true);
  if (form) h += renderGoalForm(form);
  h += active.map(renderGoalCard).join('');
  if (!form) h += '<button class="btn full" data-action="goal-new" data-hidden="1">+ New private goal</button>';
  if (ended.length) h += `<details class="ended"><summary>Ended goals (${ended.length})</summary>${ended.map(renderGoalCard).join('')}</details>`;
  h += `<div class="section"><h3 class="section-title">Private to-do</h3>${renderTodoBody(true)}</div>`;
  h += '<button class="link-btn" data-action="pin-change">Change PIN</button>';
  return h;
}

/* ---------- 10. Progress & weekly check-in for your coach ---------- */
function planForWeek(mon) {
  if (data.plans[mon]) return data.plans[mon];
  const dates = weekDates(mon);
  return Object.values(data.plans)
    .sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0))
    .find((p) => p.days.some((d) => dates.includes(d.date))) || null;
}
const fmtSetCoach = (s) => `${s.weight === 0 ? 'BW' : fmtNum(s.weight)}×${s.reps}${s.rir != null ? ` RIR${s.rir === 5 ? '5+' : s.rir}` : ''}`;

// Builds the plain-text summary you paste to your coach on Sunday.
function weekSummary(mon) {
  const t = todayKey();
  const dates = weekDates(mon);
  const end = dates[6];
  const pastDates = dates.filter((d) => d <= t);
  const plan = planForWeek(mon);
  const L = [];
  L.push(`WEEKLY CHECK-IN: ${niceDate(mon)} to ${niceDate(end)}, ${fromKey(end).getFullYear()}`);
  if (plan) L.push(`Plan: ${plan.title}`);
  const tg = plan && plan.targets;
  if (tg) {
    const tb = [];
    if (tg.weeklyLossLb) tb.push(`lose ${fmtNum(tg.weeklyLossLb)} lb/week`);
    if (tg.wake) tb.push(`wake ${fmtHM(tg.wake)}`);
    if (tg.bedtime) tb.push(`bed ${fmtHM(tg.bedtime)}`);
    if (tb.length) L.push(`Targets: ${tb.join(', ')}`);
  }
  L.push('(Sets are weight in lb × reps. RIR = reps in reserve. BW = bodyweight.)');
  L.push('');

  // Body
  const wts = dates.map((d) => [d, dayRec(d).weight]).filter((x) => x[1] != null);
  if (wts.length) {
    const a = weekAvg('weight', mon);
    const p = weekAvg('weight', addDays(mon, -7));
    let line = `Body weight: avg ${fmtNum(a.avg)} lb from ${plural(a.n, 'weigh-in')}`;
    if (p) { const diff = Math.round((a.avg - p.avg) * 10) / 10; line += ` (last week ${fmtNum(p.avg)}, ${diff >= 0 ? '+' : ''}${fmtNum(diff)}${tg && tg.weeklyLossLb ? `; target −${fmtNum(tg.weeklyLossLb)}` : ''})`; }
    L.push(line);
    L.push(`  ${wts.map(([d, w]) => `${dayName(d)} ${fmtNum(w)}`).join(', ')}`);
  } else L.push('Body weight: no weigh-ins this week (weigh-ins are optional)');
  L.push(`10,000 steps: ${pastDates.filter((d) => dayRec(d).steps).length}/${pastDates.length} days`);
  const weekCardio = data.cardio.filter((c) => dates.includes(c.date));
  L.push(`Training: ${plural(dates.filter((d) => data.sets.some((s) => s.date === d)).length, 'lifting day')}, ${plural(weekCardio.length, 'cardio session')} (${fmtNum(sum(weekCardio.map((c) => c.minutes)))} min)`);

  // Day by day
  L.push('');
  L.push('DAY BY DAY');
  for (const d of dates) {
    const pd = (plan && plan.days.find((x) => x.date === d)) || planDayFor(d);
    const future = d > t;
    L.push('');
    L.push(`${niceDate(d)}${pd ? ` - ${pd.name} (${pd.type})` : ''}`);
    const lines = [];
    const planned = exercisesOn(d, pd);
    const plannedNames = new Set(planned.map((e) => norm(e.name)));
    for (const ex of planned) {
      const sets = setsFor(d, ex.name);
      const label = `${ex.name} (${ex.added ? 'added by me, ' : 'plan '}${ex.sets}×${ex.reps}${ex.from ? `, swapped in for ${ex.from}` : ''})`;
      if (sets.length) lines.push(`  ${label}: ${sets.map(fmtSetCoach).join(', ')}${hitTop(sets, ex) ? ' - top of range on all sets' : ''}`);
      else if (!future) lines.push(`  ${label}: not done`);
    }
    const ed = data.dayEdits[d];
    if (ed && ed.removed.length) lines.push(`  Removed from the plan: ${ed.removed.join(', ')}`);
    const extra = new Map();
    data.sets.filter((s) => s.date === d && !plannedNames.has(norm(s.exercise))).sort((a, b) => a.ts - b.ts).forEach((s) => {
      if (!extra.has(s.exercise)) extra.set(s.exercise, []);
      extra.get(s.exercise).push(s);
    });
    for (const [name, sets] of extra) lines.push(`  ${name}: ${sets.map(fmtSetCoach).join(', ')}`);
    const cs = cardioFor(d);
    cs.forEach((c) => lines.push(`  Cardio: ${cardioLine(c)}${c.notes ? `. Notes: ${c.notes}` : ''}`));
    if (pd && !future) {
      const used = {};
      pd.cardio.forEach((c) => {
        const k = norm(c.type);
        used[k] = (used[k] || 0) + 1;
        if (used[k] > cs.filter((x) => norm(x.type) === k).length) lines.push(`  Planned cardio not done: ${cap(c.type)}${c.minutes ? ` ${c.minutes} min` : ''}${c.optional ? ' (optional)' : ''}`);
      });
    }
    const r = dayRec(d);
    const bits = [];
    if (r.weight != null) bits.push(`weight ${fmtNum(r.weight)}`);
    if (r.steps) bits.push('10k steps ✓');
    if (pd && !future) pd.checklist.filter((x) => !isBuiltIn(x)).forEach((x) => bits.push(`${x} ${r.checks && r.checks[x] ? '✓' : '✗'}`));
    extrasFor(d).forEach((x) => bits.push(`${x.text} (just that day) ${x.done ? '✓' : '✗'}`));
    if (bits.length) lines.push(`  Daily: ${bits.join(', ')}`);
    const bs = blocksFor(d);
    if (bs.length && !future) {
      const done = r.blocks || {};
      lines.push(`  Schedule (${bs.filter((b) => done[b.key]).length}/${bs.length} checked off): ${bs.map((b) => `${done[b.key] ? '✓' : '✗'} ${blockTime(b)} ${b.label}${b.locked ? ' [locked]' : ''}${b.mine ? ' (mine)' : ''}`).join('; ')}`);
    }
    if (!lines.length) lines.push(future ? '  (not yet)' : '  (nothing logged)');
    L.push(...lines);
  }

  // Goals
  const gs = data.goals.filter((g) => !g.hidden && (!g.until || g.until >= mon) && (!g.created || g.created <= end));
  if (gs.length) {
    L.push('');
    L.push('GOALS');
    gs.forEach((g) => {
      const w = goalWeek(g, mon, end < t ? end : t);
      L.push(`  ${g.title} (${goalTargetText(g)}): ${g.period === 'day' ? `hit ${w.hit} of ${plural(w.days, 'day')}, ${fmtNum(w.total)} ${goalUnit(g)} total` :`${fmtNum(w.done)}/${fmtNum(g.target)} ${goalUnit(g)}${w.met ? ' ✓' : ''}`}`);
    });
  }

  // Times (private ones are left out)
  const upTo = end < timeDay() ? end : timeDay();
  const ts = data.times.filter((x) => !x.hidden && dates.some((d) => d <= upTo && timeOn(x, d)));
  if (ts.length) {
    L.push('');
    L.push('TIMES (actual, with minutes late + or early − vs the goal)');
    ts.forEach((x) => {
      const w = timeWeek(x, mon, upTo);
      const parts = w.days.map((d) => {
        const a = x.log[d];
        if (!isHM(a)) return `${dayName(d)} –`;
        const off = minutesOff(x, a);
        return `${dayName(d)} ${fmtHM(a)}${off ? ` (${off > 0 ? '+' : '−'}${Math.abs(off)})` : ''}`;
      });
      let line = `  ${x.title}${x.target ? ` (goal ${fmtHM(x.target)})` : ''}: ${parts.join(', ')}`;
      if (w.logged.length) line += x.target ? `. On time ${w.onTime}/${w.logged.length}, avg ${fmtHM(w.avg)}` : `. Avg ${fmtHM(w.avg)}`;
      L.push(line);
    });
  }
  return L.join('\n');
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* try the old way */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

// A small line chart drawn with SVG (no chart library needed).
function lineChart(vals, labels, unit = '') {
  const pts = vals.map((v, i) => (v == null ? null : [i, v])).filter(Boolean);
  if (pts.length < 2) return '';
  const W = 320;
  const H = 110;
  const P = 8;
  const ys = pts.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  let min = lo;
  let max = hi;
  if (max - min < 1) { min -= 0.5; max += 0.5; }
  const x = (i) => P + (i / Math.max(1, vals.length - 1)) * (W - 2 * P);
  const y = (v) => P + (1 - (v - min) / (max - min)) * (H - 2 * P);
  const line = pts.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart from ${fmtNum(lo)} to ${fmtNum(hi)}${unit}">
      <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map(([i, v]) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="var(--accent)"/>`).join('')}
    </svg>
    <div class="chart-axis"><span>${esc(labels[pts[0][0]])}</span><span>low ${fmtNum(lo)}${unit} · high ${fmtNum(hi)}${unit}</span><span>${esc(labels[pts[pts.length - 1][0]])}</span></div>`;
}

const bestSet = (sets) => sets.reduce((b, s) => (!b || s.weight > b.weight || (s.weight === b.weight && s.reps > b.reps) ? s : b), null);
function exerciseHistory() {
  const by = new Map();
  for (const s of data.sets) {
    const k = norm(s.exercise);
    if (!by.has(k)) by.set(k, { name: s.exercise, dates: new Map() });
    const e = by.get(k);
    if (!e.dates.has(s.date)) e.dates.set(s.date, []);
    e.dates.get(s.date).push(s);
  }
  return [...by.values()].map((e) => {
    const sessions = [...e.dates.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, sets]) => ({ date, sets: sets.sort((a, b) => a.ts - b.ts), best: bestSet(sets) }));
    return { name: e.name, sessions, last: sessions[sessions.length - 1].date };
  }).sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
}

function renderProgress() {
  const t = todayKey();
  const thisMon = mondayOf(t);
  const mon = ui.sumWeek || thisMon;
  let h = `<h2>Progress</h2>
  <div class="card checkin">
    <div class="week-head">
      <button class="icon-btn" data-action="sum-week" data-by="-7" aria-label="Previous week">‹</button>
      <div class="week-title"><b>Weekly check-in</b><div class="muted small">${shortDate(mon)} – ${shortDate(addDays(mon, 6))}${mon === thisMon ? ' (this week)' : ''}</div></div>
      <button class="icon-btn" data-action="sum-week" data-by="7" ${mon >= thisMon ? 'disabled' : ''} aria-label="Next week">›</button>
    </div>
    <p class="muted small">Copies the whole week as text (sets, cardio, schedule, weigh-ins, goals, times) so you can paste it to your coach on Sunday.</p>
    <button class="btn primary big full" data-action="copy-summary">📋 Copy summary for coach</button>
    ${navigator.share ? '<button class="btn full" data-action="share-summary">📤 Share summary…</button>' : ''}
    <details class="preview" id="summary-preview"><summary>Preview the text</summary><pre class="summary-pre">${esc(weekSummary(mon))}</pre></details>
  </div>`;

  // Body weight: weekly averages
  let weeks = [];
  for (let i = 11; i >= 0; i--) {
    const m = addDays(thisMon, -7 * i);
    weeks.push({ mon: m, a: weekAvg('weight', m) });
  }
  const firstWithData = weeks.findIndex((w) => w.a);
  if (firstWithData > 0) weeks = weeks.slice(firstWithData); // start the chart at your first weigh-in
  const withData = weeks.filter((w) => w.a);
  h += '<div class="section"><h3 class="section-title">Body weight (weekly average)</h3>';
  if (withData.length === 1) h += '<p class="muted small">The chart appears after your second week of weigh-ins.</p>';
  if (!withData.length) {
    h += '<p class="muted small">Log a weigh-in on the Checklist tab and your weekly averages show up here.</p>';
  } else {
    h += `<div class="card">${lineChart(weeks.map((w) => (w.a ? w.a.avg : null)), weeks.map((w) => shortDate(w.mon)), ' lb')}`;
    h += withData.slice().reverse().slice(0, 8).map((w) => {
      const i = withData.indexOf(w);
      const prev = withData[i - 1];
      const diff = prev ? Math.round((w.a.avg - prev.a.avg) * 10) / 10 : null;
      return `<div class="hist-row"><span>Week of ${shortDate(w.mon)}</span><span><b>${fmtNum(w.a.avg)} lb</b> <small class="muted">(${w.a.n})</small>${diff != null ? ` <small class="${diff <= 0 ? 'good-text' : 'muted'}">${diff > 0 ? '+' : ''}${fmtNum(diff)}</small>` : ''}</span></div>`;
    }).join('');
    h += '</div>';
  }
  h += '</div>';

  // Exercise history
  const hist = exerciseHistory();
  h += '<div class="section"><h3 class="section-title">Exercise history</h3>';
  h += hist.length ? hist.map((e) => {
    const last = e.sessions[e.sessions.length - 1];
    const top = bestSet(e.sessions.map((s) => s.best));
    return `<details class="card hist">
      <summary><div class="hist-name">${esc(e.name)}</div>
        <div class="muted small">Last ${shortDate(last.date)}: best ${fmtSetShort(last.best)} · all-time best ${fmtSetShort(top)} · ${plural(e.sessions.length, 'session')}</div></summary>
      <div class="hist-body">
        ${lineChart(e.sessions.map((s) => s.best.weight), e.sessions.map((s) => shortDate(s.date)), ' lb')}
        ${e.sessions.slice().reverse().slice(0, 15).map((s) => `<div class="hist-row"><span>${shortDate(s.date)}</span><span>${s.sets.map((x) => (x === s.best ? `<b>${fmtSetShort(x)}</b>` : fmtSetShort(x))).join(' · ')}</span></div>`).join('')}
      </div>
    </details>`;
  }).join('') : '<p class="muted small">Log some sets on the Train tab and each exercise\'s history shows up here.</p>';
  h += '</div>';

  // Cardio
  const cardio = data.cardio.slice().sort((a, b) => (a.date === b.date ? b.ts - a.ts : a.date < b.date ? 1 : -1));
  if (cardio.length) {
    const wk = data.cardio.filter((c) => c.date >= thisMon && c.date <= addDays(thisMon, 6));
    h += `<div class="section"><h3 class="section-title">Cardio</h3><div class="card">
      <div class="row-between"><span>This week</span><b>${fmtNum(sum(wk.map((c) => c.minutes)))} min · ${plural(wk.length, 'session')}</b></div>
      ${cardio.slice(0, 10).map((c) => `<div class="hist-row"><span>${shortDate(c.date)}</span><span>${cardioIco(c.type)} ${esc(cardioLine(c))}</span></div>`).join('')}
    </div></div>`;
  }
  return h;
}

/* ---------- Look: light/dark and highlight color ---------- */
function getLook() {
  let look = {};
  try { look = JSON.parse(localStorage.getItem(LOOK_KEY)) || {}; } catch (e) { look = {}; }
  return {
    theme: ['auto', 'light', 'dark'].includes(look.theme) ? look.theme : 'auto',
    accent: ACCENTS.some((a) => a.id === look.accent) ? look.accent : 'violet',
  };
}
const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
function applyLook() {
  const look = getLook();
  const theme = look.theme !== 'auto' ? look.theme : darkQuery && darkQuery.matches ? 'light' : 'dark';
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (look.accent === 'violet') delete root.dataset.accent; else root.dataset.accent = look.accent;
  // Phone status bar color (Android) matches the strip at the top of the app.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue(theme === 'light' ? '--accent' : '--bg').trim() || '#0e0e12';
}
function setLook(changes) {
  try { localStorage.setItem(LOOK_KEY, JSON.stringify({ ...getLook(), ...changes })); } catch (e) { /* ignore */ }
  applyLook();
  render();
}
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', () => { if (getLook().theme === 'auto') applyLook(); });

function renderLook() {
  const look = getLook();
  return `<div class="section"><h3 class="section-title">Look</h3>
    <span class="field-label">Theme</span>
    <div class="look-opts">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([id, label]) =>
      `<button class="opt ${look.theme === id ? 'active' : ''}" data-action="look-theme" data-v="${id}">${label}</button>`).join('')}</div>
    <div class="muted small" style="margin-top:6px">Auto follows your phone's light/dark setting.</div>
    <span class="field-label">Color</span>
    <div class="swatches">${ACCENTS.map((a) =>
      `<button class="swatch ${look.accent === a.id ? 'active' : ''}" style="--sw:${a.color}" data-action="look-accent" data-v="${a.id}" aria-label="${a.label}">${look.accent === a.id ? '✓' : ''}</button>`).join('')}</div>
  </div>`;
}

/* ---------- 11. More: import, saved plans, backup ---------- */
let canShareFiles = false;
try {
  canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'test.json', { type: 'application/json' })] }));
} catch (e) { canShareFiles = false; }

function backupStatus() {
  let last = null;
  try { last = Number(localStorage.getItem(BACKUP_KEY)) || null; } catch (e) { /* ignore */ }
  if (!last) return { text: 'You haven\'t saved a backup yet.', warn: true };
  const days = Math.floor((Date.now() - last) / 86400000);
  return { text: `Last backup: ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}`, warn: days >= 7 };
}
function markBackup() { try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch (e) { /* ignore */ } }
function backupBlob() {
  return new Blob([JSON.stringify({ ...data, exportedAt: new Date().toISOString(), appVersion: APP_VERSION })], { type: 'application/json' });
}
const backupName = () => `tracker-backup-${todayKey()}.json`;
const countsText = (d) => `${d.sets.length} sets · ${d.cardio.length} cardio · ${Object.keys(d.plans).length} plans · ${d.goals.length} goals · ${d.times.length} times · ${d.todos.length} to-dos · ${Object.keys(d.daily).length} checklist days`;

function saveBackupFile() {
  const url = URL.createObjectURL(backupBlob());
  const a = document.createElement('a');
  a.href = url;
  a.download = backupName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  markBackup();
  toast('Backup file saved');
  render();
}
async function shareBackup() {
  try {
    await navigator.share({ files: [new File([backupBlob()], backupName(), { type: 'application/json' })], title: 'Tracker backup' });
    markBackup();
    render();
  } catch (e) {
    if (e.name !== 'AbortError') toast('Sharing didn\'t work. Try "Save backup file" instead.');
  }
}
async function restoreFromFile(file) {
  let obj;
  try { obj = JSON.parse(await file.text()); } catch (e) { alert('That file isn\'t a readable backup.'); return; }
  if (!obj || obj.app !== 'goal-tracker') { alert('That doesn\'t look like a backup from this app.'); return; }
  const n = normalizeData(obj);
  const when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleString() : 'unknown date';
  const ok = confirm(`Replace ALL data on this device with this backup?\n\nBackup from: ${when}\n${countsText(n)}\n\nWhat's on this device now will be overwritten.`);
  if (!ok) return;
  try { localStorage.setItem(`${STORE_KEY}.beforeRestore`, JSON.stringify(data)); } catch (e) { /* ignore */ }
  data = n;
  save();
  Object.keys(drafts).forEach((k) => delete drafts[k]);
  ui.planWeek = null;
  ui.trainDate = null;
  ui.cardioForm = null;
  ui.goalForm = null;
  ui.exForm = null;
  ui.timeForm = null;
  ui.blockForm = null;
  lockPrivate();
  render();
  toast('Backup restored ✓');
}

function renderMore() {
  const plans = planList().slice().reverse();
  const b = backupStatus();
  let h = `<h2>Import this week's plan</h2>
  <p class="muted small">Copy the plan your coach gives you in chat, then tap <b>Paste &amp; import</b>. Or paste it into the box yourself and tap <b>Import</b>.</p>
  <textarea id="plan-text" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" placeholder='{ "week": "2026-11-16", "title": "...", "days": [ ... ] }'>${esc(ui.planDraft)}</textarea>
  <div class="row">
    <button class="btn primary" data-action="paste-plan">📋 Paste &amp; import</button>
    <button class="btn" data-action="import-plan">Import</button>
  </div>`;

  if (importResult) {
    if (importResult.ok) {
      h += `<div class="result ok" id="import-result"><b>✓ ${esc(importResult.msg)}</b>
        ${importResult.warnings.length ? `<ul class="warns">${importResult.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        <button class="btn primary full" data-action="tab" data-tab="train">Go to Train →</button></div>`;
    } else {
      const errs = importResult.errors;
      h += `<div class="result bad" id="import-result"><b>Couldn't import that plan</b>
        <ul>${errs.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join('')}${errs.length > 8 ? `<li>…and ${errs.length - 8} more</li>` : ''}</ul>
        <p class="small">Tip: you can paste these messages to your coach and ask for the plan again in the app's JSON format.</p></div>`;
    }
  }
  h += '<button class="link-btn" data-action="example-plan">Or load an example week to try the app</button>';

  h += '<div class="section"><h3 class="section-title">Saved plans</h3>';
  h += plans.length ? plans.map((p) => `<div class="card plan-row">
      <div><b>${esc(p.title)}</b><div class="muted small">Week of ${niceDate(p.week)} · ${p.days.length} days</div></div>
      <button class="icon-btn small danger" data-action="del-plan" data-week="${p.week}" aria-label="Delete plan">🗑</button>
    </div>`).join('') : '<p class="muted small">None yet.</p>';
  h += '</div>';

  h += renderLook();

  h += `<div class="section"><h3 class="section-title">Backup</h3>
    <p class="muted small">Your data lives <b>only on this device</b>. Save a backup file every Sunday. To move data to your laptop (or a new phone), save a backup here and use <b>Restore</b> there.</p>
    <p class="status ${b.warn ? 'warn' : ''}">${b.warn ? '⚠️ ' : '✓ '}${esc(b.text)}</p>
    ${canShareFiles ? '<button class="btn primary full" data-action="backup-share">📤 Share backup (Save to Files, email, Drive…)</button>' : ''}
    <button class="btn full ${canShareFiles ? '' : 'primary'}" data-action="backup-save">⬇️ Save backup file</button>
    <label class="btn full file-btn">⬆️ Restore from a backup file<input type="file" id="restore-file" accept=".json,application/json"></label>
  </div>`;

  h += `<div class="section"><h3 class="section-title">Install on your phone</h3>
    <ul class="muted small help">
      <li><b>iPhone:</b> open this page in Safari → Share button → <b>Add to Home Screen</b>.</li>
      <li><b>Android:</b> open in Chrome → ⋮ menu → <b>Install app</b> (or Add to Home screen).</li>
    </ul>
    <p class="muted small">Stored: ${countsText(data)}</p>
    <p class="muted small">App version <b>${APP_VERSION}</b></p>
  </div>`;
  return h;
}

/* ---------- Toast (little pop-up message, with optional Undo) ---------- */
let toastTimer = null;
function toast(msg, opts = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? '<button data-action="undo">Undo</button>' : ''}`;
  undoFn = opts.undo || null;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); undoFn = null; }, opts.ms || (opts.undo ? 5000 : 2200));
}

/* ---------- 12. Drawing the screen & handling taps ---------- */
function render() {
  if (!TABS.includes(ui.tab)) ui.tab = 'train';
  const view = $('#view');
  if (ui.tab === 'train') view.innerHTML = renderTrain();
  else if (ui.tab === 'check') view.innerHTML = renderChecklist();
  else if (ui.tab === 'goals') view.innerHTML = renderGoals();
  else if (ui.tab === 'progress') view.innerHTML = renderProgress();
  else view.innerHTML = renderMore();
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
  renderTimer();
}
const today = () => ui.checkDate || todayKey();

// Every tappable thing has data-action="..."; this table says what each one does.
const actions = {
  tab(el) {
    ui.tab = el.dataset.tab === 'todo' ? 'goals' : el.dataset.tab;
    importResult = null;
    lockPrivate(); // switching tabs locks the private list
    saveUi();
    render();
    window.scrollTo(0, 0);
  },
  // Training
  'plan-week'(el) { ui.planWeek = el.dataset.week || null; ui.trainDate = null; ui.openEx = null; ui.cardioForm = null; ui.exForm = null; render(); },
  'train-day'(el) { ui.trainDate = el.dataset.date; ui.openEx = null; ui.cardioForm = null; ui.exForm = null; render(); },
  'ex-edit'(el) {
    const day = trainDay(el.dataset.date);
    const i = Number(el.dataset.i);
    const ex = day && dayExercises(day)[i];
    if (!ex) return;
    ui.exForm = { date: day.date, i, name: ex.name, sets: String(ex.sets), reps: ex.reps, restSec: ex.restSec, orig: ex.added ? '' : ex.from || ex.name };
    ui.openEx = null;
    render();
    const f = $('#ex-form');
    if (f) f.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const n = $('#exf-name');
    if (n) { n.focus(); n.select(); }
  },
  'ex-add'(el) {
    ui.exForm = { date: el.dataset.date, i: null, name: '', sets: '3', reps: '10-12', restSec: 90 };
    ui.openEx = null;
    render();
    const f = $('#ex-form');
    if (f) f.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const n = $('#exf-name');
    if (n) n.focus();
  },
  'exf-sets'(el) {
    const f = ui.exForm;
    f.sets = String(Math.min(20, Math.max(1, Math.round(num(f.sets) || 0) + Number(el.dataset.by))));
    render();
  },
  'exf-rest'(el) { ui.exForm.restSec = Number(el.dataset.sec); render(); },
  'exf-cancel'() { ui.exForm = null; render(); },
  'exf-save'() { saveExForm(); },
  'ex-remove'(el) { removeExercise(el.dataset.date, Number(el.dataset.i)); },
  'ex-reset'(el) {
    const date = el.dataset.date;
    if (!data.dayEdits[date] || !confirm('Put this day back the way the plan has it?\n\nYour logged sets stay saved.')) return;
    const snap = snapshotEdits(date);
    delete data.dayEdits[date];
    save();
    clearDrafts(date);
    ui.exForm = null;
    render();
    toast('Back to the plan', { undo: () => { restoreEdits(date, snap); clearDrafts(date); save(); render(); } });
  },
  'toggle-ex'(el) {
    const key = el.dataset.key;
    ui.openEx = ui.openEx === key ? null : key;
    render();
    if (ui.openEx) {
      const card = document.getElementById(`ex-${slug(key)}`);
      if (card) card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  },
  step(el) {
    const d = drafts[el.dataset.key];
    if (!d) return;
    const f = el.dataset.field;
    d[f] = fmtNum(Math.max(0, (num(d[f]) || 0) + Number(el.dataset.by)));
    render();
  },
  rir(el) {
    const d = drafts[el.dataset.key];
    if (!d) return;
    const n = Number(el.dataset.n);
    d.rir = d.rir === n ? null : n;
    render();
  },
  'log-set'(el) { unlockAudio(); logSet(el.dataset.key, el.dataset.date, Number(el.dataset.i)); },
  'del-set'(el) {
    const i = data.sets.findIndex((s) => s.id === el.dataset.id);
    if (i === -1) return;
    const [removed] = data.sets.splice(i, 1);
    save();
    render();
    toast('Set deleted', { undo: () => { data.sets.push(removed); save(); render(); } });
  },
  'timer-add'(el) { adjustTimer(Number(el.dataset.by)); },
  'timer-stop'() { stopTimer(); },

  // Cardio
  'cardio-open'(el) { openCardioForm(el.dataset.date, el.dataset.type, el.dataset.minutes); },
  'cf-type'(el) {
    const f = ui.cardioForm;
    f.type = el.dataset.type;
    if (f.type === 'swim' && f.unit === 'mi') f.unit = 'yd';
    if (f.type !== 'swim' && f.unit === 'yd') f.unit = 'mi';
    render();
  },
  'cf-step'(el) {
    const f = ui.cardioForm;
    f.minutes = fmtNum(Math.max(0, (num(f.minutes) || 0) + Number(el.dataset.by)));
    render();
  },
  'cf-cancel'() { ui.cardioForm = null; render(); },
  'cf-save'() { saveCardio(); },
  'cardio-del'(el) {
    const i = data.cardio.findIndex((c) => c.id === el.dataset.id);
    if (i === -1) return;
    const [removed] = data.cardio.splice(i, 1);
    save();
    render();
    toast('Cardio deleted', { undo: () => { data.cardio.push(removed); save(); render(); } });
  },

  // Checklist
  'check-day'(el) {
    const next = addDays(today(), Number(el.dataset.by));
    if (next > addDays(todayKey(), 13)) return;
    ui.checkDate = next === todayKey() ? null : next;
    ui.weighOpen = false;
    ui.blockForm = null;
    render();
  },

  // Schedule blocks
  'block-toggle'(el) {
    const done = { ...(dayRec(today()).blocks || {}) };
    const k = el.dataset.key;
    if (done[k]) delete done[k]; else done[k] = true;
    setDaily(today(), 'blocks', Object.keys(done).length ? done : null);
    render();
  },
  'block-new'() {
    const n = new Date();
    const start = `${pad(Math.min(23, n.getHours() + 1))}:00`;
    ui.blockForm = { date: today(), id: null, label: '', start, end: '', locked: false };
    render();
    const f = $('#block-form');
    if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const i = $('#bf-label');
    if (i) i.focus();
  },
  'block-edit'(el) {
    const b = (data.myBlocks[today()] || []).find((x) => x.id === el.dataset.id);
    if (!b) return;
    ui.blockForm = { date: today(), id: b.id, label: b.label, start: b.start, end: b.end, locked: b.locked };
    render();
    const f = $('#block-form');
    if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' });
  },
  'bf-locked'(el) { ui.blockForm.locked = el.dataset.v === '1'; render(); },
  'bf-cancel'() { ui.blockForm = null; render(); },
  'bf-save'() { saveBlockForm(); },
  'bf-delete'() {
    const f = ui.blockForm;
    const list = data.myBlocks[f.date] || [];
    const i = list.findIndex((x) => x.id === f.id);
    if (i === -1) return;
    const [removed] = list.splice(i, 1);
    if (!list.length) delete data.myBlocks[f.date];
    ui.blockForm = null;
    save();
    render();
    toast(`Deleted ${removed.label}`, {
      undo: () => { (data.myBlocks[f.date] || (data.myBlocks[f.date] = [])).splice(i, 0, removed); save(); render(); },
    });
  },

  // One-off checklist items
  'extra-toggle'(el) {
    const x = extrasFor(today()).find((y) => y.id === el.dataset.id);
    if (!x) return;
    x.done = !x.done;
    save();
    render();
  },
  'extra-del'(el) {
    const list = extrasFor(today());
    const i = list.findIndex((y) => y.id === el.dataset.id);
    if (i === -1) return;
    const date = today();
    const [removed] = list.splice(i, 1);
    setDaily(date, 'extras', list.length ? list : null);
    render();
    toast('Item removed', {
      undo: () => { const l = extrasFor(date).slice(); l.splice(i, 0, removed); setDaily(date, 'extras', l); render(); },
    });
  },
  'toggle-daily'(el) {
    setDaily(today(), el.dataset.field, !dayRec(today())[el.dataset.field]);
    render();
  },
  'weigh-open'() {
    ui.weighOpen = true;
    render();
    const n = $('#weigh-in');
    if (n) n.focus();
  },
  'weigh-cancel'() { ui.weighOpen = false; render(); },
  'weigh-save'() {
    const v = num(($('#weigh-in') || {}).value);
    if (v === null || v < 50 || v > 500) { toast('Type your weight in pounds, like 165.4'); return; }
    setDaily(today(), 'weight', v);
    ui.weighOpen = false;
    render();
    toast(`Saved ${fmtNum(v)} lb ✓`);
  },
  'weigh-clear'() {
    const old = dayRec(today()).weight;
    setDaily(today(), 'weight', null);
    ui.weighOpen = false;
    render();
    toast('Weigh-in removed', { undo: () => { setDaily(today(), 'weight', old); render(); } });
  },
  'toggle-check'(el) {
    const checks = { ...(dayRec(today()).checks || {}) };
    const text = el.dataset.text;
    if (checks[text]) delete checks[text]; else checks[text] = true;
    setDaily(today(), 'checks', Object.keys(checks).length ? checks : null);
    render();
  },

  // Goals
  'goal-log'(el) {
    const g = data.goals.find((x) => x.id === el.dataset.id);
    if (!g) return;
    const t = todayKey();
    const v = Math.max(0, (Number(g.log[t]) || 0) + Number(el.dataset.by));
    if (v) g.log[t] = v; else delete g.log[t];
    save();
    render();
  },
  'goal-new'(el) {
    ui.goalForm = { id: null, title: '', category: ui.todoCat, kind: 'count', period: 'week', target: '3', until: '', hidden: el.dataset.hidden === '1' };
    render();
    const f = $('#gf-title');
    if (f) f.focus();
  },
  'goal-edit'(el) {
    const g = data.goals.find((x) => x.id === el.dataset.id);
    if (!g) return;
    ui.goalForm = { id: g.id, title: g.title, category: g.category, kind: g.kind, period: g.period, target: String(g.target), until: g.until || '', hidden: !!g.hidden };
    render();
    const f = $('#goal-form');
    if (f) f.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },
  'gf-kind'(el) {
    ui.goalForm.kind = el.dataset.kind;
    if (el.dataset.kind === 'workouts') ui.goalForm.period = 'week';
    if (el.dataset.kind === 'minutes' && ui.goalForm.period === 'week' && ui.goalForm.target === '3') { ui.goalForm.period = 'day'; ui.goalForm.target = '60'; }
    render();
  },
  'gf-cancel'() { ui.goalForm = null; render(); },
  'gf-save'() { saveGoalForm(); },
  'gf-delete'() {
    const i = data.goals.findIndex((x) => x.id === ui.goalForm.id);
    if (i === -1) return;
    const [removed] = data.goals.splice(i, 1);
    ui.goalForm = null;
    save();
    render();
    toast('Goal deleted', { undo: () => { data.goals.splice(i, 0, removed); save(); render(); } });
  },
  'goal-examples'() {
    const t = todayKey();
    data.goals.push(
      { id: uid(), created: t, log: {}, title: 'Work out', category: 'Training', kind: 'workouts', period: 'week', target: 4, until: t <= '2026-12-05' ? '2026-12-05' : '' },
      { id: uid(), created: t, log: {}, title: 'Study for Materials', category: 'School', kind: 'minutes', period: 'day', target: 60, until: '' },
    );
    save();
    render();
    toast('Added. Tap Edit on either one to change it.');
  },

  // Times
  'time-now'(el) {
    const x = data.times.find((y) => y.id === el.dataset.id);
    if (!x) return;
    const date = timeDay();
    x.log[date] = nowHM();
    save();
    render();
    const off = minutesOff(x, x.log[date]);
    toast(`${x.title}: ${fmtHM(x.log[date])}${off === null ? '' : off <= 0 ? ' ✓ on time' : `, ${fmtMins(off)} late`}. Tap the time to change it.`, { ms: 3500 });
  },
  'time-clear'(el) {
    const x = data.times.find((y) => y.id === el.dataset.id);
    const date = timeDay();
    if (!x || !x.log[date]) return;
    const old = x.log[date];
    delete x.log[date];
    save();
    render();
    toast('Time cleared', { undo: () => { x.log[date] = old; save(); render(); } });
  },
  'time-new'(el) {
    ui.timeForm = { id: null, title: '', target: '', days: ALL_DAYS.slice(), once: null, hidden: el.dataset.hidden === '1' };
    render();
    const n = $('#tf-title');
    if (n) n.focus();
  },
  'time-edit'(el) {
    const x = data.times.find((y) => y.id === el.dataset.id);
    if (!x) return;
    ui.timeForm = { id: x.id, title: x.title, target: x.target, days: x.days.slice(), once: x.once, hidden: !!x.hidden };
    render();
    const f = $('#time-form');
    if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' });
  },
  'tf-notarget'() { ui.timeForm.target = ''; render(); },
  'tf-preset'(el) {
    const f = ui.timeForm;
    const p = el.dataset.p;
    if (p === 'once') { f.once = f.once || timeDay(); return render(); }
    f.once = null;
    f.days = p === 'week' ? [1, 2, 3, 4, 5] : ALL_DAYS.slice();
    render();
  },
  'tf-day'(el) {
    const f = ui.timeForm;
    const n = Number(el.dataset.n);
    f.days = f.days.includes(n) ? f.days.filter((d) => d !== n) : [...f.days, n];
    render();
  },
  'tf-cancel'() { ui.timeForm = null; render(); },
  'tf-save'() { saveTimeForm(); },
  'tf-delete'() {
    const i = data.times.findIndex((y) => y.id === ui.timeForm.id);
    if (i === -1) return;
    const [removed] = data.times.splice(i, 1);
    ui.timeForm = null;
    save();
    render();
    toast(`Deleted ${removed.title}`, { undo: () => { data.times.splice(i, 0, removed); save(); render(); } });
  },
  'time-examples'() {
    const t = timeDay();
    const mk = (title, target) => ({ id: uid(), created: t, log: {}, title, target, days: ALL_DAYS.slice(), once: null, hidden: false });
    data.times.push(mk('Woke up', ''), mk('Out of the apartment', '08:30'), mk('Phone put away', '21:30'));
    save();
    render();
    toast('Added. Tap a name to change its time or days.', { ms: 3500 });
  },

  // Private list
  'priv-open'() {
    if (unlocked) ui.privView = true;
    else ui.pin = { mode: data.lock ? 'unlock' : 'set', entry: '' };
    ui.goalForm = null;
    ui.timeForm = null;
    render();
    window.scrollTo(0, 0);
  },
  'priv-lock'() { lockPrivate(); render(); window.scrollTo(0, 0); toast('Locked 🔒'); },
  'pin-key'(el) {
    const p = ui.pin;
    if (!p || p.busy || p.entry.length >= 4) return;
    if (Date.now() < pinBlockedUntil) { toast('Wait a few seconds, then try again.'); return; }
    p.entry += el.dataset.k;
    if (p.entry.length === 1) { p.msg = ''; p.bad = false; }
    render();
    if (p.entry.length === 4) {
      p.busy = true;
      setTimeout(() => { p.busy = false; pinEntered(); }, 150);
    }
  },
  'pin-back'() { const p = ui.pin; if (p && !p.busy) { p.entry = p.entry.slice(0, -1); render(); } },
  'pin-cancel'() { ui.pin = null; render(); },
  'pin-change'() { ui.pin = { mode: 'old', entry: '' }; render(); window.scrollTo(0, 0); },
  'pin-forgot'() {
    const n = data.goals.filter((g) => g.hidden).length + data.times.filter((x) => x.hidden).length + data.todos.filter((x) => x.hidden).length;
    if (!confirm(`There's no way to recover a forgotten PIN.\n\nYou can erase the PIN AND everything in the private list (${plural(n, 'item')}), then set a new PIN.\n\nErase them?`)) return;
    data.goals = data.goals.filter((g) => !g.hidden);
    data.times = data.times.filter((x) => !x.hidden);
    data.todos = data.todos.filter((x) => !x.hidden);
    data.lock = null;
    save();
    ui.pin = { mode: 'set', entry: '', msg: 'Private list erased. Choose a new PIN.' };
    render();
  },

  // To-do
  'todo-filter'(el) { ui.todoFilter = el.dataset.cat; render(); },
  'todo-toggle'(el) {
    const x = data.todos.find((t) => t.id === el.dataset.id);
    if (!x) return;
    x.done = !x.done;
    x.doneDate = x.done ? todayKey() : null;
    save();
    render();
  },
  'todo-del'(el) {
    const i = data.todos.findIndex((t) => t.id === el.dataset.id);
    if (i === -1) return;
    const [removed] = data.todos.splice(i, 1);
    save();
    render();
    toast('To-do deleted', { undo: () => { data.todos.splice(i, 0, removed); save(); render(); } });
  },

  // Progress
  'sum-week'(el) {
    const next = addDays(ui.sumWeek || mondayOf(todayKey()), Number(el.dataset.by));
    ui.sumWeek = next >= mondayOf(todayKey()) ? null : next;
    render();
  },
  async 'copy-summary'() {
    const ok = await copyText(weekSummary(ui.sumWeek || mondayOf(todayKey())));
    if (ok) toast('Copied! Paste it in your coach chat.');
    else {
      const p = $('#summary-preview');
      if (p) { p.open = true; p.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      toast('Couldn\'t copy automatically. Long-press the text to select it.', { ms: 4500 });
    }
  },
  async 'share-summary'() {
    try { await navigator.share({ text: weekSummary(ui.sumWeek || mondayOf(todayKey())) }); } catch (e) { /* cancelled */ }
  },

  // More
  async 'paste-plan'() {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch (e) { text = ''; }
    if (!text) {
      const ta = $('#plan-text');
      if (ta) ta.focus();
      toast('Couldn\'t read the clipboard. Long-press the box, choose Paste, then tap Import.', { ms: 4500 });
      return;
    }
    ui.planDraft = text;
    importPlanText(text);
  },
  'import-plan'() { importPlanText(($('#plan-text') || {}).value || ''); },
  'example-plan'() {
    const ex = examplePlan();
    const existing = data.plans[ex.week];
    if (existing && !/^Example Week/.test(existing.title) && !confirm(`This replaces your plan for the week of ${niceDate(ex.week)}. Continue?`)) return;
    importPlanText(JSON.stringify(ex));
  },
  'del-plan'(el) {
    const p = data.plans[el.dataset.week];
    if (!p || !confirm(`Delete the plan “${p.title}”?\n\nYour logged sets stay saved.`)) return;
    delete data.plans[el.dataset.week];
    if (ui.planWeek === el.dataset.week) ui.planWeek = null;
    save();
    render();
  },
  'backup-save'() { saveBackupFile(); },
  'look-theme'(el) { setLook({ theme: el.dataset.v }); },
  'look-accent'(el) { setLook({ accent: el.dataset.v }); },
  'backup-share'() { shareBackup(); },
  undo() {
    const fn = undoFn;
    undoFn = null;
    $('#toast').classList.remove('show');
    if (fn) fn();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});

// Typing in a box: remember it, but don't redraw (so the keyboard stays open).
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.draft && drafts[t.dataset.draft]) drafts[t.dataset.draft][t.dataset.field] = t.value;
  if (t.dataset.cf && ui.cardioForm) ui.cardioForm[t.dataset.cf] = t.value;
  if (t.dataset.gf && ui.goalForm) ui.goalForm[t.dataset.gf] = t.value;
  if (t.dataset.exf && ui.exForm) ui.exForm[t.dataset.exf] = t.value;
  if (t.dataset.tf && ui.timeForm) ui.timeForm[t.dataset.tf] = t.value;
  if (t.dataset.bf && ui.blockForm) ui.blockForm[t.dataset.bf] = t.value;
  if (t.id === 'plan-text') ui.planDraft = t.value;
});
// Finished typing in a box (you tapped away) or picked from a list: save it.
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.cf && ui.cardioForm) ui.cardioForm[t.dataset.cf] = t.value;
  if (t.dataset.gf && ui.goalForm) ui.goalForm[t.dataset.gf] = t.value;
  if (t.dataset.exf && ui.exForm) ui.exForm[t.dataset.exf] = t.value;
  if (t.dataset.bf && ui.blockForm) ui.blockForm[t.dataset.bf] = t.value;
  if (t.dataset.tf && ui.timeForm) {
    ui.timeForm[t.dataset.tf] = t.value;
    if (t.dataset.tf === 'target') render(); // shows/hides the "No goal time" button
  }
  if (t.dataset.timeId) setTimeLog(t.dataset.timeId, t.value);
  if (t.id === 'todo-cat') { ui.todoCat = t.value; saveUi(); }
  if (t.id === 'restore-file' && t.files && t.files[0]) {
    restoreFromFile(t.files[0]);
    t.value = '';
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'weigh-in') { e.preventDefault(); actions['weigh-save'](); }
});
document.addEventListener('submit', (e) => {
  if (e.target.dataset.form === 'todo') { e.preventDefault(); addTodo(); }
  if (e.target.dataset.form === 'extra') {
    e.preventDefault();
    const input = $('#extra-text');
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    setDaily(today(), 'extras', [...extrasFor(today()), { id: uid(), text, done: false }]);
    render();
    const again = $('#extra-text');
    if (again) again.focus();
  }
});
// Coming back to the app (e.g. after locking the phone): refresh the timer and "today".
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    // Leaving the app locks the private list right away.
    if (unlocked || ui.pin) { lockPrivate(); render(); }
    return;
  }
  if (timer.end) keepAwake(true);
  const typing = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (!typing && !ui.cardioForm && !ui.goalForm && !ui.exForm && !ui.timeForm && !ui.blockForm) render();
});
// Keep "Now / Next" on the Today tab current: redraw once a minute (not while you're typing).
setInterval(() => {
  if (ui.tab !== 'check' || ui.checkDate || document.visibilityState !== 'visible') return;
  const typing = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (!typing && !ui.blockForm && !ui.weighOpen) render();
}, 60000);

/* ---------- Start up ---------- */
applyLook();
if (savedUi.timer && savedUi.timer.end > Date.now() - 90000) {
  Object.assign(timer, savedUi.timer, { alerted: savedUi.timer.end <= Date.now() });
  runTimer();
}
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline support unavailable:', err));
  });
}
// Ask the browser not to clear our data when the phone is low on space.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
