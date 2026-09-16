/* ============================================================
   myvocab — Core Application Engine
   ============================================================ */

/* ---------- CONSTANTS ---------- */
const STORE_KEY     = 'myvocab_settings_v3';
const LEGACY_KEYS   = ['myvocab_settings_v2'];
const TOTAL_WORDS   = GROUPS.reduce((n, g) => n + g.w.length, 0);
const TOTAL_VERBS   = VERB_GROUPS.reduce((n, g) => n + g.v.length, 0);
const RATE_NORMAL   = 0.9;
const RATE_SLOW     = 0.55;
const GAP_NORMAL    = 600;
const GAP_SLOW      = 950;
const SEARCH_DEBOUNCE = 120;

const $  = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- TEXT NORMALISATION ----------
   Turli apostroflar (’ ‘ ` ´) bitta ' ga keltiriladi, shunda
   "Ko‘rsatma" ni "ko'rsatma" deb ham topish mumkin. */
function normText(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’ʻʼ`´]/g, "'")
    .toLowerCase();
}

/* So'zning yagona kaliti — inglizcha (BrE) shakli.
   Bitta so'z bir necha darsda uchrasa ham status bitta bo'ladi. */
function wordKey(w) {
  return normText(w[0]).trim();
}

/* ---------- STORAGE (migratsiya bilan) ---------- */
function readStore() {
  for (const key of [STORE_KEY, ...LEGACY_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { /* buzilgan yozuvni e'tiborsiz qoldiramiz */ }
  }
  return null;
}

/* v2 → v3: kalit "topic::date::Word" edi, endi faqat "word". */
function migrate(s) {
  if (!s || typeof s !== 'object') return null;
  if (Array.isArray(s.learnedWords)) {
    const out = new Set();
    s.learnedWords.forEach(k => {
      if (typeof k !== 'string') return;
      const parts = k.split('::');
      const word = parts.length >= 3 ? parts.slice(2).join('::') : k;
      const norm = normText(word).trim();
      if (norm) out.add(norm);
    });
    s.learnedWords = [...out];
  }
  return s;
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      v: 5,
      theme: document.documentElement.getAttribute('data-theme'),
      script, accent, slow, activeLesson, filterMode, mode, learnedFilter, advOpen,
      dataset, activeVerbGroup, daily, level, lessonByLevel,
      progressWords: progWords,
      progressVerbs: progVerbs,
      tsSource, tsCustomKey, tsCount, tsDir, tsOrder, tsStatus, hubCount
    }));
  } catch (e) { /* privat rejim / to'la xotira — jim o'tamiz */ }
}

/* ---------- APP STATE ---------- */
const saved = readStore();
let script        = saved?.script || 'lat';            // lat | cyr
let accent        = saved?.accent || 'us';             // us  | uk
let slow          = !!saved?.slow;
let activeLesson  = saved?.activeLesson || 'all';
/* Modul (daraja). Har biri o'z darslari bilan alohida; so'z holati (SRS) esa umumiy —
   bir so'z ikkala modulda bo'lsa, statusi bitta. "Takror" va "Qiyin" — barcha modullardan. */
const LEVELS = {
  elem:   { name: 'Elementary',       code: 'A2' },
  preint: { name: 'Pre-Intermediate', code: 'B1' }
};
let level         = LEVELS[saved?.level] ? saved.level : 'preint';
let lessonByLevel = saved?.lessonByLevel || {};        // har modulda oxirgi tanlangan dars
let filterMode    = saved?.filterMode || 'date';       // date | topic
let mode          = (typeof saved?.mode === 'number') ? saved.mode : 0;
let learnedFilter = saved?.learnedFilter || 'all';     // all | unlearned | learning | learned
let advOpen       = (typeof saved?.advOpen === 'boolean') ? saved.advOpen : false;
let query         = '';

/* ---------- SRS: INTERVAL TAKRORLASH ----------
   Har bir so'z uchun yozuv:  { box, due, wrong }
     box   — 0 dan 5 gacha. 0 = hali yodlanmagan.
     due   — keyingi takrorlash sanasi (YYYY-MM-DD).
     wrong — mashg'ulotda necha marta xato qilingani.
   Qutidan qutiga o'tganda oraliq uzayadi: 1 → 3 → 7 → 21 → 60 kun. */
const SRS_STEPS = [1, 3, 7, 21, 60];
const MAX_BOX   = SRS_STEPS.length;
const HARD_AT   = 2;   // shuncha xatodan keyin "Qiyin" ro'yxatiga tushadi
const HARD_OUT  = 3;   // shu qutiga yetgach ro'yxatdan chiqadi (haftalik oraliq)

/* ---------- 4 TA MASHQ: so'z Takrorga faqat hammasidan o'tgach tushadi ----------
   st — bit maskasi: qaysi mashqlardan o'tilgani. Tartib erkin,
   tavsiya qilingani — osondan qiyinga (ro'yxatdagi tartib). */
const STAGES = [
  { id: 'card',  bit: 1, ico: '🃏', name: 'Kartochka' },
  { id: 'test',  bit: 2, ico: '✅', name: 'Test' },
  { id: 'spell', bit: 4, ico: '✍️', name: 'Yozib mashq' },
  { id: 'dict',  bit: 8, ico: '🎧', name: 'Eshitib yozish' }
];
const ALL_STAGES = 15;
/* Mashq rejimi → bosqich. UZB → ENG va Aralash ham kartochka hisoblanadi. */
const DIR_STAGE = { eng_uzb: 'card', uzb_eng: 'card', mix: 'card', test: 'test', spell: 'spell', dict: 'dict' };
const stageBit  = id => STAGES.find(s => s.id === id)?.bit || 0;

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

let progWords = migrateProgress(saved?.progressWords, saved?.learnedWords);
let progVerbs = migrateProgress(saved?.progressVerbs, saved?.learnedVerbs);

/* v3 → v4: eski "yodlangan so'zlar ro'yxati" SRS yozuvlariga aylanadi.
   Ular allaqachon o'rganilgan, shuning uchun 2-qutiga qo'yiladi. */
function migrateProgress(fresh, legacyList) {
  const out = {};
  if (fresh && typeof fresh === 'object') {
    Object.entries(fresh).forEach(([k, e]) => { if (e && typeof e === 'object') out[k] = withStages(e); });
    return out;
  }
  (Array.isArray(legacyList) ? legacyList : []).forEach(k => {
    if (typeof k === 'string' && k) out[k] = { box: 2, due: addDays(3), wrong: 0, st: ALL_STAGES };
  });
  return out;
}

/* v4 → v5: mashq bosqichlari paydo bo'lishidan oldin yodlangan so'zlar 4/4 hisoblanadi.
   Qoida: Takrordagi so'z (box ≥ 1) doim 4/4. */
function withStages(e) {
  const box = e.box || 0;
  const st  = box >= 1 ? ALL_STAGES : (typeof e.st === 'number' ? e.st & ALL_STAGES : 0);
  return { box, due: e.due || today(), wrong: e.wrong || 0, st };
}

/* Kunlik maqsad va ketma-ket kunlar */
let daily = saved?.daily && typeof saved.daily === 'object'
  ? { goal: 20, days: {}, todayKeys: [], day: today(), ...saved.daily }
  : { goal: 20, days: {}, todayKeys: [], day: today() };

/* Ikki bo'lim: so'zlar lug'ati va noto'g'ri fe'llar */
let dataset         = saved?.dataset === 'verbs' ? 'verbs' : 'words';
let activeVerbGroup = saved?.activeVerbGroup || 'all';

const isVerbs    = () => dataset === 'verbs';
const prog       = () => isVerbs() ? progVerbs : progWords;

const boxOf      = k => prog()[k]?.box || 0;
const isLearned  = k => boxOf(k) >= 1;
const stOf       = k => prog()[k]?.st || 0;
const isLearning = k => !isLearned(k) && stOf(k) > 0;     // 1–3 ta mashqdan o'tgan
const isDue      = k => { const e = prog()[k]; return !!e && e.box >= 1 && e.due <= today(); };
/* "Qiyin" — tarix emas, hozirgi holat: so'z ko'p xato qilingan
   BO'LSA-DA hali mustahkam o'zlashtirilmagan bo'lsa ro'yxatda turadi.
   HARD_OUT qutisiga yetgach (haftalik oraliq) o'zi chiqib ketadi. */
const isHard     = k => {
  const e = prog()[k];
  return !!e && (e.wrong || 0) >= HARD_AT && (e.box || 0) < HARD_OUT;
};

/* Mashq natijasi.
   result: 'ok'   — o'tdi,
           'bad'  — xato,
           'hint' — to'g'ri, lekin harflar ochilgan: hisoblanmaydi (lekin xato ham emas).
   Yodlanmagan so'zda: shu mashq belgilanadi; 4/4 bo'lsa — 1-quti, ya'ni ertaga Takrorda.
   Takrordagi so'zda: to'g'ri — keyingi quti (oldingidek);
   xato — boshiga qaytadi va FAQAT shu mashq qayta "bajarilmagan" bo'ladi.
   Qaytaradi: true — so'z hozirgina Takrorga o'tdi. */
function recordAnswer(key, stage, result) {
  markDailyDone(key);
  if (result === 'hint') return false;

  const p   = prog();
  const e   = p[key] || { box: 0, due: today(), wrong: 0, st: 0 };
  const bit = stageBit(stage);

  if (result === 'bad') {
    p[key] = { box: 0, due: today(), wrong: e.wrong + 1, st: e.st & ~bit };
    return false;
  }
  if (e.box >= 1) {
    const box = Math.min(e.box + 1, MAX_BOX);
    p[key] = { ...e, box, due: addDays(SRS_STEPS[box - 1]) };
    return false;
  }
  const st = e.st | bit;
  if (st !== ALL_STAGES) { p[key] = { ...e, st }; return false; }
  p[key] = { box: 1, due: addDays(SRS_STEPS[0]), wrong: e.wrong, st };
  return true;
}

/* ---------- KUNLIK MAQSAD ---------- */
function markDailyDone(key) {
  const t = today();
  if (daily.day !== t) { daily.day = t; daily.todayKeys = []; }
  if (daily.todayKeys.includes(key)) return;
  daily.todayKeys.push(key);
  daily.days[t] = (daily.days[t] || 0) + 1;
  /* faqat oxirgi 90 kun saqlanadi */
  const keys = Object.keys(daily.days).sort();
  while (keys.length > 90) delete daily.days[keys.shift()];
  updateDailyPill();
}

const doneToday = () => daily.days[today()] || 0;

/* Ketma-ket kunlar: bugundan (yoki kechadan) orqaga qarab uzluksiz zanjir */
function streakDays() {
  const d = new Date();
  if (!daily.days[today()]) d.setDate(d.getDate() - 1);   // bugun hali boshlanmagan bo'lishi mumkin
  let n = 0;
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    if (!daily.days[key]) break;
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
const activeKey  = () => isVerbs() ? activeVerbGroup : activeLesson;
const setActiveKey = v => { if (isVerbs()) activeVerbGroup = v; else activeLesson = v; };
const unit       = () => isVerbs() ? 'ta fe\'l' : 'ta so\'z';
const totalOf    = () => isVerbs() ? TOTAL_VERBS : levelItems().length;

/* Mashg'ulot sozlamalari */
let tsSource    = saved?.tsSource || 'current';   // current | all | custom
let tsCustomKey = saved?.tsCustomKey || 'all';
let tsCount     = saved?.tsCount || '20';         // 10 | 20 | 50 | all
let tsDir       = saved?.tsDir || 'eng_uzb';      // eng_uzb | uzb_eng | spell | dict | test | mix
let tsOrder     = saved?.tsOrder || 'shuffle';    // shuffle | seq
let tsStatus    = saved?.tsStatus || 'unlearned'; // unlearned | all | learned
let hubCount    = saved?.hubCount || '20';        // 10 | 20 | all — o'rganish markazidagi mashq hajmi

/* ---------- SEARCH INDEX (bir marta quriladi) ---------- */
const ITEMS = [];
GROUPS.forEach(g => g.w.forEach(w => {
  ITEMS.push({
    w, g,
    level: g.level || 'elem',
    key: wordKey(w),
    hay: normText(w.filter(Boolean).join(' '))   // IPA ham qidiruvga kiradi
  });
}));

const VERB_ITEMS = [];
VERB_GROUPS.forEach(g => g.v.forEach(v => {
  VERB_ITEMS.push({
    v, g,
    key: normText(v[0].split('|')[0]).trim(),    // kalit — 1-shakl (infinitiv)
    hay: normText(v.filter(Boolean).join(' ').replace(/\|/g, ' '))
  });
}));

let _lvItems = null, _lvKey = null;
const levelItems  = () => {
  if (_lvKey !== level) { _lvItems = ITEMS.filter(i => i.level === level); _lvKey = level; }
  return _lvItems;
};
const activeItems = () => isVerbs() ? VERB_ITEMS : levelItems();   // joriy modul
const allItems    = () => isVerbs() ? VERB_ITEMS : ITEMS;          // barcha modullar

/* ---------- MISOL GAPLAR ----------
   sentences.js hali yuklanmagan yoki so'z uchun gap yozilmagan
   bo'lsa — null qaytadi va kartochkada blok umuman chizilmaydi. */
function sentenceOf(key) {
  const s = (typeof SENTENCES !== 'undefined') ? SENTENCES[key] : null;
  return (Array.isArray(s) && s[0]) ? s : null;
}

/* Nomzod shakllarni kengaytiramiz: agar so'z (yoki iboraning birinchi
   so'zi) noto'g'ri fe'l bo'lsa, uning V2/V3 shakllari ham qo'shiladi.
   "fall off" -> "fell off", "be" -> "was", "were". */
function expandForms(words) {
  const out = [];
  words.filter(Boolean).forEach(word => {
    out.push(word);
    const parts = String(word).trim().split(/\s+/);
    const vi = VERB_ITEMS.find(i => i.key === normText(parts[0]));
    if (!vi) return;
    const rest = parts.slice(1).join(' ');
    vFormsOf(vi.v).forEach(form =>
      form.split('/').forEach(f => out.push(rest ? `${f} ${rest}` : f))
    );
  });
  return [...new Set(out)];
}

/* Gap ichidagi o'rganilayotgan so'zni qalin qilib ajratamiz.
   "instruction" -> "instructions", "study" -> "studied" kabi
   qo'shimchali shakllar ham topiladi. */
function highlightWord(sentence, words) {
  const esc  = p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* har bir qismga qo'shimcha ruxsat: make -> makes, study -> studied */
  /* "smb", "sth" — gapda istalgan so'z: "give smb a call" -> "Give me a call" */
  const WILD = /^(smb|sb|sth|somebody|someone|something)$/i;
  const flex = p => WILD.test(p) ? "[\\w']+"
    : esc(p).replace(/e$/, 'e?') + (/[bdgklmnprt]$/i.test(p) ? esc(p.slice(-1)) + '?' : '') + '[a-z]{0,3}';

  const cands = expandForms(Array.isArray(words) ? words : [words]);
  for (const word of cands) {
  const parts = String(word).trim().split(/\s+/);
  const last  = parts[parts.length - 1];
  const patterns = [
    parts.map(flex).join('\\s+'),                              // to'liq ibora
    parts.length > 1                                           // orada qo'shimcha so'z:
      ? parts.map(flex).join('\\s+(?:\\w+\\s+){0,2}')          // "have a long conversation"
      : null,
    last.length >= 4 && !WILD.test(last)                       // faqat asosiy so'z:
      ? esc(last).replace(/s$/, '') + '[a-z]{0,3}'             // "do smb a favour" -> favour
      : null
  ].filter(Boolean);

  for (const p of patterns) {
    let m;
    try { m = new RegExp(`\\b(${p})`, 'i').exec(sentence); } catch (e) { continue; }
    if (m) {
      return escapeHtml(sentence.slice(0, m.index)) +
             '<b>' + escapeHtml(m[0]) + '</b>' +
             escapeHtml(sentence.slice(m.index + m[0].length));
    }
  }
  }
  return escapeHtml(sentence);
}

/* ---------- TOAST ---------- */
const toastWrap = $('toastWrap');
function toast(message, actionLabel, onAction) {
  const t = document.createElement('div');
  t.className = 'toast';
  const span = document.createElement('span');
  span.textContent = message;
  t.appendChild(span);

  const kill = () => {
    t.classList.add('hide');
    setTimeout(() => t.remove(), 250);
  };

  if (actionLabel) {
    const b = document.createElement('button');
    b.textContent = actionLabel;
    b.addEventListener('click', () => { kill(); onAction && onAction(); });
    t.appendChild(b);
  }
  toastWrap.appendChild(t);
  setTimeout(kill, actionLabel ? 10000 : 3200);
  return t;
}

/* ---------- THEME ---------- */
let themeSwitchTimer = null;
function setTheme(t) {
  /* Barcha o'tish animatsiyalarini bir lahzaga o'chiramiz — aks holda
     elementlar turli tezlikda rang almashtirib, "chala rang" ko'rinadi */
  const root = document.documentElement;
  root.classList.add('theme-switching');

  root.setAttribute('data-theme', t);
  root.style.colorScheme = t;
  $('themeColor')?.setAttribute('content', t === 'dark' ? '#090d14' : '#f1f5f9');

  clearTimeout(themeSwitchTimer);
  themeSwitchTimer = setTimeout(() => root.classList.remove('theme-switching'), 60);

  const btn  = $('themeBtn');
  const span = btn.querySelector('.btn-label');
  const icon = $('themeIcon');
  const dark = t === 'dark';

  span.textContent = dark ? 'Oq rejim' : 'Qora rejim';
  btn.setAttribute('aria-label', dark ? 'Oq rejimga o\'tish' : 'Qora rejimga o\'tish');
  if (icon) {
    icon.innerHTML = dark
      ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
      : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
  saveState();
}

$('themeBtn').addEventListener('click', () => {
  setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});
setTheme(document.documentElement.getAttribute('data-theme') || 'dark');

/* ---------- DATA AGGREGATION ---------- */
/* allLevels — "Takror"/"Qiyin" uchun: barcha modullarning darslari */
const _secCache = new Map();
let _verbSecCache = null;
function sections(allLevels = false) {
  if (isVerbs()) {
    if (!_verbSecCache) {
      _verbSecCache = VERB_GROUPS.map(g => ({
        key: g.key, title: g.title, hint: g.hint,
        w: VERB_ITEMS.filter(i => i.g === g)
      }));
    }
    return _verbSecCache;
  }

  const ck = `${filterMode}|${allLevels ? '*' : level}`;
  if (_secCache.has(ck)) return _secCache.get(ck);

  const map = new Map();
  (allLevels ? ITEMS : levelItems()).forEach(item => {
    const key = filterMode === 'date' ? item.g.date : item.g.topic;
    let o = map.get(key);
    if (!o) { o = { key, date: item.g.date, topic: item.g.topic, level: item.level, w: [] }; map.set(key, o); }
    o.w.push(item);
    if (item.g.date > o.date) o.date = item.g.date;
  });

  const out = [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || a.topic.localeCompare(b.topic));
  _secCache.set(ck, out);
  return out;
}

/* ---------- TTS AUDIO ---------- */
const synth = window.speechSynthesis;
let voices = [];
let warnShown = false;

function showWarn(msg) {
  const el = $('warn');
  if (msg) el.textContent = msg;
  el.style.display = 'block';
  warnShown = true;
}

function loadVoices() { if (synth) voices = synth.getVoices() || []; }
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
  if (!synth.addEventListener) synth.onvoiceschanged = loadVoices;
} else {
  showWarn();
}

function pickVoice() {
  const want = accent === 'us' ? 'en-us' : 'en-gb';
  const norm = v => (v.lang || '').replace('_', '-').toLowerCase();
  const pool = voices.filter(v => norm(v).startsWith(want));
  const pref = accent === 'us'
    ? ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Zira', 'Alex', 'Ava']
    : ['Daniel', 'Google UK English Female', 'Google UK English Male', 'Microsoft Sonia', 'Kate', 'Serena'];

  for (const p of pref) {
    const m = pool.find(v => v.name && v.name.includes(p));
    if (m) return m;
  }
  return pool[0] || voices.find(v => norm(v).startsWith('en')) || null;
}

let playing = null;
function speak(text, card, onEnd, opts = {}) {
  if (!synth) { showWarn(); onEnd && onEnd(); return; }

  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang  = accent === 'us' ? 'en-US' : 'en-GB';
  u.rate  = opts.rate || (slow ? RATE_SLOW : RATE_NORMAL);
  const v = pickVoice();
  if (v) u.voice = v;

  if (playing) playing.classList.remove('playing');
  playing = card || null;
  if (card) {
    card.classList.add('playing');
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    if (card) card.classList.remove('playing');
    if (playing === card) playing = null;
    onEnd && onEnd();
  };

  u.onend = done;
  u.onerror = (e) => {
    const err = e && e.error;
    if (err && err !== 'canceled' && err !== 'interrupted' && !warnShown) showWarn();
    done();
  };

  synth.speak(u);
}

/* ---------- RENDER ---------- */
const list    = $('list');
const countEl = $('count');

function wordOf(w) { return (accent === 'us' && w[1]) ? w[1] : w[0]; }
function ipaOf(w)  { return accent === 'us' ? w[5] : w[2]; }
function pronOf(w) {
  if (accent === 'us') return script === 'cyr' ? w[7] : w[6];
  return script === 'cyr' ? w[4] : w[3];
}

/* Fe'l uchun: uchala shakl massiv sifatida */
function vFormsOf(v) { return ((accent === 'us' && v[1]) ? v[1] : v[0]).split('|'); }
function vIpaOf(v)   { return (accent === 'us' ? v[5] : v[2]).split('|'); }
function vPronOf(v)  {
  if (accent === 'us') return (script === 'cyr' ? v[7] : v[6]).split('|');
  return (script === 'cyr' ? v[4] : v[3]).split('|');
}

function matchesFilters(item) {
  const k = item.key;
  if (learnedFilter === 'unlearned' && (isLearned(k) || stOf(k))) return false;   // hali birorta mashq yo'q
  if (learnedFilter === 'learning'  && !isLearning(k)) return false;
  if (learnedFilter === 'learned'   && !isLearned(k))  return false;
  return !query || item.hay.includes(query);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/* So'z holati: 4 ta mashq belgisi va nima qolgani.
   Qo'lda "yodlandi" deb belgilash yo'q — so'z faqat 4 ta mashq orqali Takrorga o'tadi. */
function stageStripHTML(key) {
  const e = prog()[key];
  const st = e?.st || 0, learned = isLearned(key);
  const icons = STAGES.map(s => {
    const on = learned || (st & s.bit);
    return `<span class="stg${on ? ' on' : ''}" data-stage="${s.id}" title="${s.name}: ${on ? 'o‘tildi' : 'hali o‘tilmagan'}">${s.ico}</span>`;
  }).join('');

  let text;
  if (learned) {
    text = isDue(key)          ? '🔁 Bugun takrorlash'
         : e.box >= MAX_BOX    ? `⭐ Mustahkam · takror ${fmt(e.due)}`
         :                       `🔁 Takror: ${fmt(e.due)}`;
  } else {
    const left = STAGES.filter(s => !(st & s.bit));
    text = left.length === STAGES.length ? 'Yangi · 4 ta mashq kerak'
         : left.length === 1             ? `3/4 · oxirgisi: ${left[0].name} → Takror`
         : `${STAGES.length - left.length}/4 · qoldi: ${left.map(s => s.name).join(', ')}`;
  }
  if (isHard(key)) text = '⚠️ ' + text;
  return `<div class="stages">${icons}<span class="stg-text">${escapeHtml(text)}</span></div>`;
}

const LISTEN_HTML = `
  <span class="listen">
    <span class="sound-wave" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
    Eshitish
  </span>`;

/* Kartochkadagi misol gap bloki (gap bo'lmasa — bo'sh satr) */
function sentBlockHTML(key, words) {
  const s = sentenceOf(key);
  if (!s) return '';
  return `
    <div class="sent">
      <button class="sent-play" title="Gapni eshitish" aria-label="Gapni eshitish">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1c2.9.9 5 3.5 5 6.7s-2.1 5.8-5 6.7v2.1c4-.9 7-4.5 7-8.8s-3-7.9-7-8.8z"/></svg>
      </button>
      <div class="sent-en" lang="en">${highlightWord(s[0], words)}</div>
      <div class="sent-tr" lang="uz">${escapeHtml(s[1])}</div>
    </div>`;
}

function wordCardHTML(item) {
  const w = item.w;
  return `
    <div class="top">
      <div class="en" lang="en">${escapeHtml(wordOf(w))}</div>
      <div class="actions-right">${LISTEN_HTML}</div>
    </div>
    <div class="ipa" lang="en">${escapeHtml(ipaOf(w))}</div>
    <div class="pron ${script === 'cyr' ? 'cyr' : ''}">${escapeHtml(pronOf(w))}</div>
    <div class="meta">
      <span class="lbl">RU</span><span class="val ru" lang="ru">${escapeHtml(w[8])}</span>
      <span class="lbl">UZ</span><span class="val uz" lang="uz">${escapeHtml(w[9])}</span>
    </div>
    ${sentBlockHTML(item.key, [w[0], w[1]])}
    ${stageStripHTML(item.key)}`;
}

function verbCardHTML(item) {
  const v = item.v;
  const forms = vFormsOf(v), ipa = vIpaOf(v), pron = vPronOf(v);
  const cols = forms.map((f, i) => `
    <div class="vform">
      <span class="vlbl">V${i + 1}</span>
      <div class="en" lang="en">${escapeHtml(f)}</div>
      <div class="ipa" lang="en">${escapeHtml(ipa[i] || '')}</div>
      <div class="pron ${script === 'cyr' ? 'cyr' : ''}">${escapeHtml(pron[i] || '')}</div>
    </div>`).join('');

  return `
    <div class="top top-verb">
      <div class="actions-right">${LISTEN_HTML}</div>
    </div>
    <div class="vforms">${cols}</div>
    <div class="meta">
      <span class="lbl">RU</span><span class="val ru" lang="ru">${escapeHtml(v[8])}</span>
      <span class="lbl">UZ</span><span class="val uz" lang="uz">${escapeHtml(v[9])}</span>
    </div>
    ${sentBlockHTML(item.key, [...forms, ...vFormsOf(v)])}
    ${stageStripHTML(item.key)}`;
}

/* animate=false — qidiruv paytida kartalar miltillamasligi uchun */
function render({ animate = true } = {}) {
  /* Ro'yxat qayta chizilsa, navbatdagi kartalar DOM'dan uziladi —
     shuning uchun avval ovoz navbatini to'xtatamiz */
  if (queue.length) stopQueue();

  const frag = document.createDocumentFragment();
  let shown = 0;

  const special = isSpecial(activeKey()) ? SPECIAL[activeKey()] : null;

  sections(!!special).forEach(L => {
    if (!special && activeKey() !== 'all' && activeKey() !== L.key) return;

    const rows = L.w.filter(i => matchesFilters(i) && (!special || special(i.key)));
    if (!rows.length) return;

    const h = document.createElement('div');
    h.className = 'lhead';
    h.innerHTML = '<h2></h2><span class="date"></span>';
    if (isVerbs()) {
      h.querySelector('h2').textContent = L.title;
      h.querySelector('.date').textContent = `${L.hint} · ${rows.length} ta`;
    } else {
      h.querySelector('h2').textContent = (filterMode === 'date' ? fmt(L.date) : L.topic) +
        (special ? ` · ${LEVELS[L.level].code}` : '');       // Takrorda — qaysi moduldan
      h.querySelector('.date').textContent = filterMode === 'date'
        ? `${rows.length} ta so'z`
        : `${fmt(L.date)} · ${rows.length} ta so'z`;
    }
    frag.appendChild(h);

    const g = document.createElement('div');
    g.className = 'grid';

    rows.forEach((item, index) => {
      shown++;
      const learned = isLearned(item.key);
      const verb = isVerbs();
      const say  = verb ? vFormsOf(item.v).join(', ') : wordOf(item.w);

      const c = document.createElement('div');
      c.className = 'card' + (verb ? ' verb-card' : '') +
                    (learned ? ' is-learned' : '') + (animate ? ' card-anim' : '');
      c.setAttribute('role', 'button');
      c.setAttribute('tabindex', '0');
      c.setAttribute('aria-label', `${say} — ${verb ? item.v[9] : item.w[9]}`);
      if (animate) c.style.animationDelay = `${Math.min(index * 25, 350)}ms`;
      c.dataset.word = say;
      c.dataset.key  = item.key;

      c.innerHTML = verb ? verbCardHTML(item) : wordCardHTML(item);

      /* Misol gapni alohida eshitish — kartani bosish bilan aralashmasin */
      c.querySelector('.sent-play')?.addEventListener('click', (e) => {
        e.stopPropagation();
        stopQueue();
        const sent = sentenceOf(item.key);
        if (sent) speak(sent[0], c);
      });

      const go = () => {
        stopQueue();
        c.classList.add('revealed');
        speak(say, c);
      };
      c.addEventListener('click', go);
      c.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });

      g.appendChild(c);
    });

    frag.appendChild(g);
  });

  list.replaceChildren(frag);

  if (!shown) {
    const e = document.createElement('div');
    e.className = 'empty-state';
    e.innerHTML = `
      <svg class="empty-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
      <h3>Hech narsa topilmadi</h3>
      <p>Qidiruv shartiga mos keladigan natija yo‘q.</p>
      <button id="resetFilterBtn" type="button">Filtrni tozalash</button>
    `;
    list.appendChild(e);

    /* Qidirilgan so'z boshqa modulda bo'lsa — o'sha yerga o'tish taklifi */
    const other = Object.keys(LEVELS).find(lv => lv !== level);
    const found = (!isVerbs() && query && !special)
      ? new Set(ITEMS.filter(i => i.level === other && i.hay.includes(query)).map(i => i.key)).size : 0;
    if (found) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'on';
      b.textContent = `${LEVELS[other].name}da ${found} ta topildi →`;
      b.addEventListener('click', () => {
        lessonByLevel[other] = 'all';
        $('levelSeg').querySelector(`[data-v="${other}"]`).click();
      });
      e.appendChild(b);
    }
    $('resetFilterBtn').addEventListener('click', () => {
      $('q').value = '';
      query = '';
      learnedFilter = 'all';
      setActiveKey('all');
      syncSeg('learnedSeg', learnedFilter);
      buildLessons();
      render();
      saveState();
    });
  }

  /* Telefonda sarlavhaga joy qolsin — "ta so'z" qismi CSS'da yashiriladi */
  countEl.innerHTML = `${shown}<span class="count-unit"> ${unit()}</span>`;
  countEl.title = `${shown} ${unit()}`;
  updateHub(visibleItems());
}

/* ---------- SEGMENTED CONTROLS ---------- */
function updateSegPill(wrap, instant) {
  const active = wrap.querySelector('button.on');
  const pill   = wrap.querySelector('.seg-pill');
  if (!active || !pill) return;

  /* Yashirilgan konteynerda o'lchov 0 bo'ladi — pilyulani ko'rsatmaymiz */
  if (!active.offsetWidth) { pill.style.opacity = '0'; return; }

  if (instant) pill.style.transition = 'none';
  pill.style.opacity   = '1';
  pill.style.width     = `${active.offsetWidth}px`;
  pill.style.height    = `${active.offsetHeight}px`;
  pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
  if (instant) setTimeout(() => { pill.style.transition = ''; }, 16);
}

function updateSegs(instant) {
  $$('.seg').forEach(w => updateSegPill(w, instant));
}

function syncSeg(id, value) {
  const wrap = $(id);
  if (!wrap) return;
  $$('button', wrap).forEach(b => {
    const on = b.dataset.v === value;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  });
  updateSegPill(wrap);
}

/* cb boshlang'ich holatda ham chaqiriladi (init=true bilan),
   shunda saqlangan sozlamaga bog'liq UI to'g'ri tiklanadi. */
function seg(id, initialVal, cb) {
  const wrap = $(id);
  if (!wrap) return;

  const has = wrap.querySelector(`button[data-v="${initialVal}"]`);
  const val = has ? initialVal : wrap.querySelector('button')?.dataset.v;
  syncSeg(id, val);
  updateSegPill(wrap, true);
  cb(val, true);

  wrap.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !wrap.contains(b)) return;
    syncSeg(id, b.dataset.v);
    cb(b.dataset.v, false);
    saveState();
  });

  /* Klaviatura: radiogroup ichida strelkalar bilan yurish */
  wrap.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const btns = $$('button', wrap);
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const dir  = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
    const next = btns[(i + dir + btns.length) % btns.length];
    next.focus();
    next.click();
  });
}

/* ---------- MAXSUS TO'PLAMLAR ---------- */
/* 'due'  — bugun takrorlash vaqti kelgan so'zlar
   'hard' — mashg'ulotda ikki va undan ko'p xato qilingan so'zlar */
const SPECIAL = { due: isDue, hard: isHard };
const isSpecial = k => Object.prototype.hasOwnProperty.call(SPECIAL, k);
const countSpecial = kind => allItems().filter(i => SPECIAL[kind](i.key)).length;   // barcha modullardan

/* ---------- LESSON CHIPS ---------- */
const lessonsWrap = $('lessons');
function buildLessons() {
  const secs = sections();
  const frag = document.createDocumentFragment();
  const scrollLeft = lessonsWrap.scrollLeft;   // qayta qurishda gorizontal pozitsiya saqlansin

  const totalAll   = secs.reduce((s, l) => s + l.w.length, 0);
  const learnedAll = activeItems().filter(i => isLearned(i.key)).length;

  const mk = (label, val, total, learnedCount) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(val === activeKey()));

    const sp = document.createElement('span');
    sp.className = 'd';
    sp.textContent = `${total} ta`;
    b.appendChild(sp);

    const bp = document.createElement('span');
    bp.className = 'badge-prog';
    bp.textContent = `${learnedCount}/${total}`;
    b.appendChild(bp);

    if (val === activeKey()) b.classList.add('on');
    b.addEventListener('click', () => {
      stopQueue();
      setActiveKey(val);
      $$('button', lessonsWrap).forEach(x => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      render();
      updatePoolCount();
      saveState();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    frag.appendChild(b);
  };

  const mkSpecial = (label, val, n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip-special chip-' + val;
    b.textContent = label;
    b.setAttribute('aria-pressed', String(val === activeKey()));
    const sp = document.createElement('span');
    sp.className = 'badge-prog';
    sp.textContent = String(n);
    b.appendChild(sp);
    if (val === activeKey()) b.classList.add('on');
    b.addEventListener('click', () => {
      stopQueue();
      setActiveKey(val);
      buildLessons();
      render();
      updatePoolCount();
      saveState();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    frag.appendChild(b);
  };

  mk('Hammasi', 'all', totalAll, learnedAll);

  /* Takrorlash va qiyin so'zlar — faqat bo'sh bo'lmasa ko'rsatiladi */
  const dueN = countSpecial('due'), hardN = countSpecial('hard');
  if (dueN)  mkSpecial('🔁 Takror', 'due', dueN);
  if (hardN) mkSpecial('⚠️ Qiyin', 'hard', hardN);

  secs.forEach(L => {
    const label = isVerbs() ? L.title : (filterMode === 'date' ? fmt(L.date) : L.topic);
    mk(label, L.key, L.w.length, L.w.filter(i => isLearned(i.key)).length);
  });

  lessonsWrap.replaceChildren(frag);
  lessonsWrap.scrollLeft = scrollLeft;
  populateTsSelect(secs);
  updateHub(visibleItems());
}

function populateTsSelect(secs) {
  const sel = $('tsSelect');
  if (!sel) return;

  const frag = document.createDocumentFragment();
  const all  = document.createElement('option');
  all.value = 'all';
  all.textContent = isVerbs()
    ? `Barcha guruhlar (${TOTAL_VERBS} ta)`
    : `Barcha darslar (${levelItems().length} ta)`;
  frag.appendChild(all);

  secs.forEach(L => {
    const opt = document.createElement('option');
    opt.value = L.key;
    const label = isVerbs() ? L.title : (filterMode === 'date' ? fmt(L.date) : L.topic);
    opt.textContent = `${label} (${L.w.length} ${unit()})`;
    frag.appendChild(opt);
  });

  sel.replaceChildren(frag);
  /* Saqlangan tanlov endi mavjud bo'lmasa — "Barcha darslar"ga qaytamiz */
  sel.value = [...sel.options].some(o => o.value === tsCustomKey) ? tsCustomKey : 'all';
  tsCustomKey = sel.value;
}

/* ---------- KUNLIK MAQSAD PANELI ---------- */
function updateDailyPill() {
  const pill = $('dailyPill');
  if (!pill) return;
  const done = doneToday(), goal = daily.goal || 20, st = streakDays();
  const pct = Math.min(100, Math.round(done / goal * 100));

  pill.style.setProperty('--fill', pct + '%');
  pill.classList.toggle('is-done', done >= goal);
  $('dailyStreak').textContent = st ? `🔥 ${st}` : '🔥 0';
  $('dailyCount').textContent  = `${done}/${goal}`;
  pill.title = st
    ? `Bugun ${done} ta, maqsad ${goal} ta · ketma-ket ${st} kun`
    : `Bugun ${done} ta, maqsad ${goal} ta`;
  const sel = $('goalSelect');
  if (sel && sel.value !== String(goal)) sel.value = String(goal);
}

/* ---------- SEARCH ---------- */
let searchTimer = null;
$('q').addEventListener('input', e => {
  const val = normText(e.target.value.trim());
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (val === query) return;
    query = val;
    stopQueue();
    render({ animate: false });
    updatePoolCount();
  }, SEARCH_DEBOUNCE);
});

/* ---------- SLOW / HIDE MODE ---------- */
const slowBtn = $('slowBtn');
slowBtn.classList.toggle('on', slow);
slowBtn.setAttribute('aria-pressed', String(slow));
slowBtn.addEventListener('click', () => {
  slow = !slow;
  slowBtn.classList.toggle('on', slow);
  slowBtn.setAttribute('aria-pressed', String(slow));
  saveState();
});

const MODES = [
  { cls: null,      label: 'Yashirish: yo’q', on: false },
  { cls: 'hide-tr', label: 'ENG → UZB',       on: true  },
  { cls: 'hide-en', label: 'UZB → ENG',       on: true  }
];
const hideBtn = $('hideTrBtn');

function applyMode(persist = true) {
  document.body.classList.remove('hide-tr', 'hide-en');
  const m = MODES[mode] || MODES[0];
  if (m.cls) document.body.classList.add(m.cls);
  hideBtn.textContent = m.label;
  hideBtn.classList.toggle('on', m.on);
  hideBtn.setAttribute('aria-pressed', String(m.on));
  $$('.card.revealed').forEach(c => c.classList.remove('revealed'));
  if (persist) saveState();
}
hideBtn.addEventListener('click', () => { mode = (mode + 1) % MODES.length; applyMode(); });

/* ---------- ADVANCED BAR (mobil uchun yig'iladigan panel) ---------- */
const advBtn  = $('advBtn');
const advBars = $('advBars');

function applyAdv() {
  document.body.classList.toggle('adv-collapsed', !advOpen);
  advBtn.classList.toggle('on', advOpen);
  advBtn.setAttribute('aria-expanded', String(advOpen));
  advBtn.setAttribute('aria-label', advOpen ? 'Sozlamalarni yashirish' : 'Sozlamalarni ko\'rsatish');
  /* Panel ochilganda pilyulalarni qayta o'lchaymiz: yashirin holatda o'lcham 0 edi.
     offsetWidth o'qilishi layoutni majburan yangilaydi — rAF kutish shart emas. */
  if (advOpen) updateSegs(true);
}
advBtn.addEventListener('click', () => { advOpen = !advOpen; applyAdv(); saveState(); });

/* ---------- PLAY ALL QUEUE ---------- */
const playBtn = $('playAllBtn');
let queue = [], qIndex = -1, playToken = 0;

function stopQueue() {
  playToken++;                    // rejalashtirilgan step()larni bekor qiladi
  queue = [];
  qIndex = -1;
  if (synth) synth.cancel();
  if (playing) { playing.classList.remove('playing'); playing = null; }
  playBtn.classList.remove('on');
  playBtn.setAttribute('aria-pressed', 'false');
  playBtn.textContent = '▶ Hammasi';
}

function step(token) {
  if (token !== playToken) return;
  qIndex++;
  if (qIndex >= queue.length) { stopQueue(); return; }

  const card = queue[qIndex];
  speak(card.dataset.word, card, () => {
    if (token !== playToken) return;           // navbat to'xtatilgan
    setTimeout(() => step(token), slow ? GAP_SLOW : GAP_NORMAL);
  });
}

playBtn.addEventListener('click', () => {
  if (queue.length) { stopQueue(); return; }
  const cards = $$('.card');
  if (!cards.length) return;

  playToken++;
  queue = cards;
  qIndex = -1;
  playBtn.classList.add('on');
  playBtn.setAttribute('aria-pressed', 'true');
  playBtn.textContent = '■ To\'xtatish';
  step(playToken);
});

/* ---------- MODAL MANAGER (fokus tutqichi + fon scroll qulfi) ---------- */
const FOCUSABLE = 'button:not([hidden]):not([disabled]), select, input:not([hidden]), [href], [tabindex]:not([tabindex="-1"])';
let lastFocused = null;

function openModal(el, focusSel) {
  lastFocused = document.activeElement;
  el.classList.add('open');
  document.body.classList.add('modal-open');
  setTimeout(() => {
    const target = focusSel ? el.querySelector(focusSel) : el.querySelector(FOCUSABLE);
    target?.focus({ preventScroll: true });
  }, 30);
}

function closeModal(el) {
  el.classList.remove('open');
  if (!document.querySelector('.modal-overlay.open')) document.body.classList.remove('modal-open');
  lastFocused?.focus?.({ preventScroll: true });
  if (el === trainModal) afterTrainClose();
}

/* Mashg'ulotdan chiqqach: ovoz to'xtaydi, chiplar va ro'yxat yangi holatni ko'rsatadi
   (masalan, "Takror" to'plamidagi o'tilgan so'zlar ro'yxatdan yo'qoladi) */
function afterTrainClose() {
  if (session) clearTimeout(session.autoTimer);
  if (synth) synth.cancel();
  buildLessons();
  render({ animate: false });
}

function trapFocus(el, e) {
  if (e.key !== 'Tab') return;
  const items = $$(FOCUSABLE, el).filter(n => n.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* Fon (overlay) bosilganda yopish — faqat sozlamalar oynasida.
   Mashq oynasi tasodifan yopilib qolmasin: u faqat ✕ tugmasi (yoki yakundagi "Ro'yxatga") bilan yopiladi. */
$('trainSetupModal').addEventListener('mousedown', e => {
  if (e.target === $('trainSetupModal')) closeModal($('trainSetupModal'));
});

/* ---------- TRAINING SETUP ---------- */
const trainSetupModal = $('trainSetupModal');
const trainModal      = $('trainModal');
const trainWrap       = trainModal.querySelector('.train-card-wrap');
const tsSelectWrap    = $('tsSelectWrap');
const tsSelect        = $('tsSelect');
const tsError         = $('tsError');

/* Bitta matn tuguni sifatida yozamiz — aks holda button'ning flex `gap`i
   qavslar orasiga ortiqcha bo'shliq qo'shib yuboradi */
$('tsAllBtn').textContent = `Hammasi (${totalOf()} ta)`;

seg('tsSourceSeg', tsSource, v => {
  tsSource = v;
  tsSelectWrap.hidden = v !== 'custom';
  updatePoolCount();
});
seg('tsCountSeg',  tsCount,  v => { tsCount  = v; updatePoolCount(); });
seg('tsDirSeg',    tsDir,    v => { tsDir    = v; });
seg('tsOrderSeg',  tsOrder,  v => { tsOrder  = v; });
seg('tsStatusSeg', tsStatus, v => { tsStatus = v; updatePoolCount(); });

tsSelect.addEventListener('change', e => {
  tsCustomKey = e.target.value;
  updatePoolCount();
  saveState();
});

/* Tanlangan sozlamalarga mos so'zlar to'plami */
function buildPool() {
  const secs = sections();
  let pool = [];

  if (tsSource === 'current') {
    const special = isSpecial(activeKey()) ? SPECIAL[activeKey()] : null;
    sections(!!special).forEach(L => {
      if (!special && activeKey() !== 'all' && activeKey() !== L.key) return;
      L.w.forEach(item => {
        if (special && !special(item.key)) return;
        if (!query || item.hay.includes(query)) pool.push(item);
      });
    });
  } else if (tsSource === 'custom') {
    secs.forEach(L => {
      if (tsCustomKey !== 'all' && L.key !== tsCustomKey) return;
      L.w.forEach(item => pool.push(item));
    });
  } else {
    pool = [...activeItems()];
  }

  /* Bitta so'z bir necha darsda bo'lsa — mashg'ulotda bir marta */
  const seen = new Set();
  pool = pool.filter(item => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    const learned = isLearned(item.key);
    if (tsStatus === 'unlearned' && learned) return false;
    if (tsStatus === 'learned' && !learned)  return false;
    return true;
  });

  return pool;
}

function updatePoolCount() {
  if (!$('tsPoolCount')) return;
  const n = buildPool().length;
  const limit = tsCount === 'all' ? n : Math.min(n, parseInt(tsCount, 10) || n);
  $('tsPoolCount').textContent = String(limit);
  $('tsStartBtn').disabled = n === 0;
  if (n > 0) tsError.hidden = true;
}

function openTrainSetup() {
  tsError.hidden = true;
  updatePoolCount();
  openModal(trainSetupModal, '#tsStartBtn');
  updateSegs(true);
}

$('trainBtn').addEventListener('click', openTrainSetup);
$('closeSetup').addEventListener('click', () => closeModal(trainSetupModal));
$('closeTrain').addEventListener('click', () => closeModal(trainModal));

/* Fisher–Yates — haqiqiy bir tekis aralashtirish */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- TRAINING SESSION ---------- */
let session = null;   // {items, idx, flipped, dir, learned:Set, repeated:number, finished:bool}

function startCustomTraining() {
  let pool = buildPool();

  if (!pool.length) {
    tsError.textContent = 'Bu sozlamalar bo\'yicha natija topilmadi. Manba yoki statusni o\'zgartiring.';
    tsError.hidden = false;
    return;
  }

  const source = pool.slice();
  if (tsOrder === 'shuffle') shuffle(pool);
  if (tsCount !== 'all') {
    const limit = parseInt(tsCount, 10);
    if (limit > 0) pool = pool.slice(0, limit);
  }

  startSession(tsDir, pool, { mode: null, source });
}
$('tsStartBtn').addEventListener('click', startCustomTraining);

/* ═══════════ O'RGANISH MARKAZI ═══════════
   Ekranda ko'rinib turgan to'plam (dars, "Takror", "Qiyin", qidiruv natijasi)
   bo'yicha bitta bosishda mashq boshlanadi — sozlamalar oynasisiz. */

const HUB_DIR = { card: 'eng_uzb', dict: 'dict', spell: 'spell', test: 'test' };
const MODE_LABEL = {
  eng_uzb: '🃏 Kartochka', uzb_eng: '🃏 UZB → ENG', mix: '🔀 Aralash',
  spell: '✍️ Yozib mashq', dict: '🎧 Eshitib yozish', test: '✅ Test'
};

/* Hozir ekranda ko'rinib turgan so'zlar. Bir so'z bir necha darsda bo'lsa — bir marta. */
function visibleItems() {
  const special = isSpecial(activeKey()) ? SPECIAL[activeKey()] : null;
  const seen = new Set(), out = [];
  let total = 0;
  sections(!!special).forEach(L => {
    if (!special && activeKey() !== 'all' && activeKey() !== L.key) return;
    L.w.forEach(i => {
      if (!matchesFilters(i) || (special && !special(i.key))) return;
      total++;
      if (seen.has(i.key)) return;
      seen.add(i.key);
      out.push(i);
    });
  });
  out.total = total;             // kartochkalar soni (takrorlar bilan) — sarlavhadagi raqam bilan solishtirish uchun
  return out;
}

function hubTitle() {
  const k = activeKey();
  const allLv = isVerbs() ? '' : ' · ' + Object.values(LEVELS).map(l => l.code).join(' + ');
  if (k === 'due')  return '🔁 Bugungi takror' + allLv;
  if (k === 'hard') return '⚠️ Qiyin so\'zlar' + allLv;
  if (k === 'all')  return isVerbs() ? 'Barcha fe\'llar' : `${LEVELS[level].name}: barcha so'zlar`;
  const L = sections().find(x => x.key === k);
  if (!L) return isVerbs() ? 'Fe\'llar' : 'So\'zlar';
  if (isVerbs()) return L.title;
  return filterMode === 'date' ? [...new Set(L.w.map(i => i.g.topic))].join(', ') : L.topic;
}

function updateHub(items) {
  const hub = $('hub');
  if (!items.length) { hub.hidden = true; return; }

  const k = activeKey();
  const L = (!isSpecial(k) && k !== 'all') ? sections().find(x => x.key === k) : null;
  const learned  = items.filter(i => isLearned(i.key)).length;
  const learning = items.filter(i => isLearning(i.key)).length;
  const fresh    = items.length - learned - learning;
  const due = items.filter(i => isDue(i.key)).length;

  const parts = [];
  if (L && !isVerbs()) parts.push(fmt(L.date));
  parts.push(`<b>${items.length}</b> ${unit()}${items.total > items.length ? ' (takrorlarsiz)' : ''}`);
  if (fresh)    parts.push(`${fresh} yangi`);
  if (learning) parts.push(`${learning} o'rganilmoqda`);
  parts.push(`${learned} yodlangan`);
  if (due && k !== 'due') parts.push(`${due} takror`);
  if (query) parts.push(`qidiruv: «${escapeHtml(query)}»`);

  $('hubTitle').textContent = hubTitle();
  $('hubSub').innerHTML = parts.join(' · ');
  $$('.hub-desc', hub).forEach(d => { d.textContent = isVerbs() ? d.dataset.verbs : d.dataset.words; });

  /* Har bir mashq bo'yicha: yodlanmagan so'zlardan nechtasi hali undan o'tmagan.
     Birinchi tugallanmagan mashq "keyingi qadam" sifatida ajratiladi. */
  const open = items.filter(i => !isLearned(i.key));
  let nextMarked = false;
  $$('.hub-mode', hub).forEach(b => {
    const bit  = stageBit(b.dataset.mode);
    const left = open.filter(i => !(stOf(i.key) & bit)).length;
    const el   = b.querySelector('.hub-left');
    el.textContent = !open.length ? '' : left ? `${left} ta qoldi` : '✓ bajarildi';
    el.classList.toggle('is-done', !!open.length && !left);
    const isNext = !nextMarked && left > 0;
    if (isNext) nextMarked = true;
    b.classList.toggle('is-next', isNext);
  });

  const wasHidden = hub.hidden;
  hub.hidden = false;
  if (wasHidden) updateSegPill($('hubSizeSeg'), true);
}

/* Mashq tartibi — eng foydalisi birinchi:
   muddati kelganlar → shu mashqdan hali o'tmaganlar (qiyinlar, Takrorga yaqinlar, yangilar)
   → shu mashqdan o'tib bo'lganlar → yodlanganlar.
   Kartochkada guruh ichida dars tartibi saqlanadi, mashqlarda aralashtiriladi. */
function orderForSession(items, mode) {
  const bit = stageBit(mode);
  const buckets = [[], [], [], [], [], []];
  items.forEach(i => {
    const k = i.key;
    const need = !isLearned(k) && !(stOf(k) & bit);
    const b = isDue(k) ? 0
            : need     ? (isHard(k) ? 1 : stOf(k) ? 2 : 3)
            : (isHard(k) || !isLearned(k)) ? 4 : 5;
    buckets[b].push(i);
  });
  if (mode !== 'card') buckets.forEach(b => shuffle(b));
  return buckets.flat();
}

function startHub(mode) {
  const source = visibleItems();
  if (!source.length || !HUB_DIR[mode]) return;
  let pool = orderForSession(source, mode);
  if (hubCount !== 'all') pool = pool.slice(0, parseInt(hubCount, 10) || 20);
  startSession(HUB_DIR[mode], pool, { mode, source });
}

/* Barcha mashq turlari uchun yagona sessiya yaratuvchi */
function startSession(baseDir, pool, origin) {
  if (session) clearTimeout(session.autoTimer);
  session = {
    items: pool.slice(), idx: 0, flipped: false, finished: false,
    baseDir, dir: baseDir, origin,
    passed: new Set(), graduated: new Set(), mistakes: new Set(), repeated: 0,
    spellOk: 0, spellTotal: 0, spellChecked: false, hintLevel: 0,
    testOk: 0, testTotal: 0, testAnswered: false, answerIdx: -1,
    lastResult: null, autoTimer: null
  };
  $('trainMode').textContent = MODE_LABEL[baseDir] || '';
  if (trainSetupModal.classList.contains('open')) closeModal(trainSetupModal);
  if (!trainModal.classList.contains('open')) openModal(trainModal, '#tShowBtn');
  showTrainCard();
}

seg('hubSizeSeg', hubCount, v => { hubCount = v; });
$$('#hub .hub-mode').forEach(b => b.addEventListener('click', () => startHub(b.dataset.mode)));

/* ── Test ──────────────────────────────────────────────────── */

/* Savol: to'g'ri javob + imkon qadar SHU DARSDAN 3 ta chalg'ituvchi variant.
   Ma'nosi bir xil variantlar (Accept / Receive — "Qabul qilmoq") olib tashlanadi. */
function buildTestQuestion(item) {
  const verb = isVerbs();
  let prompt, promptLang, ipa = '', hint = '', say = '', textOf, optLang;

  if (verb) {
    const f = vFormsOf(item.v);
    prompt = f[0]; promptLang = 'en'; ipa = vIpaOf(item.v)[0]; hint = item.v[9]; say = f[0];
    textOf = it => { const g = vFormsOf(it.v); return `${g[1]} · ${g[2]}`; };
    optLang = 'en';
  } else if (Math.random() < 0.5) {
    prompt = wordOf(item.w); promptLang = 'en'; ipa = ipaOf(item.w); say = prompt;
    textOf = it => it.w[9]; optLang = 'uz';
  } else {
    prompt = item.w[9]; promptLang = 'uz'; hint = item.w[8];
    textOf = it => wordOf(it.w); optLang = 'en';
  }

  const answer = textOf(item);
  const used = new Set([normText(answer)]);
  const sameLesson = it => verb ? it.g === item.g : it.g.date === item.g.date;
  const candidates = shuffle([...(session.origin?.source || session.items), ...activeItems()]
    .filter(it => it.key !== item.key));
  candidates.sort((a, b) => (sameLesson(b) ? 1 : 0) - (sameLesson(a) ? 1 : 0));

  const distractors = [];
  for (const it of candidates) {
    const t = textOf(it), n = normText(t);
    if (used.has(n)) continue;
    used.add(n);
    distractors.push(t);
    if (distractors.length === 3) break;
  }

  const options = shuffle([answer, ...distractors]);
  return { prompt, promptLang, ipa, hint, say, options, optLang, answer: options.indexOf(answer) };
}

function renderTestOptions(q) {
  const box = $('tOptions');
  box.replaceChildren();
  q.options.forEach((text, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 't-opt';
    b.setAttribute('lang', q.optLang);
    b.innerHTML = `<span class="t-opt-n">${i + 1}</span><span class="t-opt-t"></span>`;
    b.querySelector('.t-opt-t').textContent = text;
    b.addEventListener('click', () => chooseTestOption(i));
    box.appendChild(b);
  });
  box.hidden = false;
}

function chooseTestOption(i) {
  const item = currentItem();
  if (!item || session.testAnswered) return;
  const opts = $$('#tOptions .t-opt');
  if (!opts[i]) return;

  const ok = i === session.answerIdx;
  session.testAnswered = true;
  session.testTotal++;
  if (ok) session.testOk++;

  opts.forEach((b, n) => {
    b.disabled = true;
    b.classList.add(n === session.answerIdx ? 'is-correct' : n === i ? 'is-wrong' : 'is-dim');
  });

  revealTrainAnswer(true);
  $('tHardBtn').hidden = $('tEasyBtn').hidden = true;     // test o'zi baholaydi
  $('tNextBtn').hidden = false;
  $('tNextBtn').textContent = ok ? 'Keyingi (Enter)' : 'Tushundim, keyingi (Enter)';
  $('tNextBtn').focus({ preventScroll: true });

  applyResult(item, ok ? 'ok' : 'bad');

  /* To'g'ri javobda o'zi o'tadi — sur'at saqlansin. Xatoda javobni o'qib olishga vaqt beriladi. */
  if (ok) session.autoTimer = setTimeout(advanceChecked, 1100);
}

/* Test, yozish va diktant: natija tekshirilgan zahoti qayd etilgan —
   bu yerda faqat keyingisiga o'tamiz. To'g'ri bo'lmasa so'z sessiya oxiriga qaytadi. */
function advanceChecked() {
  if (!session || session.finished || !session.lastResult) return;
  clearTimeout(session.autoTimer);
  const requeue = session.lastResult !== 'ok';
  session.lastResult = null;                              // ikki marta o'tib ketmasin
  nextCard(requeue);
}

function currentItem() {
  return session && !session.finished ? session.items[session.idx] : null;
}

function trainSpeakText(item) {
  return isVerbs() ? vFormsOf(item.v).join(', ') : wordOf(item.w);
}

/* Fe'l shakllarini javob oynasida chiroyli ustunlar bilan ko'rsatamiz */
function fillTrainForms(item, from) {
  const v = item.v;
  const forms = vFormsOf(v), ipa = vIpaOf(v), pron = vPronOf(v);
  const el = $('tForms');
  el.innerHTML = forms.slice(from).map((f, i) => `
    <div class="vform">
      <span class="vlbl">V${from + i + 1}</span>
      <div class="en">${escapeHtml(f)}</div>
      <div class="ipa">${escapeHtml(ipa[from + i] || '')}</div>
      <div class="pron ${script === 'cyr' ? 'cyr' : ''}">${escapeHtml(pron[from + i] || '')}</div>
    </div>`).join('');
  el.hidden = false;
}

/* ---------- YOZISH MASHQI (imlo) ---------- */

/* Taqqoslash uchun normallashtirish: registr, ortiqcha bo'shliq va
   tinish belgilari hisobga olinmaydi, apostrof turlari tenglashtiriladi */
function normSpell(s) {
  return normText(s).replace(/[^a-z0-9' -]/g, '').replace(/\s+/g, ' ').trim();
}

/* Har bir kiritish maydoni uchun qabul qilinadigan javoblar.
   So'zlarda — britancha va amerikacha imlo; fe'llarda — V2 va V3. */
function spellTargets(item) {
  /* "was/were" kabi shakllarda har biri alohida ham qabul qilinadi */
  const acc = (...xs) => {
    const out = xs.filter(Boolean);
    xs.filter(Boolean).forEach(x => { if (x.includes('/')) out.push(...x.split('/')); });
    return [...new Set(out)];
  };
  if (isVerbs()) {
    const uk = item.v[0].split('|');
    const us = (item.v[1] || item.v[0]).split('|');
    const all = [
      { label: 'V1', accept: acc(uk[0], us[0]) },
      { label: 'V2', accept: acc(uk[1], us[1]) },
      { label: 'V3', accept: acc(uk[2], us[2]) }
    ];
    return session?.dir === 'dict' ? all : all.slice(1);
  }
  return [{ label: '', accept: acc(item.w[0], item.w[1]) }];
}

function buildSpellInputs(item) {
  const targets = spellTargets(item);
  const ph = session.dir === 'dict' ? 'eshitganingizni yozing…' : 'ingliz tilida yozing…';
  const row = $('tSpellRow');
  row.className = 'spell-row' + (targets.length === 3 ? ' cols-3' : '');
  row.innerHTML = targets.map((t, i) => `
    <label class="spell-field">
      ${t.label ? `<span class="spell-lbl">${t.label}</span>` : ''}
      <input class="spell-input" id="spellIn${i}" type="text" lang="en" inputmode="text"
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
             aria-label="Inglizcha imloni yozing" placeholder="${t.label ? '…' : ph}">
    </label>`).join('');

  $('tSpell').hidden = false;
  $('tSpellMask').hidden = true;
  $('tSpellResult').hidden = true;
  session.spellChecked = false;
  session.hintLevel = 0;
  $('tHintBtn').textContent = '💡 Yordam';
  setTimeout(() => $('spellIn0')?.focus({ preventScroll: true }), 60);
}

/* Xato harflarni ko'rsatish: to'g'ri yozuvni chiqaramiz,
   foydalanuvchi adashgan harflar qizil bo'ladi */
function spellDiffHTML(user, correct) {
  const u = String(user).trim().toLowerCase();
  const c = correct.toLowerCase();
  let out = '';
  for (let i = 0; i < correct.length; i++) {
    out += `<span class="${u[i] === c[i] ? 'ch-ok' : 'ch-bad'}">${escapeHtml(correct[i])}</span>`;
  }
  return out;
}

function checkSpelling() {
  const item = currentItem();
  if (!item || !session || session.spellChecked) return;

  const targets = spellTargets(item);
  let allOk = true;

  const rows = targets.map((t, i) => {
    const inp = $(`spellIn${i}`);
    const val = inp ? inp.value : '';
    const accept = t.accept.filter(Boolean);
    const ok = accept.map(normSpell).includes(normSpell(val));
    if (!ok) allOk = false;
    if (inp) {
      inp.classList.toggle('is-ok', ok);
      inp.classList.toggle('is-bad', !ok);
      inp.readOnly = true;
    }
    return { ok, val, correct: accept[0], label: t.label };
  });

  /* Harflar ochilgan bo'lsa, to'g'ri yozilgan javob mashq sifatida hisoblanmaydi.
     Diktantdagi 1-yordam — faqat ma'nosi, u hisobga olinmaydi. */
  const lettersShown = session.hintLevel >= (session.dir === 'dict' ? 2 : 1);
  const result = !allOk ? 'bad' : lettersShown ? 'hint' : 'ok';

  session.spellChecked = true;
  session.spellTotal++;
  if (allOk) session.spellOk++;

  const res = $('tSpellResult');
  res.className = 'spell-result ' + (allOk ? 'ok' : 'bad');
  res.innerHTML = result === 'ok'
    ? '<span class="spell-verdict">✓ To‘g‘ri yozdingiz!</span>'
    : result === 'hint'
    ? '<span class="spell-verdict">✓ To‘g‘ri, lekin yordam bilan</span>' +
      '<div class="spell-note">Harflar ochilgani uchun mashq hisoblanmadi — so‘z oxirida yana so‘raladi.</div>'
    : '<span class="spell-verdict">✗ Imloda xato bor</span>' +
      rows.filter(r => !r.ok).map(r => `
        <div class="spell-fix">
          ${r.label ? `<span class="spell-lbl">${escapeHtml(r.label)}</span>` : ''}
          <s class="spell-user" lang="en">${escapeHtml(r.val.trim() || '—')}</s>
          <span class="spell-arrow" aria-hidden="true">→</span>
          <span class="spell-correct" lang="en">${spellDiffHTML(r.val, r.correct)}</span>
        </div>`).join('');
  res.hidden = false;
  $('tSpellMask').hidden = true;
  $('tHintBtn').hidden = true;

  revealTrainAnswer(true);
  $('tHardBtn').hidden = $('tEasyBtn').hidden = true;     // natijani ilovaning o'zi baholaydi
  $('tNextBtn').hidden = false;
  $('tNextBtn').textContent = result === 'bad' ? 'Tushundim, keyingi (Enter)' : 'Keyingi (Enter)';
  $('tNextBtn').focus({ preventScroll: true });
  applyResult(item, result);
}

/* Yordam.
   Yozib mashqda — birinchi harf va so'z uzunligi.
   Diktantda ikki bosqich: avval ma'nosi, keyin harflar. */
function showSpellHint() {
  const item = currentItem();
  if (!item) return;
  session.hintLevel = (session.hintLevel || 0) + 1;

  const w = isVerbs() ? item.v : item.w;
  const meaning = `<span class="mask-item mask-mean">💡 ${escapeHtml(w[9])}</span>`;
  const letters = spellTargets(item).map(t => {
    const word = t.accept[0] || '';
    const mask = [...word].map((ch, i) => (i === 0 || ' -/'.includes(ch)) ? ch : '_').join(' ');
    return `<span class="mask-item">${t.label ? escapeHtml(t.label) + ': ' : ''}${escapeHtml(mask)}</span>`;
  }).join('');

  if (session.dir === 'dict' && session.hintLevel === 1) {
    $('tSpellMask').innerHTML = meaning;
    $('tHintBtn').textContent = '💡 Harflar';
  } else {
    $('tSpellMask').innerHTML = (session.dir === 'dict' ? meaning : '') + letters;
    $('tHintBtn').hidden = true;
  }
  $('tSpellMask').hidden = false;
}

/* Javob oynasidagi misol gap */
function fillTrainSentence(item, words) {
  const s = sentenceOf(item.key);
  const el = $('tSent');
  if (!s) { el.hidden = true; return; }
  el.innerHTML =
    `<button class="sent-play" id="tSentPlay" title="Gapni eshitish" aria-label="Gapni eshitish">
       <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1c2.9.9 5 3.5 5 6.7s-2.1 5.8-5 6.7v2.1c4-.9 7-4.5 7-8.8s-3-7.9-7-8.8z"/></svg>
     </button>
     <div class="sent-en" lang="en">${highlightWord(s[0], words)}</div>
     <div class="sent-tr" lang="uz">${escapeHtml(s[1])}</div>` +
    (s[2] ? `<div class="sent-tr sent-ru" lang="ru">${escapeHtml(s[2])}</div>` : '');
  el.hidden = false;
  $('tSentPlay')?.addEventListener('click', () => speak(s[0]));
}

function showTrainCard() {
  if (!session) return;
  if (session.idx >= session.items.length) { finishTraining(); return; }

  session.flipped = false;
  const item = session.items[session.idx];
  const verb = isVerbs();
  const w = verb ? item.v : item.w;

  session.dir = session.baseDir === 'mix' ? (Math.random() < 0.5 ? 'eng_uzb' : 'uzb_eng') : session.baseDir;

  $('trainProgress').textContent = `${session.idx + 1} / ${session.items.length}`;
  $('trainBarFill').style.width = `${(session.idx / session.items.length) * 100}%`;

  const promptEl = $('tPrompt'), ipaEl = $('tIpa'), pronEl = $('tPron');
  $('tForms').hidden = true;
  $('tSpell').hidden = true;
  $('tHintBtn').hidden = true;
  $('tOptions').hidden = true;
  $('tSlowBtn').hidden = true;
  $('tNextBtn').hidden = $('tExitBtn').hidden = $('tRetryBtn').hidden = $('tNextExBtn').hidden = true;
  promptEl.classList.remove('is-icon');
  clearTimeout(session.autoTimer);
  session.testAnswered = false;
  session.lastResult = null;
  trainWrap.dataset.mode = session.dir;
  fillTrainSentence(item, verb ? vFormsOf(w) : [w[0], w[1]]);
  renderTrainStages(item);

  if (session.dir === 'dict') {
    /* Diktant: hech narsa ko'rsatilmaydi — faqat ovoz. Javob tekshirilgach ochiladi. */
    promptEl.textContent = '🎧';
    promptEl.setAttribute('lang', 'uz');
    promptEl.classList.add('is-icon');
    ipaEl.textContent  = verb ? vIpaOf(w).join('  ') : ipaOf(w);
    pronEl.textContent = verb ? vPronOf(w).join(' · ') : pronOf(w);
    ipaEl.hidden = pronEl.hidden = true;
    if (verb) fillTrainForms(item, 0);
    buildSpellInputs(item);
    $('tRu').textContent = `RU: ${w[8]}`;
    $('tUz').textContent = `UZ: ${w[9]}`;
    $('tUz').hidden = false;
    $('tListenBtn').hidden = $('tSlowBtn').hidden = $('tHintBtn').hidden = false;
    $('tShowBtn').textContent = 'Tekshirish (Enter)';
    speak(trainSpeakText(item));
  } else if (session.dir === 'test') {
    const q = buildTestQuestion(item);
    session.answerIdx = q.answer;
    promptEl.textContent = q.prompt;
    promptEl.setAttribute('lang', q.promptLang);
    ipaEl.textContent  = q.ipa;
    pronEl.textContent = q.hint;
    ipaEl.hidden  = !q.ipa;
    pronEl.hidden = !q.hint;
    if (verb) fillTrainForms(item, 1);
    renderTestOptions(q);
    $('tRu').textContent = `RU: ${w[8]}`;
    $('tUz').textContent = (verb || q.promptLang === 'en') ? `UZ: ${w[9]}` : `ENG: ${wordOf(w)} (${ipaOf(w)})`;
    $('tUz').hidden = false;
    $('tListenBtn').hidden = q.promptLang !== 'en';      // o'zbekcha savolda javobni aytib qo'ymasin
    if (q.say) speak(q.say);
  } else if (session.dir === 'spell') {
    /* Savol — tarjima, javob — inglizcha imloni yozish */
    if (verb) {
      promptEl.textContent = vFormsOf(w)[0];
      promptEl.setAttribute('lang', 'en');
      ipaEl.textContent = vIpaOf(w)[0];
      pronEl.textContent = w[9];
      ipaEl.hidden = pronEl.hidden = false;
      fillTrainForms(item, 1);
    } else {
      promptEl.textContent = w[9];
      promptEl.setAttribute('lang', 'uz');
      ipaEl.textContent = ipaOf(w);      // javob ochilgach ko'rinadi
      ipaEl.hidden = true;
      pronEl.textContent = w[8];
      pronEl.hidden = false;
    }
    buildSpellInputs(item);
    $('tRu').textContent = `RU: ${w[8]}`;
    $('tUz').textContent = verb ? `UZ: ${w[9]}` : `ENG: ${wordOf(w)}`;
    $('tUz').hidden = false;
    $('tListenBtn').hidden = false;      // diktant sifatida eshitish mumkin
    $('tHintBtn').hidden = false;
    $('tShowBtn').textContent = 'Tekshirish (Enter)';
  } else if (verb) {
    const forms = vFormsOf(w), ipa = vIpaOf(w), pron = vPronOf(w);
    if (session.dir === 'eng_uzb') {
      promptEl.textContent = forms[0];        // 1-shakl — qolgan ikkitasini eslash kerak
      promptEl.setAttribute('lang', 'en');
      ipaEl.textContent  = ipa[0];
      pronEl.textContent = pron[0];
      ipaEl.hidden = pronEl.hidden = false;
      fillTrainForms(item, 1);                // javobda: V2 va V3
      $('tListenBtn').hidden = true;          // ovoz uchala shaklni aytadi — javobdan keyin
    } else {
      promptEl.textContent = w[9];            // o'zbekcha savol
      promptEl.setAttribute('lang', 'uz');
      ipaEl.hidden = pronEl.hidden = true;
      fillTrainForms(item, 0);                // javobda: uchala shakl
      $('tListenBtn').hidden = true;
    }
    $('tForms').hidden = true;                // javob oynasi bilan birga ochiladi
    $('tRu').textContent = `RU: ${w[8]}`;
    $('tUz').textContent = `UZ: ${w[9]}`;
    $('tUz').hidden = session.dir === 'uzb_eng';
  } else if (session.dir === 'eng_uzb') {
    promptEl.textContent = wordOf(w);
    promptEl.setAttribute('lang', 'en');
    ipaEl.textContent  = ipaOf(w);
    pronEl.textContent = pronOf(w);
    ipaEl.hidden = pronEl.hidden = false;
    $('tRu').textContent = `RU: ${w[8]}`;
    $('tUz').textContent = `UZ: ${w[9]}`;
    $('tUz').hidden = false;
    $('tListenBtn').hidden = false;          // inglizchani ko'rib turibmiz — eshitish mumkin
  } else {
    promptEl.textContent = w[9];             // o'zbekcha savol
    promptEl.setAttribute('lang', 'uz');
    ipaEl.textContent  = ipaOf(w);
    pronEl.textContent = pronOf(w);
    ipaEl.hidden = pronEl.hidden = true;
    $('tRu').textContent = `RU: ${w[8]}`;
    $('tUz').textContent = `ENG: ${wordOf(w)} (${ipaOf(w)})`;
    $('tUz').hidden = false;
    $('tListenBtn').hidden = true;            // javobni oldindan aytib qo'ymasin
  }

  if (!['spell', 'dict'].includes(session.dir)) $('tShowBtn').textContent = 'Javobni ko\'rsatish (Space)';

  $('tStats').hidden = $('tNote').hidden = true;
  $('tAnswerBox').classList.remove('show');
  $('tShowBtn').hidden = session.dir === 'test';
  $('tHardBtn').hidden = $('tEasyBtn').hidden = $('tRestartBtn').hidden = true;
  if (!['spell', 'dict', 'test'].includes(session.dir) && trainModal.contains(document.activeElement)) {
    $('tShowBtn').focus({ preventScroll: true });
  }

  /* Kartochka rejimida so'z paydo bo'lishi bilan eshittiriladi */
  if (session.origin?.mode === 'card') speak(trainSpeakText(item));
}

function revealTrainAnswer(fromCheck) {
  const item = currentItem();
  if (!item || session.flipped) return;

  /* Yozish va diktantda javob "Tekshirish"dan keyin, testda — variant tanlangach ochiladi */
  if ((session.dir === 'spell' || session.dir === 'dict') && !fromCheck) { checkSpelling(); return; }
  if (session.dir === 'test' && !fromCheck) return;

  session.flipped = true;
  const verb = isVerbs();
  if (session.dir === 'dict') {
    const w = verb ? item.v : item.w;
    $('tPrompt').classList.remove('is-icon');
    $('tPrompt').textContent = verb ? vFormsOf(w).join(' · ') : wordOf(w);
    $('tPrompt').setAttribute('lang', 'en');
  }
  $('tIpa').hidden = $('tPron').hidden = verb && (session.dir === 'uzb_eng' || session.dir === 'dict');
  $('tForms').hidden = !verb;
  $('tListenBtn').hidden = false;
  $('tAnswerBox').classList.add('show');
  $('tShowBtn').hidden = true;
  $('tHardBtn').hidden = $('tEasyBtn').hidden = false;
  if (!fromCheck &&
      (trainModal.contains(document.activeElement) || document.activeElement === document.body)) {
    $('tEasyBtn').focus({ preventScroll: true });
  }
  speak(trainSpeakText(item));
}

/* Test, yozish va diktantni ilovaning o'zi tekshiradi — u yerda Qiyin/Oson yo'q */
const CHECKED_DIRS = new Set(['test', 'spell', 'dict']);

/* Kartochka — Qiyin: mashq "bajarilmagan" bo'ladi, xato hisoblanadi, so'z sessiya oxiriga qaytadi */
function markHard() {
  const item = currentItem();
  if (!item || !session.flipped || CHECKED_DIRS.has(session.dir)) return;
  clearTimeout(session.autoTimer);
  applyResult(item, 'bad');
  nextCard(true);
}

/* Kartochka — Oson: kartochka mashqidan o'tdi (Takrordagi so'z — keyingi qutiga) */
function markEasy() {
  const item = currentItem();
  if (!item || !session.flipped || CHECKED_DIRS.has(session.dir)) return;
  clearTimeout(session.autoTimer);
  applyResult(item, 'ok');
  nextCard(false);
}

/* Javobni qayd etadi: progress, ro'yxatdagi karta, oynadagi 4 belgi va tabrik */
function applyResult(item, result) {
  const stage = DIR_STAGE[session.dir];
  const graduated = recordAnswer(item.key, stage, result);

  if (result === 'ok')  session.passed.add(item.key);
  if (result === 'bad') session.mistakes.add(item.key);
  if (graduated) {
    session.graduated.add(item.key);
    clearGradToasts();                                    // ketma-ket bo'lsa ustma-ust yig'ilmasin
    toast(`🎉 ${trainSpeakText(item)} — 4/4, Takrorga qo'shildi`).classList.add('toast-grad');
  }
  session.lastResult = result;

  saveState();
  buildLessons();
  syncCardStatus(item.key);
  renderTrainStages(item, stage, result);
}

const clearGradToasts = () => $$('.toast-grad').forEach(t => t.remove());

/* Keyingi so'z. requeue — so'z sessiya oxiriga qaytadi (chinakam takrorlash) */
function nextCard(requeue) {
  const item = currentItem();
  if (requeue && item) { session.items.push(item); session.repeated++; }
  session.idx++;
  showTrainCard();
}

/* Mashq oynasidagi 4 belgi. Javobdan keyin o'zgargan belgi "sakraydi" (yoki qizaradi). */
function renderTrainStages(item, stage, result) {
  const el = $('tStages');
  el.innerHTML = stageStripHTML(item.key);
  const cls = result === 'ok' ? 'flash-ok' : result === 'bad' ? 'flash-bad' : '';
  if (stage && cls) el.querySelector(`[data-stage="${stage}"]`)?.classList.add(cls);
}

function syncCardStatus(key) {
  const learned = isLearned(key);
  $$(`.card[data-key="${CSS.escape(key)}"]`).forEach(card => {
    card.classList.toggle('is-learned', learned);
    const strip = card.querySelector('.stages');
    if (strip) strip.outerHTML = stageStripHTML(key);
  });
}

function finishTraining() {
  clearGradToasts();                // natija statistikada yoziladi — tugmalar ustini yopmasin
  session.finished = true;
  session.flipped = false;
  clearTimeout(session.autoTimer);

  const unique = new Set(session.items.map(i => i.key)).size;
  const titles = {
    test:  '🎉 Test yakunlandi!',
    dict:  '🎉 Diktant yakunlandi!',
    spell: '🎉 Yozish mashqi yakunlandi!'
  };

  trainWrap.dataset.mode = 'done';
  $('trainProgress').textContent = `${unique} / ${unique}`;
  $('trainBarFill').style.width = '100%';
  $('tPrompt').classList.remove('is-icon');
  $('tPrompt').textContent = titles[session.baseDir] || '🎉 Mashg\'ulot yakunlandi!';
  $('tPrompt').setAttribute('lang', 'uz');
  $('tIpa').hidden = $('tPron').hidden = true;
  $('tListenBtn').hidden = $('tSlowBtn').hidden = true;
  $('tSpell').hidden = $('tOptions').hidden = true;
  $('tAnswerBox').classList.remove('show');

  const stats = $('tStats');
  stats.replaceChildren();
  const cards = [
    [`${unique} ta`, `${isVerbs() ? 'fe\'l' : 'so\'z'} ko'rildi`],
    [`${session.passed.size} ta`, 'mashqdan o\'tdi']
  ];
  if (session.graduated.size) cards.push([`${session.graduated.size} ta`, 'Takrorga qo\'shildi']);
  cards.push([`${session.mistakes.size} ta`, 'xato qilindi']);
  if (session.spellTotal) cards.push([`${session.spellOk}/${session.spellTotal}`, 'to\'g\'ri yozildi']);
  if (session.testTotal)  cards.push([`${session.testOk}/${session.testTotal}`, 'to\'g\'ri javob']);
  cards.forEach(([big, small]) => {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<b></b><span></span>`;
    d.querySelector('b').textContent = big;
    d.querySelector('span').textContent = small;
    stats.appendChild(d);
  });
  stats.hidden = false;

  /* Shu sessiyadagi so'zlar uchun qolgan mashqlar — keyin nima qilishni aytib turadi */
  const keys = [...new Set(session.items.map(i => i.key))].filter(k => !isLearned(k));
  const need = STAGES.map(s => [s, keys.filter(k => !(stOf(k) & s.bit)).length]).filter(([, n]) => n);
  const oneLeft = keys.filter(k => STAGES.filter(s => !(stOf(k) & s.bit)).length === 1).length;
  const note = $('tNote');
  note.textContent = !need.length ? '' :
    (oneLeft ? `${oneLeft} ta so'z Takrorga 1 qadam qoldi. ` : '') +
    'Qolgan mashqlar: ' + need.map(([s, n]) => `${s.ico} ${s.name} — ${n} ta`).join(' · ');
  note.hidden = !need.length;

  $('tShowBtn').hidden = $('tHardBtn').hidden = $('tEasyBtn').hidden = true;
  $('tNextBtn').hidden = $('tHintBtn').hidden = true;

  const miss = session.mistakes.size;
  $('tRetryBtn').hidden = !miss;
  $('tRetryBtn').textContent = `🔁 Xatolar (${miss})`;
  $('tExitBtn').hidden = false;
  $('tRestartBtn').hidden = false;
  $('tRestartBtn').textContent = '↻ Yana';

  const nx = nextExercise();
  session.nextEx = nx;
  $('tNextExBtn').hidden = !nx;
  if (nx) $('tNextExBtn').textContent = `→ ${nx.num}. ${nx.stage.ico} ${nx.stage.name} (${nx.pool.length} ta)`;
  (nx ? $('tNextExBtn') : miss ? $('tRetryBtn') : $('tRestartBtn')).focus({ preventScroll: true });
}

/* Yakundan keyingi mashq — shu sessiyadagi so'zlar bilan.
   Tartibda keyingi (1→2→3→4, oxiridan boshiga) va shu so'zlardan kimdir hali o'tmagan mashq tanlanadi;
   ro'yxatga faqat o'sha mashqdan o'tmagan so'zlar kiradi.
   Hammasi yodlangan bo'lsa (masalan, Takror) — shunchaki tartibdagi keyingi mashq, hamma so'z bilan. */
function nextExercise() {
  const cur = STAGES.findIndex(s => s.id === DIR_STAGE[session.baseDir]);
  const seen = new Set();
  const words = session.items.filter(i => !seen.has(i.key) && seen.add(i.key));

  for (let n = 1; n < STAGES.length; n++) {
    const i = (cur + n) % STAGES.length;
    const pool = words.filter(w => !isLearned(w.key) && !(stOf(w.key) & STAGES[i].bit));
    if (pool.length) return { stage: STAGES[i], num: i + 1, pool };
  }
  if (cur >= 0 && cur < STAGES.length - 1) return { stage: STAGES[cur + 1], num: cur + 2, pool: words };
  return null;
}

$('tListenBtn').addEventListener('click', () => {
  const item = currentItem();
  if (item) speak(trainSpeakText(item));
});
$('tShowBtn').addEventListener('click', () => revealTrainAnswer());
$('tHintBtn').addEventListener('click', showSpellHint);
$('tHardBtn').addEventListener('click', markHard);
$('tEasyBtn').addEventListener('click', markEasy);
$('tSlowBtn').addEventListener('click', () => {
  const item = currentItem();
  if (item) speak(trainSpeakText(item), null, null, { rate: slow ? 0.42 : RATE_SLOW });
});
$('tNextBtn').addEventListener('click', advanceChecked);
$('tExitBtn').addEventListener('click', () => closeModal(trainModal));

$('tNextExBtn').addEventListener('click', () => {
  const nx = session?.nextEx;
  if (!nx) return;
  const mode = nx.stage.id;
  startSession(HUB_DIR[mode], orderForSession(nx.pool, mode),
               { mode, source: session.origin?.source || nx.pool });
});

/* Faqat xato qilingan so'zlar bilan, o'sha rejimda qaytadan */
$('tRetryBtn').addEventListener('click', () => {
  if (!session) return;
  const seen = new Set();
  const pool = session.items.filter(i =>
    session.mistakes.has(i.key) && !seen.has(i.key) && seen.add(i.key));
  if (pool.length) startSession(session.baseDir, shuffle(pool), session.origin);
});

/* "Yana": markazdan boshlangan bo'lsa — o'sha to'plam va rejim yangi tanlov bilan;
   sozlamalar oynasidan boshlangan bo'lsa — sozlamalar oynasi */
$('tRestartBtn').addEventListener('click', () => {
  const o = session?.origin;
  if (o?.mode) {
    let pool = orderForSession(o.source, o.mode);
    if (hubCount !== 'all') pool = pool.slice(0, parseInt(hubCount, 10) || 20);
    startSession(HUB_DIR[o.mode], pool, o);
    return;
  }
  closeModal(trainModal);
  openTrainSetup();
});

/* ---------- KEYBOARD ---------- */
window.addEventListener('keydown', e => {
  /* 1) Mashg'ulot sozlamalari */
  if (trainSetupModal.classList.contains('open')) {
    trapFocus(trainSetupModal, e);
    if (e.key === 'Escape') { e.preventDefault(); closeModal(trainSetupModal); }
    else if (e.key === 'Enter' && !e.target.closest('button, select')) {
      e.preventDefault();
      startCustomTraining();
    }
    return;
  }

  /* 2) Flesh-karta */
  if (trainModal.classList.contains('open')) {
    trapFocus(trainModal, e);
    if (e.key === 'Escape') { e.preventDefault(); return; }     // Esc ham yopmaydi — faqat ✕
    if (session?.finished) return;

    if (session?.dir === 'spell' || session?.dir === 'dict') {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!session.spellChecked) checkSpelling();
        else advanceChecked();
      }
      return;                                  // Space va harflar inputga tegishli
    }

    if (session?.dir === 'test') {
      if (!session.testAnswered && /^[1-4]$/.test(e.key)) {
        e.preventDefault(); chooseTestOption(Number(e.key) - 1);
      } else if (session.testAnswered && e.key === 'Enter') {
        e.preventDefault(); advanceChecked();
      } else if (e.key === ' ') {
        e.preventDefault();
        const it = currentItem();
        if (it && !$('tListenBtn').hidden) speak(trainSpeakText(it));
      }
      return;
    }

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!session?.flipped) revealTrainAnswer();
      else { const it = currentItem(); if (it) speak(trainSpeakText(it)); }
    } else if (e.key === '1' && session?.flipped) {
      e.preventDefault(); markHard();
    } else if (e.key === '2' && session?.flipped) {
      e.preventDefault(); markEasy();
    }
    return;
  }

  /* 3) Asosiy sahifa */
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (e.key === '/' && !typing) {
    e.preventDefault();
    $('q').focus();
  } else if (e.key === 'Escape' && typing && document.activeElement.id === 'q') {
    document.activeElement.value = '';
    query = '';
    render({ animate: false });
    updatePoolCount();
    document.activeElement.blur();
  }
});

/* ---------- BACKUP: EXPORT / IMPORT ---------- */
$('exportBtn').addEventListener('click', () => {
  const payload = {
    app: 'myvocab',
    version: 3,
    exportedAt: new Date().toISOString(),
    progressWords: progWords,
    progressVerbs: progVerbs,
    daily,
    learnedWords: Object.keys(progWords).filter(k => progWords[k].box >= 1),
    learnedVerbs: Object.keys(progVerbs).filter(k => progVerbs[k].box >= 1)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `myvocab-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const nw = Object.keys(progWords).length, nv = Object.keys(progVerbs).length;
  toast(`${nw} ta so'z va ${nv} ta fe'l progressi faylga saqlandi`);
});

$('importBtn').addEventListener('click', () => $('importFile').click());

$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';                     // bir xil faylni qayta tanlash uchun
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    const wordsIn = Array.isArray(data) ? data : data?.learnedWords;
    const verbsIn = Array.isArray(data) ? [] : (data?.learnedVerbs || []);
    if (!Array.isArray(wordsIn) && !data?.progressWords) throw new Error('format');

    const before = Object.keys(progWords).length + Object.keys(progVerbs).length;

    /* Yangi format: to'liq SRS yozuvlari — kattaroq quti g'olib */
    const mergeProg = (src, dst) => Object.entries(src || {}).forEach(([k, e]) => {
      if (!e || typeof e !== 'object') return;
      const cur = dst[k];
      if (!cur || (e.box || 0) > cur.box) dst[k] = withStages(e);
      else if (!cur.box && !e.box) cur.st |= withStages(e).st;          // o'tilgan mashqlar birlashadi
    });
    mergeProg(data.progressWords, progWords);
    mergeProg(data.progressVerbs, progVerbs);

    /* Eski format: shunchaki ro'yxat */
    const addList = (arr, dst) => (arr || []).forEach(k => {
      if (typeof k !== 'string') return;
      const parts = k.split('::');
      const norm = normText(parts.length >= 3 ? parts.slice(2).join('::') : k).trim();
      if (norm && !dst[norm]) dst[norm] = { box: 2, due: addDays(3), wrong: 0, st: ALL_STAGES };
    });
    addList(wordsIn, progWords);
    addList(verbsIn, progVerbs);

    if (data.daily && typeof data.daily === 'object') {
      daily.days = { ...data.daily.days, ...daily.days };
      if (data.daily.goal) daily.goal = data.daily.goal;
    }

    saveState();
    buildLessons();
    render();
    updatePoolCount();
    updateDailyPill();
    const added = Object.keys(progWords).length + Object.keys(progVerbs).length - before;
    toast(`Tiklandi: ${added} ta yangi yozuv qo'shildi`);
  } catch (err) {
    toast('Faylni o\'qib bo\'lmadi — myvocab zaxira faylini tanlang');
  }
});

/* ---------- RESIZE ---------- */
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => updateSegs(true), 120);
});

/* ---------- BO'LIMNI ALMASHTIRISH (So'zlar / Fe'llar) ---------- */
function applyDataset(init) {
  document.body.classList.toggle('ds-verbs', isVerbs());

  /* "Sana / Mavzu" filtri faqat so'zlar lug'atiga tegishli */
  $('modeSeg').closest('.segwrap').hidden = isVerbs();
  $('levelSeg').hidden = isVerbs();                    // fe'llar ro'yxati modullarga bo'linmagan
  updateSegPill($('levelSeg'), true);

  $('q').placeholder = isVerbs() ? 'Fe’l qidirish…' : 'So‘z qidirish…';
  $('tsAllBtn').textContent = `Hammasi (${totalOf()} ta)`;

  if (init) return;
  stopQueue();
  buildLessons();
  render();
  updatePoolCount();
  updateSegs(true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- INIT ---------- */
$$('#dsSeg button').forEach(b => {
  const v = b.dataset.v === 'verbs';
  b.textContent = v ? 'Fe\'llar' : 'So‘zlar';
  const n = document.createElement('span');
  n.className = 'ds-n';                       // mobilda yashiriladi — joy tejash uchun
  n.id = v ? 'dsNVerbs' : 'dsNWords';
  n.textContent = String(v ? TOTAL_VERBS : levelItems().length);
  b.appendChild(n);
});
seg('dsSeg', dataset, (v, init) => { dataset = v; applyDataset(init); });

/* ---------- MODUL (Elementary / Pre-Intermediate) ---------- */
function applyLevel(init) {
  $('dsNWords').textContent = String(levelItems().length);
  if (!isVerbs()) $('tsAllBtn').textContent = `Hammasi (${totalOf()} ta)`;

  /* Tanlangan dars bu modulda yo'q bo'lsa — "Hammasi" (Takror/Qiyin umumiy, ular qoladi) */
  const inLevel = k => levelItems().some(i => (filterMode === 'date' ? i.g.date : i.g.topic) === k);
  if (!isSpecial(activeLesson) && activeLesson !== 'all' && !inLevel(activeLesson)) {
    activeLesson = 'all';
  }
  if (init || isVerbs()) return;
  stopQueue();
  buildLessons();
  render();
  updatePoolCount();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
seg('levelSeg', level, (v, init) => {
  if (!init && v !== level) {
    lessonByLevel[level] = activeLesson;                 // har modul o'z darsini eslab qoladi
    activeLesson = lessonByLevel[v] || 'all';
  }
  level = v;
  applyLevel(init);
});

seg('scriptSeg',  script,        (v, init) => { script = v; if (!init) render({ animate: false }); });
seg('accentSeg',  accent,        (v, init) => { accent = v; if (!init) { stopQueue(); render({ animate: false }); } });
seg('learnedSeg', learnedFilter, (v, init) => { learnedFilter = v; if (!init) render(); });
seg('modeSeg',    filterMode,    (v, init) => {
  filterMode = v;
  if (init) return;
  activeLesson = 'all';
  stopQueue();
  buildLessons();
  render();
  updatePoolCount();
});

applyMode(false);
applyAdv();
applyDataset(true);

$('goalSelect')?.addEventListener('change', e => {
  daily.goal = parseInt(e.target.value, 10) || 20;
  updateDailyPill();
  saveState();
});
updateDailyPill();

buildLessons();
render();
updatePoolCount();
window.addEventListener('load', () => updateSegs(true));

/* ---------- SERVICE WORKER ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');

      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          /* Eski versiya ishlab turgan bo'lsa — yangisi tayyorligini aytamiz */
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Yangi so\'zlar mavjud', 'Yangilash', () => location.reload());
          }
        });
      });
    } catch (err) {
      console.warn('Service Worker ishga tushmadi:', err);
    }
  });
}
