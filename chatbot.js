// MediCare AI — integrated rule-based health assistant (no cloud, fully offline)
const AI_CATALOG = [
  { n: 'Ashwagandha Capsules', c: 'Stress relief', f: 'Capsules · 60', p: '₹599', a: 'In stock', m: 'Veda Wellness', rx: false },
  { n: 'Vitamin D3 60K', c: 'Supplements', f: 'Chewable · 8', p: '₹149', a: 'In stock', m: 'HealthPlus', rx: false },
  { n: 'Paracetamol 650', c: 'Fever / Pain relief', f: 'Tablets · 15', p: '₹45', a: 'In stock', m: 'GenPharma', rx: false },
  { n: 'Cetirizine 10mg', c: 'Allergy relief', f: 'Tablets · 10', p: '₹65', a: 'In stock', m: 'PureGen', rx: false },
  { n: 'Omeprazole 20mg', c: 'Acidity', f: 'Capsules · 15', p: '₹85', a: 'Low stock', m: 'MediCore', rx: false },
  { n: 'Amoxicillin 500mg', c: 'Antibiotic', f: 'Capsules · 10', p: '₹120', a: 'In stock', m: 'MediCore', rx: true },
  { n: 'Metformin 500mg', c: 'Diabetes care', f: 'Tablets · 20', p: '₹95', a: 'In stock', m: 'NovaLife', rx: true },
  { n: 'Triphala Churna', c: 'Digestive wellness', f: 'Powder · 100g', p: '₹299', a: 'In stock', m: 'Veda Wellness', rx: false }
];
const AI_TERMS = { bid: 'twice a day', tid: 'three times a day', qid: 'four times a day', qd: 'once a day', od: 'once daily', hs: 'at bedtime', ac: 'before meals', pc: 'after meals', sos: 'only when needed', prn: 'as needed', po: 'taken by mouth' };
const AI_FAQ = [
  { k: ['missed dose', 'miss dose', 'forgot'], t: '<b>Missed a dose?</b> Take it when you remember, unless it is almost time for the next one — never double up. If in doubt, ask your pharmacist. I can tighten your reminders so this happens less often. ⏰' },
  { k: ['store', 'storage', 'keep medicines', 'expiry', 'expire'], t: '<b>Storage tips:</b> cool, dry place away from sunlight; bathroom cabinets are actually too humid. Check expiry dates monthly and return expired strips to a pharmacy take-back. 🌡️' },
  { k: ['delivery', 'shipping', 'return', 'refund', 'pharmacy service'], t: '<b>Pharmacy services:</b> orders placed here ship in 24–48 hrs with free returns within 7 days. Track everything from the Orders page. 📦' },
  { k: ['routine', 'habit', 'remember', 'adherence'], t: '<b>Healthy routine:</b> link each dose to a daily habit (breakfast, brushing teeth), keep strips visible, and let me remind you — consistency beats perfection. 🌱' },
  { k: ['generic', 'brand'], t: '<b>Generic vs brand:</b> generics contain the same active ingredient in the same strength — the difference is usually just price and packaging. Your pharmacist can confirm equivalents. 💊' },
  { k: ['antibiotic', 'complete course'], t: '<b>Antibiotics:</b> always finish the full prescribed course, even if you feel better — stopping early breeds resistance. Never share antibiotics. 🛡️' }
];

let aiConvo = { id: 'c' + Date.now(), email: '', title: 'New chat', msgs: [] };
let aiPending = null;
const aiKey = ()=>'mediremind.ai.' + (currentUser ? currentUser.email : 'guest').toLowerCase();
function aiStore(){ try{ return JSON.parse(localStorage.getItem(aiKey())) || { convos: [] }; }catch(e){ return { convos: [] }; } }
function aiPersist(){
  if(!currentUser || !aiConvo.msgs.length) return;
  const s = aiStore();
  const i = s.convos.findIndex(c=>c.id === aiConvo.id);
  const snap = { id: aiConvo.id, title: aiConvo.title, t: Date.now(), msgs: aiConvo.msgs.slice(-60) };
  if(i >= 0) s.convos[i] = snap; else s.convos.unshift(snap);
  localStorage.setItem(aiKey(), JSON.stringify({ convos: s.convos.slice(0, 15) }));
}
function aiEnsure(){
  if(!currentUser) return false;
  if(aiConvo.email !== currentUser.email){
    aiConvo = { id: 'c' + Date.now(), email: currentUser.email, title: 'New chat', msgs: [] };
    renderAiMsgs();
  }
  return true;
}
function aiBoot(){ aiEnsure(); }
function aiReset(){
  aiConvo = { id: 'c' + Date.now(), email: '', title: 'New chat', msgs: [] };
  const m = $('aiMsgs');
  if(m) m.innerHTML = '';
  renderAiEmpty();
  const p = $('aiPanel');
  if(p) p.hidden = true;
}

// ---------- panel ----------
const AI_WELCOME = 'Hi! 👋 I\'m <b>MediCare AI</b>.<br>I can help you understand your medicines, manage reminders, find products, and navigate your account.<br><br>How can I help you today?';
$('aiFab').onclick = ()=>{ if(!aiEnsure()) return; const p = $('aiPanel'); p.hidden = false; p.classList.remove('min'); renderAiMsgs(); if(!aiConvo.msgs.length) pushAi('ai', AI_WELCOME); setTimeout(()=>$('aiText').focus(), 150); };
$('aiClose').onclick = ()=>{ $('aiPanel').hidden = true; };
$('aiMin').onclick = ()=>{ $('aiPanel').classList.toggle('min'); };
$('aiHist').onclick = ()=>{ renderAiHist(); $('aiHistView').hidden = !$('aiHistView').hidden; };
$('aiNew').onclick = ()=>{ aiPersist(); aiConvo = { id: 'c' + Date.now(), email: currentUser.email, title: 'New chat', msgs: [] }; $('aiHistView').hidden = true; renderAiMsgs(); pushAi('ai', AI_WELCOME); };
function renderAiEmpty(){
  const m = $('aiMsgs');
  if(!m || aiConvo.msgs.length) return;
  m.innerHTML = '<div class="ai-empty"><div class="big">🤖</div><b>How can I help with your healthcare today?</b><span>Try a quick action below, or just ask.</span></div>';
}
function fmtAi(s){
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
}
function pushAi(role, html){
  aiConvo.msgs.push({ role, html });
  if(!aiConvo.title || aiConvo.title === 'New chat'){
    const first = aiConvo.msgs.find(x=>x.role === 'user');
    if(first) aiConvo.title = first.html.slice(0, 42);
  }
  const empty = document.querySelector('#aiMsgs .ai-empty');
  if(empty) empty.remove();
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  d.innerHTML = html;
  $('aiMsgs').appendChild(d);
  d.scrollIntoView({ behavior: 'smooth', block: 'end' });
  aiPersist();
}
function renderAiMsgs(){
  const m = $('aiMsgs');
  if(!m) return;
  m.innerHTML = '';
  aiConvo.msgs.forEach(x=>{
    const d = document.createElement('div');
    d.className = 'msg ' + x.role;
    d.innerHTML = x.role === 'user' ? escapeHtml(x.html) : x.html;
    m.appendChild(d);
  });
  renderAiEmpty();
  m.scrollTop = m.scrollHeight;
}
function showTyping(on){ $('aiTyping').hidden = !on; if(on) $('aiTyping').scrollIntoView({ behavior: 'smooth', block: 'end' }); }
function aiSend(text){
  text = (text || '').trim();
  if(!text || !currentUser) return;
  $('aiHistView').hidden = true;
  pushAi('user', text);
  $('aiText').value = '';
  showTyping(true);
  setTimeout(()=>{ showTyping(false); pushAi('ai', aiReply(text)); }, 750 + Math.random() * 550);
}
$('aiSend').onclick = ()=>aiSend($('aiText').value);
$('aiText').addEventListener('keydown', e=>{ if(e.key === 'Enter') aiSend(e.target.value); });
document.querySelectorAll('#aiQuick button').forEach(b=>{ b.onclick = ()=>aiSend(b.dataset.q); });

// ---------- voice + attachments ----------
const _SR = window.SpeechRecognition || window.webkitSpeechRecognition;
$('aiMic').onclick = ()=>{
  if(!_SR){ toast('Voice input is not supported in this browser 🎤'); return; }
  try{
    const r = new _SR();
    r.lang = 'en-US';
    r.onresult = e=>{ $('aiText').value = e.results[0][0].transcript; $('aiText').focus(); };
    r.start();
    toast('Listening… 🎤');
  }catch(e){ toast('Could not start voice input 🎤'); }
};
$('aiAttach').onclick = ()=>$('aiFile').click();
$('aiFile').addEventListener('change', e=>{
  const f = e.target.files[0];
  e.target.value = '';
  if(!f) return;
  const isImg = f.type.indexOf('image/') === 0;
  const savable = isImg || /pdf|msword|officedocument/i.test(f.type || '') || /\.(pdf|doc|docx)$/i.test(f.name);
  const card = '<b>📎 ' + escapeHtml(f.name) + '</b><div class="ai-card"><div class="row"><span>Type</span><b>' + (isImg ? 'Image' : 'Document') + '</b></div><div class="row"><span>Size</span><b>' + Math.max(1, Math.round(f.size / 1024)) + ' KB</b></div>' + (savable ? '<button class="btn small secondary" data-ai-act="save-rx" data-name="' + escapeHtml(f.name) + '">Save to Prescriptions</button>' : '<div class="row"><span>Note</span><b>Only the file name is remembered</b></div>') + '</div>';
  pushAi('user', 'Attached: ' + f.name);
  setTimeout(()=>pushAi('ai', 'Got it — I have noted <b>' + escapeHtml(f.name) + '</b>.' + (savable ? ' You can file it under Prescriptions any time.' : '') + card), 600);
});

// ---------- card actions ----------
$('aiMsgs').addEventListener('click', e=>{
  const b = e.target.closest('[data-ai-act]');
  if(!b) return;
  const act = b.dataset.aiAct;
  if(act === 'confirm-reminder') aiConfirmReminder(b.dataset);
  else if(act === 'save-rx') aiSaveRx(b.dataset.name);
  else if(act === 'view-med') aiViewMed(parseInt(b.dataset.i, 10));
  else if(act === 'add-cart') aiAddCart(parseInt(b.dataset.i, 10));
  else if(act === 'confirm-profile') aiConfirmProfile(b.dataset);
  else if(act === 'delete-med') aiDeleteMed(b.dataset.id);
  else if(act === 'ask') aiSend(b.dataset.q);
});
function aiDeleteMed(id){
  const m = meds.find(x=>x.id === id);
  if(!m) return;
  meds = meds.filter(x=>x.id !== id);
  saveMeds();
  render();
  toast('Reminder deleted 🗑');
  logAct('🗑', 'Deleted reminder via MediCare AI', 'reminder');
  pushAi('ai', 'Removed ✔ — <b>' + escapeHtml(m.name) + '</b> will no longer remind you.');
}
function confirmReminderCard(name, time){
  return 'Please confirm your reminder ⏰<div class="ai-card"><div class="row"><span>Medicine</span><b>' + escapeHtml(name) + '</b></div><div class="row"><span>Dosage</span><b>As prescribed</b></div><div class="row"><span>Time</span><b>' + fmt12(time) + '</b></div><div class="row"><span>Repeat</span><b>Daily</b></div><button class="btn small glossy" data-ai-act="confirm-reminder" data-med="' + escapeHtml(name) + '" data-time="' + time + '">Confirm Reminder</button></div>';
}
function aiConfirmReminder(d){
  const name = d.med, time = d.time;
  let m = meds.find(x=>x.name.toLowerCase() === name.toLowerCase());
  if(m){ if(!m.times.includes(time)) m.times.push(time); m.times.sort(); }
  else meds.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: Date.now(), name, dose: '1 dose', note: 'via MediCare AI', times: [time] });
  saveMeds();
  render();
  toast('Reminder set for ' + name + ' at ' + fmt12(time) + ' ✔');
  logAct('🤖', 'MediCare AI set a reminder', 'reminder');
  pushAi('ai', 'Done ✔ — <b>' + escapeHtml(name) + '</b> will remind you at <b>' + fmt12(time) + '</b>, daily. You will see it under Reminders with sound + notification.');
}
function aiSaveRx(name){
  const k = userKey(LS_RX);
  const arr = load(k, []);
  arr.unshift({ name: name || 'prescription', date: new Date().toLocaleDateString() });
  save(k, arr);
  toast('Saved to Prescriptions ✔');
  logAct('📄', 'Saved prescription via MediCare AI', 'info');
  pushAi('ai', 'Filed under <b>Prescriptions</b> ✔ — open it from the ☰ menu any time.');
}
function aiViewMed(i){
  const c = AI_CATALOG[i];
  if(!c) return;
  aiSend('Tell me about ' + c.n);
}
function aiAddCart(i){
  const c = AI_CATALOG[i];
  if(!c) return;
  const k = userKey(LS_ORDERS);
  const arr = load(k, []);
  arr.unshift({ id: 'OD-' + (1040 + (Date.now() % 9000)), item: c.n, meta: c.f + ' · Qty 1', price: c.p, status: 'In cart' });
  save(k, arr);
  toast('Added to cart: ' + c.n + ' 🛒');
  logAct('🛒', 'Added ' + c.n + ' to cart', 'order');
  pushAi('ai', '<b>' + escapeHtml(c.n) + '</b> is in your cart 🛒 — review it on the Orders page.' + aiBtn('View Orders', 'ask', 'Show my recent orders'));
}
function aiConfirmProfile(d){
  const p = getProfile();
  if(d.field === 'phone') p.phone = d.value;
  if(d.field === 'address') p.addr = d.value;
  saveProfile(p);
  updateDashboard();
  const nun = $('navUserName');
  if(nun) nun.textContent = p.name || nun.textContent;
  toast('Profile updated ✔');
  logAct('👤', 'Updated profile via MediCare AI', 'info');
  pushAi('ai', 'Saved ✔ — your ' + (d.field === 'phone' ? 'phone number' : 'address') + ' is now <b>' + escapeHtml(d.value) + '</b>.');
}
function aiBtn(label, act, q){
  return '<button class="btn small secondary" data-ai-act="' + act + '" data-q="' + escapeHtml(q) + '">' + label + '</button>';
}

// ---------- brain ----------
function findUserMed(t){
  t = t.toLowerCase();
  return meds.find(m=>t.indexOf(m.name.toLowerCase()) !== -1 || m.name.toLowerCase().indexOf(t) !== -1 && t.length > 3);
}
function findCatalog(t){
  t = t.toLowerCase();
  return AI_CATALOG.find(c=>t.indexOf(c.n.toLowerCase()) !== -1);
}
function parseTime(t){
  let m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if(m){
    let h = parseInt(m[1], 10) % 12;
    if(m[3].toLowerCase() === 'pm') h += 12;
    return String(h).padStart(2, '0') + ':' + (m[2] || '00');
  }
  m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if(m) return m[1].padStart(2, '0') + ':' + m[2];
  if(/morning/.test(t)) return '08:00';
  if(/afternoon/.test(t)) return '13:00';
  if(/evening/.test(t)) return '18:00';
  if(/night|bed/.test(t)) return '21:00';
  return null;
}
function medNameFrom(t){
  let s = t.replace(/please|remind me to take|remind me|set (a )?reminder( for)?|to take|take my medicine|take my|take|my medicine|medicine|tablet|pill|for me|at .*$/gi, ' ').replace(/\s+/g, ' ').trim();
  const known = findUserMed(t) || findCatalog(t);
  if(known) return known.n || known.name;
  return s.split(' ').slice(0, 4).join(' ');
}
function orderTracker(o){
  const steps = ['Confirmed', 'Packed', 'Out for Delivery', 'Delivered'];
  let at = 1;
  if(/pack/i.test(o.status)) at = 2;
  if(/ship/i.test(o.status)) at = 2;
  if(/out|transit/i.test(o.status)) at = 3;
  if(/deliver/i.test(o.status) && !/out/i.test(o.status)) at = 4;
  if(/cart/i.test(o.status)) at = 1;
  return '<div class="track">' + steps.map((s, i)=>{
    const cls = i + 1 < at ? 'done' : (i + 1 === at ? 'now' : '');
    const ic = i + 1 < at ? '✓' : (i + 1 === at ? '→' : '○');
    return '<div class="' + cls + '"><span>' + ic + '</span><span>' + s + '</span></div>';
  }).join('') + '</div>';
}
function prodCard(c, i){
  return '<div class="ai-card"><div class="row"><span>Medicine</span><b>' + escapeHtml(c.n) + '</b></div>' +
    '<div class="row"><span>Category</span><b>' + escapeHtml(c.c) + '</b></div>' +
    '<div class="row"><span>Form</span><b>' + escapeHtml(c.f) + '</b></div>' +
    '<div class="row"><span>Price</span><b>' + escapeHtml(c.p) + '</b></div>' +
    '<div class="row"><span>Availability</span><b>' + escapeHtml(c.a) + '</b></div>' +
    '<div class="row"><span>Made by</span><b>' + escapeHtml(c.m) + '</b></div>' +
    (c.rx ? '<div class="row"><span>Note</span><b class="warn">Prescription required</b></div>' : '') +
    '<button class="btn small secondary" data-ai-act="view-med" data-i="' + i + '">View Medicine</button>' +
    '<button class="btn small glossy" data-ai-act="add-cart" data-i="' + i + '">Add to Cart</button></div>';
}
const AI_DISC = '<br><span class="warn">ℹ️ General information only — always follow your prescription and pharmacist.</span>';

function aiReply(raw){
  const t = ' ' + raw.toLowerCase().trim() + ' ';
  const has = (...ws)=>ws.some(w=>t.indexOf(w) !== -1);

  // 0. emergencies first
  if(has('chest pain', 'can\'t breathe', 'cant breathe', 'difficulty breathing', 'heavy bleeding', 'unconscious', 'suicide', 'kill myself', 'overdose', 'poison', 'stroke', 'heart attack', 'emergency', 'ambulance', 'severe allergic', 'anaphylaxis')){
    return '<b>🚨 Please treat this as urgent.</b><br>I cannot handle emergencies — call your local emergency number or go to the nearest hospital right now. If someone is with you, ask them to stay until help arrives.';
  }
  // 1. diagnosis / dosage safety rails
  if(has('do i have', 'diagnose', 'diagnosis', 'what disease', 'why do i have fever', 'symptoms of', 'is it cancer', 'is it covid', 'do i need antibiotics')){
    return 'I understand the worry 💚 — but I <b>cannot diagnose conditions</b> or interpret symptoms. Please see a doctor or pharmacist promptly, especially with fever, pain or anything worsening. I can help you track medicines and reminders meanwhile.';
  }
  if(has('increase', 'decrease', 'change my dose', 'change the dose', 'stop taking', 'stop my medicine', 'skip my medicine', 'double dose', 'take extra')){
    return 'Please <b>do not change or stop any prescribed dose</b> on my advice — I am not your prescriber. Small changes can be risky. Talk to your doctor or pharmacist first; I can note down their instructions for you afterwards. 🤝' + AI_DISC;
  }
  if(has('mix', 'combine', 'interaction', 'take with alcohol', 'with alcohol')){
    return 'Mixing medicines (or alcohol) can be dangerous and depends on your exact prescriptions. I cannot clear combinations — please check with your <b>pharmacist with your full medicine list</b>. I can list your current medicines for that visit — just say “my medicines”.' + AI_DISC;
  }
  // pending multi-turn reminder flow (safety rails above always win)
  if(aiPending){
    const qTime = /\d|morning|afternoon|evening|night|noon/i.test(raw);
    const kn = findUserMed(raw) || findCatalog(raw);
    if((aiPending.time && kn) || (!aiPending.time && qTime)){
      const t2 = aiPending.time || parseTime(t);
      let n = aiPending.name;
      if(!n) n = kn ? (kn.n || kn.name) : medNameFrom(raw);
      aiPending = null;
      if(t2 && n) return confirmReminderCard(n, t2);
    } else aiPending = null;
  }
  // 2. reminders
  if(has('remind me', 'set reminder', 'set a reminder', 'add reminder', 'reminder for')){
    const time = parseTime(t);
    const name = medNameFrom(raw);
    if(!time){ aiPending = { name: name || null }; return 'Of course ⏰ — <b>at what time</b> should I remind you' + (name ? ' to take <b>' + escapeHtml(name) + '</b>' : '') + '? (e.g. “8 PM” or “20:30”)'; }
    if(!name){ aiPending = { time }; return 'Sure ⏰ — <b>which medicine</b> should I remind you about at <b>' + fmt12(time) + '</b>?'; }
    return confirmReminderCard(name, time);
  }
  // 2b. delete a reminder
  if(has('delete reminder', 'remove reminder', 'cancel reminder', 'stop reminder', 'delete my tablet', 'remove my tablet')){
    const m = findUserMed(raw);
    if(!m) return 'Which reminder should I remove? Tell me the tablet name — e.g. “delete reminder for Vitamin D3”.';
    return 'Please confirm 🗑<div class="ai-card"><div class="row"><span>Remove</span><b>' + escapeHtml(m.name) + '</b></div><div class="row"><span>Times</span><b>' + m.times.map(fmt12).join(', ') + '</b></div><button class="btn small danger" data-ai-act="delete-med" data-id="' + m.id + '">Delete Reminder</button></div>';
  }
  // 3. prescriptions
  if(has('prescription', 'prescribe', 'my rx', 'explain bid', 'explain tid', 'what does bid', 'what does od mean', 'bd ', ' tds ', ' qd ', ' hs ', ' sos ', ' prn ')){
    const hit = Object.keys(AI_TERMS).find(k=>t.indexOf(' ' + k + ' ') !== -1 || t.indexOf('explain ' + k) !== -1);
    if(hit) return '<b>“' + hit.toUpperCase() + '”</b> on a prescription means <b>' + AI_TERMS[hit] + '</b>. Short codes save doctors time — your pharmacist will confirm the exact schedule. Anything else on the slip confusing you? 📄';
    const arr = load(userKey(LS_RX), []);
    if(!arr.length) return 'You have no saved prescriptions yet 📄 — upload one from the <b>Prescriptions</b> page (☰ menu) and I will help explain it in simple words. I never modify prescriptions, only explain them.';
    return 'Here are your saved prescriptions 📄' + arr.slice(0, 5).map(r=>'<div class="ai-card"><div class="row"><span>File</span><b>' + escapeHtml(r.name) + '</b></div><div class="row"><span>Added</span><b>' + escapeHtml(r.date) + '</b></div></div>').join('') + 'Ask me about any term on them — e.g. “what does BD mean?”';
  }
  // 4. orders
  if(has('order', 'track', 'delivery', 'package', 'where is', 'shipped')){
    const arr = load(userKey(LS_ORDERS), []);
    if(!arr.length) return 'No orders yet 📦 — tell me what you need (e.g. “find Vitamin D3”) and I will help you order it.';
    const o = arr[0];
    return 'Your most recent order 📦<div class="ai-card"><div class="row"><span>Order</span><b>' + escapeHtml(o.id) + '</b></div><div class="row"><span>Item</span><b>' + escapeHtml(o.item) + '</b></div><div class="row"><span>Status</span><b>' + escapeHtml(o.status) + '</b></div>' + orderTracker(o) + '</div>' + (arr.length > 1 ? 'Plus ' + (arr.length - 1) + ' more on the Orders page.' : '');
  }
  // 5. search / catalog
  if(has('search', 'find', 'buy', 'price', 'cost', 'add to cart', 'view medicine', 'catalog', 'shop', 'order medicine')){
    const words = raw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w=>w.length > 1 && ['find', 'finds', 'search', 'medicine', 'medicines', 'with', 'tell', 'about', 'show', 'price', 'cost', 'order', 'take', 'tablet', 'tablets', 'look', 'looking', 'need', 'want', 'please', 'that', 'this', 'what', 'which', 'your', 'from', 'does', 'take'].indexOf(w) === -1);
    const hits = AI_CATALOG.map((c, i)=>({ c, i })).filter(x=>words.some(w=>x.c.n.toLowerCase().indexOf(w) !== -1 || x.c.c.toLowerCase().indexOf(w) !== -1)).slice(0, 3);
    if(!hits.length) return 'What shall I look up? 🔍 Try “Vitamin D3”, “allergy”, “acidity” or “antibiotic”.';
    return 'Here is what I found 🔍' + hits.map(x=>prodCard(x.c, x.i)).join('');
  }
  const catHit = AI_CATALOG.findIndex(c=>t.indexOf(c.n.toLowerCase()) !== -1);
  if(catHit >= 0){
    const c = AI_CATALOG[catHit];
    if(has('side effects', 'side effect', 'used for', 'what is', 'what are', 'with food', 'when should', 'when to take', 'how to take', 'how do i take', 'dosage', 'is it safe', 'tell me about')){
      return '<b>' + escapeHtml(c.n) + '</b> (' + escapeHtml(c.c + ' · ' + c.f) + '): typically used as labelled; take at the same time daily' + (c.rx ? ', strictly as prescribed' : ', with water, with or after food unless your pack says otherwise') + '. Common mild effects vary by person — persistent or severe symptoms deserve a pharmacist or doctor, not patience.' + AI_DISC;
    }
    return prodCard(c, catHit);
  }
  // 6. profile (updates checked BEFORE the summary so they are never hijacked)
  let mPh = raw.match(/phone(?: number)?(?: to| is|:)?\s*([+\d][\d\s-]{6,17})/i);
  if(mPh && (has('update') || has('change'))){
    const v = mPh[1].trim();
    return 'Please confirm 👤<div class="ai-card"><div class="row"><span>New phone</span><b>' + escapeHtml(v) + '</b></div><button class="btn small glossy" data-ai-act="confirm-profile" data-field="phone" data-value="' + escapeHtml(v) + '">Confirm Update</button></div>';
  }
  let mAd = raw.match(/address(?: to| is|:)?\s*(.{5,80})/i);
  if(mAd && (has('update') || has('change'))){
    const v = mAd[1].trim();
    return 'Please confirm 👤<div class="ai-card"><div class="row"><span>New address</span><b>' + escapeHtml(v) + '</b></div><button class="btn small glossy" data-ai-act="confirm-profile" data-field="address" data-value="' + escapeHtml(v) + '">Confirm Update</button></div>';
  }
  if(has('my profile', 'show profile', 'my account', 'my details', 'my phone', 'my address', 'my email')){
    const p = getProfile();
    return 'Here is your profile 👤<div class="ai-card"><div class="row"><span>Name</span><b>' + escapeHtml(p.name || '–') + '</b></div><div class="row"><span>Phone</span><b>' + escapeHtml(p.phone || '–') + '</b></div><div class="row"><span>Email</span><b>' + escapeHtml(p.email || '–') + '</b></div><div class="row"><span>Address</span><b>' + escapeHtml(p.addr || '–') + '</b></div><div class="row"><span>Blood</span><b>' + escapeHtml(p.blood || '–') + '</b></div></div>To change something, say “update my phone number to …” or “change my address to …”.';
  }
  // 7. my medicines
  if(has('my medicines', 'my tablets', 'my medication', 'what am i taking', 'list my')){
    if(!meds.length) return 'Your cabinet is empty 💊 — add tablets from the Medicines page (or say “remind me to take X at 8 PM” and I will create it).';
    return 'You are taking 💊' + meds.map(m=>'<div class="ai-card"><div class="row"><span>Medicine</span><b>' + escapeHtml(m.name) + '</b></div><div class="row"><span>Times</span><b>' + m.times.map(fmt12).join(', ') + '</b></div></div>').join('');
  }
  // 8. user-med info questions
  if(has('side effect', 'side-effect', 'with food', 'when should', 'when to take', 'what is .* used', 'used for', 'how to take', 'dosage of', 'dose of')){
    const m = findUserMed(raw);
    const label = m ? m.name : medNameFrom(raw);
    return 'About <b>' + escapeHtml(label || 'this medicine') + '</b> 💊<br>• <b>Use:</b> only as your doctor prescribed — I do not guess indications.<br>• <b>Timing:</b> same time daily' + (m ? ' — yours: <b>' + m.times.map(fmt12).join(', ') + '</b>' : '') + '.<br>• <b>Food:</b> follow the pack/prescription; when unsure, ask your pharmacist.<br>• <b>Side effects:</b> mild ones often settle in days; severe or persistent ones need a professional promptly.' + AI_DISC;
  }
  // 9. FAQ
  for(const f of AI_FAQ){ if(f.k.some(k=>t.indexOf(k) !== -1)) return f.t + AI_DISC; }
  // 10. help / greeting / thanks
  if(has('help', 'menu', 'what can you do', 'options', 'features')){
    return 'I can 🤖<br>• Explain <b>medicines &amp; prescriptions</b><br>• <b>Set reminders</b> (“remind me to take X at 8 PM”)<br>• <b>Search &amp; order</b> (“find Vitamin D3”)<br>• <b>Track orders</b> (“where is my order”)<br>• Help with <b>profile &amp; account</b><br>Pick a quick action below 👇';
  }
  if(/\b(hi|hello|hey|namaste)\b|good (morning|evening|afternoon)/i.test(raw)){
    const _you = (currentUser && currentUser.name) ? currentUser.name.split(' ')[0] : 'there';
    return 'Hi ' + escapeHtml(_you) + '! 👋 I am <b>MediCare AI</b> — I can help you understand medicines, manage reminders, find products, and navigate your account.<br>How can I help you today?';
  }
  if(has('thank', 'thanks', 'great', 'awesome', 'bye')){
    return 'Anytime! 💚 Take care, and I am right here whenever you need me.';
  }
  return 'I want to get this exactly right 🤔 — could you rephrase that? I am best at <b>medicines, reminders, orders, prescriptions and your profile</b>. Try a quick action below 👇';
}

// ---------- history ----------
function renderAiHist(){
  const v = $('aiHistView');
  if(!v) return;
  aiPersist();
  const s = aiStore();
  v.innerHTML = '<div class="ai-hist"><div class="card-head"><h2 style="font-size:15px">🕘 Recent Conversations</h2></div>' +
    (s.convos.length ? '' : '<div class="muted small">No conversations yet.</div>') +
    s.convos.map(c=>'<button class="hrow" data-cid="' + c.id + '"><span>💬</span><div><b>' + escapeHtml(c.title || 'Chat') + '</b><span>' + new Date(c.t).toLocaleDateString() + ' · ' + c.msgs.length + ' msgs</span></div></button>').join('') + '</div>';
  v.querySelectorAll('[data-cid]').forEach(b=>{
    b.onclick = ()=>{
      const c = aiStore().convos.find(x=>x.id === b.dataset.cid);
      if(c){ aiConvo = { id: c.id, email: currentUser.email, title: c.title, msgs: c.msgs }; }
      v.hidden = true;
      renderAiMsgs();
    };
  });
}
