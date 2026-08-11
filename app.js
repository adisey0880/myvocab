/* ============================================================
   myvocab — Core Application Engine
   ============================================================ */

/* ---------- LOCAL STORAGE SAFELY ---------- */
const STORE_KEY = 'myvocab_settings_v2';
function loadState(){
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function saveState(){
  try {
    const data = {
      theme: document.documentElement.getAttribute('data-theme'),
      script, accent, slow, activeLesson, filterMode, mode, learnedFilter,
      learnedWords: Array.from(learnedWordsSet),
      // Training setup preferences
      tsSource, tsCustomKey, tsCount, tsDir, tsOrder, tsStatus
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch(e){}
}

/* ---------- APP STATE ---------- */
const saved = loadState();
let script = saved?.script || 'lat';      // lat | cyr
let accent = saved?.accent || 'us';       // us  | uk
let slow = !!saved?.slow;
let activeLesson = saved?.activeLesson || 'all';
let filterMode = saved?.filterMode || 'date';   // date | topic
let mode = (typeof saved?.mode === 'number') ? saved.mode : 0; // 0: none, 1: hide-tr, 2: hide-en
let learnedFilter = saved?.learnedFilter || 'all'; // all | unlearned | learned
let query = '';
let playing = null, queue = [], qIndex = -1;

const learnedWordsSet = new Set(saved?.learnedWords || []);

// Training Setup State
let tsSource = saved?.tsSource || 'current'; // current | all | custom
let tsCustomKey = saved?.tsCustomKey || 'all';
let tsCount = saved?.tsCount || '20';        // 10 | 20 | 50 | all
let tsDir = saved?.tsDir || 'eng_uzb';       // eng_uzb | uzb_eng | mix
let tsOrder = saved?.tsOrder || 'shuffle';    // shuffle | seq
let tsStatus = saved?.tsStatus || 'unlearned'; // unlearned | all | learned

function getWordKey(g, w) {
  return `${g.topic}::${g.date}::${w[0]}`;
}

/* ---------- THEME MANAGEMENT ---------- */
function initTheme() {
  let theme = saved?.theme;
  if (!theme) {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  setTheme(theme);
}

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('themeBtn');
  const span = btn.querySelector('span');
  const icon = document.getElementById('themeIcon');
  
  if (t === 'dark') {
    span.textContent = 'Oq rejim';
    btn.setAttribute('aria-label', 'Oq rejimga o\'tish');
    if(icon) {
      icon.innerHTML = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
    }
  } else {
    span.textContent = 'Qora rejim';
    btn.setAttribute('aria-label', 'Qora rejimga o\'tish');
    if(icon) {
      icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
    }
  }
  saveState();
}

document.getElementById('themeBtn').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
});

initTheme();

/* ---------- DATA AGGREGATION ---------- */
function sections(){
  const map = new Map();
  GROUPS.forEach((g, gIdx) => {
    const key = filterMode === 'date' ? g.date : g.topic;
    if(!map.has(key)) map.set(key, {key:key, date:g.date, topic:g.topic, w:[]});
    const o = map.get(key);
    g.w.forEach(w => {
      o.w.push({ w, g, key: getWordKey(g, w) });
    });
    if(g.date > o.date) o.date = g.date;
  });
  return [...map.values()].sort((a,b) => b.date.localeCompare(a.date) || a.topic.localeCompare(b.topic));
}

/* ---------- TTS AUDIO SYSTEM ---------- */
const synth = window.speechSynthesis;
let voices = [];
function loadVoices(){ if(synth) voices = synth.getVoices() || []; }
if(synth){ loadVoices(); synth.onvoiceschanged = loadVoices; }
else document.getElementById('warn').style.display = 'block';

function pickVoice(){
  const want = accent === 'us' ? 'en-us' : 'en-gb';
  const norm = v => (v.lang||'').replace('_','-').toLowerCase();
  const pool = voices.filter(v => norm(v).startsWith(want));
  const pref = accent === 'us'
    ? ["Samantha","Google US English","Microsoft Aria","Microsoft Zira","Alex","Ava"]
    : ["Daniel","Google UK English Female","Google UK English Male","Microsoft Sonia","Kate","Serena"];
  for(const p of pref){
    const m = pool.find(v => v.name && v.name.includes(p));
    if(m) return m;
  }
  return pool[0] || voices.find(v => norm(v).startsWith('en')) || null;
}

function speak(text, card, onEnd){
  if(!synth){ document.getElementById('warn').style.display='block'; return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = accent === 'us' ? 'en-US' : 'en-GB';
  const v = pickVoice();
  if(v) u.voice = v;
  u.rate = slow ? 0.55 : 0.9;
  if(playing) playing.classList.remove('playing');
  playing = card || null;
  if(card){ card.classList.add('playing'); card.scrollIntoView({block:'nearest',behavior:'smooth'}); }
  const done = () => {
    if(card) card.classList.remove('playing');
    if(playing === card) playing = null;
    if(onEnd) onEnd();
  };
  u.onend = done; u.onerror = done;
  synth.speak(u);
}

/* ---------- RENDER LOGIC ---------- */
const list = document.getElementById('list');
const countEl = document.getElementById('count');

function wordOf(w){ return (accent === 'us' && w[1]) ? w[1] : w[0]; }
function ipaOf(w){ return accent === 'us' ? w[5] : w[2]; }
function pronOf(w){
  if(accent === 'us') return script === 'cyr' ? w[7] : w[6];
  return script === 'cyr' ? w[4] : w[3];
}

function render(){
  list.innerHTML = '';
  let shown = 0;
  
  sections().forEach(L => {
    if(activeLesson !== 'all' && activeLesson !== L.key) return;
    
    const rows = L.w.filter(item => {
      const w = item.w;
      const isLearned = learnedWordsSet.has(item.key);
      if(learnedFilter === 'unlearned' && isLearned) return false;
      if(learnedFilter === 'learned' && !isLearned) return false;
      if(!query) return true;
      return (w[0]+' '+(w[1]||'')+' '+w[8]+' '+w[9]+' '+w[3]+' '+w[4]+' '+w[6]+' '+w[7])
             .toLowerCase().includes(query);
    });
    
    if(!rows.length) return;

    const h = document.createElement('div');
    h.className = 'lhead';
    h.innerHTML = '<h2></h2><span class="date"></span>';
    h.querySelector('h2').textContent = (filterMode === 'date') ? fmt(L.date) : L.topic;
    h.querySelector('.date').textContent = (filterMode === 'date')
        ? rows.length + ' ta so\'z'
        : fmt(L.date) + ' \u00b7 ' + rows.length + ' ta so\'z';
    list.appendChild(h);

    const g = document.createElement('div');
    g.className = 'grid';
    
    rows.forEach((item, index) => {
      shown++;
      const w = item.w;
      const wordKey = item.key;
      const isLearned = learnedWordsSet.has(wordKey);

      const c = document.createElement('div');
      c.className = 'card' + (isLearned ? ' is-learned' : '');
      c.setAttribute('role','button');
      c.setAttribute('tabindex','0');
      c.setAttribute('aria-label', `${wordOf(w)} - ${w[9]}`);
      c.style.animationDelay = `${Math.min(index * 25, 350)}ms`;
      c.dataset.word = wordOf(w);

      c.innerHTML = `
        <div class="top">
          <div class="en" lang="en">${escapeHtml(wordOf(w))}</div>
          <div class="actions-right">
            <button class="check-btn" title="${isLearned ? 'Yodlangan deb belgilangan' : 'Yodlangan deb belgilash'}" aria-label="Yodlanganlikni almashtirish">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <span class="listen">
              <div class="sound-wave"><span></span><span></span><span></span><span></span></div>
              Eshitish
            </span>
          </div>
        </div>
        <div class="ipa" lang="en">${escapeHtml(ipaOf(w))}</div>
        <div class="pron ${script === 'cyr' ? 'cyr' : ''}">${escapeHtml(pronOf(w))}</div>
        <div class="meta">
          <span class="lbl">RU</span><span class="val ru" lang="ru">${escapeHtml(w[8])}</span>
          <span class="lbl">UZ</span><span class="val uz" lang="uz">${escapeHtml(w[9])}</span>
        </div>
      `;

      // Checkmark click
      const checkBtn = c.querySelector('.check-btn');
      checkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if(learnedWordsSet.has(wordKey)) {
          learnedWordsSet.delete(wordKey);
          c.classList.remove('is-learned');
        } else {
          learnedWordsSet.add(wordKey);
          c.classList.add('is-learned');
        }
        saveState();
        buildLessons();
      });

      // Card action
      const go = () => {
        stopQueue();
        c.classList.add('revealed');
        speak(wordOf(w), c);
      };
      
      c.addEventListener('click', go);
      c.addEventListener('keydown', e => {
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          go();
        }
      });

      g.appendChild(c);
    });
    list.appendChild(g);
  });

  if(!shown){
    const e = document.createElement('div');
    e.className = 'empty-state';
    e.innerHTML = `
      <svg class="empty-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 14z"/></svg>
      <h3>Hech narsa topilmadi</h3>
      <p>Qidiruv shartiga mos keladigan so'zlar mavjud emas.</p>
      <button id="resetFilterBtn">Filtrni tozalash</button>
    `;
    list.appendChild(e);
    document.getElementById('resetFilterBtn')?.addEventListener('click', () => {
      document.getElementById('q').value = '';
      query = '';
      learnedFilter = 'all';
      updateSegs();
      render();
    });
  }
  
  countEl.textContent = shown + ' ta so\'z';
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(iso){
  const [y,m,d] = iso.split('-');
  return d + '.' + m + '.' + y;
}

/* ---------- SEGMENTED CONTROLS & UI PIPES ---------- */
function updateSegPill(wrap) {
  const activeBtn = wrap.querySelector('button.on');
  const pill = wrap.querySelector('.seg-pill');
  if (activeBtn && pill) {
    pill.style.left = activeBtn.offsetLeft + 'px';
    pill.style.width = activeBtn.offsetWidth + 'px';
  }
}

function updateSegs() {
  document.querySelectorAll('.seg').forEach(updateSegPill);
}

function seg(id, initialVal, cb){
  const wrap = document.getElementById(id);
  if(!wrap) return;
  
  const btn = wrap.querySelector(`button[data-v="${initialVal}"]`) || wrap.querySelector('button');
  if(btn) {
    [...wrap.children].forEach(x => { if(x.tagName==='BUTTON') { x.classList.remove('on'); x.setAttribute('aria-checked','false'); } });
    btn.classList.add('on');
    btn.setAttribute('aria-checked','true');
  }
  
  setTimeout(() => updateSegPill(wrap), 10);

  wrap.addEventListener('click', e => {
    const b = e.target.closest('button');
    if(!b) return;
    [...wrap.children].forEach(x => { if(x.tagName==='BUTTON') { x.classList.remove('on'); x.setAttribute('aria-checked','false'); } });
    b.classList.add('on');
    b.setAttribute('aria-checked','true');
    updateSegPill(wrap);
    cb(b.dataset.v);
    saveState();
  });
}

/* ---------- LESSONS FILTER CHIPS ---------- */
const lessonsWrap = document.getElementById('lessons');
function buildLessons(){
  lessonsWrap.innerHTML = '';
  const secs = sections();
  
  const totalAll = secs.reduce((s,l) => s + l.w.length, 0);
  const learnedAll = secs.reduce((s,l) => s + l.w.filter(i => learnedWordsSet.has(i.key)).length, 0);

  const mk = (label, val, sub, learnedCount) => {
    const b = document.createElement('button');
    b.textContent = label;
    if(sub){ 
      const sp = document.createElement('span'); 
      sp.className='d'; 
      sp.textContent = sub; 
      b.appendChild(sp); 
    }
    if(typeof learnedCount === 'number') {
      const bp = document.createElement('span');
      bp.className = 'badge-prog';
      bp.textContent = `${learnedCount}/${sub.replace(' ta','')}`;
      b.appendChild(bp);
    }
    if(val === activeLesson) b.classList.add('on');
    b.addEventListener('click', () => {
      stopQueue();
      activeLesson = val;
      [...lessonsWrap.children].forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      render();
      saveState();
      window.scrollTo({top:0, behavior:'smooth'});
    });
    lessonsWrap.appendChild(b);
  };

  mk('Hammasi','all', totalAll + ' ta', learnedAll);
  secs.forEach(L => {
    const lCount = L.w.filter(i => learnedWordsSet.has(i.key)).length;
    mk(filterMode === 'date' ? fmt(L.date) : L.topic, L.key, L.w.length + ' ta', lCount);
  });

  populateTsSelect(secs);
}

function populateTsSelect(secs) {
  const tsSelect = document.getElementById('tsSelect');
  if(!tsSelect) return;
  tsSelect.innerHTML = '<option value="all">Barcha darslar (212 ta)</option>';
  secs.forEach(L => {
    const opt = document.createElement('option');
    opt.value = L.key;
    opt.textContent = `${filterMode === 'date' ? fmt(L.date) : L.topic} (${L.w.length} ta so'z)`;
    if(L.key === tsCustomKey) opt.selected = true;
    tsSelect.appendChild(opt);
  });
}

buildLessons();

seg('scriptSeg', script, v => { script = v; render(); });
seg('accentSeg', accent, v => { accent = v; stopQueue(); render(); });
seg('learnedSeg', learnedFilter, v => { learnedFilter = v; render(); });
seg('modeSeg', filterMode, v => {
  filterMode = v;
  activeLesson = 'all';
  stopQueue();
  buildLessons();
  render();
});

window.addEventListener('resize', updateSegs);

/* ---------- SEARCH & SLOW & HIDE CONTROLS ---------- */
document.getElementById('q').addEventListener('input', e => {
  query = e.target.value.trim().toLowerCase();
  stopQueue();
  render();
});

const slowBtn = document.getElementById('slowBtn');
if(slow) slowBtn.classList.add('on');
slowBtn.addEventListener('click', () => { 
  slow = !slow; 
  slowBtn.classList.toggle('on', slow); 
  saveState();
});

const MODES = [
  {cls:null,      label:'Yashirish: yo\u2019q', on:false},
  {cls:'hide-tr', label:'ENG \u2192 UZB',       on:true},
  {cls:'hide-en', label:'UZB \u2192 ENG',       on:true}
];
const hideBtn = document.getElementById('hideTrBtn');
function applyMode(){
  document.body.classList.remove('hide-tr','hide-en');
  const m = MODES[mode];
  if(m.cls) document.body.classList.add(m.cls);
  hideBtn.textContent = m.label;
  hideBtn.classList.toggle('on', m.on);
  document.querySelectorAll('.card.revealed').forEach(c => c.classList.remove('revealed'));
  saveState();
}
hideBtn.addEventListener('click', () => { mode = (mode + 1) % MODES.length; applyMode(); });
applyMode();

/* ---------- PLAY ALL QUEUE ---------- */
const playBtn = document.getElementById('playAllBtn');
function stopQueue(){
  queue = []; qIndex = -1;
  if(synth) synth.cancel();
  if(playing){ playing.classList.remove('playing'); playing = null; }
  playBtn.classList.remove('on');
  playBtn.textContent = '▶ Hammasi';
}
function step(){
  qIndex++;
  if(qIndex >= queue.length){ stopQueue(); return; }
  const card = queue[qIndex];
  speak(card.dataset.word, card, () => setTimeout(step, slow ? 950 : 600));
}
playBtn.addEventListener('click', () => {
  if(queue.length){ stopQueue(); return; }
  queue = [...document.querySelectorAll('.card')];
  if(!queue.length) return;
  qIndex = -1;
  playBtn.classList.add('on');
  playBtn.textContent = '■ To\'xtatish';
  step();
});

/* ---------- TRAINING SETUP & FLASHCARD SYSTEM ---------- */
const trainSetupModal = document.getElementById('trainSetupModal');
const trainModal = document.getElementById('trainModal');
const trainBtn = document.getElementById('trainBtn');
const closeSetup = document.getElementById('closeSetup');
const closeTrain = document.getElementById('closeTrain');
const tsStartBtn = document.getElementById('tsStartBtn');
const tsSelectWrap = document.getElementById('tsSelectWrap');
const tsSelect = document.getElementById('tsSelect');

// Setup Segments
seg('tsSourceSeg', tsSource, v => {
  tsSource = v;
  tsSelectWrap.style.display = (v === 'custom') ? 'flex' : 'none';
  saveState();
});

seg('tsCountSeg', tsCount, v => { tsCount = v; saveState(); });
seg('tsDirSeg', tsDir, v => { tsDir = v; saveState(); });
seg('tsOrderSeg', tsOrder, v => { tsOrder = v; saveState(); });
seg('tsStatusSeg', tsStatus, v => { tsStatus = v; saveState(); });

tsSelect.addEventListener('change', e => {
  tsCustomKey = e.target.value;
  saveState();
});

function openTrainSetup() {
  trainSetupModal.classList.add('open');
  updateSegs();
}

trainBtn.addEventListener('click', openTrainSetup);
closeSetup.addEventListener('click', () => trainSetupModal.classList.remove('open'));
closeTrain.addEventListener('click', () => trainModal.classList.remove('open'));

let trainList = [];
let trainIdx = 0;
let trainFlipped = false;
let currentCardDir = 'eng_uzb'; // eng_uzb | uzb_eng for current card

function startCustomTraining() {
  trainSetupModal.classList.remove('open');
  
  // 1. Gather Words by Source
  let pool = [];
  const secs = sections();

  if (tsSource === 'current') {
    secs.forEach(L => {
      if(activeLesson !== 'all' && activeLesson !== L.key) return;
      L.w.forEach(item => pool.push(item));
    });
  } else if (tsSource === 'custom') {
    secs.forEach(L => {
      if(tsCustomKey !== 'all' && L.key !== tsCustomKey) return;
      L.w.forEach(item => pool.push(item));
    });
  } else {
    // all words
    secs.forEach(L => L.w.forEach(item => pool.push(item)));
  }

  // 2. Filter by Status
  pool = pool.filter(item => {
    const isLearned = learnedWordsSet.has(item.key);
    if(tsStatus === 'unlearned' && isLearned) return false;
    if(tsStatus === 'learned' && !isLearned) return false;
    return true;
  });

  if(!pool.length) {
    alert("Tanlangan sozlamalar bo'yicha mashg'ulot o'tkazish uchun so'zlar topilmadi!");
    return;
  }

  // 3. Order (Shuffle vs Sequential)
  if (tsOrder === 'shuffle') {
    pool.sort(() => Math.random() - 0.5);
  }

  // 4. Count Limit
  if (tsCount !== 'all') {
    const limit = parseInt(tsCount, 10);
    if (!isNaN(limit) && limit > 0) {
      pool = pool.slice(0, limit);
    }
  }

  trainList = pool;
  trainIdx = 0;
  trainModal.classList.add('open');
  showTrainCard();
}

tsStartBtn.addEventListener('click', startCustomTraining);

function showTrainCard() {
  if(trainIdx >= trainList.length) {
    finishTraining();
    return;
  }

  trainFlipped = false;
  const item = trainList[trainIdx];
  const w = item.w;

  // Determine Direction for Card
  if (tsDir === 'mix') {
    currentCardDir = Math.random() > 0.5 ? 'eng_uzb' : 'uzb_eng';
  } else {
    currentCardDir = tsDir;
  }

  document.getElementById('trainProgress').textContent = `${trainIdx + 1} / ${trainList.length}`;
  document.getElementById('trainBarFill').style.width = `${((trainIdx + 1) / trainList.length) * 100}%`;

  const promptEl = document.getElementById('tPrompt');
  const ipaEl = document.getElementById('tIpa');
  const pronEl = document.getElementById('tPron');
  const ruEl = document.getElementById('tRu');
  const uzEl = document.getElementById('tUz');
  const answerBox = document.getElementById('tAnswerBox');

  if (currentCardDir === 'eng_uzb') {
    promptEl.textContent = wordOf(w);
    promptEl.setAttribute('lang', 'en');
    ipaEl.textContent = ipaOf(w);
    ipaEl.style.display = 'block';
    pronEl.textContent = pronOf(w);
    pronEl.style.display = 'block';
    ruEl.textContent = 'RU: ' + w[8];
    uzEl.textContent = 'UZ: ' + w[9];
  } else {
    // UZB -> ENG
    promptEl.textContent = w[9]; // Uzbek
    promptEl.setAttribute('lang', 'uz');
    ipaEl.style.display = 'none';
    pronEl.style.display = 'none';
    ruEl.textContent = 'RU: ' + w[8];
    uzEl.textContent = 'ENG: ' + wordOf(w) + ' (' + ipaOf(w) + ')';
  }

  answerBox.classList.remove('show');
  document.getElementById('tShowBtn').style.display = 'block';
  document.getElementById('tHardBtn').style.display = 'none';
  document.getElementById('tEasyBtn').style.display = 'none';
}

function revealTrainAnswer() {
  trainFlipped = true;
  const item = trainList[trainIdx];
  const w = item.w;

  if (currentCardDir === 'uzb_eng') {
    document.getElementById('tIpa').style.display = 'block';
    document.getElementById('tPron').style.display = 'block';
  }

  document.getElementById('tAnswerBox').classList.add('show');
  document.getElementById('tShowBtn').style.display = 'none';
  document.getElementById('tHardBtn').style.display = 'block';
  document.getElementById('tEasyBtn').style.display = 'block';
  speak(wordOf(w));
}

function finishTraining() {
  document.getElementById('tPrompt').textContent = "🎉 Mashg'ulot yakunlandi!";
  document.getElementById('tIpa').textContent = "";
  document.getElementById('tPron').textContent = "Barcha so'zlarni takrorlab bo'ldingiz!";
  document.getElementById('tAnswerBox').classList.remove('show');
  document.getElementById('tShowBtn').style.display = 'none';
  document.getElementById('tHardBtn').style.display = 'none';
  document.getElementById('tEasyBtn').style.display = 'none';
}

document.getElementById('tListenBtn').addEventListener('click', () => {
  if(trainList[trainIdx]) speak(wordOf(trainList[trainIdx].w));
});

document.getElementById('tShowBtn').addEventListener('click', revealTrainAnswer);

document.getElementById('tHardBtn').addEventListener('click', () => {
  trainIdx++;
  showTrainCard();
});

document.getElementById('tEasyBtn').addEventListener('click', () => {
  if(trainList[trainIdx]) {
    learnedWordsSet.add(trainList[trainIdx].key);
    saveState();
    buildLessons();
  }
  trainIdx++;
  showTrainCard();
});

/* ---------- KEYBOARD SHORTCUTS ---------- */
window.addEventListener('keydown', e => {
  if(trainSetupModal.classList.contains('open')) {
    if(e.key === 'Escape') trainSetupModal.classList.remove('open');
    else if(e.key === 'Enter') startCustomTraining();
    return;
  }

  if(trainModal.classList.contains('open')) {
    if(e.key === 'Escape') {
      trainModal.classList.remove('open');
    } else if(e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if(!trainFlipped) revealTrainAnswer();
      else speak(wordOf(trainList[trainIdx].w));
    } else if(e.key === '1' && trainFlipped) {
      document.getElementById('tHardBtn').click();
    } else if(e.key === '2' && trainFlipped) {
      document.getElementById('tEasyBtn').click();
    }
    return;
  }

  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('q').focus();
  } else if (e.key === 'Escape') {
    if (document.activeElement.tagName === 'INPUT') {
      document.activeElement.value = '';
      query = '';
      render();
      document.activeElement.blur();
    }
  }
});

/* REGISTER SERVICE WORKER FOR OFFLINE PWA */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('Service Worker registration skipped:', err);
    });
  });
}

/* Initial Render */
render();
