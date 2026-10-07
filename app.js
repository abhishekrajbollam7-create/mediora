// Mediora — healthcare dashboard: signup/login + per-user reminders
const LS_MEDS_BASE = 'mediremind.meds.v1';
const LS_TAKEN_BASE = 'mediremind.taken.v1';
const LS_USER_BASE = 'mediremind.user.v1';
const LS_NOTIFIED_BASE = 'mediremind.notified.v1';
const LS_USERS = 'mediremind.users.v1';
const LS_SESSION = 'mediremind.session.v1';

const $ = (id) => document.getElementById(id);
const authView = $('authView'), appView = $('appView');
const tabSignup = $('tabSignup'), tabLogin = $('tabLogin'), tabSlider = $('tabSlider');
const signupForm = $('signupForm'), loginForm = $('loginForm');
const medForm = $('medForm'), medName = $('medName'), medDose = $('medDose'),
  medNote = $('medNote'), timeInputs = $('timeInputs'), addTimeBtn = $('addTimeBtn'),
  medList = $('medList'), todayList = $('todayList'), medCount = $('medCount'),
  todayDate = $('todayDate'), progressFill = $('progressFill'), progressText = $('progressText'),
  userName = $('userName'), toastWrap = $('toastWrap'),
  alarmModal = $('alarmModal'), alarmList = $('alarmList'),
  userChip = $('userChip');

let currentUser = null; // { name, email }
let meds = [];
let editingId = null;
let deferredPrompt = null;
let notifiedToday = {};
let snoozedUntil = {};
let searchQuery = '';
let scheduleFilter = 'all';

function load(k, fb){ try{ const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; }catch{ return fb; } }
function save(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
function todayStr(d=new Date()){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const hash = (s) => { let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))>>>0; return 'h'+h.toString(36); };
const userKey = (base) => `${base}.${(currentUser?.email || 'guest').toLowerCase()}`;

// ================= AUTH =================
function getUsers(){ return load(LS_USERS, []); }
function setSession(email){ if(email) localStorage.setItem(LS_SESSION, email); else localStorage.removeItem(LS_SESSION); }
function getSession(){ return localStorage.getItem(LS_SESSION); }

// Buttery full-screen transition played on login / signup / logout
function playTransition(msg, mid){
  const ov = $('transitionOverlay');
  const tm = $('transMsg');
  if (tm) tm.textContent = msg || 'Loading…';
  if (!ov){ mid && mid(); return; }
  ov.classList.add('show');
  setTimeout(()=>{ try{ mid && mid(); }finally{ setTimeout(()=>ov.classList.remove('show'), 550); } }, 620);
}
function showAuth(mode='signup'){
  appView.hidden = true;
  authView.hidden = false;
  switchAuthTab(mode);
  // re-trigger entrance animation for smoothness
  const wrap = authView.querySelector('.auth-wrap');
  wrap.classList.remove('view-enter'); void wrap.offsetWidth; wrap.classList.add('view-enter');
  wrap.style.transform = '';
  setTimeout(()=>wrap.classList.remove('view-enter'), 700);
}
function showApp(){
  authView.hidden = true;
  appView.hidden = false;
  loadUserData();
  applyTheme();
  seedProfile();
  refreshAvatars();
  const nun = $('navUserName');
  if (nun) nun.textContent = currentUser.name;
  const hn = $('helloName');
  if (hn) hn.textContent = currentUser.name;
  userName.value = localStorage.getItem(userKey(LS_USER_BASE)) || currentUser.name || '';
  render();
  syncPrefInputs();
  refreshThemeIcon();
  refreshVerifyBanner();
  if(typeof aiBoot === 'function') aiBoot();
  gotoPage('home');
  requestAnimationFrame(()=>{ moveChipSlider(true); moveTabSlider(true); });
}

function switchAuthTab(which){
  const isSignup = which === 'signup';
  tabSignup.classList.toggle('active', isSignup);
  tabLogin.classList.toggle('active', !isSignup);
  tabSlider.style.transform = isSignup ? 'translateX(0)' : 'translateX(100%)';
  signupForm.hidden = !isSignup;
  loginForm.hidden = isSignup;
  // re-animate form swap
  const f = isSignup ? signupForm : loginForm;
  f.style.animation='none'; void f.offsetWidth; f.style.animation='';
}
tabSignup.onclick = ()=>switchAuthTab('signup');
tabLogin.onclick = ()=>switchAuthTab('login');
$('goLogin').onclick = (e)=>{ e.preventDefault(); switchAuthTab('login'); };
$('goSignup').onclick = (e)=>{ e.preventDefault(); switchAuthTab('signup'); };

function authMsg(el, text, type){
  const m = $(el);
  m.textContent = text;
  m.className = 'auth-msg' + (type ? ' ' + type : '');
}

signupForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const name = $('suName').value.trim();
  const email = $('suEmail').value.trim().toLowerCase();
  const pass = $('suPass').value;
  const confirm = $('suConfirm').value;
  const phone = $('suPhone').value.trim();
  const ageEl = $('suAge');
  const age = ageEl ? ageEl.value.trim() : '';
  if(!name || !email || !pass) return authMsg('signupMsg','Please fill all required fields.','err');
  if(pass.length < 4) return authMsg('signupMsg','Password must be at least 4 characters.','err');
  if(pass !== confirm) return authMsg('signupMsg','Passwords do not match.','err');
  if(!$('termsChk').checked) return authMsg('signupMsg','Please accept the Terms & Conditions.','err');
  const users = getUsers();
  if(users.some(u=>u.email===email)) return authMsg('signupMsg','Account already exists — please Log in.','err');
  users.push({ name, email, pass: hash(pass), age, phone, createdAt: Date.now() });
  save(LS_USERS, users);
  // migrate any old global data (from version before signup) into this new account
  const legacyMeds = load(LS_MEDS_BASE, null);
  if(Array.isArray(legacyMeds) && legacyMeds.length){
    currentUser = { name, email };
    if(!localStorage.getItem(userKey(LS_MEDS_BASE))) save(userKey(LS_MEDS_BASE), legacyMeds);
  }
  authMsg('signupMsg','Account created ✔ — setting up…','ok');
  playTransition('Creating your cabinet…', ()=>{
    currentUser = { name, email };
    setSession(email);
    seedProfile(); recordLogin(); logAct('🎉', 'Account created', 'system');
    signupForm.reset();
    showApp();
    setTimeout(()=>startVerification(email, name), 1300);
  });
  setTimeout(()=>toast(`Welcome, ${name}! 🌿`), 1250);
});

loginForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const email = $('liEmail').value.trim().toLowerCase();
  const pass = $('liPass').value;
  const u = getUsers().find(x=>x.email===email);
  if(!u) return authMsg('loginMsg','No account with this email — please Sign up.','err');
  if(u.pass !== hash(pass)) return authMsg('loginMsg','Wrong password. Try again.','err');
  authMsg('loginMsg','Welcome back ✔…','ok');
  playTransition('Logging you in…', ()=>{
    currentUser = { name: u.name, email: u.email };
    setSession(email);
    seedProfile(); recordLogin(); logAct('👋', 'Logged in', 'system');
    loginForm.reset();
    showApp();
  });
  setTimeout(()=>toast(`Welcome back, ${u.name}! 🌿`), 1250);
});

$('logoutBtn').onclick = ()=>{
  playTransition('Logging you out…', ()=>{
    setSession(null);
    currentUser = null; meds = []; snoozedUntil = {};
    searchQuery = ''; scheduleFilter = 'all';
    const sq = $('searchInput'); if (sq) sq.value = '';
    document.querySelectorAll('.chip').forEach(x=>x.classList.toggle('active', x.dataset.f==='all'));
    moveChipSlider(true);
    stopAlarm();
    if(typeof aiReset === 'function') aiReset();
    document.body.classList.remove('painted');
    gotoPage('home');
    showAuth('login');
  });
  setTimeout(()=>toast('Logged out. See you soon 🌿'), 1250);
};

// ---------- per-user data ----------
function loadUserData(){
  meds = load(userKey(LS_MEDS_BASE), []);
  notifiedToday = load(userKey(LS_NOTIFIED_BASE), {});
  // seed demo per user once
  if(!localStorage.getItem(userKey(LS_MEDS_BASE)+'.seeded')){
    if(meds.length===0){
      meds = [
        { id: uid(), name:'Vitamin D3', dose:'1 tablet after breakfast', note:'with water', times:['08:00'], createdAt: Date.now() },
        { id: uid(), name:'Blood Pressure Tablet', dose:'1 tablet', note:'after dinner', times:['20:30'], createdAt: Date.now() },
      ];
      save(userKey(LS_MEDS_BASE), meds);
    }
    localStorage.setItem(userKey(LS_MEDS_BASE)+'.seeded','1');
  }
}
function saveMeds(){ save(userKey(LS_MEDS_BASE), meds); }

// ---------- form: dynamic times ----------
function addTimeInput(value='08:00'){
  const row = document.createElement('div');
  row.className = 'time-row';
  row.innerHTML = `<input type="time" value="${value}" required />
    <button type="button" class="btn small danger" title="Remove">✕</button>`;
  row.querySelector('button').onclick = () => {
    if (timeInputs.children.length > 1) { row.style.opacity='0'; setTimeout(()=>row.remove(),180); }
    else toast('At least one time is needed');
  };
  timeInputs.appendChild(row);
}
function getTimes(){
  return [...timeInputs.querySelectorAll('input[type=time]')].map(i=>i.value).filter(Boolean).sort();
}
addTimeBtn.onclick = () => addTimeInput('13:00');
addTimeInput('08:00');

// ---------- repeat mode: daily vs specific dates ----------
let formMode = 'daily';
let formDays = [];
let calCursor = new Date();
calCursor.setDate(1);
function isoOf(y, m, d){ return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
function setMode(m){
  formMode = m;
  $('repDaily').classList.toggle('active', m === 'daily');
  $('repDates').classList.toggle('active', m === 'dates');
  $('dateWrap').hidden = m !== 'dates';
}
$('repDaily').onclick = ()=>setMode('daily');
$('repDates').onclick = ()=>setMode('dates');
$('calPrev').onclick = ()=>{ calCursor.setMonth(calCursor.getMonth() - 1); clampCal(); renderCalendar(); };
$('calNext').onclick = ()=>{ calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); };
function clampCal(){ const t = new Date(); t.setDate(1); t.setHours(0, 0, 0, 0); if(calCursor < t) calCursor = new Date(t); }
function renderCalendar(){
  const y = calCursor.getFullYear(), mo = calCursor.getMonth();
  $('calTitle').textContent = calCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const first = new Date(y, mo, 1).getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const tstr = todayStr();
  const g = $('calGrid');
  g.innerHTML = '';
  for(let i = 0; i < first; i++) g.appendChild(document.createElement('em'));
  for(let d = 1; d <= days; d++){
    const iso = isoOf(y, mo, d);
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = d;
    if(iso === tstr) b.classList.add('today');
    if(formDays.includes(iso)) b.classList.add('sel');
    if(iso < tstr) b.disabled = true;
    b.onclick = ()=>{
      const i = formDays.indexOf(iso);
      if(i >= 0) formDays.splice(i, 1);
      else formDays.push(iso);
      formDays.sort();
      renderCalendar();
      renderDayChips();
    };
    g.appendChild(b);
  }
}
function renderDayChips(){
  const w = $('dayChips');
  w.innerHTML = '';
  if(!formDays.length){ w.innerHTML = '<span class="muted">No dates picked yet.</span>'; return; }
  formDays.forEach(iso=>{
    const c = document.createElement('span');
    c.className = 'day-chip';
    c.textContent = new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ';
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '✕';
    x.title = 'Remove';
    x.onclick = ()=>{ formDays = formDays.filter(d=>d !== iso); renderCalendar(); renderDayChips(); };
    c.appendChild(x);
    w.appendChild(c);
  });
}
$('dayClear').onclick = ()=>{ formDays = []; renderCalendar(); renderDayChips(); };
function resetMedForm(){
  medForm.reset();
  timeInputs.innerHTML = '';
  addTimeInput('08:00');
  setMode('daily');
  syncTypeChips(true);
  formDays = [];
  renderDayChips();
  calCursor = new Date();
  calCursor.setDate(1);
  renderCalendar();
}
clampCal();
renderCalendar();
renderDayChips();

// ---------- sliding medicine-type selector ----------
function syncTypeChips(instant){
  const v = $('medType').value || 'tablets';
  const chips = document.querySelectorAll('.type-chip');
  let on = null;
  chips.forEach(x=>{ const hit = x.dataset.v === v; x.classList.toggle('active', hit); if(hit) on = x; });
  if(!on && chips.length){ chips[0].classList.add('active'); on = chips[0]; }
  slideTo($('typeInd'), on, instant);
}
document.querySelectorAll('.type-chip').forEach(c=>{
  c.onclick = ()=>{ $('medType').value = c.dataset.v; syncTypeChips(); };
});
syncTypeChips(true);
window.addEventListener('resize', ()=>syncTypeChips(true));

userName.addEventListener('input', () => { if(currentUser) localStorage.setItem(userKey(LS_USER_BASE), userName.value); });

// ---------- CRUD ----------
medForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = medName.value.trim();
  const times = getTimes();
  if (!name) return toast('Please enter tablet name');
  if (!times.length) return toast('Please add at least one time');
  if (formMode === 'dates' && !formDays.length) return toast('Pick at least one date for this reminder');
  const stockVal = $('medStock').value === '' ? null : Math.max(0, parseInt($('medStock').value, 10) || 0);
  const data = { name, dose: medDose.value.trim(), note: medNote.value.trim(), times, repeat: formMode, days: formMode === 'dates' ? [...formDays] : [], stock: stockVal, form: $('medType').value };
  if (editingId) {
    meds = meds.map(m => m.id === editingId ? { ...m, ...data } : m);
    toast(`Updated “${name}” ✔`);
    editingId = null; $('saveBtn').textContent = '➕ Add tablet'; $('cancelEditBtn').hidden = true;
  } else {
    meds.push({ id: uid(), createdAt: Date.now(), ...data });
    toast(`Added “${name}” ✔`);
  }
  saveMeds();
  logAct('💊', 'Added "' + name + '"', 'med');
  resetMedForm();
  render();
});
$('cancelEditBtn').onclick = () => {
  editingId = null; resetMedForm();
  $('saveBtn').textContent = '➕ Add tablet'; $('cancelEditBtn').hidden = true;
};

function delMed(id){
  const m = meds.find(x=>x.id===id);
  if (!confirm(`Delete “${m?.name}”?`)) return;
  meds = meds.filter(x=>x.id!==id);
  saveMeds(); render();
}
function editMed(id){
  const m = meds.find(x=>x.id===id); if(!m) return;
  editingId = id;
  medName.value = m.name; medDose.value = m.dose || ''; medNote.value = m.note || '';
  $('medStock').value = (m.stock === undefined || m.stock === null) ? '' : m.stock;
  $('medType').value = m.form || 'tablets';
  syncTypeChips();
  timeInputs.innerHTML=''; m.times.forEach(t=>addTimeInput(t));
  setMode(m.repeat === 'dates' ? 'dates' : 'daily');
  formDays = Array.isArray(m.days) ? [...m.days] : [];
  renderDayChips();
  calCursor = new Date(); calCursor.setDate(1); renderCalendar();
  $('saveBtn').textContent = '💾 Save changes'; $('cancelEditBtn').hidden = false;
  window.scrollTo({top:0, behavior:'smooth'});
  medName.focus();
}

function renderTrack(){
  const list = $('trackList');
  if(!list || !currentUser) return;
  const byMed = {};
  todaysDoses().forEach(d=>{
    const id = d.med.id;
    if(!byMed[id]) byMed[id] = { med: d.med, slots: [] };
    byMed[id].slots.push(d);
  });
  const ids = Object.keys(byMed);
  // what the user should take first: pending / in-progress on top, completed last
  ids.sort((a, b)=>{
    const pa = byMed[a].slots.filter(s=>!isTaken(s.key)).length;
    const pb = byMed[b].slots.filter(s=>!isTaken(s.key)).length;
    if((pa > 0) !== (pb > 0)) return pa > 0 ? -1 : 1;
    return byMed[a].med.name.localeCompare(byMed[b].med.name);
  });
  let done = 0, total = 0;
  const nx = nextDose();
  const tn = $('trackNext');
  if(tn){
    if(nx) tn.innerHTML = '🔔 Up next: you should take <b></b> at <b></b>';
    else tn.innerHTML = '🎉 All caught up — nothing left to take today.';
    tn.classList.toggle('done', !nx);
    if(nx){
      tn.querySelectorAll('b')[0].textContent = nx.med.name;
      tn.querySelectorAll('b')[1].textContent = fmt12(nx.time);
    }
  }
  list.innerHTML = ids.length ? '' : '<div class="muted small">No medicines scheduled today — add tablets to start tracking.</div>';
  ids.forEach(id=>{
    const g = byMed[id];
    const tk = g.slots.filter(s=>isTaken(s.key)).length;
    done += tk;
    total += g.slots.length;
    const full = g.slots.length > 0 && tk === g.slots.length;
    const pct = g.slots.length ? Math.round(tk / g.slots.length * 100) : 0;
    const row = document.createElement('div');
    row.className = 'track-med' + (full ? ' done' : '');
    row.innerHTML = '<span class="t-ic">💊</span><div class="t-info"><b></b><span class="muted small"></span><div class="t-bar"><i style="width:' + pct + '%"></i></div></div><span class="badge ' + (full ? 'ok' : '') + '">' + (full ? 'Done ✔' : tk + '/' + g.slots.length) + '</span><div class="t-times"></div>';
    row.querySelector('b').textContent = g.med.name;
    let sched = '🔁 Daily';
    if(g.med.repeat === 'dates'){
      const upcomingAll = (g.med.days || []).filter(d=>d >= todayStr()).sort();
      const show = upcomingAll.slice(0, 3).map(d=>new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
      sched = upcomingAll.length ? ('📅 ' + show.join(', ') + (upcomingAll.length > 3 ? ' +' + (upcomingAll.length - 3) + ' more' : '')) : '📅 No upcoming days';
    }
    const sub = row.querySelector('.t-info span');
    const baseParts = [g.med.dose, sched].filter(Boolean);
    const st = stockText(g.med);
    if(st){ sub.textContent = baseParts.concat([st]).join(' · ') || '—'; }
    else{
      sub.textContent = baseParts.join(' · ') + (baseParts.length ? ' · ' : '');
      const sb = document.createElement('button');
      sb.type = 'button';
      sb.className = 'stock-add';
      sb.textContent = '📦 Set stock';
      sb.onclick = ()=>{ editMed(g.med.id); gotoPage('medicines'); };
      sub.appendChild(sb);
    }
    const tw = row.querySelector('.t-times');
    g.slots.forEach(s=>{
      const taken = isTaken(s.key);
      const ch = document.createElement('button');
      ch.type = 'button';
      ch.className = 'tchip' + (taken ? ' done' : '');
      ch.dataset.k = s.key;
      ch.title = taken ? 'Taken — tap to undo' : 'Tap to mark taken';
      ch.textContent = fmt12(s.time) + (taken ? ' ✔' : '');
      ch.onclick = ()=>{ if(isTaken(ch.dataset.k)) unmarkTaken(ch.dataset.k); else { markTaken(ch.dataset.k); stopAlarm(); } };
      tw.appendChild(ch);
    });
    list.appendChild(row);
  });
  const tc = $('trackCount');
  if(tc) tc.textContent = done + ' / ' + total + ' taken';
}

function usedCount(id){
  const log = takenLog();
  let n = 0;
  Object.keys(log).forEach(d=>{ Object.keys(log[d] || {}).forEach(k=>{ if(k.indexOf(id + '_') === 0) n++; }); });
  return n;
}
function stockText(m){
  if(m.stock === undefined || m.stock === null || m.stock === '') return '';
  const used = usedCount(m.id);
  const left = Math.max(0, m.stock - used);
  return '📦 ' + used + ' used · ' + left + ' left of ' + m.stock + (left <= 3 ? ' ⚠️ refill soon' : '');
}

function checkLowStock(){
  if(!currentUser) return;
  const k = userKey('mediremind.lowstock.v1');
  const seen = load(k, {});
  const today = todayStr();
  let changed = false;
  meds.forEach(m=>{
    if(m.stock === undefined || m.stock === null || m.stock === '') return;
    const left = Math.max(0, m.stock - usedCount(m.id));
    if(left <= 5 && seen[m.id] !== today){
      seen[m.id] = today;
      changed = true;
      const msg = 'Your ' + m.name + ' tablets are running out (' + left + ' left) — buy them soon!';
      toast('⚠️ ' + msg, 4500);
      notifySystem('⚠️ Low stock alert', msg);
      logAct('⚠️', 'Low stock: ' + m.name + ' (' + left + ' left)', 'system');
    }
    if(left > 5 && seen[m.id]){ delete seen[m.id]; changed = true; }
  });
  if(changed) save(k, seen);
}

// ---------- today's schedule ----------
function todaysDoses(){
  const out = [];
  const today = todayStr();
  meds.forEach(m => {
    if((m.repeat || 'daily') === 'dates' && !(m.days || []).includes(today)) return;
    m.times.forEach(t => out.push({ med:m, time:t, key:`${m.id}_${t}` }));
  });
  return out.sort((a,b)=>a.time.localeCompare(b.time));
}
function takenLog(){ return currentUser ? load(userKey(LS_TAKEN_BASE), {}) : {}; }
function isTaken(key){
  const log = takenLog();
  return !!(log[todayStr()] && log[todayStr()][key]);
}
function markTaken(key){
  if(!currentUser) return;
  const k = userKey(LS_TAKEN_BASE);
  const log = load(k, {});
  const d = todayStr();
  log[d] = log[d] || {};
  log[d][key] = Date.now();
  save(k, log);
  const _mm = meds.find(x=>key.indexOf(x.id+'_')===0);
  logAct('✔', 'Took ' + (_mm ? '"' + _mm.name + '"' : 'dose'), 'reminder');
  render();
}
function unmarkTaken(key){
  if(!currentUser) return;
  const k = userKey(LS_TAKEN_BASE);
  const log = load(k, {});
  const d = todayStr();
  if (log[d]) { delete log[d][key]; save(k, log); }
  render();
}

function render(){
  if(!currentUser) return;
  todayDate.textContent = new Date().toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});
  medCount.textContent = meds.length;
  medList.innerHTML = meds.length ? '' : `<div class="muted small">No tablets yet — add your first one above 👆</div>`;
  [...meds].sort((a,b)=>a.name.localeCompare(b.name)).filter(m=>{
    if(!searchQuery) return true;
    const hay = (m.name+' '+(m.dose||'')+' '+(m.note||'')+' '+m.times.join(' ')).toLowerCase();
    return hay.includes(searchQuery);
  }).forEach(m=>{
    const el = document.createElement('div');
    el.className='med';
    el.innerHTML = `<div class="med-info"><b></b><div></div></div>
      <div class="med-actions"><button class="btn small secondary">Edit</button><button class="btn small danger">Del</button></div>`;
    el.querySelector('b').textContent = m.name;
    const _sub = el.querySelector('.med-info div');
    if(_sub) _sub.remove();
    el.querySelectorAll('button')[0].onclick = ()=>editMed(m.id);
    el.querySelectorAll('button')[1].onclick = ()=>delMed(m.id);
    medList.appendChild(el);
  });
  const doses = todaysDoses();
  const taken = doses.filter(d=>isTaken(d.key)).length;
  progressFill.style.width = doses.length ? (taken/doses.length*100)+'%' : '0';
  progressText.textContent = `${taken} / ${doses.length} taken`;
  todayList.innerHTML = doses.length ? '' : `<div class="muted small">Nothing scheduled. Add tablets to build today's schedule.</div>`;
  const now = new Date(); const nowMin = now.getHours()*60+now.getMinutes();
  doses.forEach(d=>{
    const [h,mi] = d.time.split(':').map(Number);
    const due = (h*60+mi) <= nowMin;
    const takenYet = isTaken(d.key);
    const _st = takenYet ? 'taken' : (due ? 'due' : 'upcoming');
    if(scheduleFilter !== 'all' && scheduleFilter !== _st) return;
    const el = document.createElement('div');
    el.className = 'dose' + (takenYet ? ' taken' : (due ? ' due' : ''));
    el.innerHTML = `<div class="dose-time"></div><div class="dose-info"><b></b><div></div></div>
      <span class="badge"></span> <button class="btn small primary"></button>`;
    el.querySelector('.dose-time').textContent = fmt12(d.time);
    el.querySelector('b').textContent = d.med.name;
    el.querySelector('.dose-info div').textContent = [d.med.dose, d.med.note].filter(Boolean).join(' • ') || '—';
    const badge = el.querySelector('.badge');
    const btn = el.querySelector('button');
    if (takenYet){ badge.textContent='Taken ✔'; badge.classList.add('ok'); btn.textContent='Undo'; btn.className='btn small secondary'; btn.onclick=()=>unmarkTaken(d.key); }
    else if (due){ badge.textContent='DUE NOW'; badge.classList.add('due'); btn.textContent='Take ✔'; btn.onclick=()=>{markTaken(d.key); stopAlarm();}; }
    else { badge.textContent='Upcoming'; btn.textContent='Take ✔'; btn.onclick=()=>markTaken(d.key); }
    todayList.appendChild(el);
  });
  renderTrack();
  renderAppts();
  updateDashboard();
  if(!document.body.classList.contains('painted')) requestAnimationFrame(()=>document.body.classList.add('painted'));
}
function fmt12(t){ let [h,m]=t.split(':').map(Number); const ap=h>=12?'PM':'AM'; h=h%12||12; return `${h}:${String(m).padStart(2,'0')} ${ap}`; }

// ---------- toast ----------
function toast(msg, ms=2600){
  const t = document.createElement('div');
  t.className='toast'; t.textContent=msg;
  toastWrap.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(8px)'; setTimeout(()=>t.remove(),300); }, ms);
}

// ---------- sound ----------
let audioCtx = null;
function beep(times=3){
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    let t = audioCtx.currentTime;
    for(let i=0;i<times;i++){
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type='sine'; o.frequency.value=880;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t+0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.5);
      o.start(t); o.stop(t+0.55);
      t += 0.7;
    }
  }catch{}
}
$('testSoundBtn').onclick = ()=>beep(2);

// ---------- alerts ----------
async function enableAlerts(){
  beep(1);
  try{
    if ('Notification' in window){
      const p = await Notification.requestPermission();
      toast(p==='granted' ? 'Alerts enabled ✔ (sound + notification)' : 'Sound on. Notifications blocked — allow them for best results.');
    } else toast('Sound enabled ✔');
  }catch{ toast('Sound enabled ✔'); }
  render();
}
const _esb = $('enableSoundBtn');
if(_esb) _esb.onclick = enableAlerts;
const _esb2 = $('enableSoundBtn2');
if(_esb2) _esb2.onclick = enableAlerts;

function notifySystem(title, body){
  try{
    if ('Notification' in window && Notification.permission === 'granted'){
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, icon:'icon.svg', badge:'icon.svg', vibrate:[200,100,200] })).catch(()=>new Notification(title,{body}));
      } else new Notification(title, { body });
    }
  }catch{}
}

let currentDue = [];
function checkDue(){
  if(!currentUser) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0'), mm = String(now.getMinutes()).padStart(2,'0');
  const cur = `${hh}:${mm}`;
  const dstr = todayStr();
  notifiedToday = load(userKey(LS_NOTIFIED_BASE), {});
  const due = todaysDoses().filter(d => {
    if (d.time !== cur) return false;
    if (isTaken(d.key)) return false;
    if (snoozedUntil[d.key] && Date.now() < snoozedUntil[d.key]) return false;
    if (notifiedToday[dstr+'_'+d.key]) return false;
    return true;
  });
  if (due.length) {
    todaysDoses().filter(d=>d.time===cur && !isTaken(d.key)).forEach(d=>{ notifiedToday[dstr+'_'+d.key]=Date.now(); });
    save(userKey(LS_NOTIFIED_BASE), notifiedToday);
    currentDue = todaysDoses().filter(d=>d.time===cur && !isTaken(d.key));
    showAlarm(currentDue);
    render();
  }
  // 5-minute early heads-up (toast + notification only, once per slot per day)
  const _nm = new Date();
  const _nmMin = _nm.getHours() * 60 + _nm.getMinutes();
  let _preChanged = false;
  todaysDoses().forEach(d=>{
    if(isTaken(d.key)) return;
    if(snoozedUntil[d.key] && Date.now() < snoozedUntil[d.key]) return;
    const _parts = d.time.split(':').map(Number);
    if((_parts[0] * 60 + _parts[1]) - _nmMin !== 5) return;
    const _pk = dstr + '_' + d.key + '_pre5';
    if(notifiedToday[_pk]) return;
    notifiedToday[_pk] = Date.now();
    _preChanged = true;
    toast('⏰ ' + d.med.name + ' in 5 minutes (' + fmt12(d.time) + ')');
    notifySystem('⏰ Coming up in 5 min', d.med.name + ' at ' + fmt12(d.time));
    try{ beep(1); }catch(e){}
  });
  if(_preChanged) save(userKey(LS_NOTIFIED_BASE), notifiedToday);
  Object.keys(snoozedUntil).forEach(k=>{
    if (Date.now() >= snoozedUntil[k] && !isTaken(k)) {
      delete snoozedUntil[k];
      const idx = k.lastIndexOf('_');
      const mid = k.slice(0, idx), t = k.slice(idx+1);
      const m = meds.find(x=>x.id===mid);
      if (m){ currentDue=[{med:m,time:t,key:k}]; showAlarm(currentDue); }
    }
  });
}
function showAlarm(dueList){
  alarmList.innerHTML = dueList.map(d=>{
    const div=document.createElement('div'); div.className='dose due';
    div.innerHTML=`<div class="dose-time"></div><div class="dose-info"><b></b><div></div></div>`;
    div.querySelector('.dose-time').textContent=fmt12(d.time);
    div.querySelector('b').textContent=d.med.name;
    div.querySelector('.dose-info div').textContent=[d.med.dose,d.med.note].filter(Boolean).join(' • ')||'—';
    return div.outerHTML;
  }).join('');
  alarmModal.hidden = false;
  beep(4);
  try{
    if('speechSynthesis' in window){
      window.speechSynthesis.cancel();
      const names = dueList.map(d=>d.med.name + ' at ' + fmt12(d.time)).join(', ');
      const u = new SpeechSynthesisUtterance('Time to take your tablets. ' + names);
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    }
  }catch(e){}
  const who = currentUser ? ` (${currentUser.name})` : '';
  notifySystem('💊 Time for your medicine!', dueList.map(d=>`${d.med.name} at ${fmt12(d.time)}`).join('\n') + who);
  if (navigator.vibrate) try{navigator.vibrate([300,100,300]);}catch{}
}
function stopAlarm(){ alarmModal.hidden = true; currentDue=[]; try{ if('speechSynthesis' in window) window.speechSynthesis.cancel(); }catch(e){} }
$('markTakenBtn').onclick = ()=>{ currentDue.forEach(d=>markTaken(d.key)); stopAlarm(); toast('Marked as taken ✔'); };
$('snoozeBtn').onclick = ()=>{
  currentDue.forEach(d=>{ snoozedUntil[d.key]=Date.now()+10*60*1000; });
  stopAlarm(); toast('Snoozed for 10 minutes 😴');
};

// PWA install
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt=e; $('installBtn').hidden=false; });
$('installBtn').onclick = async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt=null; $('installBtn').hidden=true; };

// ---------- one-tap demo credentials + social sign-in (demo) ----------
function doDemoLogin(via){
  const users = getUsers();
  if(!users.some(u=>u.email==='demo@mediora.app')){
    users.push({ name:'Demo User', email:'demo@mediora.app', pass: hash('demo1234'), age:'', createdAt: Date.now() });
    save(LS_USERS, users);
  }
  playTransition(via === 'google' ? 'Continuing with Google…' : 'Loading demo…', ()=>{
    currentUser = { name:'Demo User', email:'demo@mediora.app' };
    setSession('demo@mediora.app');
    recordLogin(); logAct('👋', 'Logged in (demo)', 'system');
    showApp();
  });
  setTimeout(()=>toast(via === 'google' ? 'Signed in with Google (demo) 🌿' : 'Welcome to the demo! 🌿'), 1250);
}
$('demoBtn').onclick = ()=>doDemoLogin('demo');
// ---------- real Google sign-in (Google Identity Services) + demo fallback ----------
// For REAL Google login: Google Cloud Console → APIs & Services → Credentials →
// Create Credentials → OAuth client ID → Web application → add your site origin
// (e.g. https://abhishekrajbollam7-create.github.io) to Authorized JavaScript origins,
// then paste the Client ID below.
const GOOGLE_CLIENT_ID = '';
function googleSignIn(){
  if(GOOGLE_CLIENT_ID && window.google && google.accounts && google.accounts.oauth2){
    try{
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid email profile',
        callback: (resp)=>{
          if(!resp || !resp.access_token){ toast('Google sign-in was cancelled'); return; }
          fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + resp.access_token } })
            .then(r=>r.json())
            .then(info=>{
              if(!info || !info.email) throw 0;
              googleLocalLogin(info);
            })
            .catch(()=>toast('Could not read Google profile — try again'));
        }
      });
      client.requestAccessToken();
      return;
    }catch(e){}
  }
  toast('Demo mode: add your Google Client ID for real Google sign-in');
  doDemoLogin('google');
}
function googleLocalLogin(info){
  const email = String(info.email).toLowerCase();
  const name = info.name || email.split('@')[0];
  const users = getUsers();
  let u = users.find(x=>x.email === email);
  if(!u){
    u = { name, email, pass: hash('google-' + email), age: '', phone: '', verified: true, provider: 'google', createdAt: Date.now() };
    users.push(u);
    save(LS_USERS, users);
  } else if(!u.verified){ u.verified = true; save(LS_USERS, users); }
  playTransition('Signing in with Google…', ()=>{
    currentUser = { name: u.name, email: u.email };
    setSession(email);
    seedProfile(); recordLogin(); logAct('👋', 'Signed in with Google', 'system');
    showApp();
  });
  setTimeout(()=>toast('Welcome, ' + u.name + '! 🌿'), 1250);
}
document.querySelectorAll('.gsocial').forEach(b=>{ b.onclick = ()=>googleSignIn(); });
document.querySelectorAll('.asocial').forEach(b=>{ b.onclick = ()=>toast('Apple sign-in needs a server — use Google or demo in this offline build 🍏'); });

// ---------- password eye toggles ----------
document.querySelectorAll('.pw-eye').forEach(b=>{
  b.onclick = ()=>{
    const inp = $(b.dataset.for);
    if(!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.textContent = show ? '🙈' : '👁';
  };
});

// ---------- home search + schedule filter chips ----------
$('searchInput').addEventListener('input', (e)=>{ searchQuery = e.target.value.trim().toLowerCase(); render(); });
document.querySelectorAll('.chip').forEach(c=>{
  c.onclick = ()=>{
    document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
    c.classList.add('active');
    scheduleFilter = c.dataset.f || 'all';
    render();
    moveChipSlider();
  };
});

// ---------- bottom tab bar (page navigation) ----------
document.querySelectorAll('.tabbar button').forEach(b=>{
  if(b.classList.contains('tab-exit')){ b.onclick = ()=>$('logoutBtn').click(); return; }
  b.onclick = ()=>{
    document.querySelectorAll('.tabbar button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    gotoPage(b.dataset.page || 'dashboard');
    moveTabSlider();
  };
});
document.querySelectorAll('.scroll-btn').forEach(b=>{
  b.onclick = ()=>{
    const t = b.dataset.target && $(b.dataset.target);
    gotoPage('medicines');
    setTimeout(()=>{ if(t) t.scrollIntoView({behavior:'smooth', block:'start'}); const f=$('medName'); if(f) f.focus({preventScroll:true}); }, 150);
  };
});

// ---------- sliding indicators (buttery segmented motion) ----------
function slideTo(ind, el, instant){
  if(!ind || !el || !el.offsetParent) return;
  if(instant) ind.style.transition = 'none';
  ind.style.width = el.offsetWidth + 'px';
  ind.style.height = el.offsetHeight + 'px';
  ind.style.transform = 'translate(' + el.offsetLeft + 'px,' + el.offsetTop + 'px)';
  if(instant){ void ind.offsetWidth; ind.style.transition = ''; }
}
function moveChipSlider(instant){ slideTo($('chipIndicator'), document.querySelector('.chip.active'), instant); }
function moveTabSlider(instant){ slideTo($('tabIndicator'), document.querySelector('.tabbar button.active'), instant); }
window.addEventListener('resize', ()=>{ moveChipSlider(true); moveTabSlider(true); });
if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ moveChipSlider(true); moveTabSlider(true); });

// ================= DASHBOARD STUDIO =================
const LS_PROFILE = 'mediremind.profile.v1';
const LS_PREFS_BASE = 'mediremind.prefs.v1';
const LS_ACT = 'mediremind.activity.v1';
const LS_ORDERS = 'mediremind.orders.v1';
const LS_RX = 'mediremind.rx.v1';
const LS_LOGINS = 'mediremind.logins.v1';
const LS_APPT = 'mediremind.appt.v1';

function setText(id, v){ const e = $(id); if(e) e.textContent = v; }
function setChip(id, v){ const e = $(id); if(!e) return; e.textContent = v; e.style.display = v ? '' : 'none'; }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ---------- profile store ----------
function seedProfile(){
  if(!currentUser) return;
  const u = getUsers().find(x=>x.email===currentUser.email) || {};
  const k = userKey(LS_PROFILE);
  if(!load(k, null)){
    save(k, { name: currentUser.name, email: currentUser.email, phone: u.phone||'', dob:'', gender:'', blood:'', addr:'', emerg:'', loc:'', allerg:'', cond:'', photo:'' });
  }
}
function getProfile(){ return currentUser ? load(userKey(LS_PROFILE), {}) : {}; }
function saveProfile(p){ if(currentUser) save(userKey(LS_PROFILE), p); }

// ---------- activity log ----------
function logAct(icon, text, type){
  if(!currentUser) return;
  const k = userKey(LS_ACT);
  const a = load(k, []);
  a.unshift({ t: Date.now(), icon, text, type: type || 'info' });
  save(k, a.slice(0, 60));
  renderActivity();
  if(currentPage === 'notifs') renderNotifs();
}
function actRow(ev){
  const el = document.createElement('div');
  el.className = 'act-item';
  el.innerHTML = '<i></i><div><b></b></div>';
  el.querySelector('i').textContent = ev.icon;
  el.querySelector('b').textContent = ev.text;
  const tm = document.createElement('time');
  tm.textContent = new Date(ev.t).toLocaleString(undefined, { day:'numeric', month:'short', hour:'numeric', minute:'2-digit' });
  el.appendChild(tm);
  return el;
}
function renderActivity(){
  const list = $('actList');
  if(!list || !currentUser) return;
  const a = load(userKey(LS_ACT), []);
  list.innerHTML = a.length ? '' : '<div class="muted small">No activity yet — add a tablet to get started.</div>';
  a.slice(0, 6).forEach(ev=>list.appendChild(actRow(ev)));
}
function renderNotifs(){
  const list = $('notifList');
  if(!list || !currentUser) return;
  const a = load(userKey(LS_ACT), []).filter(e=>['reminder','system','order'].includes(e.type));
  list.innerHTML = a.length ? '' : '<div class="muted small">No notifications yet.</div>';
  a.slice(0, 25).forEach(ev=>list.appendChild(actRow(ev)));
}
function recordLogin(){
  if(!currentUser) return;
  const k = userKey(LS_LOGINS);
  const a = load(k, []);
  a.unshift({ t: Date.now(), info: 'This browser · current session' });
  save(k, a.slice(0, 10));
}
function renderLoginAct(){
  const list = $('loginActList');
  if(!list || !currentUser) return;
  const a = load(userKey(LS_LOGINS), []);
  list.innerHTML = a.length ? '' : '<div class="muted small">No logins recorded.</div>';
  a.forEach(l=>{
    const el = document.createElement('div');
    el.className = 'act-item';
    el.innerHTML = '<i>💻</i><div><b>This browser</b></div>';
    const tm = document.createElement('time');
    tm.textContent = new Date(l.t).toLocaleString(undefined, { day:'numeric', month:'short', hour:'numeric', minute:'2-digit' });
    el.appendChild(tm);
    list.appendChild(el);
  });
}

// ---------- navigation ----------
function closeMenus(){ const u = $('userDrop'); if(u) u.classList.remove('open'); const m = $('navMenu'); if(m) m.classList.remove('open'); const s = $('menuScrim'); if(s) s.classList.remove('show'); }
let currentPage = 'dashboard';
function gotoPage(p){
  currentPage = p;
  document.querySelectorAll('.page').forEach(s=>{ s.hidden = s.id !== 'page-' + p; });
  document.querySelectorAll('.nav-item[data-page]').forEach(n=>n.classList.toggle('active', n.dataset.page === p));
  document.querySelectorAll('.tabbar button[data-page]').forEach(n=>n.classList.toggle('active', n.dataset.page === p));
  $('sidebar') && $('sidebar').classList.remove('open');
  $('scrim') && $('scrim').classList.remove('show');
  closeMenus();
  window.scrollTo({ top: 0 });
  if(p === 'dashboard'){ updateDashboard(); animateChart(); }
  if(p === 'profile'){ fillProfileForm(); syncPrefInputs(); renderLoginAct(); }
  if(p === 'settings'){ syncPrefInputs(); }
  if(p === 'orders'){ renderOrders(); }
  if(p === 'rx'){ renderRx(); }
  if(p === 'records'){ renderRecords(); }
  if(p === 'notifs'){ renderNotifs(); requestAnimationFrame(()=>moveTabSlider(true)); }
  if(p === 'reminders' || p === 'medicines'){ syncTypeChips(true); requestAnimationFrame(()=>{ moveChipSlider(true); moveTabSlider(true); }); }
}
document.querySelectorAll('.nav-item[data-page]').forEach(n=>{ n.onclick = ()=>{ gotoPage(n.dataset.page); closeMenus(); }; });
document.querySelectorAll('[data-go]').forEach(b=>{ b.onclick = ()=>{ gotoPage(b.dataset.go); const f = b.dataset.focus && $(b.dataset.focus); if(f) setTimeout(()=>f.focus({ preventScroll: true }), 400); }; });
$('editProfileBtn').onclick = ()=>gotoPage('profile');
$('goMeds').onclick = (e)=>{ e.preventDefault(); gotoPage('medicines'); };
const _st = $('sideToggle');
if(_st) _st.onclick = (e)=>{ e.stopPropagation(); const m = $('navMenu'); if(!m) return; m.classList.toggle('open'); const s = $('menuScrim'); if(s) s.classList.toggle('show', m.classList.contains('open')); };
const _ms = $('menuScrim');
if(_ms) _ms.onclick = ()=>closeMenus();
const _sc = $('sideCollapse');
if(_sc) _sc.onclick = ()=>document.querySelector('.app-shell').classList.toggle('collapsed');
const _scr = $('scrim');
if(_scr) _scr.onclick = ()=>{ const s = $('sidebar'); if(s) s.classList.remove('open'); _scr.classList.remove('show'); };
$('themeBtn').onclick = ()=>{
  if(!currentUser) return;
  const p = getPrefs();
  p.theme = p.theme === 'light' ? 'dark' : 'light';
  savePrefs(p);
  applyTheme();
  syncPrefInputs();
  refreshThemeIcon();
  toast(p.theme === 'light' ? '☀️ Light mode on' : '🌙 Dark mode on');
};
function refreshThemeIcon(){ const b = $('themeBtn'); if(b) b.textContent = getPrefs().theme === 'light' ? '☀️' : '🌙'; }
$('notifBtn').onclick = ()=>gotoPage('notifs');
$('helpBtn').onclick = ()=>{ $('helpModal').hidden = false; };
$('helpClose').onclick = ()=>{ $('helpModal').hidden = true; };
$('helpModal').addEventListener('click', (e)=>{ if(e.target.id === 'helpModal') e.target.hidden = true; });
$('navUserBtn').onclick = (e)=>{ e.stopPropagation(); $('userDrop').classList.toggle('open'); };
document.addEventListener('click', ()=>{ const d = $('userDrop'); if(d) d.classList.remove('open'); closeMenus(); });
$('ddProfile').onclick = ()=>gotoPage('profile');
$('ddSettings').onclick = ()=>gotoPage('settings');
$('ddLogout').onclick = ()=>$('logoutBtn').click();
$('searchInput').addEventListener('keydown', (e)=>{ if(e.key === 'Enter') gotoPage('medicines'); });

// ---------- avatars ----------
function refreshAvatars(){
  const p = getProfile();
  const show = !!(p && p.photo);
  document.querySelectorAll('.prof-photo-img').forEach(im=>{ if(show){ im.src = p.photo; im.hidden = false; } else { im.removeAttribute('src'); im.hidden = true; } });
  ['profInitial', 'profInitial2'].forEach(id=>{ const s = $(id); if(s) s.style.display = show ? 'none' : 'flex'; });
  const chip = $('userChip');
  if(chip){
    if(show){ chip.style.backgroundImage = 'url(' + p.photo + ')'; chip.style.backgroundSize = 'cover'; chip.textContent = ''; }
    else { chip.style.backgroundImage = ''; chip.textContent = currentUser ? currentUser.name.charAt(0).toUpperCase() : '🌿'; }
  }
}

// ---------- photo upload + crop ----------
let cropState = null;
function pickPhoto(){ $('photoInput').click(); }
$('photoChange').onclick = pickPhoto;
$('photoChange2').onclick = pickPhoto;
$('photoInput').addEventListener('change', (e)=>{
  const f = e.target.files[0];
  e.target.value = '';
  if(!f) return;
  const r = new FileReader();
  r.onload = ()=>openCrop(r.result);
  r.readAsDataURL(f);
});
function openCrop(src){
  cropState = { scale: 1, x: 0, y: 0 };
  const img = $('cropImg');
  img.onload = ()=>fitCrop();
  img.src = src;
  $('cropZoom').value = 1;
  $('cropModal').hidden = false;
}
function fitCrop(){
  const img = $('cropImg'), S = 260;
  cropState.iw = img.naturalWidth;
  cropState.ih = img.naturalHeight;
  cropState.base = Math.max(S / cropState.iw, S / cropState.ih);
  cropState.scale = 1; cropState.x = 0; cropState.y = 0;
  applyCrop();
}
function applyCrop(){
  const img = $('cropImg'), S = 260;
  const w = cropState.iw * cropState.base * cropState.scale;
  const h = cropState.ih * cropState.base * cropState.scale;
  img.style.width = w + 'px';
  img.style.height = h + 'px';
  const maxX = Math.max(0, (w - S) / 2), maxY = Math.max(0, (h - S) / 2);
  cropState.x = Math.min(maxX, Math.max(-maxX, cropState.x));
  cropState.y = Math.min(maxY, Math.max(-maxY, cropState.y));
  img.style.left = ((S - w) / 2 + cropState.x) + 'px';
  img.style.top = ((S - h) / 2 + cropState.y) + 'px';
}
const _stage = $('cropStage');
let _drag = false, _sx = 0, _sy = 0, _ox = 0, _oy = 0;
_stage.addEventListener('pointerdown', (e)=>{ if(!cropState) return; _drag = true; _sx = e.clientX; _sy = e.clientY; _ox = cropState.x; _oy = cropState.y; try{ _stage.setPointerCapture(e.pointerId); }catch(_){} });
_stage.addEventListener('pointermove', (e)=>{ if(!_drag || !cropState) return; cropState.x = _ox + (e.clientX - _sx); cropState.y = _oy + (e.clientY - _sy); applyCrop(); });
_stage.addEventListener('pointerup', ()=>{ _drag = false; });
$('cropZoom').addEventListener('input', (e)=>{ if(!cropState) return; cropState.scale = parseFloat(e.target.value); applyCrop(); });
$('cropSave').onclick = ()=>{
  if(!cropState) return;
  const img = $('cropImg'), st = $('cropStage');
  const ir = img.getBoundingClientRect(), sr = st.getBoundingClientRect();
  const cx = sr.left + sr.width / 2, cy = sr.top + sr.height / 2, R = 100;
  const k = img.naturalWidth / ir.width;
  const sx = Math.max(0, (cx - R - ir.left) * k), sy = Math.max(0, (cy - R - ir.top) * k);
  const ss = Math.min(R * 2 * k, img.naturalWidth - sx, img.naturalHeight - sy);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d').drawImage(img, sx, sy, ss, ss, 0, 0, 256, 256);
  const p = getProfile();
  p.photo = c.toDataURL('image/jpeg', 0.85);
  saveProfile(p);
  refreshAvatars();
  $('cropModal').hidden = true;
  cropState = null;
  toast('Profile photo updated ✔');
  logAct('📷', 'Updated profile photo', 'info');
};
$('cropCancel').onclick = ()=>{ $('cropModal').hidden = true; cropState = null; };
$('photoRemove').onclick = ()=>{
  const p = getProfile();
  p.photo = '';
  saveProfile(p);
  refreshAvatars();
  $('cropModal').hidden = true;
  cropState = null;
  toast('Photo removed');
};

// ---------- profile editor ----------
function authMsg2(id, text, type){ const m = $(id); if(!m) return; m.textContent = text; m.className = 'auth-msg' + (type ? ' ' + type : ''); }
function fillProfileForm(){
  const p = getProfile();
  $('pfName').value = p.name || '';
  $('pfEmail').value = p.email || '';
  $('pfPhone').value = p.phone || '';
  $('pfDob').value = p.dob || '';
  $('pfGender').value = p.gender || '';
  $('pfBlood').value = p.blood || '';
  $('pfAddr').value = p.addr || '';
  $('pfEmerg').value = p.emerg || '';
  $('pfLoc').value = p.loc || '';
  $('pfAllerg').value = p.allerg || '';
  $('pfCond').value = p.cond || '';
  setText('pfHeadName', p.name || '–');
  setText('pfHeadSub', [p.email, p.phone].filter(Boolean).join(' · ') || '–');
  authMsg2('pfMsg', '');
}
$('pfSave').onclick = ()=>{
  const name = $('pfName').value.trim(), phone = $('pfPhone').value.trim();
  if(!name) return authMsg2('pfMsg', 'Full name is required.', 'err');
  if(!phone) return authMsg2('pfMsg', 'Phone number is required.', 'err');
  const p = getProfile();
  Object.assign(p, { name, phone, dob: $('pfDob').value, gender: $('pfGender').value, blood: $('pfBlood').value, addr: $('pfAddr').value.trim(), emerg: $('pfEmerg').value.trim(), loc: $('pfLoc').value.trim(), allerg: $('pfAllerg').value.trim(), cond: $('pfCond').value.trim() });
  saveProfile(p);
  refreshAvatars();
  fillProfileForm();
  updateDashboard();
  const nun = $('navUserName');
  if(nun) nun.textContent = name;
  setText('helloName', name);
  authMsg2('pfMsg', 'Profile saved ✔', 'ok');
  toast('Profile saved ✔');
  logAct('👤', 'Updated profile', 'info');
};
$('pfCancel').onclick = ()=>{ fillProfileForm(); toast('Changes discarded'); };
$('cpForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const u = getUsers().find(x=>x.email === currentUser.email);
  if(!u || u.pass !== hash($('cpOld').value)) return authMsg2('cpMsg', 'Current password is incorrect.', 'err');
  if($('cpNew').value.length < 4) return authMsg2('cpMsg', 'New password must be at least 4 characters.', 'err');
  save(LS_USERS, getUsers().map(x=>x.email === currentUser.email ? Object.assign({}, x, { pass: hash($('cpNew').value) }) : x));
  e.target.reset();
  authMsg2('cpMsg', 'Password changed ✔', 'ok');
  toast('Password changed ✔');
  logAct('🔐', 'Changed password', 'system');
});

// ---------- preferences ----------
function getPrefs(){
  return Object.assign({ reminders: true, sound: true, email: true, theme: 'dark', lang: 'English', twofa: false, private: false, analytics: false }, currentUser ? load(userKey(LS_PREFS_BASE), {}) : {});
}
function savePrefs(p){ if(currentUser) save(userKey(LS_PREFS_BASE), p); }
function applyTheme(){ document.body.classList.toggle('light', getPrefs().theme === 'light'); }
document.addEventListener('change', (e)=>{
  const t = e.target;
  if(!t || !t.matches || !t.matches('[data-pref]') || !currentUser) return;
  const p = getPrefs(), k = t.dataset.pref;
  if(k === 'theme') p.theme = t.checked ? 'light' : 'dark';
  else p[k] = t.type === 'checkbox' ? t.checked : t.value;
  savePrefs(p);
  if(k === 'theme'){ applyTheme(); refreshThemeIcon(); }
  syncPrefInputs();
  toast('Preference saved ✔');
});
function syncPrefInputs(){
  if(!currentUser) return;
  const p = getPrefs();
  document.querySelectorAll('[data-pref]').forEach(el=>{
    const k = el.dataset.pref;
    if(k === 'theme') el.checked = (p.theme === 'light');
    else if(el.type === 'checkbox') el.checked = !!p[k];
    else el.value = (p[k] !== undefined ? p[k] : el.value);
  });
}

// ---------- orders / prescriptions / records ----------
function seedOrders(){
  const k = userKey(LS_ORDERS);
  if(!localStorage.getItem(k)){
    save(k, [
      { id: 'OD-1024', item: 'Ashwagandha Capsules', meta: '60 capsules · Qty 1', price: '₹599', status: 'Shipped' },
      { id: 'OD-1025', item: 'Neem Tulsi Face Wash', meta: '150 ml · Qty 1', price: '₹349', status: 'Out for delivery' }
    ]);
  }
}
function renderOrders(){
  seedOrders();
  const list = $('orderList');
  if(!list || !currentUser) return;
  const orders = load(userKey(LS_ORDERS), []);
  list.innerHTML = orders.length ? '' : '<div class="muted small">No orders yet.</div>';
  orders.forEach(o=>{
    const el = document.createElement('div');
    el.className = 'order-card';
    el.innerHTML = '<span class="o-ic">📦</span><div><b></b><span class="o-meta"></span><br><span class="o-id muted small"></span></div><span class="status"></span> <button class="btn small secondary">Reorder</button>';
    el.querySelector('b').textContent = o.item;
    el.querySelector('.o-meta').textContent = o.meta + ' · ' + o.price;
    el.querySelector('.o-id').textContent = o.id;
    const st = el.querySelector('.status');
    st.textContent = o.status;
    if(/out|transit/i.test(o.status)) st.classList.add('out');
    el.querySelector('button').onclick = ()=>{ logAct('🛒', 'Reordered ' + o.item, 'order'); toast('Added to cart: ' + o.item + ' 🛒'); };
    list.appendChild(el);
  });
}
$('rxFile').addEventListener('change', (e)=>{
  const f = e.target.files[0];
  e.target.value = '';
  if(!f || !currentUser) return;
  const k = userKey(LS_RX);
  const arr = load(k, []);
  arr.unshift({ name: f.name, date: new Date().toLocaleDateString() });
  save(k, arr);
  renderRx();
  toast('Prescription uploaded ✔');
  logAct('📄', 'Uploaded ' + f.name, 'info');
});
function renderRx(){
  const list = $('rxList');
  if(!list || !currentUser) return;
  const arr = load(userKey(LS_RX), []);
  list.innerHTML = arr.length ? '' : '<div class="muted small">No prescriptions yet — upload one above.</div>';
  arr.forEach((r, i)=>{
    const el = document.createElement('div');
    el.className = 'rx-item';
    el.innerHTML = '<span class="o-ic rx-ic">📄</span><div><b></b><span></span></div><button class="btn small danger">Remove</button>';
    el.querySelector('b').textContent = r.name;
    el.querySelector('div span').textContent = r.date;
    el.querySelector('button').onclick = ()=>{ const a = load(userKey(LS_RX), []); a.splice(i, 1); save(userKey(LS_RX), a); renderRx(); };
    list.appendChild(el);
  });
}
function renderRecords(){
  const g = $('recGrid');
  if(!g || !currentUser) return;
  const p = getProfile();
  const days = last7();
  const avg = Math.round(days.reduce((a, d)=>a + d.pct, 0) / 7);
  const rows = [['🩸 Blood Group', p.blood || '–'], ['🤧 Allergies', p.allerg || 'None noted'], ['🩺 Conditions', p.cond || 'None noted'], ['🚨 Emergency', p.emerg || '–'], ['💊 Medicines', String(meds.length)], ['📈 Adherence', avg + '%']];
  g.innerHTML = rows.map(r=>'<div class="rec-card"><span>' + r[0] + '</span><b>' + escapeHtml(r[1]) + '</b></div>').join('');
}

// ---------- dashboard widgets + chart ----------
function dayKeyOff(off){ const d = new Date(); d.setDate(d.getDate() - off); return todayStr(d); }
function last7(){
  const sched = todaysDoses().length;
  const log = takenLog();
  const out = [];
  for(let i = 6; i >= 0; i--){
    const dk = dayKeyOff(i);
    const tk = log[dk] ? Object.keys(log[dk]).length : 0;
    out.push({ label: new Date(Date.now() - i * 864e5).toLocaleDateString(undefined, { weekday: 'narrow' }), pct: sched ? Math.min(100, Math.round(tk / sched * 100)) : 0 });
  }
  return out;
}
function nextDose(){
  const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
  const up = todaysDoses().filter(d=>{ const parts = d.time.split(':').map(Number); return (parts[0] * 60 + parts[1]) > cur && !isTaken(d.key); });
  if(up.length) return up[0];
  return todaysDoses().filter(d=>!isTaken(d.key))[0] || null;
}
function updateDashboard(){
  if(!currentUser) return;
  const p = getProfile();
  const age = p.dob ? String(new Date().getFullYear() - new Date(p.dob).getFullYear()) : '';
  setChip('wAge', age ? ('🎂 ' + age + ' yrs') : '');
  setChip('wGender', p.gender || '');
  setChip('wBlood', p.blood ? ('🩸 ' + p.blood) : '');
  setChip('wLoc', p.loc ? ('📍 ' + p.loc) : '');
  const _wc = [p.email, p.phone].filter(Boolean).join(' · ');
  setChip('wContact', _wc);
  const h = new Date().getHours();
  setText('dayPart', h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening');
  setText('statMeds', String(meds.length));
  const nx = nextDose();
  setText('statNext', nx ? (nx.med.name.split(' ').slice(0, 2).join(' ') + ' — ' + fmt12(nx.time)) : 'All done 🎉');
  seedOrders();
  setText('statOrders', String(load(userKey(LS_ORDERS), []).length));
  const nm = new Date(), nmMin = nm.getHours() * 60 + nm.getMinutes();
  const due = todaysDoses().filter(d=>{ const parts = d.time.split(':').map(Number); return (parts[0] * 60 + parts[1]) <= nmMin && !isTaken(d.key); }).length;
  const dot = $('notifDot');
  if(dot) dot.hidden = due === 0;
  const fd = $('aiFabDot');
  if(fd) fd.hidden = due === 0;
  renderActivity();
  checkLowStock();
}
function animateChart(){ drawChart(0); }
function drawChart(prog){
  const cv = $('adhChart');
  if(!cv || !currentUser || cv.offsetParent === null) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 320, H = 190;
  cv.width = W * dpr;
  cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const data = last7();
  const pad = { l: 30, r: 12, t: 12, b: 22 };
  const X = i=>pad.l + i * (W - pad.l - pad.r) / 6;
  const Y = v=>pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  ctx.font = '10px Plus Jakarta Sans, sans-serif';
  [0, 25, 50, 75, 100].forEach(v=>{
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke();
    ctx.fillStyle = '#7d968a';
    ctx.fillText(v + '%', 4, Y(v) + 3);
  });
  data.forEach((d, i)=>{ ctx.fillStyle = '#7d968a'; ctx.fillText(d.label, X(i) - 4, H - 7); });
  const upto = prog * 6;
  const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
  grad.addColorStop(0, 'rgba(74,222,128,.45)');
  grad.addColorStop(1, 'rgba(74,222,128,0)');
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, pad.l + upto * (W - pad.l - pad.r) / 6, H);
  ctx.clip();
  ctx.beginPath();
  data.forEach((d, i)=>{ if(i === 0) ctx.moveTo(X(i), Y(d.pct)); else ctx.lineTo(X(i), Y(d.pct)); });
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(74,222,128,.8)';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineTo(X(6), H - pad.b);
  ctx.lineTo(X(0), H - pad.b);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
  data.forEach((d, i)=>{
    if(i > upto) return;
    ctx.beginPath();
    ctx.arc(X(i), Y(d.pct), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0a1f14';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#4ade80';
    ctx.stroke();
  });
  if(prog < 1) requestAnimationFrame(()=>drawChart(Math.min(1, prog + 0.045)));
}

// ---------- data export + delete ----------
function downloadData(){
  if(!currentUser) return;
  const dump = { profile: getProfile(), prefs: getPrefs(), meds: load(userKey(LS_MEDS_BASE), []), taken: load(userKey(LS_TAKEN_BASE), {}), orders: load(userKey(LS_ORDERS), []), rx: load(userKey(LS_RX), []), activity: load(userKey(LS_ACT), []), exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mediora-data.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  toast('Data downloaded ⬇');
  logAct('⬇', 'Downloaded personal data', 'info');
}
$('dlData').onclick = downloadData;
$('dlData2').onclick = downloadData;
function deleteAccount(){
  if(!currentUser) return;
  if(!confirm('Delete your account and ALL data on this device?')) return;
  if(!confirm('Last chance — this cannot be undone. Delete?')) return;
  const suf = '.' + currentUser.email.toLowerCase();
  [LS_MEDS_BASE, LS_TAKEN_BASE, LS_USER_BASE, LS_NOTIFIED_BASE, LS_PROFILE, LS_PREFS_BASE, LS_ACT, LS_ORDERS, LS_RX, LS_LOGINS].forEach(b=>localStorage.removeItem(b + suf));
  localStorage.removeItem(userKey(LS_MEDS_BASE) + '.seeded');
  save(LS_USERS, getUsers().filter(x=>x.email !== currentUser.email));
  setSession(null);
  location.reload();
}
$('delAccount').onclick = deleteAccount;
$('delAccount2').onclick = deleteAccount;

// ---------- appointments ----------
function renderAppts(){
  const list = $('apptList');
  if(!list || !currentUser) return;
  const k = userKey(LS_APPT);
  const all = load(k, []);
  const today = todayStr();
  const upcoming = all.filter(a=>a.date >= today).sort((a, b)=>((a.date + (a.time || ''))).localeCompare(b.date + (b.time || '')));
  if(upcoming.length !== all.length) save(k, upcoming);
  const cd = $('apptCount');
  list.innerHTML = '';
  if(!upcoming.length){
    if(cd) cd.textContent = '–';
    list.innerHTML = '<div class="muted">Nothing coming up — add one below.</div>';
    return;
  }
  const f = upcoming[0];
  const diff = Math.round((new Date(f.date + 'T12:00:00') - new Date(today + 'T12:00:00')) / 864e5);
  const when = diff <= 0 ? 'Today' : diff === 1 ? 'Tomorrow' : 'In ' + diff + ' days';
  if(cd) cd.textContent = when;
  upcoming.slice(0, 6).forEach((ap, idx)=>{
    const el = document.createElement('div');
    el.className = 'appt-item' + (idx === 0 ? ' featured' : '');
    const ic = document.createElement('span');
    ic.className = 'o-ic';
    ic.textContent = idx === 0 ? '⭐' : '📅';
    const info = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = ap.doctor + (idx === 0 ? ' · ' + when : '');
    const s = document.createElement('span');
    s.textContent = new Date(ap.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + (ap.time ? ' at ' + fmt12(ap.time) : '');
    info.appendChild(b);
    info.appendChild(s);
    if(ap.purpose){
      const r = document.createElement('span');
      r.className = 'appt-reason';
      r.textContent = '📝 Reason: ' + ap.purpose;
      info.appendChild(r);
    }
    el.appendChild(ic);
    el.appendChild(info);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn small danger';
    del.textContent = 'Del';
    del.onclick = ()=>{
      save(userKey(LS_APPT), load(userKey(LS_APPT), []).filter(x=>x.id !== ap.id));
      renderAppts();
    };
    el.appendChild(del);
    list.appendChild(el);
  });
}
$('apToggle').onclick = ()=>{ $('apFormWrap').hidden = !$('apFormWrap').hidden; };
$('apSave').onclick = ()=>{
  if(!currentUser) return;
  const doctor = $('apName').value.trim(), date = $('apDate').value;
  if(!doctor) return toast('Please enter doctor / clinic name');
  if(!date) return toast('Please pick a date');
  if(date < todayStr()) return toast('Please pick today or a future date');
  const arr = load(userKey(LS_APPT), []);
  arr.push({ id: uid(), doctor, purpose: $('apFor').value.trim(), date, time: $('apTime').value, note: $('apNote').value.trim() });
  save(userKey(LS_APPT), arr);
  $('apName').value = $('apFor').value = $('apDate').value = $('apTime').value = $('apNote').value = '';
  $('apFormWrap').hidden = true;
  renderAppts();
  toast('Appointment saved 📅');
  logAct('📅', 'Booked appointment with ' + doctor, 'info');
};

// ---------- cabinet sectors ----------
const CAB_TITLES = { tablets: '💊 Tablets', capsules: '💊 Capsules', syrup: '🍼 Bottles & Syrups', other: '📦 Other Medicines' };
function medFormOf(m){ return m.form || 'tablets'; }
function openCabinet(sector){
  const list = $('cabList');
  if(!list || !currentUser) return;
  $('cabTitle').textContent = CAB_TITLES[sector] || CAB_TITLES.tablets;
  const items = meds.filter(m=>medFormOf(m) === sector);
  $('cabCount').textContent = items.length;
  list.innerHTML = '';
  if(!items.length) list.innerHTML = '<div class="muted">Nothing here yet — add a tablet with this form.</div>';
  items.forEach(m=>{
    const today = todaysDoses().filter(d=>d.med.id === m.id);
    const tk = today.filter(d=>isTaken(d.key)).length;
    const el = document.createElement('div');
    el.className = 'cab-row';
    el.innerHTML = '<span class="t-ic">💊</span><div><b></b><span></span></div>';
    el.querySelector('b').textContent = m.name;
    el.querySelector('div span').textContent = [m.dose, today.length ? ('Today ' + tk + '/' + today.length + ' taken') : 'Not scheduled today', stockText(m)].filter(Boolean).join(' · ');
    const eb = document.createElement('button');
    eb.type = 'button';
    eb.className = 'btn small secondary';
    eb.textContent = 'Edit';
    eb.onclick = ()=>{ $('cabModal').hidden = true; editMed(m.id); gotoPage('medicines'); };
    el.appendChild(eb);
    list.appendChild(el);
  });
  $('cabModal').hidden = false;
}
document.querySelectorAll('.shelf-item').forEach(s=>{
  const go = ()=>openCabinet(s.dataset.sector || 'tablets');
  s.onclick = go;
  s.onkeydown = (e)=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } };
});
$('cabClose').onclick = ()=>{ $('cabModal').hidden = true; };
$('cabModal').addEventListener('click', (e)=>{ if(e.target.id === 'cabModal') e.target.hidden = true; });

// ================= EMAIL VERIFICATION =================
// To send REAL emails: free signup at https://www.emailjs.com, then fill these.
// Template variables to use in EmailJS: {{to_name}} {{code}} {{app_name}} (recipient = To Email field).
const MEDIORA_EMAIL_CONFIG = { publicKey: '', serviceId: '', templateId: '' };
function sendWelcomeEmail(name, email, code){
  const c = (typeof MEDIORA_EMAIL_CONFIG !== 'undefined') ? MEDIORA_EMAIL_CONFIG : null;
  if(c && c.publicKey && c.serviceId && c.templateId && typeof emailjs !== 'undefined'){
    try{
      emailjs.init({ publicKey: c.publicKey });
      return emailjs.send(c.serviceId, c.templateId, { to_email: email, to_name: name, code: code, app_name: 'Mediora' }).then(()=>true).catch(()=>false);
    }catch(e){ return Promise.resolve(false); }
  }
  return Promise.resolve(false);
}
function pendingKey(email){ return 'mediremind.pending.' + email.toLowerCase(); }
function startVerification(email, name){
  const code = String(Math.floor(100000 + Math.random() * 900000));
  localStorage.setItem(pendingKey(email), JSON.stringify({ code, exp: Date.now() + 15 * 60 * 1000 }));
  const vm = $('verifyMail');
  if(vm) vm.textContent = 'We sent a 6-digit code to ' + email + '. Enter it below to verify it\u2019s you.';
  $('verifyCode').value = '';
  authMsg2('verifyMsg', '');
  $('verifyModal').hidden = false;
  sendWelcomeEmail(name, email, code).then(sent=>{
    if(sent) toast('📧 Thank-you email sent to ' + email);
    else toast('📧 Demo mode — email service not configured. Your code is ' + code, 7000);
  });
}
function refreshVerifyBanner(){
  const b = $('verifyBanner');
  if(!b || !currentUser) return;
  const u = getUsers().find(x=>x.email === currentUser.email);
  const v = !!(u && u.verified);
  b.hidden = v;
  ['wVerified', 'pfVerified'].forEach(id=>{ const e = $(id); if(e) e.hidden = !v; });
}
$('verifyGo').onclick = ()=>{
  const email = currentUser ? currentUser.email : '';
  const raw = localStorage.getItem(pendingKey(email));
  const p = raw ? JSON.parse(raw) : null;
  const val = $('verifyCode').value.trim();
  if(!p) return authMsg2('verifyMsg', 'No active code — tap Resend.', 'err');
  if(Date.now() > p.exp) return authMsg2('verifyMsg', 'Code expired — tap Resend.', 'err');
  if(val !== p.code) return authMsg2('verifyMsg', 'Wrong code — try again.', 'err');
  save(LS_USERS, getUsers().map(x=>x.email === email ? Object.assign({}, x, { verified: true }) : x));
  localStorage.removeItem(pendingKey(email));
  $('verifyModal').hidden = true;
  refreshVerifyBanner();
  authMsg2('verifyMsg', '');
  toast('✔ Email verified — welcome to Mediora!');
  logAct('✔', 'Verified email', 'system');
};
$('verifySkip').onclick = ()=>{ $('verifyModal').hidden = true; toast('You can verify later from Home ⚠️'); };
$('verifyResend').onclick = (e)=>{
  e.preventDefault();
  if(!currentUser) return;
  const u = getUsers().find(x=>x.email === currentUser.email) || {};
  startVerification(currentUser.email, u.name || currentUser.name);
};
$('verifyOpen').onclick = ()=>{
  if(!currentUser) return;
  const u = getUsers().find(x=>x.email === currentUser.email) || {};
  startVerification(currentUser.email, u.name || currentUser.name);
};

// ---------- boot: restore session ----------
(function boot(){
  const email = getSession();
  const u = email && getUsers().find(x=>x.email===email);
  if(u){ currentUser = { name: u.name, email: u.email }; showApp(); }
  else showAuth('signup');
})();

setInterval(checkDue, 10000);
checkDue();

// ---------- buttery cursor spotlight + click ripples ----------
document.addEventListener('pointermove', (e)=>{
  const el = e.target && e.target.closest ? e.target.closest('.card,.stat-card,.modal-card,.auth-wrap') : null;
  if(!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
  el.style.setProperty('--my', (e.clientY - r.top) + 'px');
}, { passive: true });
document.addEventListener('pointerdown', (e)=>{
  const el = e.target && e.target.closest ? e.target.closest('.btn,.chip,.tabbar button,.nav-item,.qa-grid button,.stat-card,.soc,.icon-btn,.shelf-item,.order-card') : null;
  if(!el || el.disabled) return;
  if(el.closest && el.closest('#authView')) return;
  const r = el.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 2.1;
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.width = s.style.height = d + 'px';
  s.style.left = (e.clientX - r.left - d / 2) + 'px';
  s.style.top = (e.clientY - r.top - d / 2) + 'px';
  el.appendChild(s);
  setTimeout(()=>s.remove(), 680);
});

// ---------- login section highlight (crisp-safe: no rotation, no filters) ----------
(function(){
  if(window.matchMedia('(hover: none)').matches) return;
  const view = $('authView');
  if(!view) return;
  view.addEventListener('pointermove', (e)=>{
    if(view.hidden) return;
    const sec = e.target && e.target.closest ? e.target.closest('.hero-left,.auth-wrap,.hero-right') : null;
    view.querySelectorAll('.cursor-in').forEach(x=>{ if(x !== sec) x.classList.remove('cursor-in'); });
    if(sec) sec.classList.add('cursor-in');
  });
  view.addEventListener('pointerleave', ()=>{ view.querySelectorAll('.cursor-in').forEach(x=>x.classList.remove('cursor-in')); });
})();
