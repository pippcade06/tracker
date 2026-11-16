'use strict';
/* =====================================================================
   Goals & Training Tracker — version 1
   Everything is stored on this device (browser "localStorage").
   Sections:  1 settings · 2 helpers · 3 storage · 4 plan import
              5 training · 6 rest timer · 7 checklist · 8 to-do
              9 more/backup · 10 drawing & events
   ===================================================================== */

/* ---------- 1. Settings ---------- */
const APP_VERSION = '1.0.0';
const STORE_KEY = 'tracker.data.v1';
const UI_KEY = 'tracker.ui.v1';
const BACKUP_KEY = 'tracker.lastBackup';
const CATEGORIES = ['Training', 'School', 'Work', 'Side projects', 'Personal'];
const TARGETS = { steps: 10000, protein: 160, proteinMin: 130, calories: 2500, caloriesLow: 2300 };

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
const relDay = (k) => (k === todayKey() ? 'today' : k === addDays(todayKey(), -1) ? 'yesterday' : niceDate(k));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const fmtSec = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const num = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const show = (v) => (v === undefined ? 'nothing' : String(JSON.stringify(v)).slice(0, 40));

/* ---------- 3. Storage ---------- */
function blankData() {
  return { app: 'goal-tracker', version: 1, plans: {}, sets: [], daily: {}, todos: [] };
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
  if (isObj(d.daily)) out.daily = d.daily;
  if (Array.isArray(d.todos)) out.todos = d.todos.filter((t) => isObj(t) && typeof t.text === 'string' && isDateKey(t.date));
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

// Small things about the screen itself (which tab is open, the running timer).
const ui = { tab: 'train', planWeek: null, trainDate: null, openEx: null, checkDate: null, todoFilter: 'All', todoCat: 'Personal', planDraft: '' };
let savedUi = {};
try { savedUi = JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { savedUi = {}; }
if (['train', 'check', 'todo', 'more'].includes(savedUi.tab)) ui.tab = savedUi.tab;
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

    const type = isText(d.type) ? d.type.trim().toLowerCase() : exercises.length ? 'lift' : cardio.length ? 'cardio' : 'rest';
    days.push({ date: d.date, name: txt(d.name), type, exercises, cardio, checklist });
  });

  if (errors.length) return { errors, warnings };
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    plan: { week: o.week, title: isText(o.title) ? o.title.trim() : `Week of ${niceDate(o.week)}`, rules, days },
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
  const t = todayKey();
  const mon = addDays(t, -((fromKey(t).getDay() + 6) % 7));
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
    const logged = data.sets.some((s) => s.date === d.date);
    return `<button class="day-chip ${d.date === day.date ? 'active' : ''} ${d.date === t ? 'today' : ''}" data-action="train-day" data-date="${d.date}" aria-label="${esc(niceDate(d.date))}: ${esc(d.name)}">
      <span>${DOW[dt.getDay()]}</span><b>${dt.getDate()}</b><i class="dot ${logged ? 'on' : ''}"></i></button>`;
  }).join('')}</div>`;
  h += renderDay(day, plan);
  return h;
}

function renderDay(day, plan) {
  const label = { lift: 'Lift', cardio: 'Cardio', rest: 'Rest' }[day.type] || cap(day.type);
  let h = `<section class="day-head">
    <div><h3>${esc(day.name)}</h3><div class="muted small">${niceDate(day.date)}${day.date === todayKey() ? ' · Today' : ''}</div></div>
    <span class="badge ${esc(day.type)}">${esc(label)}</span>
  </section>`;
  h += day.exercises.map((ex, i) => renderExercise(day, ex, i)).join('');
  if (day.cardio.length) {
    h += '<h4 class="section-label">Cardio</h4>';
    h += day.cardio.map((c) => `<div class="card cardio-card">
      <div class="row-between"><b>${esc(cap(c.type))}</b><span>${c.minutes ? `${esc(c.minutes)} min` : ''}${c.optional ? ' · optional' : ''}</span></div>
      ${c.notes ? `<div class="muted">${esc(c.notes)}</div>` : ''}
    </div>`).join('');
    h += '<p class="muted small">Cardio logging comes in the next version.</p>';
  }
  if (!day.exercises.length && !day.cardio.length) h += '<div class="card muted">Rest day. Walk, stretch, recover.</div>';
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
  </div>`;
  return h;
}

function logSet(key, date, i) {
  const plan = activePlan();
  const day = plan && plan.days.find((d) => d.date === date);
  const ex = day && day.exercises[i];
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

/* ---------- 6. Rest timer ---------- */
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

/* ---------- 7. Daily checklist ---------- */
const dayRec = (date) => data.daily[date] || {};
function setDaily(date, field, value) {
  const r = data.daily[date] || (data.daily[date] = {});
  if (value === null || value === undefined || value === false) delete r[field];
  else r[field] = value;
  if (!Object.keys(r).length) delete data.daily[date];
  save();
}
const isBuiltIn = (text) => /10,?000\s*steps/i.test(text) || /back pain/i.test(text);
function planChecklist(date) {
  const pd = planDayFor(date);
  return pd ? pd.checklist.filter((x) => !isBuiltIn(x)) : [];
}
function checklistItems(date) {
  const r = dayRec(date);
  const checks = r.checks || {};
  return [
    !!r.steps,
    (r.protein || 0) >= TARGETS.proteinMin,
    (r.calories || 0) > 0,
    r.weight != null,
    r.waist != null,
    r.backPain != null,
    ...planChecklist(date).map((x) => !!checks[x]),
  ];
}
function weightAvg(date) {
  const vals = [];
  for (let i = 0; i < 7; i++) {
    const r = data.daily[addDays(date, -i)];
    if (r && r.weight != null) vals.push(r.weight);
  }
  return vals.length ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length } : null;
}

function summaryHtml(date) {
  const items = checklistItems(date);
  const n = items.filter(Boolean).length;
  const all = n === items.length;
  return `<div class="row-between"><b>${n} of ${items.length} done</b><span class="muted small">${all ? 'All done 🎉' : ''}</span></div>
    <div class="bar ${all ? 'ok' : ''}"><i style="width:${(n / items.length) * 100}%"></i></div>`;
}
function statHead(field, date) {
  const r = dayRec(date);
  if (field === 'protein') {
    const p = r.protein || 0;
    return `<div class="row-between"><b>Protein</b><span><b>${fmtNum(p)}</b> / ${TARGETS.protein} g</span></div>
      <div class="bar ${p >= TARGETS.proteinMin ? 'ok' : ''}"><i style="width:${Math.min(100, (p / TARGETS.protein) * 100)}%"></i></div>`;
  }
  if (field === 'calories') {
    const c = r.calories || 0;
    return `<div class="row-between"><b>Calories</b><span><b>${c.toLocaleString()}</b> / ~${TARGETS.calories.toLocaleString()}</span></div>
      <div class="bar ${c >= TARGETS.caloriesLow ? 'ok' : ''}"><i style="width:${Math.min(100, (c / TARGETS.calories) * 100)}%"></i></div>`;
  }
  if (field === 'weight') {
    const a = weightAvg(date);
    return `<div class="row-between"><b>Weigh-in</b><span class="muted small">${a ? `7-day avg <b>${fmtNum(a.avg)} lb</b> (${a.n})` : 'Morning, after the bathroom'}</span></div>`;
  }
  if (field === 'waist') return '<div class="row-between"><b>Waist</b><span class="muted small">At the belly button, relaxed</span></div>';
  return '';
}
function patchChecklist() {
  const date = ui.checkDate || todayKey();
  const s = $('#check-summary');
  if (s) s.innerHTML = summaryHtml(date);
  document.querySelectorAll('[data-head]').forEach((el) => { el.innerHTML = statHead(el.dataset.head, date); });
}

function renderChecklist() {
  const t = todayKey();
  const date = ui.checkDate || t;
  const r = dayRec(date);
  const checks = r.checks || {};
  const numBox = (field, mode, ph) => `<input class="num sm" type="number" inputmode="${mode}" step="any" min="0" data-daily="${field}" value="${r[field] ?? ''}" placeholder="${ph}" aria-label="${field}">`;
  const adds = (field, list) => list.map((n) => `<button class="chip-btn" data-action="add-daily" data-field="${field}" data-by="${n}">+${n}</button>`).join('');
  const checkRow = (on, attrs, label) => `<button class="check-row ${on ? 'on' : ''}" ${attrs}><span class="box">${on ? '✓' : ''}</span><span>${label}</span></button>`;

  let h = `<section class="date-nav">
    <button class="icon-btn" data-action="check-day" data-by="-1" aria-label="Previous day">‹</button>
    <div class="week-title"><h2>${date === t ? 'Today' : niceDate(date)}</h2><div class="muted small">${date === t ? niceDate(date) : 'Editing a past day'}</div></div>
    <button class="icon-btn" data-action="check-day" data-by="1" ${date >= t ? 'disabled' : ''} aria-label="Next day">›</button>
  </section>
  <div class="card" id="check-summary">${summaryHtml(date)}</div>

  ${checkRow(!!r.steps, 'data-action="toggle-daily" data-field="steps"', 'Walk 10,000 steps')}

  <div class="card">
    <div data-head="protein">${statHead('protein', date)}</div>
    <div class="quick">${numBox('protein', 'decimal', 'grams')}${adds('protein', [10, 20, 30])}</div>
    <div class="muted small" style="margin-top:6px">130 g minimum is OK. Egg ≈ 6 g · cup of milk ≈ 8 g · 4 oz chicken ≈ 28 g</div>
  </div>

  <div class="card">
    <div data-head="calories">${statHead('calories', date)}</div>
    <div class="quick">${numBox('calories', 'numeric', 'calories')}${adds('calories', [100, 250, 500])}</div>
    <div class="muted small" style="margin-top:6px">2,300–2,400 on lighter training days</div>
  </div>

  <div class="card">
    <div data-head="weight">${statHead('weight', date)}</div>
    <div class="quick">${numBox('weight', 'decimal', '165.0')}<span class="unit">lb</span></div>
  </div>

  <div class="card">
    <div data-head="waist">${statHead('waist', date)}</div>
    <div class="quick">${numBox('waist', 'decimal', '32.0')}<span class="unit">in</span></div>
  </div>

  <div class="card">
    <div class="row-between"><b>Back pain today</b><span>${r.backPain != null ? `<b>${r.backPain}</b>/10` : 'not set'}</span></div>
    <div class="pain-row">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button class="pain ${r.backPain === n ? 'active' : ''}" style="--c:hsl(${140 - (n - 1) * 15} 70% 55%)" data-action="pain" data-n="${n}" aria-label="Pain ${n} of 10">${n}</button>`).join('')}</div>
    <div class="muted small" style="margin-top:8px">1 = barely notice it · 10 = worst ever. Tap again to clear.</div>
  </div>`;

  const extra = planChecklist(date);
  if (extra.length) {
    h += '<h4 class="section-label">From this week\'s plan</h4>';
    h += extra.map((x) => checkRow(!!checks[x], `data-action="toggle-check" data-text="${esc(x)}"`, esc(x))).join('');
  }
  return h;
}

/* ---------- 8. To-do list ---------- */
function renderTodo() {
  const t = todayKey();
  const f = ui.todoFilter;
  const match = (x) => f === 'All' || x.category === f;
  const open = data.todos.filter((x) => !x.done && x.date <= t)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created || 0) - (b.created || 0)));
  const doneToday = data.todos.filter((x) => x.done && x.doneDate === t);

  const row = (x) => `<div class="todo cat-${slug(x.category || 'Personal')} ${x.done ? 'done' : ''}">
    <button class="todo-check" data-action="todo-toggle" data-id="${x.id}">
      <span class="box">${x.done ? '✓' : ''}</span>
      <span class="todo-text">${esc(x.text)}<small>${esc(x.category || 'Personal')}${!x.done && x.date < t ? ` · <span class="carried">↻ carried over from ${esc(relDay(x.date))}</span>` : ''}</small></span>
    </button>
    <button class="icon-btn small" data-action="todo-del" data-id="${x.id}" aria-label="Delete">✕</button>
  </div>`;

  const shown = open.filter(match);
  let h = `<h2>To-Do</h2><div class="muted small">${niceDate(t)}</div>
  <form class="card" data-form="todo">
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
  data.todos.push({ id: uid(), text, category: cat, date: todayKey(), done: false, doneDate: null, created: Date.now() });
  save();
  render();
  const again = $('#todo-text');
  if (again) again.focus(); // keep the keyboard up so you can add several in a row
}

/* ---------- 9. More: import, saved plans, backup ---------- */
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
  const ok = confirm(`Replace ALL data on this device with this backup?\n\nBackup from: ${when}\n${n.sets.length} sets · ${Object.keys(n.plans).length} plans · ${n.todos.length} to-dos · ${Object.keys(n.daily).length} checklist days\n\nWhat's on this device now will be overwritten.`);
  if (!ok) return;
  try { localStorage.setItem(`${STORE_KEY}.beforeRestore`, JSON.stringify(data)); } catch (e) { /* ignore */ }
  data = n;
  save();
  Object.keys(drafts).forEach((k) => delete drafts[k]);
  ui.planWeek = null;
  ui.trainDate = null;
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
    <p class="muted small">Stored: ${data.sets.length} sets · ${data.todos.length} to-dos · ${Object.keys(data.daily).length} checklist days · version ${APP_VERSION}</p>
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

/* ---------- 10. Drawing the screen & handling taps ---------- */
function render() {
  const view = $('#view');
  if (ui.tab === 'train') view.innerHTML = renderTrain();
  else if (ui.tab === 'check') view.innerHTML = renderChecklist();
  else if (ui.tab === 'todo') view.innerHTML = renderTodo();
  else view.innerHTML = renderMore();
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
  renderTimer();
}

// Every tappable thing has data-action="..."; this table says what each one does.
const actions = {
  tab(el) {
    ui.tab = el.dataset.tab;
    importResult = null;
    saveUi();
    render();
    window.scrollTo(0, 0);
  },
  'plan-week'(el) { ui.planWeek = el.dataset.week || null; ui.trainDate = null; ui.openEx = null; render(); },
  'train-day'(el) { ui.trainDate = el.dataset.date; ui.openEx = null; render(); },
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

  'check-day'(el) {
    const next = addDays(ui.checkDate || todayKey(), Number(el.dataset.by));
    ui.checkDate = next >= todayKey() ? null : next;
    render();
  },
  'toggle-daily'(el) {
    const date = ui.checkDate || todayKey();
    setDaily(date, el.dataset.field, !dayRec(date)[el.dataset.field]);
    render();
  },
  'add-daily'(el) {
    const date = ui.checkDate || todayKey();
    const f = el.dataset.field;
    setDaily(date, f, (dayRec(date)[f] || 0) + Number(el.dataset.by));
    render();
  },
  pain(el) {
    const date = ui.checkDate || todayKey();
    const n = Number(el.dataset.n);
    setDaily(date, 'backPain', dayRec(date).backPain === n ? null : n);
    render();
  },
  'toggle-check'(el) {
    const date = ui.checkDate || todayKey();
    const checks = { ...(dayRec(date).checks || {}) };
    const text = el.dataset.text;
    if (checks[text]) delete checks[text]; else checks[text] = true;
    setDaily(date, 'checks', Object.keys(checks).length ? checks : null);
    render();
  },

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
  if (t.id === 'plan-text') ui.planDraft = t.value;
});
// Finished typing in a box (you tapped away): save it.
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.daily) {
    const v = num(t.value);
    setDaily(ui.checkDate || todayKey(), t.dataset.daily, v !== null && v >= 0 ? v : null);
    patchChecklist(); // update the numbers without redrawing the whole screen
  }
  if (t.id === 'todo-cat') { ui.todoCat = t.value; saveUi(); }
  if (t.id === 'restore-file' && t.files && t.files[0]) {
    restoreFromFile(t.files[0]);
    t.value = '';
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.dataset.form === 'todo') { e.preventDefault(); addTodo(); }
});
// Coming back to the app (e.g. after locking the phone): refresh the timer and "today".
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (timer.end) keepAwake(true);
  const typing = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (!typing) render();
});

/* ---------- Start up ---------- */
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
