import { state, els } from './state.js';
import { PATHS } from './config.js';
import { apiGet } from './api.js';
import { setStatus, applyTeamTheme } from './utils.js';
import { renderLeagueList } from './ui-league.js';
import { handleOpenScoreboard } from './ui-match.js';

export async function init() {
  setStatus('Initializing...');
  const storedKey = localStorage.getItem('bb3_edit_key');
  if (storedKey) {
    if(els.inputs.editKey) els.inputs.editKey.value = storedKey;
    if(els.mobileKey.input) els.mobileKey.input.value = storedKey;
  }

  try {
    state.gameData = await apiGet(PATHS.gameData);
    populateSkillList();
    const index = await apiGet(PATHS.leaguesIndex);
    state.leaguesIndex = index || [];
    goHome();
    setStatus('Ready.', 'ok');
  } catch (e) { console.error(e); setStatus(`Init Failed: ${e.message}`, 'error'); }
}

export function populateSkillList() {
  if (!state.gameData?.skillCategories) return;
  const list = els.datalist;
  list.innerHTML = '';
  Object.values(state.gameData.skillCategories).flat().forEach(s => {
    const opt = document.createElement('option');
    opt.value = (typeof s === 'object' && s.name) ? s.name : s; 
    list.appendChild(opt);
  });
}

export function showSection(name) {
  window.scrollTo(0,0);
  if (state.activeMatchPollInterval) {
    clearInterval(state.activeMatchPollInterval);
    state.activeMatchPollInterval = null;
  }
  Object.values(els.sections).forEach(el => el.classList.add('hidden'));
  els.sections[name].classList.remove('hidden');
}

export function updateBreadcrumbs(path) {
  const container = els.nav.breadcrumbs;
  container.innerHTML = '';
  const inner = document.createElement('div');
  inner.className = 'breadcrumbs-inner';
  path.forEach((step, index) => {
    if (index > 0) {
      const sep = document.createElement('span'); sep.className = 'crumb-sep'; sep.textContent = ' / '; inner.appendChild(sep);
    }
    const span = document.createElement('span');
    if (step.action) {
      span.className = 'crumb-link'; span.textContent = step.label; span.onclick = step.action;
    } else {
      span.className = 'crumb'; span.textContent = step.label;
    }
    inner.appendChild(span);
  });
  container.appendChild(inner);
}

export function setActiveNav(tabName) {
  ['deskLeagues', 'deskAdmin'].forEach(k => els.nav[k].classList.remove('active'));
  ['mobLeagues', 'mobMatch', 'mobAdmin'].forEach(k => els.nav[k].classList.remove('active'));
  if (tabName === 'leagues') { els.nav.deskLeagues.classList.add('active'); els.nav.mobLeagues.classList.add('active'); }
  else if (tabName === 'admin') { els.nav.deskAdmin.classList.add('active'); els.nav.mobAdmin.classList.add('active'); }
  else if (tabName === 'match') { els.nav.mobMatch.classList.add('active'); }
}

export function goHome() {
  applyTeamTheme(null);
  showSection('list');
  renderLeagueList();
  updateBreadcrumbs([{ label: 'Leagues' }]);
  setActiveNav('leagues');
}

export function goAdmin() {
  applyTeamTheme(null);
  showSection('admin');
  updateBreadcrumbs([{ label: 'Leagues', action: goHome }, { label: 'Admin Tools' }]);
  setActiveNav('admin');
}

// Global Skill Modal
export function showSkill(skillName) {
  const rawName = String(skillName ?? '').trim();
  const cleanName = rawName
    .replace(/\*+$/g, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim();
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const cleanKey = norm(cleanName);
  if (!cleanKey) {
    showInfoModal(rawName || 'Skill', 'No description available.', false);
    return;
  }
  let desc = "No description available.";
  if (state.gameData?.skillCategories) {
    for (const cat in state.gameData.skillCategories) {
      const found = state.gameData.skillCategories[cat].find(s => {
        const name = (typeof s === 'object' && s.name) ? s.name : String(s ?? '');
        const key = norm(name);
        return key === cleanKey || key.startsWith(cleanKey);
      });
      if (found && typeof found === 'object') { desc = found.description || desc; break; }
    }
  }
  showInfoModal(rawName || cleanName, desc, false);
}

export function closeSkillModal() {
  els.modal.el.classList.add('hidden');
}

export function showInfoModal(title, message, messageIsHtml = false) {
  els.modal.title.textContent = title;
  els.modal.body.style.whiteSpace = messageIsHtml ? 'normal' : 'pre-wrap';
  if (messageIsHtml) els.modal.body.innerHTML = message;
  else els.modal.body.textContent = message;
  els.modal.el.classList.remove('hidden');
}

const STATIC_MODAL_IDS = new Set(['scheduleModal', 'preMatchModal', 'postGameModal', 'skillModal', 'glossaryModal']);

export function closeModalElement(modalEl) {
  const el = modalEl || null;
  if (!el) return;
  const id = String(el.getAttribute('id') || '');
  if (id && STATIC_MODAL_IDS.has(id)) el.classList.add('hidden');
  else el.remove();
}

export function closeNearestModal(fromEl) {
  const modalEl = fromEl?.closest?.('.modal') || null;
  closeModalElement(modalEl);
}

export function replaceNearestModal(fromEl, openNext) {
  closeNearestModal(fromEl);
  if (typeof openNext === 'function') openNext();
}

export function scrollModalBodyTop(modalEl) {
  const el = modalEl || null;
  if (!el) return;
  const scroller = el.querySelector('.modal-body-scroll');
  if (scroller) scroller.scrollTop = 0;
}

// Mobile Match Nav Button Logic
export function handleMobileMatchNav() {
  if (state.activeMatchData) {
    handleOpenScoreboard(state.activeMatchData.matchId);
  } else if (state.currentLeague) {
    showSection('view');
    document.getElementById('leagueMatchesSection').scrollIntoView({behavior:'smooth'});
  } else {
    goHome();
  }
  setActiveNav('match');
}

// --- NEW: Generic Confirmation Modal ---
export function confirmModal(title, message, confirmLabel = 'Confirm', isDanger = false, messageIsHtml = false) {
  return new Promise((resolve) => {
    const hiddenModals = [];
    document.querySelectorAll('.modal').forEach(existing => {
      if (!existing?.isConnected) return;
      if (existing.classList.contains('hidden')) return;
      if (getComputedStyle(existing).display === 'none') return;
      hiddenModals.push({ el: existing, prevDisplay: existing.style.display });
      existing.style.display = 'none';
    });

    const restoreHidden = () => {
      hiddenModals.forEach(({ el, prevDisplay }) => {
        if (!el?.isConnected) return;
        el.style.display = prevDisplay || '';
      });
    };

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '20000';
    
    const btnClass = isDanger ? 'danger-btn' : 'primary-btn';

    modal.innerHTML = `
      <div class="modal-content">
          <div class="modal-header"><h3>${title}</h3></div>
          <div class="confirm-message" style="margin-bottom: 1rem; overflow-y: auto; flex: 1; max-height: 60vh;"></div>
          <div class="modal-actions">
              <button id="confirmCancelBtn" class="secondary-btn">Cancel</button>
              <button id="confirmOkBtn" class="${btnClass}">${confirmLabel}</button>
          </div>
      </div>
    `;
    
    document.body.appendChild(modal);

    const messageEl = modal.querySelector('.confirm-message');
    if (messageIsHtml) messageEl.innerHTML = message;
    else messageEl.textContent = message;
    
    const close = (val) => {
        modal.remove();
        restoreHidden();
        resolve(val);
    };

    modal.querySelector('#confirmCancelBtn').onclick = () => close(false);
    modal.querySelector('#confirmOkBtn').onclick = () => close(true);
  });
}
