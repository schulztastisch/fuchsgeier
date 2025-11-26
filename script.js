const CONFIG_URL = "config.json";
const JOBS_URL = "jobs.json";
const STORAGE_KEY = "fg_state_v1";
const THEME_KEY = "fg_theme";
let allJobs = [];
let filteredJobs = [];
let state = {}; // url -> "todo"|"done"|"skip"

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw?JSON.parse(raw):{};
  }catch{ state = {}; }
}

function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function setTheme(t){
  if(t==="light") document.documentElement.classList.add("light");
  else document.documentElement.classList.remove("light");
  localStorage.setItem(THEME_KEY, t);
}

function detectTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  if(saved) return saved;
  if(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return "light";
  const hour = new Date().getHours();
  return (hour>=7 && hour<20)?"light":"dark";
}

function initTheme(){
  const t = detectTheme();
  setTheme(t);
  document.getElementById("themeToggle").addEventListener("click", ()=>{
    const cur = document.documentElement.classList.contains("light")?"light":"dark";
    setTheme(cur==="light"?"dark":"light");
  });
}

function formatDate(iso){
  if(!iso) return "";
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
}

async function loadConfig(){
  try{
    const res = await fetch(CONFIG_URL,{cache:"no-store"});
    if(!res.ok) return;
    const cfg = await res.json();
    const ks = document.getElementById("lastUpdated");
    ks.textContent = "Suchbegriffe: " + ((cfg.search_terms||[]).slice(0,6).join(", ") || "—");
  }catch(e){ console.warn(e) }
}

async function loadJobs(){
  try{
    const res = await fetch(JOBS_URL,{cache:"no-store"});
    if(!res.ok) throw new Error();
    const data = await res.json();
    allJobs = data.jobs||[];
    renderAll();
  }catch(err){
    document.getElementById("jobsContainer").innerHTML = `<div class="empty-state">Fehler beim Laden</div>`;
  }
}

function applyFilters(){
  const term = (document.getElementById("searchInput").value||"").trim().toLowerCase();
  const pr = document.getElementById("prioritySelect").value;
  filteredJobs = allJobs.filter(j=>{
    const url = (j.url||"");
    if(state[url]==="skip") return false;
    if(pr!=="all" && String(j.priority||1)!==pr) return false;
    if(!term) return true;
    const hay = ((j.title||"") + " " + url).toLowerCase();
    return hay.includes(term);
  });
}

function renderJobs(){
  const container = document.getElementById("jobsContainer");
  if(!filteredJobs.length){
    container.innerHTML = `<div class="empty-state">Keine Treffer für die Filter</div>`;
    document.getElementById("jobsCount").textContent = "0";
    return;
  }
  document.getElementById("jobsCount").textContent = String(filteredJobs.length);
  const html = filteredJobs.map(j=>{
    const url = j.url||"#";
    const title = j.title||"Ohne Titel";
    const src = j.source||"unbekannt";
    const fetched = formatDate(j.fetched_at);
    const st = state[url]||"";
    const heartClass = st==="todo"?"btn heart active":"btn heart";
    return `<article class="job">
      <div class="top"><div class="title">${escapeHtml(title)}</div>
      <div class="meta">${src} ${fetched?` • ${fetched}`:""}</div></div>
      <div class="meta">${url}</div>
      <div class="actions">
        <button class="${heartClass}" data-action="todo" data-url="${escapeHtml(url)}">❤</button>
        <button class="btn done" data-action="done" data-url="${escapeHtml(url)}">✓</button>
        <button class="btn skip" data-action="skip" data-url="${escapeHtml(url)}">✕</button>
        <a class="btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Öffnen</a>
      </div>
    </article>`;
  }).join("");
  container.innerHTML = html;
  container.querySelectorAll("button[data-action]").forEach(b=>{
    b.addEventListener("click", onActionClick);
  });
}

function renderLists(){
  const todo = [];
  const done = [];
  const skip = [];
  for(const j of allJobs){
    const url = j.url||"";
    const st = state[url];
    if(st==="todo") todo.push(j);
    else if(st==="done") done.push(j);
    else if(st==="skip") skip.push(j);
  }
  const renderMini = (arr)=> arr.length? arr.map(x=>`<div class="mini"><span>${escapeHtml(x.title||x.url)}</span><span class="muted">${escapeHtml(x.source||"")}</span></div>`).join("") : "";
  document.getElementById("todoList").innerHTML = renderMini(todo) || `<div class="empty">Noch nichts gemerkt</div>`;
  document.getElementById("doneList").innerHTML = renderMini(done) || `<div class="empty">Noch nichts erledigt</div>`;
  document.getElementById("skipList").innerHTML = renderMini(skip) || `<div class="empty">Keine Einträge</div>`;
}

function onActionClick(e){
  const btn = e.currentTarget;
  const action = btn.dataset.action;
  const url = btn.dataset.url;
  if(!url) return;
  if(action==="todo") state[url] = (state[url]==="todo")? null : "todo";
  if(action==="done") {
    state[url] = "done";
  }
  if(action==="skip") state[url] = "skip";
  // normalize removals
  for(const k of Object.keys(state)) if(state[k]===null) delete state[k];
  saveState();
  applyFilters();
  renderJobs();
  renderLists();
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" })[c]); }

document.addEventListener("DOMContentLoaded", ()=>{
  loadState();
  initTheme();
  document.getElementById("searchInput").addEventListener("input", ()=>{
    applyFilters();
    renderJobs();
  });
  document.getElementById("prioritySelect").addEventListener("change", ()=>{
    applyFilters();
    renderJobs();
  });
  loadConfig();
  loadJobs().then(()=>{
    applyFilters();
    renderJobs();
    renderLists();
  });
});