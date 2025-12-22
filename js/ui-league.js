import { state, els } from './state.js';
import { PATHS } from './config.js';
import { apiGet, apiSave, apiDelete } from './api.js';
import { setStatus, normalizeName, getContrastColor, ulid } from './utils.js';
import { computeSeasonStats } from './rules.js';
import { collectSeasonPlayerRows, aggregatePlayerStats } from './stats.js';
import { showSection, updateBreadcrumbs, setActiveNav, goHome, confirmModal } from './ui-core.js';
import { handleOpenTeam, handleEditTeam, renderTeamEditor } from './ui-team.js';
import { handleStartMatch, handleOpenScoreboard } from './ui-match.js';

const LEAGUE_TABS = [
  { id: 'season', label: 'Season' },
  { id: 'standings', label: 'Standings' },
  { id: 'leaders', label: 'Leaders' },
  { id: 'teamStats', label: 'Team Stats' },
  { id: 'playerStats', label: 'Player Stats' }
];

const PLAYER_SORTABLE_KEYS = new Set([
  'name',
  'teamName',
  'games',
  'td',
  'cas',
  'int',
  'comp',
  'mvp',
  'sppGain'
]);

function getLeagueViewSeason(league) {
  const current = Number(league?.season || 1);
  const selectedRaw = state.leagueSeasonView;
  const selected = (selectedRaw == null || selectedRaw === '') ? null : Number(selectedRaw);
  if (Number.isFinite(selected) && selected >= 1 && selected <= current) return selected;
  return current;
}

export function setLeagueSeasonView(season) {
  const league = state.currentLeague;
  if (!league) return;

  const current = Number(league?.season || 1);
  const next = Number(season || 0);
  state.leagueSeasonView = (Number.isFinite(next) && next >= 1 && next <= current) ? next : null;
  state.leagueStatsCache = null;
  renderLeagueView();
}

function safeHexColor(value, fallback) {
  const s = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  return fallback;
}

function hexToRgba(hex, alpha) {
  const h = safeHexColor(hex, null);
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  if (!h) return `rgba(0,0,0,${a})`;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function buildTeamStyleVars(colors) {
  const prim = safeHexColor(colors?.primary, '#444444');
  const sec = safeHexColor(colors?.secondary, prim);
  const text = getContrastColor(prim);
  const primBg = hexToRgba(prim, 0.14);
  const secBg = hexToRgba(sec, 0.06);
  return `--team-primary:${prim};--team-secondary:${sec};--team-text:${text};--team-primary-bg:${primBg};--team-secondary-bg:${secBg};`;
}

function getLeagueTeamColors(league, teamId) {
  return (league?.teams || []).find(t => t.id === teamId)?.colors || null;
}

export function renderLeagueList() {
  if (!state.leaguesIndex.length) {
    els.containers.leagueList.innerHTML = `<div class="panel-styled">No leagues found. Create one to get started.</div>`;
    return;
  }
  els.containers.leagueList.innerHTML = state.leaguesIndex.map(l => `
    <div class="league-card">
      <div class="league-card-main">
        <div class="league-card-title">${l.name}</div>
        <div class="league-meta">
          <span class="tag ${l.status === 'completed' ? 'completed' : (l.status === 'active' || l.status === 'playoffs') ? 'in_progress' : 'scheduled'}">${l.status}</span>
          Season ${l.season}
        </div>
      </div>
      <div>
        <button class="link-button" onclick="window.handleOpenLeague('${l.id}')">Open</button>
        &nbsp;|&nbsp;
        <button class="link-button" onclick="window.handleManageLeague('${l.id}')">Manage</button>
      </div>
    </div>
  `).join('');
}

export async function handleOpenLeague(id) {
  const leagueName = state.leaguesIndex.find(l => l.id === id)?.name;
  setStatus(`Loading league${leagueName ? `: ${leagueName}` : ''}...`);
  try {
    state.currentLeague = null; 
    const league = await apiGet(PATHS.league(id));
    if (!league) throw new Error("League file not found.");
    state.currentLeague = league;
    state.viewLeagueId = id;
    state.leagueTeamsCache = null;
    state.leagueStatsCache = null;
    state.leagueSeasonView = null;
    state.leagueTeamsCacheForLeagueId = id;
    
    renderLeagueView();
    showSection('view');
    updateBreadcrumbs([{ label: 'Leagues', action: goHome }, { label: league.name }]);
    setActiveNav('leagues');

    setStatus(`League loaded: ${league.name}`, 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
}

function renderLeagueTabs() {
  const tabsEl = els.leagueView?.tabs;
  if (!tabsEl) return;

  tabsEl.innerHTML = LEAGUE_TABS.map(t => `
    <button class="league-tab-btn ${state.leagueTab === t.id ? 'active' : ''}" onclick="window.setLeagueTab('${t.id}')">${t.label}</button>
  `).join('');
}

function renderLeagueTabTools() {
  const toolsEl = els.leagueView?.tabTools;
  if (!toolsEl) return;
  const league = state.currentLeague;
  if (!league) return;

  const currentSeason = Number(league.season || 1);
  const viewSeason = getLeagueViewSeason(league);
  const isHistory = viewSeason !== currentSeason;

  let seasonSelect = toolsEl.querySelector('select[data-role="league-season-select"]');
  let seasonNote = toolsEl.querySelector('[data-role="league-season-note"]');
  let seasonCurrentBtn = toolsEl.querySelector('button[data-role="league-season-current"]');
  let searchInput = toolsEl.querySelector('input[data-role="league-player-search"]');

  if (!seasonSelect) {
    toolsEl.innerHTML = '';

    const seasonWrap = document.createElement('div');
    seasonWrap.style.display = 'flex';
    seasonWrap.style.alignItems = 'center';
    seasonWrap.style.gap = '0.5rem';

    const label = document.createElement('div');
    label.className = 'small';
    label.textContent = 'Season';

    seasonSelect = document.createElement('select');
    seasonSelect.setAttribute('data-role', 'league-season-select');
    seasonSelect.addEventListener('change', (e) => setLeagueSeasonView(e.target.value));

    seasonWrap.appendChild(label);
    seasonWrap.appendChild(seasonSelect);

    seasonNote = document.createElement('div');
    seasonNote.className = 'small';
    seasonNote.style.color = '#666';
    seasonNote.setAttribute('data-role', 'league-season-note');

    seasonCurrentBtn = document.createElement('button');
    seasonCurrentBtn.className = 'secondary-btn';
    seasonCurrentBtn.textContent = 'Current';
    seasonCurrentBtn.setAttribute('data-role', 'league-season-current');
    seasonCurrentBtn.onclick = () => setLeagueSeasonView(currentSeason);

    searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Search players...';
    searchInput.value = state.leaguePlayerSearch || '';
    searchInput.setAttribute('data-role', 'league-player-search');
    searchInput.addEventListener('input', (e) => setLeaguePlayerSearch(e.target.value));

    toolsEl.appendChild(seasonWrap);
    toolsEl.appendChild(seasonNote);
    toolsEl.appendChild(seasonCurrentBtn);
    toolsEl.appendChild(searchInput);
  }

  seasonSelect.innerHTML = Array.from({ length: currentSeason }, (_, i) => {
    const n = i + 1;
    return `<option value="${n}">Season ${n}</option>`;
  }).join('');
  if (String(seasonSelect.value) !== String(viewSeason)) seasonSelect.value = String(viewSeason);

  seasonNote.textContent = isHistory ? `Viewing Season ${viewSeason} (history).` : `Viewing Season ${viewSeason}.`;
  seasonCurrentBtn.style.display = isHistory ? '' : 'none';

  const showSearch = state.leagueTab === 'playerStats';
  searchInput.style.display = showSearch ? '' : 'none';
  const nextValue = state.leaguePlayerSearch || '';
  if (showSearch && searchInput.value !== nextValue) searchInput.value = nextValue;
}

function getTabLabel(tabId) {
  return LEAGUE_TABS.find(t => t.id === tabId)?.label || 'Standings';
}

export function setLeagueTab(tabId) {
  const next = String(tabId || 'standings');
  if (!LEAGUE_TABS.some(t => t.id === next)) return;
  state.leagueTab = next;
  renderLeagueView();
}

export function setLeaguePlayerSearch(value) {
  state.leaguePlayerSearch = String(value ?? '');
  renderLeagueView();
}

export function setLeaguePlayerSort(key) {
  const k = String(key || '');
  if (!PLAYER_SORTABLE_KEYS.has(k)) return;

  if (state.leaguePlayerSortKey === k) {
    state.leaguePlayerSortDir = (state.leaguePlayerSortDir === 'asc') ? 'desc' : 'asc';
  } else {
    state.leaguePlayerSortKey = k;
    state.leaguePlayerSortDir = 'desc';
  }

  renderLeagueView();
}

// --- Phase 7: Season / Play-offs / Off-season ---

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getEditKey() {
  return String(els.inputs.editKey?.value || els.mobileKey?.input?.value || '').trim();
}

function getPlayoffStageOrder(bracketSize) {
  const n = Number(bracketSize || 0);
  if (n === 4) return ['semifinals', 'final', 'thirdPlace'];
  if (n === 8) return ['quarterfinals', 'semifinals', 'final', 'thirdPlace'];
  if (n === 16) return ['roundOf16', 'quarterfinals', 'semifinals', 'final', 'thirdPlace'];
  return [];
}

function getPlayoffStageLabel(stage) {
  const s = String(stage || '');
  if (s === 'roundOf16') return 'Round of 16';
  if (s === 'quarterfinals') return 'Quarterfinals';
  if (s === 'semifinals') return 'Semi-finals';
  if (s === 'final') return 'Final';
  if (s === 'thirdPlace') return 'Third-place Play-off';
  return s || 'Play-off';
}

function generateSeedOrder(n) {
  const size = Number(n || 0);
  if (size === 2) return [1, 2];
  if (size < 2 || (size & (size - 1)) !== 0) return [];
  const prev = generateSeedOrder(size / 2);
  const out = [];
  for (const seed of prev) {
    out.push(seed);
    out.push(size + 1 - seed);
  }
  return out;
}

function getPlayoffWinnerTeamId(match) {
  if (!match) return null;
  if (match.winnerTeamId) return match.winnerTeamId;
  const hs = Number(match.score?.home);
  const as = Number(match.score?.away);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
  if (hs > as) return match.homeTeamId;
  if (as > hs) return match.awayTeamId;
  return null;
}

function getPlayoffLoserTeamId(match) {
  const winner = getPlayoffWinnerTeamId(match);
  if (!winner) return null;
  if (winner === match.homeTeamId) return match.awayTeamId;
  if (winner === match.awayTeamId) return match.homeTeamId;
  return null;
}

async function saveLeagueAndIndex(league, key, note) {
  await apiSave(PATHS.league(league.id), league, note, key);

  const freshIndex = (await apiGet(PATHS.leaguesIndex)) || [];
  const idxEntry = { id: league.id, name: league.name, season: league.season, status: league.status };
  const i = freshIndex.findIndex(x => x.id === league.id);
  if (i >= 0) freshIndex[i] = idxEntry;
  else freshIndex.push(idxEntry);
  await apiSave(PATHS.leaguesIndex, freshIndex, `Update index for ${league.id}`, key);
  state.leaguesIndex = freshIndex;
}

async function pickWinnerModal({ title, homeLabel, awayLabel }) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '12050';

    modal.innerHTML = `
      <div class="modal-content" style="max-width:520px; width:95%;">
        <div class="modal-header"><h3>${escapeHtml(title)}</h3><button class="close-btn">×</button></div>
        <div style="text-align:left; margin-bottom:0.75rem;">Play-offs require a winner. Record who advanced (Extra Time / Penalties as needed).</div>
        <div class="panel-styled" style="margin-bottom:0.75rem;">
          <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
            <input type="radio" name="poWinnerPick" value="home" checked>
            <span><strong>Home:</strong> ${escapeHtml(homeLabel)}</span>
          </label>
          <label style="display:flex; align-items:center; gap:0.5rem;">
            <input type="radio" name="poWinnerPick" value="away">
            <span><strong>Away:</strong> ${escapeHtml(awayLabel)}</span>
          </label>
        </div>
        <div class="modal-actions">
          <button class="secondary-btn" id="poPickCancel">Cancel</button>
          <button class="primary-btn" id="poPickOk">Set Winner</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = (val) => {
      modal.remove();
      resolve(val);
    };

    modal.querySelector('.close-btn').onclick = () => close(null);
    modal.querySelector('#poPickCancel').onclick = () => close(null);
    modal.querySelector('#poPickOk').onclick = () => {
      const picked = modal.querySelector('input[name="poWinnerPick"]:checked')?.value || 'home';
      close(picked);
    };
  });
}

export async function openPlayoffsManager() {
  const l = state.currentLeague;
  if (!l) return;

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.style.zIndex = '12000';

  modal.innerHTML = `
    <div class="modal-content" style="max-width:1100px; width:95%; max-height:90vh; display:flex; flex-direction:column;">
      <div class="modal-header">
        <h3>Play-offs</h3>
        <button class="close-btn">×</button>
      </div>
      <div class="modal-body-scroll" id="playoffsBody"></div>
      <div class="modal-actions" style="justify-content:flex-end;">
        <button class="secondary-btn" id="playoffsCloseBtn">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.close-btn').onclick = close;
  modal.querySelector('#playoffsCloseBtn').onclick = close;

  const body = modal.querySelector('#playoffsBody');

  const render = () => {
    const league = state.currentLeague;
    const season = Number(league?.season || 1);
    const playoffs = (league?.playoffs && league.playoffs.season === season) ? league.playoffs : null;

    if (!playoffs) {
      renderSetup(league, season);
      return;
    }

    renderManage(league, season, playoffs);
  };

  const renderSetup = (league, season) => {
    const key = getEditKey();
    const sizes = [4, 8, 16].filter(n => n <= (league.teams || []).length);
    const standings = computeSeasonStats(league);

    const regularMatches = (league.matches || [])
      .filter(m => (m.season ?? 1) === season)
      .filter(m => String(m.type || 'regular') !== 'playoff');
    const regularIncomplete = regularMatches.filter(m => m.status !== 'completed');

    if (!sizes.length) {
      body.innerHTML = `<div class="panel-styled">Not enough teams to start play-offs. Need at least 4.</div>`;
      return;
    }

    body.innerHTML = `
      <div class="league-subheading">Start Play-offs</div>
      <div class="panel-styled" style="margin-bottom:0.75rem;">
        <div class="small" style="color:#666; margin-bottom:0.5rem;">Seeds are based on current standings (points, TD diff, CAS diff).</div>
        <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
          <div class="form-field">
            <label>Bracket size</label>
            <select id="poBracketSize">${sizes.map(n => `<option value="${n}">${n} teams</option>`).join('')}</select>
          </div>
        </div>
        ${regularIncomplete.length ? `<div class="small" style="margin-top:0.6rem; color:#b00020;">Warning: ${regularIncomplete.length} regular-season match(es) are not completed.</div>` : ''}
        ${!key ? `<div class="small" style="margin-top:0.6rem; color:#b00020;">Enter your Edit Key to start play-offs.</div>` : ''}
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:flex-end; margin-top:0.75rem;">
          <button class="primary-btn" id="poStartBtn" ${key ? '' : 'disabled'}>Start Play-offs</button>
        </div>
      </div>

      <div class="panel-styled">
        <h4 style="margin-top:0;">Current standings (seeding preview)</h4>
        <div class="table-scroll">
          <table class="league-table standings-table">
            <thead><tr><th>#</th><th>Team</th><th>Pts</th><th>TD Diff</th><th>CAS Diff</th></tr></thead>
            <tbody>
              ${standings.map((s, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(s.name)}</td><td>${s.points}</td><td>${s.tdDiff}</td><td>${s.casDiff}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const startBtn = body.querySelector('#poStartBtn');
    startBtn.onclick = async () => {
      const editKey = getEditKey();
      if (!editKey) return setStatus('Edit key required.', 'error');
      const size = Number(body.querySelector('#poBracketSize')?.value || 0);
      if (![4, 8, 16].includes(size)) return setStatus('Invalid bracket size.', 'error');

      const msg = `<div style="text-align:left;">
        <div style="margin-bottom:0.5rem;"><strong>Start ${size}-team play-offs</strong> for Season ${season}?</div>
        <div class="small" style="color:#666;">This will schedule the first play-off round as new fixtures.</div>
        ${regularIncomplete.length ? `<div class="small" style="margin-top:0.5rem; color:#b00020;">${regularIncomplete.length} regular-season match(es) are incomplete. You can still proceed.</div>` : ''}
      </div>`;
      const ok = await confirmModal('Start play-offs?', msg, 'Start', false, true);
      if (!ok) return;

      try {
        await startPlayoffs(size, editKey);
        setStatus('Play-offs started.', 'ok');
        renderLeagueView();
        render();
      } catch (e) {
        setStatus(`Play-offs start failed: ${e.message}`, 'error');
      }
    };
  };

  const startPlayoffs = async (bracketSize, key) => {
    const league = state.currentLeague;
    const season = Number(league.season || 1);
    if (league.playoffs && league.playoffs.season === season) throw new Error('Play-offs already exist for this season.');

    const size = Number(bracketSize || 0);
    const stageOrder = getPlayoffStageOrder(size);
    if (!stageOrder.length) throw new Error('Unsupported bracket size.');

    const standings = computeSeasonStats(league);
    const qualified = standings.map(s => s.id).filter(Boolean).slice(0, size);
    if (qualified.length < size) throw new Error(`Need ${size} teams for this bracket.`);

    league.matches = Array.isArray(league.matches) ? league.matches : [];

    const seasonMatches = league.matches.filter(m => (m.season ?? 1) === season);
    const maxRound = Math.max(0, ...seasonMatches.map(m => Number(m.round) || 0));

    const baseStages = stageOrder.filter(s => s !== 'thirdPlace');
    const stageRounds = {};
    let roundCursor = maxRound + 1;
    baseStages.forEach(stage => { stageRounds[stage] = roundCursor++; });
    if (stageOrder.includes('thirdPlace')) stageRounds.thirdPlace = stageRounds.final;

    const rounds = {};
    stageOrder.forEach(stage => { rounds[stage] = []; });

    const firstStage = baseStages[0];
    const seedOrder = generateSeedOrder(size);
    if (!seedOrder.length) throw new Error('Failed to generate bracket.');

    const today = new Date().toISOString().split('T')[0];
    for (let i = 0; i < seedOrder.length; i += 2) {
      const seedHome = seedOrder[i];
      const seedAway = seedOrder[i + 1];
      const homeTeamId = qualified[seedHome - 1];
      const awayTeamId = qualified[seedAway - 1];
      const matchId = ulid();
      league.matches.push({
        id: matchId,
        season,
        round: stageRounds[firstStage],
        homeTeamId,
        awayTeamId,
        status: 'scheduled',
        date: today,
        type: 'playoff',
        playoff: { stage: firstStage, bracketSize: size, seedHome, seedAway }
      });
      rounds[firstStage].push(matchId);
    }

    league.playoffs = {
      season,
      bracketSize: size,
      status: 'in_progress',
      stageOrder,
      stageRounds,
      rounds,
      qualifiedTeamIds: qualified,
      createdAt: new Date().toISOString(),
      prizesAwardedAt: null
    };

    league.status = 'playoffs';

    await saveLeagueAndIndex(league, key, `Start play-offs (S${season})`);
  };

  const renderManage = (league, season, playoffs) => {
    const key = getEditKey();
    const matchById = new Map((league.matches || []).map(m => [m.id, m]));
    const stageOrder = Array.isArray(playoffs.stageOrder) ? playoffs.stageOrder : getPlayoffStageOrder(playoffs.bracketSize);
    const rounds = playoffs.rounds || {};

    const baseStages = stageOrder.filter(s => s !== 'thirdPlace');
    const nextStage = (() => {
      for (let idx = 1; idx < baseStages.length; idx++) {
        const s = baseStages[idx];
        const ids = Array.isArray(rounds[s]) ? rounds[s] : [];
        if (!ids.length) return { prev: baseStages[idx - 1], next: s };
      }
      return null;
    })();

    const stageIsComplete = (stage) => {
      const ids = Array.isArray(rounds[stage]) ? rounds[stage] : [];
      if (!ids.length) return false;
      return ids.every(id => matchById.get(id)?.status === 'completed');
    };

    const prevIds = nextStage ? (Array.isArray(rounds[nextStage.prev]) ? rounds[nextStage.prev] : []) : [];
    const prevMissingWinners = nextStage
      ? prevIds
        .map(id => matchById.get(id))
        .filter(m => m?.status === 'completed')
        .filter(m => !getPlayoffWinnerTeamId(m))
        .length
      : 0;

    const canGenerateNext = !!nextStage && stageIsComplete(nextStage.prev) && prevMissingWinners === 0;

    const finalId = Array.isArray(rounds.final) ? rounds.final[0] : null;
    const thirdId = Array.isArray(rounds.thirdPlace) ? rounds.thirdPlace[0] : null;
    const finalMatch = finalId ? matchById.get(finalId) : null;
    const thirdMatch = thirdId ? matchById.get(thirdId) : null;
    const finalWinner = (finalMatch?.status === 'completed') ? getPlayoffWinnerTeamId(finalMatch) : null;
    const finalLoser = (finalMatch?.status === 'completed') ? getPlayoffLoserTeamId(finalMatch) : null;
    const thirdWinner = (thirdMatch?.status === 'completed') ? getPlayoffWinnerTeamId(thirdMatch) : null;
    const canAwardPrizes = !playoffs.prizesAwardedAt && finalWinner && finalLoser && thirdWinner;
    const awardLabel = playoffs.prizesAwardedAt ? 'Prizes Awarded' : 'Award Glittering Prizes';

    const actionRow = `
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:flex-end; margin-bottom:0.75rem;">
        ${nextStage ? `<button class="primary-btn" id="poGenNextBtn" ${canGenerateNext && key ? '' : 'disabled'}>Generate ${escapeHtml(getPlayoffStageLabel(nextStage.next))}</button>` : ''}
        <button class="secondary-btn" id="poAwardBtn" ${(canAwardPrizes && key) ? '' : 'disabled'}>${escapeHtml(awardLabel)}</button>
        <button class="danger-btn" id="poResetBtn" ${key ? '' : 'disabled'}>Reset Play-offs</button>
      </div>
      ${!key ? `<div class="small" style="color:#b00020; margin-bottom:0.75rem;">Enter your Edit Key to make changes.</div>` : ''}
      ${nextStage && stageIsComplete(nextStage.prev) && prevMissingWinners ? `<div class="small" style="color:#b00020; margin-bottom:0.75rem;">${prevMissingWinners} match(es) need a recorded winner before advancing.</div>` : ''}
      ${playoffs.prizesAwardedAt ? `<div class="small" style="color:#2e7d32; margin-bottom:0.75rem;">Glittering Prizes awarded.</div>` : ''}
    `;

    const renderMatchRow = (m) => {
      const homeName = league.teams.find(t => t.id === m.homeTeamId)?.name || m.homeTeamId;
      const awayName = league.teams.find(t => t.id === m.awayTeamId)?.name || m.awayTeamId;
      const score = (m.status === 'completed' && m.score) ? `${m.score.home}-${m.score.away}` : '';
      const winnerId = getPlayoffWinnerTeamId(m);
      const winnerName = winnerId ? (league.teams.find(t => t.id === winnerId)?.name || winnerId) : null;

      const isTie = (m.status === 'completed') && (Number(m.score?.home) === Number(m.score?.away));
      const needsWinner = isTie && !m.winnerTeamId;

      let actions = '';
      if (m.status === 'scheduled') {
        actions = `<button class="link-button" data-action="start" data-match="${m.id}" style="color:green; font-weight:bold">Start</button>`;
      } else if (m.status === 'in_progress') {
        actions = `<button class="link-button" data-action="view" data-match="${m.id}" style="font-weight:bold">View Board</button>`;
      } else if (m.status === 'completed') {
        actions = (m.reportId || m.hasReport)
          ? `<button class="link-button" data-action="report" data-match="${m.id}" style="font-weight:bold">View Report</button>`
          : `<span class="tag completed">Final</span>`;
      }

      if (needsWinner) {
        actions += ` <button class="secondary-btn" data-action="winner" data-match="${m.id}">Set Winner</button>`;
      }

      return `
        <tr>
          <td data-label="Round">${m.round ?? '-'}</td>
          <td data-label="Home">${escapeHtml(homeName)}</td>
          <td data-label="Away">${escapeHtml(awayName)}</td>
          <td data-label="Score">${escapeHtml(score)}</td>
          <td data-label="Winner">${winnerName ? escapeHtml(winnerName) : (m.status === 'completed' ? '<span class="small" style="color:#b00020;">TBD</span>' : '<span class="small" style="color:#666;">—</span>')}</td>
          <td data-label="Status">${actions}</td>
        </tr>
      `;
    };

    const stageBlocks = stageOrder.map(stage => {
      const ids = Array.isArray(rounds[stage]) ? rounds[stage] : [];
      const matches = ids.map(id => matchById.get(id)).filter(Boolean);
      return `
        <div class="panel-styled" style="margin-bottom:0.75rem;">
          <h4 style="margin-top:0;">${escapeHtml(getPlayoffStageLabel(stage))}</h4>
          ${matches.length ? `
            <div class="table-scroll">
              <table class="responsive-table">
                <thead><tr><th>Rd</th><th>Home</th><th>Away</th><th>Score</th><th>Winner</th><th>Status</th></tr></thead>
                <tbody>${matches.map(renderMatchRow).join('')}</tbody>
              </table>
            </div>
          ` : `<div class="small" style="color:#666;">Not scheduled yet.</div>`}
        </div>
      `;
    }).join('');

    body.innerHTML = `
      <div class="league-subheading">Season ${season} play-offs</div>
      <div class="small" style="color:#666; text-align:center; margin-bottom:0.75rem;">Bracket: ${playoffs.bracketSize} teams • ${escapeHtml(playoffs.status || 'in_progress')}</div>
      ${actionRow}
      ${stageBlocks}
    `;

    const resetBtn = body.querySelector('#poResetBtn');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        const editKey = getEditKey();
        if (!editKey) return setStatus('Edit key required.', 'error');
        const ok = await confirmModal('Reset play-offs?', 'This will remove all play-off fixtures from the league. Match report files (if any) may remain as orphans.', 'Reset', true);
        if (!ok) return;

        try {
          const toRemove = (league.matches || [])
            .filter(m => (m.season ?? 1) === season)
            .filter(m => String(m.type || 'regular') === 'playoff');

          league.matches = (league.matches || [])
            .filter(m => !(toRemove.includes(m)));

          delete league.playoffs;
          league.status = 'active';

          await saveLeagueAndIndex(league, editKey, `Reset play-offs (S${season})`);
          setStatus('Play-offs reset.', 'ok');
          renderLeagueView();
          render();
        } catch (e) {
          setStatus(`Reset failed: ${e.message}`, 'error');
        }
      };
    }

    const genBtn = body.querySelector('#poGenNextBtn');
    if (genBtn) {
      genBtn.onclick = async () => {
        const editKey = getEditKey();
        if (!editKey) return setStatus('Edit key required.', 'error');
        try {
          await generateNextRound(editKey);
          setStatus('Next round scheduled.', 'ok');
          renderLeagueView();
          render();
        } catch (e) {
          setStatus(`Advance failed: ${e.message}`, 'error');
        }
      };
    }

    const awardBtn = body.querySelector('#poAwardBtn');
    if (awardBtn) {
      awardBtn.onclick = async () => {
        const editKey = getEditKey();
        if (!editKey) return setStatus('Edit key required.', 'error');
        try {
          await awardGlitteringPrizes(editKey);
          setStatus('Glittering Prizes awarded.', 'ok');
          renderLeagueView();
          render();
        } catch (e) {
          setStatus(`Award failed: ${e.message}`, 'error');
        }
      };
    }

    body.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const action = btn.getAttribute('data-action');
        const matchId = btn.getAttribute('data-match');
        if (!action || !matchId) return;

        if (action === 'start') return window.handleStartMatch(matchId);
        if (action === 'view') return window.handleOpenScoreboard(matchId);
        if (action === 'report') return window.handleViewMatchReport(matchId);

        if (action === 'winner') {
          const editKey = getEditKey();
          if (!editKey) return setStatus('Edit key required.', 'error');

          const match = (state.currentLeague?.matches || []).find(m => m.id === matchId);
          if (!match) return setStatus('Match not found.', 'error');

          const homeName = league.teams.find(t => t.id === match.homeTeamId)?.name || match.homeTeamId;
          const awayName = league.teams.find(t => t.id === match.awayTeamId)?.name || match.awayTeamId;
          const picked = await pickWinnerModal({ title: 'Set play-off winner', homeLabel: homeName, awayLabel: awayName });
          if (!picked) return;

          match.winnerTeamId = (picked === 'home') ? match.homeTeamId : match.awayTeamId;
          await saveLeagueAndIndex(state.currentLeague, editKey, `Set play-off winner ${matchId}`);

          renderLeagueView();
          render();
        }
      });
    });
  };

  const generateNextRound = async (key) => {
    const league = state.currentLeague;
    const season = Number(league.season || 1);
    const playoffs = (league.playoffs && league.playoffs.season === season) ? league.playoffs : null;
    if (!playoffs) throw new Error('No play-offs found.');

    const matchById = new Map((league.matches || []).map(m => [m.id, m]));
    const stageOrder = Array.isArray(playoffs.stageOrder) ? playoffs.stageOrder : getPlayoffStageOrder(playoffs.bracketSize);
    const baseStages = stageOrder.filter(s => s !== 'thirdPlace');
    const rounds = playoffs.rounds || {};
    const stageRounds = playoffs.stageRounds || {};

    let nextStage = null;
    let prevStage = null;
    for (let idx = 1; idx < baseStages.length; idx++) {
      const s = baseStages[idx];
      const ids = Array.isArray(rounds[s]) ? rounds[s] : [];
      if (!ids.length) {
        nextStage = s;
        prevStage = baseStages[idx - 1];
        break;
      }
    }

    if (!nextStage || !prevStage) throw new Error('No further rounds to generate.');

    const prevIds = Array.isArray(rounds[prevStage]) ? rounds[prevStage] : [];
    if (!prevIds.length) throw new Error('Previous round is missing matches.');

    const prevMatches = prevIds.map(id => matchById.get(id)).filter(Boolean);
    const notDone = prevMatches.filter(m => m.status !== 'completed').length;
    if (notDone) throw new Error('Previous round is not complete.');

    const winners = [];
    const losers = [];
    prevMatches.forEach(m => {
      const w = getPlayoffWinnerTeamId(m);
      if (!w) throw new Error('A previous match is missing a winner (likely a tie).');
      winners.push(w);
      if (nextStage === 'final') {
        const loser = getPlayoffLoserTeamId(m);
        if (!loser) throw new Error('Could not determine loser for a semi-final.');
        losers.push(loser);
      }
    });

    const today = new Date().toISOString().split('T')[0];
    const makeMatch = (homeTeamId, awayTeamId, stage, round) => {
      const id = ulid();
      league.matches.push({
        id,
        season,
        round,
        homeTeamId,
        awayTeamId,
        status: 'scheduled',
        date: today,
        type: 'playoff',
        playoff: { stage, bracketSize: playoffs.bracketSize }
      });
      return id;
    };

    rounds[nextStage] = [];

    if (nextStage === 'final') {
      const finalRound = Number(stageRounds.final) || Math.max(0, ...prevMatches.map(m => Number(m.round) || 0)) + 1;
      const finalId = makeMatch(winners[0], winners[1], 'final', finalRound);
      rounds.final = [finalId];

      if (stageOrder.includes('thirdPlace')) {
        const thirdId = makeMatch(losers[0], losers[1], 'thirdPlace', finalRound);
        rounds.thirdPlace = [thirdId];
      }
    } else {
      const roundNumber = Number(stageRounds[nextStage]) || (Math.max(0, ...prevMatches.map(m => Number(m.round) || 0)) + 1);
      for (let i = 0; i < winners.length; i += 2) {
        const id = makeMatch(winners[i], winners[i + 1], nextStage, roundNumber);
        rounds[nextStage].push(id);
      }
    }

    playoffs.rounds = rounds;
    playoffs.status = 'in_progress';

    await saveLeagueAndIndex(league, key, `Schedule play-off round ${nextStage} (S${season})`);
  };

  const awardGlitteringPrizes = async (key) => {
    const league = state.currentLeague;
    const season = Number(league?.season || 1);
    const playoffs = (league?.playoffs && league.playoffs.season === season) ? league.playoffs : null;
    if (!playoffs) throw new Error('No play-offs found.');
    if (playoffs.prizesAwardedAt) throw new Error('Prizes already awarded.');

    const matchById = new Map((league.matches || []).map(m => [m.id, m]));
    const finalId = Array.isArray(playoffs.rounds?.final) ? playoffs.rounds.final[0] : null;
    const thirdId = Array.isArray(playoffs.rounds?.thirdPlace) ? playoffs.rounds.thirdPlace[0] : null;
    const finalMatch = finalId ? matchById.get(finalId) : null;
    const thirdMatch = thirdId ? matchById.get(thirdId) : null;

    if (!finalMatch || finalMatch.status !== 'completed') throw new Error('Final is not complete.');
    if (!thirdMatch || thirdMatch.status !== 'completed') throw new Error('Third-place match is not complete.');

    const firstTeamId = getPlayoffWinnerTeamId(finalMatch);
    const secondTeamId = getPlayoffLoserTeamId(finalMatch);
    const thirdTeamId = getPlayoffWinnerTeamId(thirdMatch);
    if (!firstTeamId || !secondTeamId || !thirdTeamId) throw new Error('Missing winner/loser info for prizes.');

    const firstName = league.teams.find(t => t.id === firstTeamId)?.name || firstTeamId;
    const secondName = league.teams.find(t => t.id === secondTeamId)?.name || secondTeamId;
    const thirdName = league.teams.find(t => t.id === thirdTeamId)?.name || thirdTeamId;

    const msg = `
      <div style="text-align:left">
        <div style="margin-bottom:0.5rem;">Award Glittering Prizes for Season ${season}?</div>
        <ul style="margin:0; padding-left:1.2rem;">
          <li><strong>1st:</strong> ${escapeHtml(firstName)} (+100k, League Trophy)</li>
          <li><strong>2nd:</strong> ${escapeHtml(secondName)} (+60k)</li>
          <li><strong>3rd:</strong> ${escapeHtml(thirdName)} (+30k)</li>
        </ul>
        <div class="small" style="margin-top:0.75rem; color:#666;">These winnings are awarded after the final Post-game Sequence (not subject to Expensive Mistakes).</div>
      </div>
    `;

    const ok = await confirmModal('Award Glittering Prizes?', msg, 'Award', true, true);
    if (!ok) return;

    const teamIds = (league.teams || []).map(t => t.id).filter(Boolean);
    const teamFiles = new Map();
    for (const teamId of teamIds) {
      const team = await apiGet(PATHS.team(league.id, teamId));
      if (!team) throw new Error(`Team file not found: ${teamId}`);
      teamFiles.set(teamId, team);
    }

    const at = new Date().toISOString();

    const addTx = (team, label, deltaTreasuryGp, deltaTvGp = null) => {
      team.transactions = Array.isArray(team.transactions) ? team.transactions : [];
      team.transactions.push({
        id: ulid(),
        at,
        type: 'league',
        label,
        delta: {
          treasuryGp: deltaTreasuryGp,
          tvGp: deltaTvGp ?? undefined
        }
      });
    };

    for (const team of teamFiles.values()) {
      if ('trophyRerollSeason' in team) delete team.trophyRerollSeason;
    }

    const prizeMap = new Map([
      [firstTeamId, 100000],
      [secondTeamId, 60000],
      [thirdTeamId, 30000]
    ]);

    for (const [teamId, prizeGp] of prizeMap.entries()) {
      const team = teamFiles.get(teamId);
      if (!team) continue;
      team.treasury = Number(team.treasury || 0) + Number(prizeGp || 0);
      const label = (teamId === firstTeamId)
        ? `Glittering Prize: 1st place (+100k)`
        : (teamId === secondTeamId)
          ? `Glittering Prize: 2nd place (+60k)`
          : `Glittering Prize: 3rd place (+30k)`;
      addTx(team, label, prizeGp);
    }

    const champion = teamFiles.get(firstTeamId);
    if (champion) {
      champion.trophyRerollSeason = season + 1;
      const race = state.gameData?.races?.find(r => r.name === champion.race);
      const rrCost = Number(race?.rerollCost || 50000);
      addTx(champion, `League Trophy: +1 Team Re-roll for Season ${season + 1}`, 0, rrCost);
    }

    for (const [teamId, team] of teamFiles.entries()) {
      await apiSave(PATHS.team(league.id, teamId), team, `Glittering Prizes (S${season})`, key);
    }

    playoffs.placements = { firstTeamId, secondTeamId, thirdTeamId };
    playoffs.prizesAwardedAt = at;
    playoffs.status = 'completed';
    league.status = 'offseason';

    await saveLeagueAndIndex(league, key, `Award Glittering Prizes (S${season})`);
  };

  render();
}

export async function beginOffseason() {
  const l = state.currentLeague;
  if (!l) return;

  const key = getEditKey();
  if (!key) return setStatus('Edit key required', 'error');

  const season = Number(l.season || 1);
  const msg = `
    <div style="text-align:left">
      <div style="margin-bottom:0.5rem;">Begin the Off-season for Season ${season}?</div>
      <div class="small" style="color:#666;">This enables Re-drafting on team pages and prepares for Season ${season + 1}.</div>
    </div>
  `;

  const ok = await confirmModal('Begin Off-season?', msg, 'Begin', false, true);
  if (!ok) return;

  try {
    l.status = 'offseason';
    l.offseason = { season, startedAt: new Date().toISOString() };
    await saveLeagueAndIndex(l, key, `Begin off-season (S${season})`);
    setStatus('Off-season started.', 'ok');
    renderLeagueView();
  } catch (e) {
    setStatus(`Failed to begin off-season: ${e.message}`, 'error');
  }
}

export async function startNextSeason() {
  const l = state.currentLeague;
  if (!l) return;

  const key = getEditKey();
  if (!key) return setStatus('Edit key required', 'error');

  const fromSeason = Number(l.season || 1);
  const toSeason = fromSeason + 1;

  const warnings = [];
  if (String(l.status || '') !== 'offseason') warnings.push('League status is not "offseason".');
  if (l.playoffs && l.playoffs.season === fromSeason && !l.playoffs.prizesAwardedAt) warnings.push('Play-offs exist but Glittering Prizes are not awarded yet.');

  const teamIds = (l.teams || []).map(t => t.id).filter(Boolean);
  const teamFiles = [];
  const notRedrafted = [];

  for (const teamId of teamIds) {
    const t = await apiGet(PATHS.team(l.id, teamId));
    if (!t) throw new Error(`Team file not found: ${teamId}`);
    teamFiles.push(t);
    if (Number(t.redraft?.toSeason || 0) !== toSeason) {
      notRedrafted.push(t.name || teamId);
    }
  }

  if (notRedrafted.length) warnings.push(`Teams not re-drafted for Season ${toSeason}: ${notRedrafted.join(', ')}`);

  const html = `
    <div style="text-align:left">
      <div style="margin-bottom:0.5rem;">Start Season ${toSeason}?</div>
      ${warnings.length ? `
        <div style="font-weight:800; margin-bottom:0.35rem;">Warnings</div>
        <ul style="margin:0; padding-left:1.2rem;">${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
      ` : `<div class="small" style="color:#666;">All teams appear ready.</div>`}
      <div class="small" style="margin-top:0.75rem; color:#666;">This will advance the league season, clear MNG/TR flags for all teams, and keep match history for prior seasons.</div>
    </div>
  `;

  const ok = await confirmModal('Start new season?', html, `Start Season ${toSeason}`, true, true);
  if (!ok) return;

  try {
    // Archive play-offs (if present for the outgoing season)
    if (l.playoffs && l.playoffs.season === fromSeason) {
      l.playoffsHistory = l.playoffsHistory || {};
      l.playoffsHistory[String(fromSeason)] = l.playoffs;
      delete l.playoffs;
    }

    l.season = toSeason;
    l.status = 'active';
    l.offseason = { ...(l.offseason || {}), endedAt: new Date().toISOString(), nextSeason: toSeason };

    // Clear seasonal availability flags
    for (const t of teamFiles) {
      (t.players || []).forEach(p => {
        if (p.mng) p.mng = false;
        if (p.tr) p.tr = false;
      });
      await apiSave(PATHS.team(l.id, t.id), t, `Start Season ${toSeason} cleanup`, key);
    }

    await saveLeagueAndIndex(l, key, `Start Season ${toSeason}`);

    state.leagueTeamsCache = null;
    state.leagueStatsCache = null;
    state.leagueTeamsCacheForLeagueId = null;

    setStatus(`Season ${toSeason} started.`, 'ok');
    renderLeagueView();
  } catch (e) {
    setStatus(`Failed to start season: ${e.message}`, 'error');
  }
}

export function renderLeagueView() {
  const l = state.currentLeague;
  if (!l) return;
  const viewSeason = getLeagueViewSeason(l);
  
  document.getElementById('leagueHeader').innerHTML = `<h2>${l.name}</h2><div class="small">Season ${l.season} (${l.status})</div>`;
  document.getElementById('leagueTeamsSection').className = 'panel-styled';
  document.getElementById('leagueMatchesSection').className = 'panel-styled';

  const matchesHeading = document.querySelector('#leagueMatchesSection h3');
  if (matchesHeading) matchesHeading.textContent = `Matches (Season ${viewSeason})`;
  const isCurrentSeason = viewSeason === Number(l.season || 1);
  const schedBtn = document.getElementById('desktopSchedBtn');
  if (schedBtn) {
    schedBtn.disabled = !isCurrentSeason;
    schedBtn.title = isCurrentSeason ? '' : 'Switch to the current season to schedule matches.';
  }
  const mobileBtn = document.getElementById('mobileAddMatchBtn');
  if (mobileBtn) mobileBtn.classList.toggle('hidden', !isCurrentSeason);

  if (!state.leagueTab) state.leagueTab = 'standings';
  renderLeagueTabs();

  const headingEl = els.leagueView?.tabHeading;
  if (headingEl) headingEl.textContent = getTabLabel(state.leagueTab);

  renderLeagueTabTools();
  void renderLeagueTabContent(l);
  renderMatchesList(l, viewSeason);
}

let leagueTabLoadToken = 0;
async function renderLeagueTabContent(league) {
  const token = ++leagueTabLoadToken;

  if (state.leagueTab === 'season') {
    renderSeasonTab(league);
    return;
  }

  if (state.leagueTab === 'standings') {
    renderStandingsTab(league);
    return;
  }

  try {
    const cachedTeams = (state.leagueTeamsCache && state.leagueTeamsCacheForLeagueId === league.id)
      ? state.leagueTeamsCache
      : null;

    if (!cachedTeams) {
      els.containers.standings.innerHTML = `<div class="small" style="color:#666;">Loading...</div>`;
    }

    const teamFiles = cachedTeams || await ensureLeagueTeamsLoaded(league);
    if (token !== leagueTabLoadToken) return;

    if (state.leagueTab === 'leaders') {
      renderLeadersTab(league, teamFiles);
      return;
    }
    if (state.leagueTab === 'teamStats') {
      renderTeamStatsTab(league, teamFiles);
      return;
    }
    if (state.leagueTab === 'playerStats') {
      renderPlayerStatsTab(league, teamFiles);
      return;
    }

    els.containers.standings.innerHTML = `<div class="small" style="color:#666;">Not implemented.</div>`;
  } catch (e) {
    els.containers.standings.innerHTML = `<div class="small" style="color:#b00020;">Failed to load stats: ${e.message}</div>`;
  }
}

function getLeaguePhaseLabel(status) {
  const s = String(status || 'active');
  if (s === 'upcoming') return 'Upcoming';
  if (s === 'playoffs') return 'Play-offs';
  if (s === 'offseason') return 'Off-season';
  if (s === 'completed') return 'Completed';
  return 'Regular Season';
}

function renderSeasonTab(league) {
  const season = getLeagueViewSeason(league);
  const status = String(league?.status || 'active');
  const isCurrentSeason = season === Number(league?.season || 1);
  const phaseLabel = isCurrentSeason ? getLeaguePhaseLabel(status) : 'Archived';

  const matches = Array.isArray(league?.matches) ? league.matches : [];
  const seasonMatches = matches.filter(m => (m.season ?? 1) === season);
  const regularMatches = seasonMatches.filter(m => String(m.type || 'regular') !== 'playoff');
  const playoffMatches = seasonMatches.filter(m => String(m.type || 'regular') === 'playoff');
  const regularComplete = regularMatches.length ? regularMatches.every(m => m.status === 'completed') : false;
  const playoffComplete = playoffMatches.length ? playoffMatches.every(m => m.status === 'completed') : false;

  const playoffs = ((league?.playoffs && league.playoffs.season === season) ? league.playoffs : null)
    || (league?.playoffsHistory?.[String(season)] || league?.playoffsHistory?.[season] || null);
  const hasBracket = !!playoffs?.bracketSize;
  const prizesAwarded = !!playoffs?.prizesAwardedAt;

  const summary = `
    <div class="panel-styled" style="margin-bottom:0.75rem;">
      <div class="league-subheading">Season ${season} (${phaseLabel})</div>
      <div class="small" style="color:#666; text-align:center;">
        Regular: ${regularMatches.length ? (regularComplete ? 'complete' : 'in progress') : 'no fixtures'} •
        Play-offs: ${playoffMatches.length ? (playoffComplete ? 'complete' : 'in progress') : 'not started'}
      </div>
    </div>
  `;

  const playoffsCtaLabel = hasBracket ? 'Manage Play-offs' : 'Start Play-offs';
  const playoffsNote = (!regularComplete && regularMatches.length)
    ? `<div class="small" style="margin-top:0.6rem; color:#b00020;">${regularMatches.filter(m => m.status !== 'completed').length} regular-season match(es) are not completed.</div>`
    : '';

  const teamChipHtml = (teamId) => {
    const tid = String(teamId || '');
    const team = (league.teams || []).find(t => t.id === tid);
    if (!team) return `<span class="tag">${escapeHtml(tid || '-')}</span>`;
    const styleVars = buildTeamStyleVars(team.colors);
    return `<button class="team-chip" style="${styleVars}" onclick="window.handleOpenTeam('${league.id}', '${tid}')">${escapeHtml(team.name || tid)}</button>`;
  };

  const seasonMatchById = new Map(seasonMatches.map(m => [m.id, m]));
  const getPlayoffStageMatches = (stage) => {
    const ids = Array.isArray(playoffs?.rounds?.[stage]) ? playoffs.rounds[stage] : null;
    if (ids) return ids.map(id => seasonMatchById.get(id)).filter(Boolean);
    return playoffMatches.filter(m => String(m.playoff?.stage || '') === String(stage || ''));
  };

  const derivedPlacements = (() => {
    const p = playoffs?.placements;
    if (p?.firstTeamId && p?.secondTeamId && p?.thirdTeamId) return p;

    const finalMatch = getPlayoffStageMatches('final')[0] || null;
    const thirdMatch = getPlayoffStageMatches('thirdPlace')[0] || null;
    const finalWinner = (finalMatch?.status === 'completed') ? getPlayoffWinnerTeamId(finalMatch) : null;
    const finalLoser = (finalMatch?.status === 'completed') ? getPlayoffLoserTeamId(finalMatch) : null;
    const thirdWinner = (thirdMatch?.status === 'completed') ? getPlayoffWinnerTeamId(thirdMatch) : null;
    if (finalWinner && finalLoser && thirdWinner) return { firstTeamId: finalWinner, secondTeamId: finalLoser, thirdTeamId: thirdWinner };
    return null;
  })();

  const placementsHtml = (hasBracket && derivedPlacements)
    ? `
      <div class="panel-styled" style="margin-top:0.5rem; padding:0.65rem;">
        <div class="small" style="font-weight:800; text-transform:uppercase; color:#333; margin-bottom:0.4rem;">Results</div>
        <div style="display:grid; gap:0.35rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem;"><div><strong>Champion</strong></div><div>${teamChipHtml(derivedPlacements.firstTeamId)}</div></div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem;"><div><strong>Runner-up</strong></div><div>${teamChipHtml(derivedPlacements.secondTeamId)}</div></div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem;"><div><strong>Third</strong></div><div>${teamChipHtml(derivedPlacements.thirdTeamId)}</div></div>
        </div>
      </div>
    `
    : '';

  const fixturesHtml = (hasBracket && playoffMatches.length)
    ? (() => {
      const stageOrder = Array.isArray(playoffs?.stageOrder) ? playoffs.stageOrder : getPlayoffStageOrder(playoffs?.bracketSize);
      const stageRows = [];

      const pushMatchRow = (stage, match) => {
        if (!match) return;
        const score = (match.status === 'completed') ? `${Number(match.score?.home ?? 0)}-${Number(match.score?.away ?? 0)}` : '-';
        const winnerTeamId = (match.status === 'completed') ? getPlayoffWinnerTeamId(match) : null;
        stageRows.push(`
          <tr>
            <td>${escapeHtml(getPlayoffStageLabel(stage))}</td>
            <td>${teamChipHtml(match.homeTeamId)} vs ${teamChipHtml(match.awayTeamId)}</td>
            <td style="text-align:center; font-family:Consolas, monospace;">${escapeHtml(score)}</td>
            <td>${winnerTeamId ? teamChipHtml(winnerTeamId) : `<span class="small" style="color:#666;">${escapeHtml(match.status || '-')}</span>`}</td>
          </tr>
        `);
      };

      if (stageOrder.length && playoffs?.rounds) {
        stageOrder.forEach(stage => {
          getPlayoffStageMatches(stage).forEach(m => pushMatchRow(stage, m));
        });
      } else {
        playoffMatches
          .slice()
          .sort((a, b) => (Number(a.round) || 0) - (Number(b.round) || 0))
          .forEach(m => pushMatchRow(m.playoff?.stage || 'playoff', m));
      }

      if (!stageRows.length) return '';

      return `
        <details style="margin-top:0.5rem;">
          <summary style="cursor:pointer; font-weight:800;">Play-off fixtures</summary>
          <div class="table-scroll" style="margin-top:0.5rem;">
            <table class="league-table standings-table">
              <thead>
                <tr><th>Stage</th><th>Match</th><th>Score</th><th>Winner</th></tr>
              </thead>
              <tbody>${stageRows.join('')}</tbody>
            </table>
          </div>
        </details>
      `;
    })()
    : '';

  const playoffsCard = `
    <div class="panel-styled" style="margin-bottom:0.75rem;">
      <h4 style="margin-top:0;">Play-offs</h4>
      ${hasBracket ? `
        <div class="small" style="color:#666; margin-bottom:0.5rem;">Bracket: ${playoffs.bracketSize} teams • ${playoffs.status || 'in_progress'}${prizesAwarded ? ' • prizes awarded' : ''}</div>
      ` : `<div class="small" style="color:#666; margin-bottom:0.5rem;">No play-offs configured for this season.</div>`}
      ${placementsHtml}
      ${fixturesHtml}
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:flex-end;">
        ${isCurrentSeason ? `<button class="${hasBracket ? 'secondary-btn' : 'primary-btn'}" onclick="window.openPlayoffsManager()">${playoffsCtaLabel}</button>` : ''}
      </div>
      ${playoffsNote}
    </div>
  `;

  const offseasonCard = `
    <div class="panel-styled">
      <h4 style="margin-top:0;">Off-season & Re-drafting</h4>
      <div class="small" style="color:#666; margin-bottom:0.5rem;">
        Use this after play-offs conclude to run Re-draft Budgets and prepare for Season ${season + 1}.
      </div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:flex-end;">
        <button class="secondary-btn" onclick="window.beginOffseason()">Begin Off-season</button>
        <button class="primary-btn" onclick="window.startNextSeason()">Start Season ${season + 1}</button>
      </div>
    </div>
  `;

  els.containers.standings.innerHTML = isCurrentSeason ? (summary + playoffsCard + offseasonCard) : (summary + playoffsCard);
}

function renderStandingsTab(league) {
  const season = getLeagueViewSeason(league);
  const standings = computeSeasonStats(league, season);
  els.containers.standings.innerHTML = `
    <div class="league-subheading">Season ${season} standings</div>
    <div class="table-scroll">
      <table class="league-table standings-table">
        <thead>
          <tr>
            <th>#</th><th>Team</th><th>GP</th><th>W-D-L</th><th>Pts</th><th>TD F/A</th><th>CAS F/A</th>
          </tr>
        </thead>
        <tbody>${standings.map((s, i) => {
          const styleVars = buildTeamStyleVars(getLeagueTeamColors(league, s.id));
          return `
            <tr class="league-row" style="${styleVars}">
              <td>${i + 1}</td>
              <td><button class="team-chip" style="${styleVars}" onclick="window.handleOpenTeam('${league.id}', '${s.id}')">${s.name}</button></td>
              <td>${s.games}</td>
              <td>${s.wins}-${s.draws}-${s.losses}</td>
              <td>${s.points}</td>
              <td>${s.tdFor}/${s.tdAgainst} (${s.tdDiff >= 0 ? '+' : ''}${s.tdDiff})</td>
              <td>${s.casFor}/${s.casAgainst} (${s.casDiff >= 0 ? '+' : ''}${s.casDiff})</td>
            </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function ensureLeagueTeamsLoaded(league) {
  if (state.leagueTeamsCache && state.leagueTeamsCacheForLeagueId === league.id) return state.leagueTeamsCache;

  const teamIds = (league.teams || []).map(t => t.id).filter(Boolean);
  const entries = await Promise.all(teamIds.map(async (teamId) => {
    const team = await apiGet(PATHS.team(league.id, teamId));
    return [teamId, team];
  }));

  const map = new Map(entries.filter(([, t]) => t));
  state.leagueTeamsCache = map;
  state.leagueTeamsCacheForLeagueId = league.id;
  state.leagueStatsCache = null;
  return map;
}

function getSeasonPlayerStats(league, teamFiles, season) {
  const key = `${league.id}:${season}`;
  const cached = state.leagueStatsCache;
  if (cached?.key === key && Array.isArray(cached.players)) return cached.players;

  const players = aggregatePlayerStats(collectSeasonPlayerRows(teamFiles, season));
  state.leagueStatsCache = { key, players };
  return players;
}

function renderLeadersTab(league, teamFiles) {
  const season = getLeagueViewSeason(league);
  const players = getSeasonPlayerStats(league, teamFiles, season);

  const top = (key, n = 5) =>
    players
      .filter(p => (p[key] || 0) > 0)
      .sort((a, b) => (b[key] || 0) - (a[key] || 0))
      .slice(0, n);

  const teamStyle = (teamId) => {
    const team = teamFiles.get(teamId);
    return buildTeamStyleVars(team?.colors || getLeagueTeamColors(league, teamId));
  };

  const renderStatBlock = (label, key) => {
    const list = top(key);
    return `
      <div class="leader-block">
        <div class="leader-block-title">${label}</div>
        ${list.length ? `
          <div class="leader-list">
            ${list.map((p, idx) => {
              const styleVars = teamStyle(p.teamId);
              return `
                <div class="leader-item league-row" style="${styleVars}">
                  <div class="leader-rank">${idx + 1}</div>
                  <div class="leader-player">${p.number ? `#${p.number} ` : ''}${p.name}</div>
                  <div class="leader-meta">
                    <button class="team-chip" style="${styleVars}" onclick="window.handleOpenTeam('${league.id}', '${p.teamId}')">${p.teamName}</button>
                    <div class="leader-value">${p[key] || 0}</div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        ` : `<div class="small" style="color:#666;">No data yet.</div>`}
      </div>`;
  };

  const outPlayers = [];
  for (const [teamId, team] of teamFiles.entries()) {
    for (const p of (team?.players || [])) {
      if (!p?.mng && !p?.tr) continue;
      outPlayers.push({
        teamId,
        teamName: team?.name || (league?.teams || []).find(t => t.id === teamId)?.name || 'Unknown Team',
        number: p.number,
        name: p.name || 'Unknown',
        position: p.position || '',
        mng: !!p.mng,
        tr: !!p.tr
      });
    }
  }

  outPlayers.sort((a, b) =>
    String(a.teamName).localeCompare(String(b.teamName))
    || (Number(a.number) || 0) - (Number(b.number) || 0)
    || String(a.name).localeCompare(String(b.name))
  );

  const renderInjuriesBlock = () => `
    <div class="leader-block">
      <div class="leader-block-title">Injuries / Retired</div>
      ${outPlayers.length ? `
        <div class="leader-list">
          ${outPlayers.map(p => {
            const styleVars = teamStyle(p.teamId);
            const status = [p.mng ? 'MNG' : null, p.tr ? 'TR' : null].filter(Boolean).join('/');
            return `
              <div class="leader-item league-row" style="${styleVars}">
                <div class="leader-rank">${status}</div>
                <div class="leader-player">
                  <div>${p.number ? `#${p.number} ` : ''}${p.name}</div>
                  ${p.position ? `<div class="small" style="color:#666;">${p.position}</div>` : ''}
                </div>
                <div class="leader-meta">
                  <button class="team-chip" style="${styleVars}" onclick="window.handleOpenTeam('${league.id}', '${p.teamId}')">${p.teamName}</button>
                </div>
              </div>`;
          }).join('')}
        </div>
      ` : `<div class="small" style="color:#666;">No players currently out.</div>`}
    </div>
  `;

  els.containers.standings.innerHTML = `
    <div class="league-subheading">Season ${season} leaders</div>
    <div class="leaders-grid">
      ${renderStatBlock('Touchdowns', 'td')}
      ${renderStatBlock('Injuries Inflicted', 'cas')}
      ${renderStatBlock('Interceptions', 'int')}
      ${renderStatBlock('Completions', 'comp')}
      ${renderStatBlock('SPP Gained', 'sppGain')}
      ${renderInjuriesBlock()}
    </div>
  `;
}

function renderTeamStatsTab(league, teamFiles) {
  const season = getLeagueViewSeason(league);
  const standings = computeSeasonStats(league, season);
  const tvK = (team) => {
    const tv = Number(team?.teamValue);
    return Number.isFinite(tv) && tv > 0 ? `${Math.round(tv / 1000)}k` : '-';
  };
  const seasonTvK = (team) => {
    if (!team) return '-';
    const history = Array.isArray(team.history) ? team.history : [];
    const entries = history.filter(h => (h.season ?? 1) === season);
    if (!entries.length) return tvK(team);
    const last = entries.reduce(
      (best, cur) => (Number(cur?.round) || 0) > (Number(best?.round) || 0) ? cur : best,
      entries[0]
    );
    const tv = Number(last?.tv);
    return Number.isFinite(tv) && tv > 0 ? `${Math.round(tv / 1000)}k` : tvK(team);
  };

  els.containers.standings.innerHTML = `
    <div class="league-subheading">Season ${season} team stats</div>
    <div class="table-scroll">
      <table class="league-table team-stats-table">
        <thead>
          <tr>
            <th>Team</th><th>Coach</th><th>GP</th><th>W-D-L</th><th>Pts</th><th>TD +/-</th><th>CAS +/-</th><th>TV</th>
          </tr>
        </thead>
        <tbody>
          ${standings.map(s => {
            const team = teamFiles.get(s.id);
            const styleVars = buildTeamStyleVars(team?.colors || getLeagueTeamColors(league, s.id));
            return `
              <tr class="league-row" style="${styleVars}">
                <td><button class="team-chip" style="${styleVars}" onclick="window.handleOpenTeam('${league.id}', '${s.id}')">${s.name}</button></td>
                <td>${s.coachName || '-'}</td>
                <td>${s.games}</td>
                <td>${s.wins}-${s.draws}-${s.losses}</td>
                <td>${s.points}</td>
                <td>${s.tdDiff >= 0 ? '+' : ''}${s.tdDiff}</td>
                <td>${s.casDiff >= 0 ? '+' : ''}${s.casDiff}</td>
                <td>${seasonTvK(team)}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderPlayerStatsTab(league, teamFiles) {
  const season = getLeagueViewSeason(league);
  const q = (state.leaguePlayerSearch || '').trim().toLowerCase();
  let players = [...getSeasonPlayerStats(league, teamFiles, season)];

  if (q) {
    players = players.filter(p =>
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.position || '').toLowerCase().includes(q) ||
      String(p.teamName || '').toLowerCase().includes(q) ||
      String(p.number || '').includes(q)
    );
  }

  const sortKey = PLAYER_SORTABLE_KEYS.has(state.leaguePlayerSortKey) ? state.leaguePlayerSortKey : 'sppGain';
  const dir = (state.leaguePlayerSortDir === 'asc') ? 1 : -1;
  const stringKeys = new Set(['name', 'teamName']);

  players.sort((a, b) => {
    const av = a?.[sortKey];
    const bv = b?.[sortKey];

    let cmp = 0;
    if (stringKeys.has(sortKey)) {
      cmp = String(av || '').localeCompare(String(bv || ''), undefined, { sensitivity: 'base' });
    } else {
      cmp = (Number(av) || 0) - (Number(bv) || 0);
    }

    if (cmp) return cmp * dir;

    const sppCmp = (b.sppGain - a.sppGain);
    if (sppCmp) return sppCmp;
    const tdCmp = (b.td - a.td);
    if (tdCmp) return tdCmp;
    const casCmp = (b.cas - a.cas);
    if (casCmp) return casCmp;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  });

  const sortIndicator = (key) => {
    if (sortKey !== key) return '';
    return (dir === 1) ? ' ^' : ' v';
  };

  const sortableTh = (label, key) =>
    `<th class="sortable" onclick="window.setLeaguePlayerSort('${key}')">${label}${sortIndicator(key)}</th>`;

  els.containers.standings.innerHTML = `
    <div class="league-subheading">Season ${season} player stats</div>
    ${players.length ? `
      <div class="table-scroll">
        <table class="league-table player-stats-table">
          <thead>
            <tr>
              ${sortableTh('Player', 'name')}
              ${sortableTh('Team', 'teamName')}
              ${sortableTh('GP', 'games')}
              ${sortableTh('TD', 'td')}
              ${sortableTh('CAS', 'cas')}
              ${sortableTh('INT', 'int')}
              ${sortableTh('COMP', 'comp')}
              ${sortableTh('MVP', 'mvp')}
              ${sortableTh('SPP', 'sppGain')}
            </tr>
          </thead>
          <tbody>
            ${players.map(p => {
              const team = teamFiles.get(p.teamId);
              const styleVars = buildTeamStyleVars(team?.colors || getLeagueTeamColors(league, p.teamId));
              return `
                <tr class="league-row" style="${styleVars}">
                  <td>
                    <div class="player-cell">
                      <div>${p.number ? `#${p.number} ` : ''}${p.name}</div>
                      ${p.position ? `<div class="small" style="color:#666;">${p.position}</div>` : ''}
                    </div>
                  </td>
                  <td><button class="team-chip" style="${styleVars}" onclick="window.handleOpenTeam('${league.id}', '${p.teamId}')">${p.teamName}</button></td>
                  <td>${p.games}</td>
                  <td>${p.td}</td>
                  <td>${p.cas}</td>
                  <td>${p.int}</td>
                  <td>${p.comp}</td>
                  <td>${p.mvp}</td>
                  <td>${p.sppGain}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : `<div class="small" style="color:#666;">No player stats found.</div>`}
  `;
}

export function renderMatchesList(league, seasonOverride = null) {
  if(!league.matches || !league.matches.length) {
    els.containers.matches.innerHTML = '<div class="small">No matches scheduled.</div>';
    return;
  }
  
  const season = Number(seasonOverride || getLeagueViewSeason(league));
  const seasonMatches = league.matches.filter(m => (m.season ?? 1) === season);

  const active = seasonMatches.filter(m => m.status === 'in_progress');
  const others = seasonMatches.filter(m => m.status !== 'in_progress').sort((a,b) => a.round - b.round);

  let inProgHtml = '';
  if (active.length > 0) {
    inProgHtml = '<div class="card"><h4 style="color:#0066cc">Live Matches</h4><ul>' + 
      active.map(m => {
        const h = league.teams.find(t => t.id === m.homeTeamId)?.name || m.homeTeamId;
        const a = league.teams.find(t => t.id === m.awayTeamId)?.name || m.awayTeamId;
        return `<li>Round ${m.round}: ${h} vs ${a} <button class="link-button" onclick="window.handleOpenScoreboard('${m.id}')"><strong>View Board</strong></button></li>`;
      }).join('') + 
    '</ul></div>';
  }
  els.containers.inProgress.innerHTML = inProgHtml;

  const rows = others.map(m => {
    const h = league.teams.find(t => t.id === m.homeTeamId)?.name || m.homeTeamId;
    const a = league.teams.find(t => t.id === m.awayTeamId)?.name || m.awayTeamId;
    const score = m.status === 'completed' ? `${m.score.home}-${m.score.away}` : '';
    
    let action = `<span class="tag ${m.status}">${m.status}</span>`;
    if (m.status === 'scheduled') {
        action = `<button class="link-button" onclick="window.handleStartMatch('${m.id}')" style="color:green; font-weight:bold">Start Match</button>`;
    } else if (m.status === 'completed' && (m.reportId || m.hasReport)) {
        action = `<button class="link-button" onclick="window.handleViewMatchReport('${m.id}')" style="color:#444; font-weight:bold">View Report</button>`;
    } else if (m.status === 'completed') {
        action = `<span class="tag completed">Final</span>`;
    }
    
    return `<tr>
      <td data-label="Round">${m.round}</td>
      <td data-label="Home">${h}</td>
      <td data-label="Away">${a}</td>
      <td data-label="Score">${score}</td>
      <td data-label="Status">${action} <button onclick="window.handleDeleteMatch('${m.id}')" style="margin-left:5px; color:red; border:none; background:none; cursor:pointer;" title="Delete">🗑️</button></td>
    </tr>`;
  }).join('');
  
  const scheduledHeader = active.length > 0 ? '<h4 style="margin-top:2rem; color:#444;">Upcoming & Results</h4>' : '';
  els.containers.matches.innerHTML = `${scheduledHeader}<table class="responsive-table"><thead><tr><th>Rd</th><th>Home</th><th>Away</th><th>Score</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`; 
}

export async function handleViewMatchReport(matchId) {
    const l = state.currentLeague;
    const m = l.matches.find(x => x.id === matchId);
    if (!m) return setStatus("Match not found.", "error");

    const report = await apiGet(PATHS.match(l.id, matchId));
    if (!report) return setStatus("No report data found.", "error");
    
    const homeT = l.teams.find(t => t.id === m.homeTeamId);
    const awayT = l.teams.find(t => t.id === m.awayTeamId);
    const hColor = homeT?.colors?.primary || '#222';
    const aColor = awayT?.colors?.primary || '#222';
    const hText = getContrastColor(hColor);
    const aText = getContrastColor(aColor);

    const renderStatList = (stats) => {
        if(!stats || stats.length === 0) return '<div style="font-style:italic; color:#999">No notable stats.</div>';
        return stats.map(p => {
            const acts = [];
            if(p.live.td) acts.push(`${p.live.td} TD`);
            if(p.live.cas) acts.push(`${p.live.cas} CAS`);
            if(p.live.int) acts.push(`${p.live.int} INT`);
            return `<div><strong>${p.name}</strong>: ${acts.join(', ')}</div>`;
        }).join('');
    };

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '5000';
    
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 700px; width: 95%;">
          <div class="modal-header"><h3>Match Report</h3><button class="close-btn">×</button></div>
          
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; background:#eee; padding:1rem; border-radius:4px;">
             <div style="text-align:center">
                <h2 style="color:${hColor}; margin:0;">${homeT?.name}</h2>
                <div style="font-size:2.5rem; font-weight:bold;">${m.score.home}</div>
             </div>
             <div style="font-weight:bold; color:#666; font-size:1.2rem;">VS</div>
             <div style="text-align:center">
                <h2 style="color:${aColor}; margin:0;">${awayT?.name}</h2>
                <div style="font-size:2.5rem; font-weight:bold;">${m.score.away}</div>
             </div>
          </div>
          
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
             <div class="panel-styled">
                <div style="background:${hColor}; color:${hText}; padding:5px; font-weight:bold; text-align:center; margin:-1rem -1rem 1rem -1rem;">HOME STATS</div>
                <div><strong>MVP:</strong> ${report.home.mvp}</div>
                <div><strong>Winnings:</strong> ${report.home.winnings}k</div>
                <hr>
                ${renderStatList(report.home.stats)}
             </div>
             <div class="panel-styled">
                <div style="background:${aColor}; color:${aText}; padding:5px; font-weight:bold; text-align:center; margin:-1rem -1rem 1rem -1rem;">AWAY STATS</div>
                <div><strong>MVP:</strong> ${report.away.mvp}</div>
                <div><strong>Winnings:</strong> ${report.away.winnings}k</div>
                <hr>
                ${renderStatList(report.away.stats)}
             </div>
          </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    modal.querySelector('.close-btn').onclick = () => modal.remove();
}

export async function handleDeleteMatch(matchId) {
  const confirmed = await confirmModal("Delete Match?", "Permanently delete this match record?", "Delete", true);
  if(!confirmed) return;
  
  const key = els.inputs.editKey.value; if (!key) return setStatus('Edit key required', 'error');
  try {
    const l = state.currentLeague;
    const m = l.matches.find(x => x.id === matchId);
    l.matches = l.matches.filter(x => x.id !== matchId);
    await apiSave(PATHS.league(l.id), l, `Delete match ${matchId}`, key);
    if (m?.status === 'completed') {
      try { await apiDelete(PATHS.match(l.id, matchId), `Delete match report ${matchId}`, key); } catch (e) {}
    }
    renderLeagueView(); setStatus('Match deleted.', 'ok');
  } catch(e) { setStatus(`Delete failed: ${e.message}`, 'error'); }
}

// --- Management ---

export async function handleManageLeague(id) {
  state.editMode = 'league';
  state.editLeagueId = id;
  state.editTeamId = null;
  state.dirtyLeague = null;
  state.editorReturnPath = 'leagueManage';
  
  if (id) {
    try {
      const league = await apiGet(PATHS.league(id));
      if (!league) throw new Error('League file not found.');
      state.dirtyLeague = JSON.parse(JSON.stringify(league));
    } catch (e) { setStatus(e.message, 'error'); return; }
  } else {
    state.dirtyLeague = { 
      schemaVersion: 1,
      id: ulid(),
      slug: '',
      name: '',
      season: 1,
      status: 'upcoming', 
      settings: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, maxTeams: 16, lockTeams: false }, 
      rules: { startingBudget: 1000000 },
      teams: [], matches: [] 
    };
  }
  
  if (!state.dirtyLeague.rules) state.dirtyLeague.rules = { startingBudget: 1000000 };
  if (!Number.isFinite(Number(state.dirtyLeague.rules.startingBudget))) state.dirtyLeague.rules.startingBudget = 1000000;

  renderManageForm();
  showSection('manage');
  updateBreadcrumbs([
    { label: 'Leagues', action: goHome },
    { label: state.dirtyLeague.name || 'New League' },
    { label: 'Manage' }
  ]);
}

export function renderManageForm() {
  const l = state.dirtyLeague;
  const isNewLeague = !state.editLeagueId;
  
  const saveBtn = els.buttons.manageSave;
  const saveReturnBtn = els.buttons.manageSaveReturn;
  if (saveBtn) saveBtn.textContent = (state.editMode === 'team') ? 'Save' : 'Save Changes';
  if (saveReturnBtn) {
    const showReturn = state.editMode === 'team' && state.editorReturnPath === 'leagueManage';
    saveReturnBtn.classList.toggle('hidden', !showReturn);

    if (showReturn) {
      saveReturnBtn.textContent = 'Save & Return';
      saveReturnBtn.classList.add('primary-btn');
      saveBtn?.classList.remove('primary-btn');
      saveBtn?.classList.add('secondary-btn');
    } else {
      saveBtn?.classList.add('primary-btn');
      saveBtn?.classList.remove('secondary-btn');
    }
  }

  els.inputs.leagueId.value = l.id;
  if (isNewLeague) {
    els.inputs.leagueId.readOnly = true;
    els.inputs.leagueId.classList.add('faded');
  } else {
    els.inputs.leagueId.readOnly = true;
    els.inputs.leagueId.classList.remove('faded');
  }
  
  els.inputs.leagueName.value = l.name;
  els.inputs.leagueName.oninput = function() {
    state.dirtyLeague.name = this.value;
    if (isNewLeague) state.dirtyLeague.slug = normalizeName(this.value);
  };
  
  els.inputs.leagueSeason.value = l.season;
  els.inputs.leagueStatus.value = l.status;
  els.inputs.ptsWin.value = l.settings.pointsWin;
  els.inputs.ptsDraw.value = l.settings.pointsDraw;
  els.inputs.ptsLoss.value = l.settings.pointsLoss;
  els.inputs.maxTeams.value = l.settings.maxTeams || 16;
  if (els.inputs.startingBudget) {
    els.inputs.startingBudget.value = l.rules?.startingBudget ?? 1000000;
    els.inputs.startingBudget.oninput = function () {
      l.rules = l.rules || { startingBudget: 1000000 };
      l.rules.startingBudget = parseInt(this.value) || 1000000;
    };
  }
  if(els.inputs.lockTeams) els.inputs.lockTeams.checked = l.settings.lockTeams;

  if (state.editMode === 'team') {
    els.cards.leagueInfo.classList.add('hidden');
    els.cards.leagueTeams.classList.add('hidden');
    els.cards.teamEditor.classList.remove('hidden');
    renderTeamEditor();
  } else {
    els.cards.leagueInfo.classList.remove('hidden');
    els.cards.leagueTeams.classList.remove('hidden');
    els.cards.teamEditor.classList.add('hidden');
    renderManageTeamsList();
    
    let delBtn = document.getElementById('deleteLeagueBtn');
    if (!delBtn) {
      delBtn = document.createElement('button');
      delBtn.id = 'deleteLeagueBtn';
      delBtn.textContent = 'Delete Entire League';
      delBtn.className = 'danger-btn';
      delBtn.onclick = handleDeleteLeague;
      els.containers.delLeagueBtn.appendChild(delBtn);
    }
    delBtn.classList.toggle('hidden', isNewLeague);
  }
}

function renderManageTeamsList() {
  const l = state.dirtyLeague;
  els.containers.manageTeams.innerHTML = `<table><thead><tr><th>Name</th><th>Action</th></tr></thead><tbody>
    ${l.teams.map(t => `<tr><td>${t.name}</td><td><button class="link-button" onclick="window.handleEditTeam('${t.id}')">Edit</button> | <button class="link-button" onclick="window.handleDeleteTeam('${t.id}')" style="color:red">Delete</button></td></tr>`).join('')}
  </tbody></table>`;
}

export async function handleDeleteLeague() {
  const l = state.dirtyLeague;
  const confirmed = await confirmModal("Delete League?", `WARNING: This will permanently delete the league "${l.name}" and ALL associated teams. This cannot be undone.`, "Delete Forever", true);
  if(!confirmed) return;
  
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  try {
    for (const t of l.teams) {
      try { await apiDelete(PATHS.team(l.id, t.id), `Delete team ${t.id}`, key); } catch (e) {}
    }
    for (const m of (l.matches || [])) {
      try { await apiDelete(PATHS.match(l.id, m.id), `Delete match report ${m.id}`, key); } catch (e) {}
    }
    await apiDelete(PATHS.league(l.id), `Delete league ${l.id}`, key);
    const freshIndex = (await apiGet(PATHS.leaguesIndex)) || [];
    const newIndex = freshIndex.filter(x => x.id !== l.id);
    await apiSave(PATHS.leaguesIndex, newIndex, `Remove league ${l.id} from index`, key);
    state.leaguesIndex = newIndex;
    state.editMode = 'league';
    goHome();
    setStatus('League deleted.', 'ok');
  } catch(e) { setStatus(`Delete failed: ${e.message}`, 'error'); }
}

export async function saveLeague(key) {
  const l = state.dirtyLeague;
  if (!l.id) return setStatus('League ID required.', 'error');
  if (!state.editLeagueId && state.leaguesIndex.find(x => x.id === l.id)) return setStatus('League ID exists.', 'error');
  
  l.name = els.inputs.leagueName.value;
  l.slug = l.slug || normalizeName(l.name);
  l.season = parseInt(els.inputs.leagueSeason.value);
  l.status = els.inputs.leagueStatus.value;
  l.settings.pointsWin = parseInt(els.inputs.ptsWin.value);
  l.settings.pointsDraw = parseInt(els.inputs.ptsDraw.value);
  l.settings.pointsLoss = parseInt(els.inputs.ptsLoss.value);
  l.settings.maxTeams = parseInt(els.inputs.maxTeams.value) || 16;
  l.settings.lockTeams = els.inputs.lockTeams.checked;
  l.rules = l.rules || { startingBudget: 1000000 };
  l.rules.startingBudget = parseInt(els.inputs.startingBudget?.value) || 1000000;
  
  await apiSave(PATHS.league(l.id), l, `Save league ${l.id}`, key);
  
  const freshIndex = (await apiGet(PATHS.leaguesIndex)) || [];
  const idxEntry = { id: l.id, name: l.name, season: l.season, status: l.status };
  const i = freshIndex.findIndex(x => x.id === l.id);
  if (i >= 0) freshIndex[i] = idxEntry;
  else freshIndex.push(idxEntry);
  
  await apiSave(PATHS.leaguesIndex, freshIndex, `Update index for ${l.id}`, key);
  state.leaguesIndex = freshIndex;
  setStatus('League saved.', 'ok');
  state.editMode = 'league';
  goHome();
}
