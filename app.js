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
      v: 4,
      theme: document.documentElement.getAttribute('data-theme'),
      script, accent, slow, activeLesson, filterMode, mode, learnedFilter, advOpen,
      dataset, activeVerbGroup, daily,
      progressWords: progWords,
      progressVerbs: progVerbs,
      tsSource, tsCustomKey, tsCount, tsDir, tsOrder, tsStatus
    }));
  } catch (e) { /* privat rejim / to'la xotira — jim o'tamiz */ }
}

/* ---------- APP STATE ---------- */
const saved = readStore();
let script        = saved?.script || 'lat';            // lat | cyr
let accent        = saved?.accent || 'us';             // us  | uk
let slow          = !!saved?.slow;
let activeLesson  = saved?.activeLesson || 'all';
let filterMode    = saved?.filterMode || 'date';       // date | topic
let mode          = (typeof saved?.mode === 'number') ? saved.mode : 0;
let learnedFilter = saved?.learnedFilter || 'all';     // all | unlearned | learned
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
  if (fresh && typeof fresh === 'object') return { ...fresh };
  const out = {};
  (Array.isArray(legacyList) ? legacyList : []).forEach(k => {
    if (typeof k === 'string' && k) out[k] = { box: 2, due: addDays(3), wrong: 0 };
  });
  return out;
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
const isDue      = k => { const e = prog()[k]; return !!e && e.box >= 1 && e.due <= today(); };
/* "Qiyin" — tarix emas, hozirgi holat: so'z ko'p xato qilingan
   BO'LSA-DA hali mustahkam o'zlashtirilmagan bo'lsa ro'yxatda turadi.
   HARD_OUT qutisiga yetgach (haftalik oraliq) o'zi chiqib ketadi. */
const isHard     = k => {
  const e = prog()[k];
  return !!e && (e.wrong || 0) >= HARD_AT && (e.box || 0) < HARD_OUT;
};

/* Qo'lda belgilash (kartochkadagi ✓) — 1-qutiga qo'yadi yoki tozalaydi */
function setLearned(key, on) {
  const p = prog();
  if (on) {
    const e = p[key] || { box: 0, due: today(), wrong: 0 };
    p[key] = { ...e, box: Math.max(e.box, 1), due: addDays(SRS_STEPS[0]) };
  } else if (p[key]) {
    p[key] = { ...p[key], box: 0, due: today() };
  }
}

/* Mashg'ulot javobi: to'g'ri bo'lsa keyingi qutiga, xato bo'lsa boshiga */
function srsAnswer(key, ok) {
  const p = prog();
  const e = p[key] || { box: 0, due: today(), wrong: 0 };
  if (ok) {
    const box = Math.min(e.box + 1, MAX_BOX);
    p[key] = { box, due: addDays(SRS_STEPS[box - 1]), wrong: e.wrong };
  } else {
    p[key] = { box: 0, due: today(), wrong: e.wrong + 1 };
  }
  markDailyDone(key);
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
const totalOf    = () => isVerbs() ? TOTAL_VERBS : TOTAL_WORDS;

/* Mashg'ulot sozlamalari */
let tsSource    = saved?.tsSource || 'current';   // current | all | custom
let tsCustomKey = saved?.tsCustomKey || 'all';
let tsCount     = saved?.tsCount || '20';         // 10 | 20 | 50 | all
let tsDir       = saved?.tsDir || 'eng_uzb';      // eng_uzb | uzb_eng | mix
let tsOrder     = saved?.tsOrder || 'shuffle';    // shuffle | seq
let tsStatus    = saved?.tsStatus || 'unlearned'; // unlearned | all | learned

/* ---------- SEARCH INDEX (bir marta quriladi) ---------- */
const ITEMS = [];
GROUPS.forEach(g => g.w.forEach(w => {
  ITEMS.push({
    w, g,
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

const activeItems = () => isVerbs() ? VERB_ITEMS : ITEMS;

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
  const flex = p => esc(p).replace(/e$/, 'e?') + '[a-z]{0,3}';

  const cands = expandForms(Array.isArray(words) ? words : [words]);
  for (const word of cands) {
  const parts = String(word).trim().split(/\s+/);
  const last  = parts[parts.length - 1];
  const patterns = [
    parts.map(flex).join('\\s+'),                              // to'liq ibora
    parts.length > 1                                           // orada qo'shimcha so'z:
      ? parts.map(flex).join('\\s+(?:\\w+\\s+){0,2}')          // "have a long conversation"
      : null,
    last.length >= 4                                           // faqat asosiy so'z:
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
let _secCache = null, _secCacheMode = null, _verbSecCache = null;
function sections() {
  if (isVerbs()) {
    if (!_verbSecCache) {
      _verbSecCache = VERB_GROUPS.map(g => ({
        key: g.key, title: g.title, hint: g.hint,
        w: VERB_ITEMS.filter(i => i.g === g)
      }));
    }
    return _verbSecCache;
  }

  if (_secCache && _secCacheMode === filterMode) return _secCache;

  const map = new Map();
  ITEMS.forEach(item => {
    const key = filterMode === 'date' ? item.g.date : item.g.topic;
    let o = map.get(key);
    if (!o) { o = { key, date: item.g.date, topic: item.g.topic, w: [] }; map.set(key, o); }
    o.w.push(item);
    if (item.g.date > o.date) o.date = item.g.date;
  });

  _secCache = [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || a.topic.localeCompare(b.topic));
  _secCacheMode = filterMode;
  return _secCache;
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
function speak(text, card, onEnd) {
  if (!synth) { showWarn(); onEnd && onEnd(); return; }

  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang  = accent === 'us' ? 'en-US' : 'en-GB';
  u.rate  = slow ? RATE_SLOW : RATE_NORMAL;
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
  const learned = isLearned(item.key);
  if (learnedFilter === 'unlearned' && learned) return false;
  if (learnedFilter === 'learned' && !learned) return false;
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

const CHECK_BTN_HTML = (isLearned) => `
  <button class="check-btn" aria-pressed="${isLearned}" title="Yodlangan deb belgilash" aria-label="Yodlanganlikni almashtirish">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
  </button>
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

function wordCardHTML(item, isLearned) {
  const w = item.w;
  return `
    <div class="top">
      <div class="en" lang="en">${escapeHtml(wordOf(w))}</div>
      <div class="actions-right">${CHECK_BTN_HTML(isLearned)}</div>
    </div>
    <div class="ipa" lang="en">${escapeHtml(ipaOf(w))}</div>
    <div class="pron ${script === 'cyr' ? 'cyr' : ''}">${escapeHtml(pronOf(w))}</div>
    <div class="meta">
      <span class="lbl">RU</span><span class="val ru" lang="ru">${escapeHtml(w[8])}</span>
      <span class="lbl">UZ</span><span class="val uz" lang="uz">${escapeHtml(w[9])}</span>
    </div>
    ${sentBlockHTML(item.key, [w[0], w[1]])}`;
}

function verbCardHTML(item, isLearned) {
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
      <div class="actions-right">${CHECK_BTN_HTML(isLearned)}</div>
    </div>
    <div class="vforms">${cols}</div>
    <div class="meta">
      <span class="lbl">RU</span><span class="val ru" lang="ru">${escapeHtml(v[8])}</span>
      <span class="lbl">UZ</span><span class="val uz" lang="uz">${escapeHtml(v[9])}</span>
    </div>
    ${sentBlockHTML(item.key, [...forms, ...vFormsOf(v)])}`;
}

/* animate=false — qidiruv paytida kartalar miltillamasligi uchun */
function render({ animate = true } = {}) {
  /* Ro'yxat qayta chizilsa, navbatdagi kartalar DOM'dan uziladi —
     shuning uchun avval ovoz navbatini to'xtatamiz */
  if (queue.length) stopQueue();

  const frag = document.createDocumentFragment();
  let shown = 0;

  const special = isSpecial(activeKey()) ? SPECIAL[activeKey()] : null;

  sections().forEach(L => {
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
      h.querySelector('h2').textContent = filterMode === 'date' ? fmt(L.date) : L.topic;
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

      c.innerHTML = verb ? verbCardHTML(item, learned) : wordCardHTML(item, learned);

      c.querySelector('.check-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLearned(item.key);
      });

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

  countEl.textContent = `${shown} ${unit()}`;
}

/* Statusni almashtirish — ekrandagi barcha nusxalarni birdek yangilaydi */
function toggleLearned(key) {
  const nowLearned = !isLearned(key);
  setLearned(key, nowLearned);
  if (nowLearned) markDailyDone(key);

  $$(`.card[data-key="${CSS.escape(key)}"]`).forEach(card => {
    card.classList.toggle('is-learned', nowLearned);
    card.querySelector('.check-btn')?.setAttribute('aria-pressed', String(nowLearned));
  });

  saveState();
  buildLessons();
  updatePoolCount();
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
const countSpecial = kind => activeItems().filter(i => SPECIAL[kind](i.key)).length;

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
}

function populateTsSelect(secs) {
  const sel = $('tsSelect');
  if (!sel) return;

  const frag = document.createDocumentFragment();
  const all  = document.createElement('option');
  all.value = 'all';
  all.textContent = isVerbs()
    ? `Barcha guruhlar (${TOTAL_VERBS} ta)`
    : `Barcha darslar (${TOTAL_WORDS} ta)`;
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
}

function trapFocus(el, e) {
  if (e.key !== 'Tab') return;
  const items = $$(FOCUSABLE, el).filter(n => n.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* Fon (overlay) bosilganda yopish */
[['trainSetupModal'], ['trainModal']].forEach(([id]) => {
  $(id).addEventListener('mousedown', e => { if (e.target === $(id)) closeModal($(id)); });
});

/* ---------- TRAINING SETUP ---------- */
const trainSetupModal = $('trainSetupModal');
const trainModal      = $('trainModal');
const tsSelectWrap    = $('tsSelectWrap');
const tsSelect        = $('tsSelect');
const tsError         = $('tsError');

/* Bitta matn tuguni sifatida yozamiz — aks holda button'ning flex `gap`i
   qavslar orasiga ortiqcha bo'shliq qo'shib yuboradi */
$('tsAllBtn').textContent = `Hammasi (${TOTAL_WORDS} ta)`;

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
    secs.forEach(L => {
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
    if (tsStatus === 'unlearned' && isLearned) return false;
    if (tsStatus === 'learned' && !isLearned)  return false;
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

  if (tsOrder === 'shuffle') shuffle(pool);
  if (tsCount !== 'all') {
    const limit = parseInt(tsCount, 10);
    if (limit > 0) pool = pool.slice(0, limit);
  }

  session = { items: pool, idx: 0, flipped: false, dir: tsDir, learned: new Set(),
              repeated: 0, spellOk: 0, spellTotal: 0, spellChecked: false,
              spellLastOk: false, finished: false };

  closeModal(trainSetupModal);
  openModal(trainModal, '#tShowBtn');
  showTrainCard();
}
$('tsStartBtn').addEventListener('click', startCustomTraining);

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
  if (isVerbs()) {
    const uk = item.v[0].split('|');
    const us = (item.v[1] || item.v[0]).split('|');
    return [
      { label: 'V2', accept: [uk[1], us[1]] },
      { label: 'V3', accept: [uk[2], us[2]] }
    ];
  }
  return [{ label: '', accept: [item.w[0], item.w[1]] }];
}

function buildSpellInputs(item) {
  const targets = spellTargets(item);
  $('tSpellRow').innerHTML = targets.map((t, i) => `
    <label class="spell-field">
      ${t.label ? `<span class="spell-lbl">${t.label}</span>` : ''}
      <input class="spell-input" id="spellIn${i}" type="text" lang="en" inputmode="text"
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
             aria-label="Inglizcha imloni yozing" placeholder="ingliz tilida yozing…">
    </label>`).join('');

  $('tSpell').hidden = false;
  $('tSpellMask').hidden = true;
  $('tSpellResult').hidden = true;
  session.spellChecked = false;
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

  session.spellChecked = true;
  session.spellLastOk = allOk;
  session.spellTotal++;
  if (allOk) session.spellOk++;

  const res = $('tSpellResult');
  res.className = 'spell-result ' + (allOk ? 'ok' : 'bad');
  res.innerHTML = allOk
    ? '<span class="spell-verdict">✓ To‘g‘ri yozdingiz!</span>'
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
  (allOk ? $('tEasyBtn') : $('tHardBtn')).focus({ preventScroll: true });
}

/* Yordam: birinchi harf va so'z uzunligi ko'rsatiladi */
function showSpellHint() {
  const item = currentItem();
  if (!item) return;
  $('tSpellMask').innerHTML = spellTargets(item).map(t => {
    const word = t.accept.find(Boolean) || '';
    const mask = [...word].map((ch, i) => (i === 0 || ch === ' ' || ch === '-') ? ch : '_').join(' ');
    return `<span class="mask-item">${t.label ? escapeHtml(t.label) + ': ' : ''}${escapeHtml(mask)}</span>`;
  }).join('');
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

  session.dir = tsDir === 'mix' ? (Math.random() < 0.5 ? 'eng_uzb' : 'uzb_eng') : tsDir;

  $('trainProgress').textContent = `${session.idx + 1} / ${session.items.length}`;
  $('trainBarFill').style.width = `${(session.idx / session.items.length) * 100}%`;

  const promptEl = $('tPrompt'), ipaEl = $('tIpa'), pronEl = $('tPron');
  $('tForms').hidden = true;
  $('tSpell').hidden = true;
  $('tHintBtn').hidden = true;
  fillTrainSentence(item, verb ? vFormsOf(w) : [w[0], w[1]]);

  if (session.dir === 'spell') {
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

  if (session.dir !== 'spell') $('tShowBtn').textContent = 'Javobni ko\'rsatish (Space)';

  $('tStats').hidden = true;
  $('tAnswerBox').classList.remove('show');
  $('tShowBtn').hidden = false;
  $('tHardBtn').hidden = $('tEasyBtn').hidden = $('tRestartBtn').hidden = true;
  if (session.dir !== 'spell' && trainModal.contains(document.activeElement)) {
    $('tShowBtn').focus({ preventScroll: true });
  }
}

function revealTrainAnswer(fromSpell) {
  const item = currentItem();
  if (!item || session.flipped) return;

  /* Yozish rejimida javob faqat "Tekshirish"dan keyin ochiladi */
  if (session.dir === 'spell' && !fromSpell) { checkSpelling(); return; }

  session.flipped = true;
  $('tIpa').hidden = $('tPron').hidden = isVerbs() && session.dir === 'uzb_eng';
  $('tForms').hidden = !isVerbs();
  $('tListenBtn').hidden = false;
  $('tAnswerBox').classList.add('show');
  $('tShowBtn').hidden = true;
  $('tHardBtn').hidden = $('tEasyBtn').hidden = false;
  if (!fromSpell &&
      (trainModal.contains(document.activeElement) || document.activeElement === document.body)) {
    $('tEasyBtn').focus({ preventScroll: true });
  }
  speak(trainSpeakText(item));
}

/* Qiyin: so'z 1-qutiga qaytadi, xato hisoblanadi va sessiya oxiriga qo'shiladi */
function markHard() {
  const item = currentItem();
  if (!item || !session.flipped) return;

  session.repeated++;
  session.learned.delete(item.key);
  srsAnswer(item.key, false);
  saveState();
  buildLessons();
  syncCardStatus(item.key, false);

  session.items.push(item);      // oxiriga qaytaramiz — chinakam takrorlash
  session.idx++;
  showTrainCard();
}

/* Oson: keyingi qutiga o'tadi, takrorlash sanasi uzayadi */
function markEasy() {
  const item = currentItem();
  if (!item || !session.flipped) return;

  srsAnswer(item.key, true);
  saveState();
  buildLessons();
  syncCardStatus(item.key, true);

  session.learned.add(item.key);
  session.idx++;
  showTrainCard();
}

function syncCardStatus(key, isLearned) {
  $$(`.card[data-key="${CSS.escape(key)}"]`).forEach(card => {
    card.classList.toggle('is-learned', isLearned);
    card.querySelector('.check-btn')?.setAttribute('aria-pressed', String(isLearned));
  });
}

function finishTraining() {
  session.finished = true;
  session.flipped = false;

  const unique = new Set(session.items.map(i => i.key)).size;

  $('trainProgress').textContent = `${unique} / ${unique}`;
  $('trainBarFill').style.width = '100%';
  $('tPrompt').textContent = '🎉 Mashg\'ulot yakunlandi!';
  $('tPrompt').setAttribute('lang', 'uz');
  $('tIpa').hidden = $('tPron').hidden = true;
  $('tListenBtn').hidden = true;
  $('tAnswerBox').classList.remove('show');

  const stats = $('tStats');
  stats.replaceChildren();
  const cards = [
    [`${unique} ta`, `${isVerbs() ? 'fe\'l' : 'so\'z'} ko'rildi`],
    [`${session.learned.size} ta`, 'yodlandi'],
    [`${session.repeated} ta`, 'qaytarildi']
  ];
  if (session.spellTotal) {
    cards.push([`${session.spellOk}/${session.spellTotal}`, 'to\'g\'ri yozildi']);
  }
  cards.forEach(([big, small]) => {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<b></b><span></span>`;
    d.querySelector('b').textContent = big;
    d.querySelector('span').textContent = small;
    stats.appendChild(d);
  });
  stats.hidden = false;

  $('tShowBtn').hidden = $('tHardBtn').hidden = $('tEasyBtn').hidden = true;
  $('tRestartBtn').hidden = false;
  $('tRestartBtn').focus({ preventScroll: true });
}

$('tListenBtn').addEventListener('click', () => {
  const item = currentItem();
  if (item) speak(trainSpeakText(item));
});
$('tShowBtn').addEventListener('click', () => revealTrainAnswer());
$('tHintBtn').addEventListener('click', showSpellHint);
$('tHardBtn').addEventListener('click', markHard);
$('tEasyBtn').addEventListener('click', markEasy);
$('tRestartBtn').addEventListener('click', () => {
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
    if (e.key === 'Escape') { e.preventDefault(); closeModal(trainModal); return; }
    if (session?.finished) return;

    const typing = e.target && e.target.classList && e.target.classList.contains('spell-input');

    if (session?.dir === 'spell') {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!session.spellChecked) checkSpelling();
        else (session.spellLastOk ? markEasy : markHard)();
      } else if (!typing && (e.key === '1' || e.key === '2') && session.flipped) {
        e.preventDefault();
        (e.key === '1' ? markHard : markEasy)();
      }
      return;                                  // Space va harflar inputga tegishli
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
      if (!cur || (e.box || 0) > cur.box) dst[k] = { box: e.box || 0, due: e.due || today(), wrong: e.wrong || 0 };
    });
    mergeProg(data.progressWords, progWords);
    mergeProg(data.progressVerbs, progVerbs);

    /* Eski format: shunchaki ro'yxat */
    const addList = (arr, dst) => (arr || []).forEach(k => {
      if (typeof k !== 'string') return;
      const parts = k.split('::');
      const norm = normText(parts.length >= 3 ? parts.slice(2).join('::') : k).trim();
      if (norm && !dst[norm]) dst[norm] = { box: 2, due: addDays(3), wrong: 0 };
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
  n.textContent = String(v ? TOTAL_VERBS : TOTAL_WORDS);
  b.appendChild(n);
});
seg('dsSeg', dataset, (v, init) => { dataset = v; applyDataset(init); });

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
