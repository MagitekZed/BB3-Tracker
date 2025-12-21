import { state, els } from './state.js';
import { setStatus } from './utils.js';

let cachedEntries = null;
let activeFilter = 'all'; // 'all' | 'skill' | 'inducement' | 'star'
let searchDebounce = null;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeSearchKey(str) {
  return String(str ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9]+/g, '');
}

function buildEntries() {
  const gd = state.gameData;
  if (!gd) return [];
  const out = [];

  for (const [cat, list] of Object.entries(gd.skillCategories || {})) {
    for (const sk of Array.isArray(list) ? list : []) {
      if (!sk || typeof sk !== 'object') continue;
      const name = sk.name;
      if (!name) continue;
      out.push({
        type: 'skill',
        name,
        id: sk.id,
        category: cat,
        tags: sk.tags
      });
    }
  }

  for (const ind of Array.isArray(gd.inducements) ? gd.inducements : []) {
    if (!ind || typeof ind !== 'object' || !ind.name) continue;
    out.push({
      type: 'inducement',
      name: ind.name,
      id: ind.id,
      cost: ind.cost,
      priceText: ind.priceText,
      purchaseEnabled: ind.purchaseEnabled !== false
    });
  }

  for (const sp of Array.isArray(gd.starPlayers) ? gd.starPlayers : []) {
    if (!sp || typeof sp !== 'object' || !sp.name) continue;
    out.push({
      type: 'star',
      name: sp.name,
      id: sp.id,
      cost: sp.cost,
      profile: sp.profile,
      availabilityNote: sp.availabilityNote
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

function getEntries() {
  if (!cachedEntries) cachedEntries = buildEntries();
  return cachedEntries;
}

function setActiveFilter(next) {
  activeFilter = next;
  const container = els.glossary.filters;
  if (!container) return;
  container.querySelectorAll('.glossary-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === next);
  });
}

function render() {
  const listEl = els.glossary.list;
  if (!listEl) return;

  const entries = getEntries();
  const rawQ = String(els.glossary.search?.value ?? '').trim();
  const q = rawQ.length >= 2 ? normalizeSearchKey(rawQ) : '';

  const filtered = entries.filter(e => {
    if (activeFilter !== 'all' && e.type !== activeFilter) return false;
    if (!q) return true;
    return normalizeSearchKey(e.name).includes(q);
  });

  listEl.innerHTML = filtered.map(e => {
    if (e.type === 'skill') {
      const meta = `Skill • ${e.category}${e.tags ? ` • ${e.tags}` : ''}`;
      return `
        <div class="glossary-item" onclick='window.showSkill(${JSON.stringify(e.name)})'>
          <div style="min-width:0;">
            <div class="glossary-item-title">${escapeHtml(e.name)}</div>
          </div>
          <div class="glossary-item-meta">${escapeHtml(meta)}</div>
        </div>
      `;
    }
    if (e.type === 'inducement') {
      const costText = e.priceText || (e.cost ? `${Math.round(e.cost / 1000)}k` : 'Price varies');
      const meta = `Inducement • ${costText}${e.purchaseEnabled ? '' : ' • glossary-only'}`;
      return `
        <div class="glossary-item" onclick='window.showInducementInfo(${JSON.stringify(e.name)})'>
          <div style="min-width:0;">
            <div class="glossary-item-title">${escapeHtml(e.name)}</div>
          </div>
          <div class="glossary-item-meta">${escapeHtml(meta)}</div>
        </div>
      `;
    }
    const meta = `Star • ${(e.cost || 0) / 1000}k`;
    const sub = e.availabilityNote ? `<div class="glossary-item-sub">${escapeHtml(e.availabilityNote)}</div>` : '';
    return `
      <div class="glossary-item" onclick='window.showStarInfo(${JSON.stringify(e.name)})'>
        <div style="min-width:0;">
          <div class="glossary-item-title">${escapeHtml(e.name)}</div>
          ${sub}
        </div>
        <div class="glossary-item-meta">${escapeHtml(meta)}</div>
      </div>
    `;
  }).join('');
}

function scheduleRender() {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(render, 50);
}

export function openGlossary() {
  if (!state.gameData) {
    setStatus('Game data not loaded yet.', 'error');
    return;
  }
  cachedEntries = null;
  setActiveFilter('all');
  if (els.glossary.search) els.glossary.search.value = '';
  if (els.glossary.el) els.glossary.el.classList.remove('hidden');
  render();
  if (els.glossary.list) els.glossary.list.scrollTop = 0;
  if (els.glossary.search) els.glossary.search.focus();
}

export function closeGlossary() {
  if (els.glossary.el) els.glossary.el.classList.add('hidden');
}

export function initGlossary() {
  if (els.glossary.closeBtn) els.glossary.closeBtn.addEventListener('click', closeGlossary);
  if (els.glossary.search) els.glossary.search.addEventListener('input', scheduleRender);
  if (els.glossary.filters) {
    els.glossary.filters.addEventListener('click', (e) => {
      const btn = e.target.closest('.glossary-filter');
      if (!btn) return;
      setActiveFilter(btn.dataset.filter || 'all');
      render();
    });
  }
  if (els.glossary.el) {
    els.glossary.el.addEventListener('click', (e) => {
      if (e.target === els.glossary.el) closeGlossary();
    });
  }
}

