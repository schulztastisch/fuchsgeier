const CONFIG_URL = "config.json";
const JOBS_URL = "jobs.json";

let allJobs = [];
let filteredJobs = [];
let searchTerm = "";
let priorityFilter = "all";

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function applyFilters() {
  const term = searchTerm.trim().toLowerCase();
  filteredJobs = allJobs.filter(job => {
    if (priorityFilter !== "all" && String(job.priority || 1) !== priorityFilter) {
      return false;
    }
    if (!term) return true;
    const haystack = `${job.title || ""} ${job.url || ""}`.toLowerCase();
    return haystack.includes(term);
  });
  renderJobs();
}

function renderJobs() {
  const container = document.getElementById("jobsContainer");
  const countEl = document.getElementById("jobsCount");

  if (!filteredJobs.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Keine Treffer für diese Filter</h3>
        <p>Andere Stichwörter oder eine andere Priorität ausprobieren.</p>
      </div>
    `;
    countEl.textContent = "0 Treffer";
    return;
  }

  countEl.textContent = `${filteredJobs.length} Treffer`;

  const items = filteredJobs.map(job => {
    const prio = job.priority || 1;
    const prioLabel = prio === 2 ? "Hohe Priorität" : "Normal";
    const prioClass = prio === 2 ? "pill-prio-high" : "pill-prio-normal";
    const source = job.source || "unbekannte Quelle";
    const fetched = formatDate(job.fetched_at);
    const url = job.url || "#";
    const title = job.title || "Ohne Titel";

    return `
      <article class="job-card">
        <div class="job-top">
          <div class="job-title">${title}</div>
          <div class="pill ${prioClass}">${prioLabel}</div>
        </div>
        <div class="job-meta">
          <span><strong>Quelle:</strong> ${source}</span>
          ${fetched ? `<span><strong>Gefunden:</strong> ${fetched}</span>` : ""}
        </div>
        <div class="job-actions">
          <a class="job-link" href="${url}" target="_blank" rel="noopener noreferrer">
            Zur Anzeige
          </a>
        </div>
      </article>
    `;
  });

  container.innerHTML = items.join("");
}

async function loadConfig() {
  const keywordsEl = document.getElementById("keywords");
  try {
    const res = await fetch(CONFIG_URL, { cache: "no-store" });
    if (!res.ok) throw new Error();
    const cfg = await res.json();
    const terms = cfg.search_terms || [];
    if (!terms.length) {
      keywordsEl.innerHTML = `<span class="pill pill-ghost">Keine Stichwörter definiert</span>`;
      return;
    }
    keywordsEl.innerHTML = terms
      .map(t => `<span class="pill pill-soft">${t}</span>`)
      .join("");
  } catch {
    keywordsEl.innerHTML = `<span class="pill pill-ghost">Konnte Config nicht laden</span>`;
  }
}

async function loadJobs() {
  const lastUpdatedEl = document.getElementById("lastUpdated");
  try {
    const res = await fetch(JOBS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error();
    const data = await res.json();
    allJobs = data.jobs || [];

    if (allJobs.length) {
      const latest = allJobs[0].fetched_at || allJobs[0].fetchedAt;
      const label = latest ? formatDate(latest) : "unbekannt";
      lastUpdatedEl.textContent = `Zuletzt aktualisiert: ${label}`;
    } else {
      lastUpdatedEl.textContent = "Noch keine Treffer";
    }

    applyFilters();
  } catch {
    allJobs = [];
    lastUpdatedEl.textContent = "Fehler beim Laden";
    renderJobs();
  }
}

function initFilters() {
  const searchInput = document.getElementById("searchInput");
  const prioSelect = document.getElementById("prioritySelect");

  searchInput.addEventListener("input", e => {
    searchTerm = e.target.value;
    applyFilters();
  });

  prioSelect.addEventListener("change", e => {
    priorityFilter = e.target.value;
    applyFilters();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initFilters();
  loadConfig();
  loadJobs();
});