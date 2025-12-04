// app.js

// ============================================
// CONFIGURATION & STATE
// ============================================

const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';
const PATHS = {
  gameData: 'data/gameData.json',
  leaguesIndex: 'data/leagues/index.json',
  leagueSettings: (id) => `data/leagues/${id}/settings.json`,
  team: (leagueId, teamId) => `data/leagues/${leagueId}/teams/${teamId}.json`,
  activeMatch: (matchId) => `data/active_matches/${matchId}.json`
};

const state = {
  // Global Data
  leaguesIndex: [],
  gameData: null,
  
  // Current View Data
  currentLeague: null,
  currentTeam: null,
  activeMatchData: null,
  activeMatchPollInterval: null,
  coachSide: null, 
  
  // Navigation State
  viewLeagueId: null,
  viewTeamId: null,
  
  // Action Sheet State
  selectedPlayerIdx: null,
  
  // Editing State
  editLeagueId: null,
  editTeamId: null,
  editMode: 'league',
  dirtyLeague: null,
  dirtyTeam: null
};

// ============================================
// DOM ELEMENTS
// ============================================
const els = {
  toastContainer: document.getElementById('toastContainer'),
  
  nav: {
    deskLeagues: document.getElementById('navDeskLeagues'),
    deskAdmin: document.getElementById('navDeskAdmin'),
    mobLeagues: document.getElementById('navMobLeagues'),
    mobMatch: document.getElementById('navMobMatch'),
    mobAdmin: document.getElementById('navMobAdmin'),
    breadcrumbs: document.getElementById('breadcrumbs')
  },

  // Modals & Sheets
  mobileKey: {
    btn: document.getElementById('mobileKeyToggle'),
    modal: document.getElementById('mobileKeyModal'),
    input: document.getElementById('mobileKeyInput'),
    save: document.getElementById('mobileKeySaveBtn')
  },
  scheduleModal: {
    el: document.getElementById('scheduleModal'),
    round: document.getElementById('schedModalRound'),
    home: document.getElementById('schedModalHome'),
    away: document.getElementById('schedModalAway'),
    addBtn: document.getElementById('schedModalAddBtn')
  },
  actionSheet: {
    el: document.getElementById('playerActionSheet'),
    title: document.getElementById('actionSheetTitle')
  },

  // Sections
  sections: {
    list: document.getElementById('leagueListSection'),
    view: document.getElementById('leagueViewSection'),
    manage: document.getElementById('leagueManageSection'),
    team: document.getElementById('teamViewSection'),
    scoreboard: document.getElementById('scoreboardSection'),
    coach: document.getElementById('coachSection'),
    admin: document.getElementById('adminSection')
  },
  
  // Containers
  containers: {
    leagueList: document.getElementById('leagueListContainer'),
    standings: document.getElementById('standingsContainer'),
    matches: document.getElementById('matchesContainer'),
    inProgress: document.getElementById('inProgressContainer'),
    rosterQuick: document.getElementById('rosterQuickViewContainer'),
    manageTeams: document.getElementById('leagueManageTeamsList'),
    manageTeamEditor: document.getElementById('leagueManageTeamEditor'),
    teamSummary: document.getElementById('teamSummary'),
    teamRoster: document.getElementById('teamRosterContainer'),
    
    // Jumbotron
    sbHomeName: document.getElementById('sbHomeName'),
    sbAwayName: document.getElementById('sbAwayName'),
    sbHomeScore: document.getElementById('sbHomeScore'),
    sbAwayScore: document.getElementById('sbAwayScore'),
    sbHomeTurn: document.getElementById('sbHomeTurn'),
    sbAwayTurn: document.getElementById('sbAwayTurn'),
    sbHomeRoster: document.getElementById('scoreboardHomeRoster'),
    sbAwayRoster: document.getElementById('scoreboardAwayRoster'),
    
    // Coach Dashboard
    coachTeamName: document.getElementById('coachTeamName'),
    coachScore: document.getElementById('coachScoreDisplay'),
    coachRerolls: document.getElementById('coachRerolls'),
    coachTurn: document.getElementById('coachTurnDisplay'),
    coachRoster: document.getElementById('coachRosterList'),
    
    // Admin
    delLeagueBtn: document.getElementById('deleteLeagueContainer'),
    scanResults: document.getElementById('scanResults')
  },
  
  // Buttons
  buttons: {
    createLeague: document.getElementById('leagueCreateBtn'),
    manageSave: document.getElementById('leagueManageSaveBtn'),
    manageAddTeam: document.getElementById('leagueManageAddNewTeamBtn'),
    manageBack: document.getElementById('leagueManageBackBtn'),
    teamManage: document.getElementById('teamManageBtn'),
    teamBack: document.getElementById('teamBackBtn'),
    sbBack: document.getElementById('scoreboardBackToMatchBtn'),
    sbRefresh: document.getElementById('scoreboardRefreshBtn'),
    endGame: document.getElementById('endGameBtn'),
    rememberKey: document.getElementById('rememberKeyBtn'),
    coachEndTurn: document.getElementById('coachEndTurnBtn'),
    scanBtn: document.getElementById('scanBtn'),
    loadBtn: document.getElementById('loadBtn'),
    saveBtn: document.getElementById('saveBtn'),
    deskSchedBtn: document.getElementById('desktopSchedBtn'),
    mobSchedBtn: document.getElementById('mobileAddMatchBtn'),
    cancelGame: document.getElementById('cancelGameBtn')
  },
  
  // Inputs
  inputs: {
    editKey: document.getElementById('editKeyInput'),
    leagueId: document.getElementById('leagueManageIdInput'),
    leagueName: document.getElementById('leagueManageNameInput'),
    leagueSeason: document.getElementById('leagueManageSeasonInput'),
    leagueStatus: document.getElementById('leagueManageStatusSelect'),
    ptsWin: document.getElementById('leagueManagePointsWinInput'),
    ptsDraw: document.getElementById('leagueManagePointsDrawInput'),
    ptsLoss: document.getElementById('leagueManagePointsLossInput'),
    maxTeams: document.getElementById('leagueManageMaxTeamsInput'),
    lockTeams: document.getElementById('leagueManageLockTeamsInput'),
    adminText: document.getElementById('leagueTextarea')
  },
  
  // Cards & Modal
  cards: {
    leagueInfo: document.getElementById('leagueInfoCard'),
    leagueTeams: document.getElementById('leagueTeamsCard'),
    teamEditor: document.getElementById('teamEditorCard')
  },
  modal: {
    el: document.getElementById('skillModal'),
    title: document.getElementById('skillModalTitle'),
    body: document.getElementById('skillModalBody')
  },
  datalist: document.getElementById('skillList')
};

// ============================================
// THEME & UTILS
// ============================================

function getContrastColor(hex) {
  if(!hex) return '#ffffff';
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#111111' : '#ffffff';
}

function applyTeamTheme(team) {
  const root = document.documentElement;
  if (team && team.colors) {
    root.style.setProperty('--team-primary', team.colors.primary || '#222');
    root.style.setProperty('--team-secondary', team.colors.secondary || '#c5a059');
    root.style.setProperty('--team-text', getContrastColor(team.colors.primary || '#222'));
  } else {
    root.style.setProperty('--team-primary', '#222222');
    root.style.setProperty('--team-secondary', '#c5a059');
    root.style.setProperty('--team-text', '#ffffff');
  }
}

function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// Replaced Status Bar with Toasts
function setStatus(msg, type = 'info') {
  if(!msg) return;
  // console.log(`[${type}] ${msg}`); // Optional debug
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  
  els.toastContainer.appendChild(toast);
  
  // Auto-remove after 3s
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

async function apiGet(path) {
  const url = `${API_BASE}/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiSave(path, content, message, key) {
  if (!key) throw new Error("Missing Edit Key");
  const url = `${API_BASE}/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Edit-Key': key },
    body: JSON.stringify({ content, message })
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${await res.text()}`);
  return res.json();
}

async function apiDelete(path, message, key) {
  if (!key) throw new Error("Missing Edit Key");
  const url = `${API_BASE}/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'X-Edit-Key': key },
    body: JSON.stringify({ message })
  });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${await res.text()}`);
  return res.json();
}

// ============================================
// NAVIGATION
// ============================================

function updateBreadcrumbs(path) {
  const container = els.nav.breadcrumbs;
  container.innerHTML = '';
  const inner = document.createElement('div');
  inner.className = 'breadcrumbs-inner';
  
  path.forEach((step, index) => {
    if (index > 0) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = ' / ';
      inner.appendChild(sep);
    }
    const span = document.createElement('span');
    if (step.action) {
      span.className = 'crumb-link';
      span.textContent = step.label;
      span.onclick = step.action;
    } else {
      span.className = 'crumb';
      span.textContent = step.label;
    }
    inner.appendChild(span);
  });
  
  container.appendChild(inner);
}

function setActiveNav(tabName) {
  ['deskLeagues', 'deskAdmin'].forEach(k => els.nav[k].classList.remove('active'));
  ['mobLeagues', 'mobMatch', 'mobAdmin'].forEach(k => els.nav[k].classList.remove('active'));
  if (tabName === 'leagues') { els.nav.deskLeagues.classList.add('active'); els.nav.mobLeagues.classList.add('active'); }
  else if (tabName === 'admin') { els.nav.deskAdmin.classList.add('active'); els.nav.mobAdmin.classList.add('active'); }
  else if (tabName === 'match') { els.nav.mobMatch.classList.add('active'); }
}

function showSection(name) {
  if (state.activeMatchPollInterval) {
    clearInterval(state.activeMatchPollInterval);
    state.activeMatchPollInterval = null;
  }
  Object.values(els.sections).forEach(el => el.classList.add('hidden'));
  els.sections[name].classList.remove('hidden');
}

function goHome() {
  applyTeamTheme(null);
  showSection('list');
  renderLeagueList();
  updateBreadcrumbs([{ label: 'Leagues' }]);
  setActiveNav('leagues');
}

function goAdmin() {
  applyTeamTheme(null);
  showSection('admin');
  updateBreadcrumbs([{ label: 'Leagues', action: goHome }, { label: 'Admin Tools' }]);
  setActiveNav('admin');
}

els.nav.deskLeagues.addEventListener('click', () => goHome());
els.nav.mobLeagues.addEventListener('click', () => goHome());
els.nav.deskAdmin.addEventListener('click', () => goAdmin());
els.nav.mobAdmin.addEventListener('click', () => goAdmin());

els.nav.mobMatch.addEventListener('click', () => {
  if (state.activeMatchData) {
    handleOpenScoreboard(state.activeMatchData.matchId);
  } else if (state.currentLeague) {
    showSection('view');
    document.getElementById('leagueMatchesSection').scrollIntoView({behavior:'smooth'});
  } else {
    goHome();
  }
  setActiveNav('match');
});

els.mobileKey.btn.addEventListener('click', () => els.mobileKey.modal.classList.remove('hidden'));
els.mobileKey.save.addEventListener('click', () => {
  const k = els.mobileKey.input.value;
  if(k) { 
    localStorage.setItem('bb3_edit_key', k);
    if(els.inputs.editKey) els.inputs.editKey.value = k;
    els.mobileKey.modal.classList.add('hidden');
    setStatus("Key Saved", 'ok');
  }
});

if(els.buttons.rememberKey) {
  els.buttons.rememberKey.addEventListener('click', () => {
    const k = els.inputs.editKey.value;
    if(k) { 
      localStorage.setItem('bb3_edit_key', k);
      setStatus('Key saved.', 'ok'); 
    }
  });
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
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
  } catch (e) {
    console.error(e);
    setStatus(`Init Failed: ${e.message}`, 'error');
  }
}

function populateSkillList() {
  if (!state.gameData?.skillCategories) return;
  const list = els.datalist;
  list.innerHTML = '';
  Object.values(state.gameData.skillCategories).flat().forEach(s => {
    const opt = document.createElement('option');
    opt.value = (typeof s === 'object' && s.name) ? s.name : s; 
    list.appendChild(opt);
  });
}

// ============================================
// LEAGUE LOGIC
// ============================================

function renderLeagueList() {
  if (!state.leaguesIndex.length) {
    els.containers.leagueList.innerHTML = `<div class="panel-styled">No leagues found. Create one to get started.</div>`;
    return;
  }
  els.containers.leagueList.innerHTML = state.leaguesIndex.map(l => `
    <div class="league-card">
      <div class="league-card-main">
        <div class="league-card-title">${l.name}</div>
        <div class="league-meta">
          <span class="tag ${l.status === 'active' ? 'in_progress' : 'scheduled'}">${l.status}</span>
          Season ${l.season} • ID: ${l.id}
        </div>
      </div>
      <div>
        <button class="link-button" onclick="handleOpenLeague('${l.id}')">Open</button>
        &nbsp;|&nbsp;
        <button class="link-button" onclick="handleManageLeague('${l.id}')">Manage</button>
      </div>
    </div>
  `).join('');
}

window.handleOpenLeague = async (id) => {
  setStatus(`Loading league ${id}...`);
  try {
    state.currentLeague = null; 
    const settings = await apiGet(PATHS.leagueSettings(id));
    if (!settings) throw new Error("League settings file not found.");
    state.currentLeague = settings;
    state.viewLeagueId = id;
    
    renderLeagueView();
    showSection('view');
    updateBreadcrumbs([{ label: 'Leagues', action: goHome }, { label: settings.name }]);
    setActiveNav('leagues');

    setStatus('League loaded.', 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
};

function renderLeagueView() {
  const l = state.currentLeague;
  if (!l) return;
  
  document.getElementById('leagueHeader').innerHTML = `<h2>${l.name}</h2><div class="small">Season ${l.season} (${l.status})</div>`;
  document.getElementById('leagueTeamsSection').className = 'panel-styled';
  document.getElementById('leagueMatchesSection').className = 'panel-styled';

  const standings = computeStandings(l);
  els.containers.standings.innerHTML = `<table class="responsive-table">
    <thead><tr><th>#</th><th>Team</th><th>W-D-L</th><th>Pts</th><th>Diff</th></tr></thead>
    <tbody>${standings.map((s, i) => `
      <tr>
        <td data-label="Rank">${i+1}</td>
        <td data-label="Team"><button class="team-link" onclick="handleOpenTeam('${l.id}', '${s.id}')">${s.name}</button></td>
        <td data-label="W-D-L">${s.wins}-${s.draws}-${s.losses}</td>
        <td data-label="Points">${s.points}</td>
        <td data-label="Diff">${s.tdDiff}/${s.casDiff}</td>
      </tr>`).join('')}
  </tbody></table>`;
  
  if (els.containers.rosterQuick) {
    els.containers.rosterQuick.innerHTML = `<div class="roster-tiles">
      ${l.teams.map(t => {
        const prim = t.colors?.primary || '#8a1c1c';
        return `
        <div class="roster-tile" style="border-top-color: ${prim}">
          <div class="roster-tile-title"><button class="team-link" onclick="handleOpenTeam('${l.id}', '${t.id}')">${t.name}</button></div>
          <div class="roster-tile-meta"><span><strong>Race:</strong> ${t.race}</span><span><strong>Coach:</strong> ${t.coachName}</span></div>
        </div>`;
      }).join('')}
    </div>`;
  }
  renderMatchesList(l);
}

function renderMatchesList(league) {
  if(!league.matches || !league.matches.length) {
    els.containers.matches.innerHTML = '<div class="small">No matches scheduled.</div>';
    return;
  }
  
  const active = league.matches.filter(m => m.status === 'in_progress');
  const others = league.matches.filter(m => m.status !== 'in_progress').sort((a,b) => a.round - b.round);

  let inProgHtml = '';
  if (active.length > 0) {
    inProgHtml = '<div class="card"><h4 style="color:#0066cc; margin-top:0;">Live Matches</h4><ul>' + 
      active.map(m => {
        const h = league.teams.find(t => t.id === m.homeTeamId)?.name || m.homeTeamId;
        const a = league.teams.find(t => t.id === m.awayTeamId)?.name || m.awayTeamId;
        // Improved Mobile Layout for Live Matches
        return `<li style="margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:1px solid #eee;">
          <div style="font-weight:bold; font-size:0.9rem; color:#555;">Round ${m.round} <button class="link-button" style="float:right;" onclick="handleOpenScoreboard('${m.id}')"><strong>View Board</strong></button></div>
          <div style="margin-top:0.2rem; font-size:1.1rem;">${h} <span style="color:#aaa">vs</span> ${a}</div>
        </li>`;
      }).join('') + 
    '</ul></div>';
  }
  els.containers.inProgress.innerHTML = inProgHtml;

  const rows = others.map(m => {
    const h = league.teams.find(t => t.id === m.homeTeamId)?.name || m.homeTeamId;
    const a = league.teams.find(t => t.id === m.awayTeamId)?.name || m.awayTeamId;
    const score = m.status === 'completed' ? `${m.score.home}-${m.score.away}` : '';
    let action = m.status;
    if (m.status === 'scheduled') action = `<button class="link-button" onclick="handleStartMatch('${m.id}')" style="color:green; font-weight:bold">Start Match</button>`;
    
    return `<tr>
      <td data-label="Round">${m.round}</td>
      <td data-label="Home">${h}</td>
      <td data-label="Away">${a}</td>
      <td data-label="Score">${score}</td>
      <td data-label="Status"><span class="tag ${m.status}">${action}</span> <button onclick="handleDeleteMatch('${m.id}')" style="margin-left:5px; color:red; border:none; background:none; cursor:pointer;" title="Delete">🗑️</button></td>
    </tr>`;
  }).join('');
  
  // Add Subheader for scheduled matches
  const scheduledHeader = active.length > 0 ? '<h4 style="margin-top:2rem; color:#444;">Upcoming & Results</h4>' : '';
  
  els.containers.matches.innerHTML = `${scheduledHeader}<table class="responsive-table"><thead><tr><th>Rd</th><th>Home</th><th>Away</th><th>Score</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`; 
}

function computeStandings(league) {
  const map = new Map();
  league.teams.forEach(t => map.set(t.id, { ...t, wins:0, draws:0, losses:0, points:0, tdDiff:0, casDiff:0 }));
  (league.matches||[]).filter(m => m.status === 'completed').forEach(m => {
    const h = map.get(m.homeTeamId);
    const a = map.get(m.awayTeamId);
    if(!h || !a) return;
    
    const hf = m.score?.home || 0;
    const af = m.score?.away || 0;
    const hCas = m.casualties?.homeInflicted || 0;
    const aCas = m.casualties?.awayInflicted || 0;
    
    h.tdDiff += (hf - af);
    a.tdDiff += (af - hf);
    h.casDiff += (hCas - aCas);
    a.casDiff += (aCas - hCas);
    
    if (hf > af) { h.wins++; a.losses++; h.points += (league.settings.pointsWin||3); a.points += (league.settings.pointsLoss||0); }
    else if (hf < af) { a.wins++; h.losses++; a.points += (league.settings.pointsWin||3); h.points += (league.settings.pointsLoss||0); }
    else { h.draws++; a.draws++; h.points += (league.settings.pointsDraw||1); a.points += (league.settings.pointsDraw||1); }
  });
  return Array.from(map.values()).sort((a,b) => b.points - a.points);
}

window.handleDeleteMatch = async (matchId) => {
  if(!confirm("Permanently delete match record?")) return;
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  try {
    const l = state.currentLeague;
    l.matches = l.matches.filter(m => m.id !== matchId);
    await apiSave(PATHS.leagueSettings(l.id), l, `Delete match ${matchId}`, key);
    renderLeagueView();
    setStatus('Match deleted.', 'ok');
  } catch(e) { setStatus(`Delete failed: ${e.message}`, 'error'); }
};

// ============================================
// TEAM LOGIC
// ============================================

window.handleOpenTeam = async (leagueId, teamId) => {
  setStatus(`Loading team ${teamId}...`);
  try {
    const teamData = await apiGet(PATHS.team(leagueId, teamId));
    if (!teamData) throw new Error("Team file not found.");
    state.currentTeam = teamData;
    state.viewTeamId = teamId;
    
    applyTeamTheme(teamData);
    renderTeamView();
    
    // Apply Header style manually for Desktop View (SWAPPED Colors)
    const hdr = document.getElementById('teamHeader');
    if(hdr && teamData.colors) {
        hdr.className = "team-header-styled";
        hdr.style.backgroundColor = teamData.colors.secondary || '#c5a059'; // Banner = Secondary
        hdr.style.color = teamData.colors.primary || '#222'; // Text = Primary
        hdr.style.borderBottomColor = teamData.colors.primary || '#222';
    }

    showSection('team');
    updateBreadcrumbs([{ label: 'Leagues', action: goHome }, { label: state.currentLeague.name, action: () => handleOpenLeague(leagueId) }, { label: teamData.name }]);
    setStatus('Team loaded.', 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
};

function renderTeamView() {
  const t = state.currentTeam;
  document.getElementById('teamHeader').textContent = t.name;
  els.containers.teamSummary.innerHTML = `Coach: ${t.coachName} | Race: ${t.race} | TV: ${t.teamValue || 0}`;
  
  const rows = (t.players || []).map(p => {
    const skillsHtml = (p.skills||[]).map(s => 
      `<span class="skill-tag" onclick="showSkill('${s}')">${s}</span>`
    ).join(' ');
    return `
    <tr>
      <td data-label="#">${p.number||''}</td>
      <td data-label="Name">${p.name}</td>
      <td data-label="Pos">${p.position}</td>
      <td data-label="MA">${p.ma}</td>
      <td data-label="ST">${p.st}</td>
      <td data-label="AG">${p.ag}</td>
      <td data-label="PA">${p.pa}</td>
      <td data-label="AV">${p.av}</td>
      <td data-label="Skills">${skillsHtml}</td>
      <td data-label="SPP">${p.spp}</td>
    </tr>`;
  }).join('');
  els.containers.teamRoster.innerHTML = `<table class="responsive-table"><thead><tr><th>#</th><th>Name</th><th>Pos</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th><th>SPP</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ============================================
// MATCH ENGINE
// ============================================

function openScheduleModal() {
  const l = state.currentLeague; if(!l) return;
  
  const homeSel = els.scheduleModal.home;
  const awaySel = els.scheduleModal.away;
  homeSel.innerHTML = '<option value="">Home Team...</option>';
  awaySel.innerHTML = '<option value="">Away Team...</option>';
  
  l.teams.forEach(t => {
    const opt = `<option value="${t.id}">${t.name}</option>`;
    homeSel.innerHTML += opt;
    awaySel.innerHTML += opt;
  });
  
  // Auto-increment Round Logic
  let nextRound = 1;
  if(l.matches && l.matches.length > 0) {
      const maxR = Math.max(...l.matches.map(m => m.round));
      nextRound = maxR + 1;
  }
  els.scheduleModal.round.value = nextRound;
  
  els.scheduleModal.el.classList.remove('hidden');
}

window.closeScheduleModal = () => els.scheduleModal.el.classList.add('hidden');

if(els.buttons.deskSchedBtn) els.buttons.deskSchedBtn.addEventListener('click', openScheduleModal);
if(els.buttons.mobSchedBtn) els.buttons.mobSchedBtn.addEventListener('click', openScheduleModal);

if(els.scheduleModal.addBtn) {
  els.scheduleModal.addBtn.addEventListener('click', async () => {
    const key = els.inputs.editKey.value;
    if (!key) return setStatus('Edit key required', 'error');
    
    const l = state.currentLeague;
    const round = parseInt(els.scheduleModal.round.value);
    const homeId = els.scheduleModal.home.value;
    const awayId = els.scheduleModal.away.value;
    
    if (!homeId || !awayId || homeId === awayId) return alert("Invalid selection");
    
    setStatus('Scheduling...');
    try {
      const matchId = `match_${Date.now()}`;
      const newMatch = { id: matchId, round: round, homeTeamId: homeId, awayTeamId: awayId, status: 'scheduled', date: new Date().toISOString().split('T')[0] };
      l.matches = l.matches || [];
      l.matches.push(newMatch);
      await apiSave(PATHS.leagueSettings(l.id), l, `Schedule match`, key);
      
      closeScheduleModal();
      renderLeagueView();
      setStatus('Match scheduled.', 'ok');
    } catch(e) { setStatus(e.message, 'error'); }
  });
}

// --- Starting a Match ---

window.handleStartMatch = async (matchId) => {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  if(!confirm("Start this match?")) return;
  
  setStatus('Initializing...');
  try {
    const l = state.currentLeague;
    const matchIdx = l.matches.findIndex(m => m.id === matchId);
    if(matchIdx === -1) throw new Error("Match not found");
    const m = l.matches[matchIdx];
    
    const homeTeam = await apiGet(PATHS.team(l.id, m.homeTeamId));
    const awayTeam = await apiGet(PATHS.team(l.id, m.awayTeamId));
    if(!homeTeam || !awayTeam) throw new Error("Could not load team files.");
    
    const initRoster = (players) => (players||[]).map(p => ({
        ...p,
        live: { used: false, injured: false, sentOff: false, td: 0, cas: 0, int: 0 }
    }));

    const activeData = {
      matchId: m.id, leagueId: l.id, round: m.round, status: 'in_progress',
      home: { id: homeTeam.id, name: homeTeam.name, colors: homeTeam.colors, score: 0, roster: initRoster(homeTeam.players), rerolls: homeTeam.rerolls || 0, apothecary: true },
      away: { id: awayTeam.id, name: awayTeam.name, colors: awayTeam.colors, score: 0, roster: initRoster(awayTeam.players), rerolls: awayTeam.rerolls || 0, apothecary: true },
      turn: { home: 0, away: 0 },
      log: []
    };
    
    await apiSave(PATHS.activeMatch(m.id), activeData, `Start match`, key);
    m.status = 'in_progress';
    await apiSave(PATHS.leagueSettings(l.id), l, `Match in progress`, key);
    
    handleOpenScoreboard(m.id);
    setStatus('Match started!', 'ok');
  } catch(e) { setStatus(e.message, 'error'); }
};

window.handleOpenScoreboard = async (matchId) => {
  setStatus('Loading live match...');
  try {
    const data = await apiGet(PATHS.activeMatch(matchId));
    if (!data) throw new Error("Active match file not found.");
    state.activeMatchData = data;
    renderJumbotron();
    showSection('scoreboard');
    
    updateBreadcrumbs([
      { label: 'Leagues', action: goHome },
      { label: state.currentLeague?.name || 'League', action: () => handleOpenLeague(state.activeMatchData.leagueId) },
      { label: 'Live Match' }
    ]);
    setActiveNav('match');
    
    if (state.activeMatchPollInterval) clearInterval(state.activeMatchPollInterval);
    state.activeMatchPollInterval = setInterval(async () => {
        try {
            // FIX: Ensure we are still on the scoreboard screen
            if(!document.getElementById('sbHomeName') || els.sections.scoreboard.classList.contains('hidden')) {
                return;
            }
            
            const fresh = await apiGet(PATHS.activeMatch(matchId));
            if (fresh) { state.activeMatchData = fresh; renderJumbotron(); }
        } catch(e) { console.warn("Poll failed", e); }
    }, 5000); 
    setStatus('Live connection active.', 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
};

function renderJumbotron() {
  const d = state.activeMatchData;
  els.containers.sbHomeName.innerHTML = `<div class="big-team-text" style="color:${d.home.colors?.primary}; text-shadow:2px 2px 0 ${d.home.colors?.secondary}, 4px 4px 0px rgba(0,0,0,0.5)">${d.home.name}</div>`;
  els.containers.sbAwayName.innerHTML = `<div class="big-team-text" style="color:${d.away.colors?.primary}; text-shadow:2px 2px 0 ${d.away.colors?.secondary}, 4px 4px 0px rgba(0,0,0,0.5)">${d.away.name}</div>`;
  els.containers.sbHomeScore.textContent = d.home.score;
  els.containers.sbAwayScore.textContent = d.away.score;
  
  // FIX: Use textContent to update turn counter safely without destroying DOM structure
  const homeTurnEl = document.getElementById('sbHomeTurn');
  const awayTurnEl = document.getElementById('sbAwayTurn');
  if(homeTurnEl) homeTurnEl.textContent = d.turn.home;
  if(awayTurnEl) awayTurnEl.textContent = d.turn.away;
  
  const hCol = d.home.colors?.primary || '#222'; const hTxt = getContrastColor(hCol);
  const aCol = d.away.colors?.primary || '#222'; const aTxt = getContrastColor(aCol);
  
  els.containers.sbHomeRoster.innerHTML = 
    `<div class="roster-header" style="background:${hCol}; color:${hTxt}">Home - ${d.home.name}</div>` +
    renderLiveRoster(d.home.roster, 'home', true);
    
  els.containers.sbAwayRoster.innerHTML = 
    `<div class="roster-header" style="background:${aCol}; color:${aTxt}">Away - ${d.away.name}</div>` +
    renderLiveRoster(d.away.roster, 'away', true);
}

// ---- Coach Mode ----
window.enterCoachMode = (side) => {
  state.coachSide = side;
  document.body.classList.add('mode-coach');
  const team = state.activeMatchData[side];
  applyTeamTheme(team); // Apply Theme!
  renderCoachView();
  showSection('coach');
  if (state.activeMatchPollInterval) {
    clearInterval(state.activeMatchPollInterval);
    state.activeMatchPollInterval = null;
  }
};

window.exitCoachMode = () => {
  document.body.classList.remove('mode-coach');
  applyTeamTheme(null);
  handleOpenScoreboard(state.activeMatchData.matchId);
};

function renderCoachView() {
  const d = state.activeMatchData;
  const side = state.coachSide;
  const team = d[side];
  const oppSide = side === 'home' ? 'away' : 'home';
  const oppTeam = d[oppSide];

  els.containers.coachTeamName.innerHTML = `<div class="big-team-text" style="color:${team.colors?.text || '#fff'}; text-shadow:none;">${team.name}</div>`;
  els.containers.coachScore.textContent = `${team.score} - ${oppTeam.score}`;
  els.containers.coachTurn.textContent = `Turn: ${d.turn[side]}`;

  let pips = '';
  for(let i=0; i<team.rerolls; i++) {
    pips += `<div class="reroll-pip ${i < (team.rerolls) ? 'active' : ''}" onclick="toggleReroll('${side}', ${i})"></div>`;
  }
  els.containers.coachRerolls.innerHTML = pips;
  els.containers.coachRoster.innerHTML = renderLiveRoster(team.roster, side, false);
}

function renderLiveRoster(roster, side, readOnly) {
  return roster.map((p, idx) => {
    const live = p.live || {};
    let badges = '';
    if(live.td > 0) badges += `<span class="stat-badge">TD:${live.td}</span>`;
    if(live.cas > 0) badges += `<span class="stat-badge">CAS:${live.cas}</span>`;
    if(live.int > 0) badges += `<span class="stat-badge">INT:${live.int}</span>`;
    if(live.sentOff) badges += `<span class="stat-badge" style="background:#faa">Off</span>`;

    const skillTags = (p.skills || []).map(s => 
      `<span class="skill-tag" onclick="event.stopPropagation(); showSkill('${s}')">${s}</span>`
    ).join(' ');

    if (readOnly) {
        return `
          <div class="live-player-row ${live.used?'used':''} ${live.injured?'injured':''}">
            <div class="player-info">
              <span class="player-name">#${p.number} ${p.name} ${badges}</span>
              <span class="player-pos">${p.position} | ${skillTags}</span>
            </div>
          </div>`;
    }

    return `
      <div class="live-player-row ${live.used?'used':''} ${live.injured?'injured':''}" onclick="openPlayerActionSheet(${idx})">
        <div class="player-info">
          <span class="player-name">#${p.number} ${p.name} ${badges}</span>
          <span class="player-pos">${p.position} | ${skillTags}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Action Sheet Functions
window.openPlayerActionSheet = (idx) => {
  state.selectedPlayerIdx = idx;
  const p = state.activeMatchData[state.coachSide].roster[idx];
  if(els.actionSheet.title) els.actionSheet.title.textContent = `#${p.number} ${p.name}`;
  els.actionSheet.el.classList.remove('hidden');
};

window.closeActionSheet = () => {
  els.actionSheet.el.classList.add('hidden');
  state.selectedPlayerIdx = null;
};

window.handleSheetAction = (type) => {
  const side = state.coachSide;
  const idx = state.selectedPlayerIdx;
  if(idx === null) return;
  
  const p = state.activeMatchData[side].roster[idx];
  p.live = p.live || {};
  
  if (type === 'used') p.live.used = !p.live.used;
  else if (type === 'injured') p.live.injured = !p.live.injured;
  else if (type === 'td') {
    p.live.td++;
    state.activeMatchData[side].score++;
  }
  else if (type === 'cas') p.live.cas++;
  
  closeActionSheet();
  renderCoachView();
  updateLiveMatch(`Update ${p.name} ${type}`);
};

async function updateLiveMatch(actionDesc) {
  const key = els.inputs.editKey.value;
  if(!key) return setStatus("Key needed.", "error");
  try {
    await apiSave(PATHS.activeMatch(state.activeMatchData.matchId), state.activeMatchData, actionDesc, key);
  } catch(e) { console.error(e); setStatus("Sync failed!", "error"); }
}

window.toggleReroll = (side, idx) => {
  const team = state.activeMatchData[side];
  if (team.rerolls > 0) {
      team.rerolls--;
      renderCoachView();
      updateLiveMatch(`${side} used Reroll`);
  }
};

if(els.buttons.coachEndTurn) {
  els.buttons.coachEndTurn.addEventListener('click', async () => {
    const side = state.coachSide;
    const d = state.activeMatchData;
    d[side].roster.forEach(p => { if(p.live) p.live.used = false; });
    d.turn[side]++;
    renderCoachView();
    await updateLiveMatch(`End Turn: ${side}`);
    setStatus("Turn ended.", "ok");
  });
}

// ---- Match Control Listeners ----

if(els.buttons.cancelGame) {
  els.buttons.cancelGame.addEventListener('click', async () => {
    if(!confirm("Cancel match?")) return;
    const key = els.inputs.editKey.value;
    try {
      const mId = state.activeMatchData.matchId;
      const lId = state.activeMatchData.leagueId;
      await apiDelete(PATHS.activeMatch(mId), `Cancel ${mId}`, key);
      const l = await apiGet(PATHS.leagueSettings(lId));
      const m = l.matches.find(x => x.id === mId);
      if(m) m.status = 'scheduled';
      await apiSave(PATHS.leagueSettings(l.id), l, `Revert ${mId}`, key);
      handleOpenLeague(lId);
    } catch(e) { setStatus(e.message, 'error'); }
  });
}

els.buttons.endGame.addEventListener('click', async () => {
  if(!confirm("End game? Saves results.")) return;
  const key = els.inputs.editKey.value;
  try {
    const d = state.activeMatchData;
    const l = await apiGet(PATHS.leagueSettings(d.leagueId));
    const m = l.matches.find(x => x.id === d.matchId);
    if(m) {
      m.status = 'completed';
      m.score = { home: d.home.score, away: d.away.score };
      m.casualties = { 
        homeInflicted: d.home.roster.reduce((sum, p) => sum + (p.live?.cas||0), 0),
        awayInflicted: d.away.roster.reduce((sum, p) => sum + (p.live?.cas||0), 0)
      };
    }
    await apiSave(PATHS.leagueSettings(d.leagueId), l, `Complete ${d.matchId}`, key);
    await apiDelete(PATHS.activeMatch(d.matchId), `Cleanup ${d.matchId}`, key);
    handleOpenLeague(d.leagueId);
  } catch(e) { setStatus(e.message, 'error'); }
});

els.buttons.sbBack.addEventListener('click', () => {
  if (state.activeMatchPollInterval) clearInterval(state.activeMatchPollInterval);
  showSection('view');
  if (state.viewLeagueId) handleOpenLeague(state.viewLeagueId);
});

els.buttons.sbRefresh.addEventListener('click', () => handleOpenScoreboard(state.activeMatchData.matchId));

// ============================================
// TEAM EDITOR & ADMIN
// ============================================

window.showSkill = (skillName) => {
  const cleanName = skillName.replace(/\(\+.*\)/, '').trim(); 
  let desc = "No description available.";
  if (state.gameData?.skillCategories) {
    for (const cat in state.gameData.skillCategories) {
      const found = state.gameData.skillCategories[cat].find(s => s.name.startsWith(cleanName));
      if (found) { desc = found.description; break; }
    }
  } else if (state.gameData?.Traits) {
      const found = state.gameData.Traits.find(s => s.name.startsWith(cleanName));
      if (found) desc = found.description;
  }
  els.modal.title.textContent = skillName;
  els.modal.body.textContent = desc;
  els.modal.el.classList.remove('hidden');
};

window.closeSkillModal = () => els.modal.el.classList.add('hidden');

// --- League & Team Management Functions ---

window.handleManageLeague = async (id) => {
  state.editMode = 'league';
  state.editLeagueId = id;
  state.editTeamId = null;
  state.dirtyLeague = null;
  
  if (id) {
    try {
      const s = await apiGet(PATHS.leagueSettings(id));
      state.dirtyLeague = JSON.parse(JSON.stringify(s));
    } catch (e) { setStatus(e.message, 'error'); return; }
  } else {
    state.dirtyLeague = { 
      id: '', name: '', season: 1, status: 'upcoming', 
      settings: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, maxTeams: 16, lockTeams: false }, 
      teams: [], matches: [] 
    };
  }
  
  renderManageForm();
  showSection('manage');
  updateBreadcrumbs([
    { label: 'Leagues', action: goHome },
    { label: state.dirtyLeague.name || 'New League' },
    { label: 'Manage' }
  ]);
};

function renderManageForm() {
  const l = state.dirtyLeague;
  const isNewLeague = !state.editLeagueId;
  
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
    if (isNewLeague) {
      state.dirtyLeague.id = normalizeName(this.value);
      els.inputs.leagueId.value = state.dirtyLeague.id;
    }
  };
  
  els.inputs.leagueSeason.value = l.season;
  els.inputs.leagueStatus.value = l.status;
  els.inputs.ptsWin.value = l.settings.pointsWin;
  els.inputs.ptsDraw.value = l.settings.pointsDraw;
  els.inputs.ptsLoss.value = l.settings.pointsLoss;

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
  els.containers.manageTeams.innerHTML = `<table><thead><tr><th>ID</th><th>Name</th><th>Action</th></tr></thead><tbody>
    ${l.teams.map(t => `<tr><td>${t.id}</td><td>${t.name}</td><td><button class="link-button" onclick="handleEditTeam('${t.id}')">Edit</button> | <button class="link-button" onclick="handleDeleteTeam('${t.id}')" style="color:red">Delete</button></td></tr>`).join('')}
  </tbody></table>`;
}

window.handleEditTeam = async (teamId) => {
  state.editMode = 'team';
  state.editTeamId = teamId;
  
  if (teamId) {
    try {
      const t = await apiGet(PATHS.team(state.dirtyLeague.id, teamId));
      state.dirtyTeam = t || createEmptyTeam(teamId);
    } catch(e) { console.error(e); state.dirtyTeam = createEmptyTeam(teamId); }
  } else {
    state.dirtyTeam = createEmptyTeam('');
  }
  renderManageForm(); 
};

function createEmptyTeam(id) {
  const defaultRace = state.gameData?.races?.[0]?.name || 'Human';
  return { 
    id, 
    name: 'New Team', 
    race: defaultRace, 
    coachName: '', 
    players: [], 
    colors: { primary: '#222222', secondary: '#c5a059' } 
  };
}

function renderTeamEditor() {
  const t = state.dirtyTeam;
  const raceOpts = (state.gameData?.races || []).map(r => `<option value="${r.name}" ${t.race === r.name ? 'selected' : ''}>${r.name}</option>`).join('');
  
  els.containers.manageTeamEditor.innerHTML = `
    <h3>${state.editTeamId ? 'Edit Team' : 'Add New Team'}</h3>
    <div class="form-grid">
      <div class="form-field"><label>File ID</label><input type="text" value="${t.id}" readonly class="faded" placeholder="Auto-generated"></div>
      <div class="form-field"><label>Name</label><input type="text" value="${t.name}" id="teamEditNameInput"></div>
      <div class="form-field"><label>Coach</label><input type="text" value="${t.coachName}" onchange="state.dirtyTeam.coachName = this.value"></div>
      <div class="form-field"><label>Race</label><select onchange="changeTeamRace(this.value)">${raceOpts}</select></div>
    </div>
    
    <div class="form-grid" style="margin-top:1rem; padding:1rem; background:#f4f4f4; border-radius:4px;">
      <div class="form-field"><label>Primary Color</label><input type="color" id="teamColorPrimary" value="${t.colors?.primary || '#222222'}" style="width:100%; height:40px"></div>
      <div class="form-field"><label>Secondary Color</label><input type="color" id="teamColorSecondary" value="${t.colors?.secondary || '#c5a059'}" style="width:100%; height:40px"></div>
    </div>
    
    <h4>Roster</h4>
    <div class="manager-toolbar">
      <button onclick="addSmartPlayer()" class="primary-btn">+ Hire Player</button>
    </div>
    
    <table class="responsive-table roster-editor-table">
      <thead><tr><th style="width:40px">#</th><th>Name</th><th>Position</th><th style="width:40px">MA</th><th style="width:40px">ST</th><th style="width:40px">AG</th><th style="width:40px">PA</th><th style="width:40px">AV</th><th>Skills</th><th style="width:50px">SPP</th><th style="width:30px"></th></tr></thead>
      <tbody id="editorRosterBody"></tbody>
    </table>
  `;

  const tbody = document.getElementById('editorRosterBody');
  const currentRaceObj = state.gameData?.races.find(r => r.name === t.race);
  const positionalOptions = (currentRaceObj?.positionals || []).map(pos => `<option value="${pos.name}">${pos.name} (${Math.floor(pos.cost/1000)}k)</option>`).join('');
  
  let allSkillsHtml = '<option value="">+ Skill...</option>';
  if (state.gameData?.skillCategories) {
    Object.values(state.gameData.skillCategories).flat().forEach(s => {
      const sName = (typeof s === 'object') ? s.name : s;
      allSkillsHtml += `<option value="${sName}">${sName}</option>`;
    });
  }

  t.players.forEach((p, idx) => {
    const posSelect = `<select style="width:100%; font-size:0.8rem;" onchange="updatePlayerPos(${idx}, this.value)"><option value="" disabled>Pos...</option>${positionalOptions.replace(`value="${p.position}"`, `value="${p.position}" selected`)}</select>`;
    
    const currentSkills = (p.skills || []).map((skill, sIdx) => `
      <span class="skill-pill">${skill}<span class="remove-skill" onclick="removePlayerSkill(${idx}, ${sIdx})">×</span></span>
    `).join('');
    
    const skillPicker = `<div class="skill-editor-container">${currentSkills}<select class="skill-select" onchange="addPlayerSkill(${idx}, this.value)">${allSkillsHtml}</select></div>`;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="#"><input type="number" value="${p.number||''}" style="width:30px" onchange="updatePlayer(${idx}, 'number', this.value)"></td>
      <td data-label="Name"><input type="text" value="${p.name}" onchange="updatePlayer(${idx}, 'name', this.value)"></td>
      <td data-label="Pos">${posSelect}</td>
      <td data-label="MA"><input type="number" value="${p.ma}" style="width:30px" onchange="updatePlayer(${idx}, 'ma', this.value)"></td>
      <td data-label="ST"><input type="number" value="${p.st}" style="width:30px" onchange="updatePlayer(${idx}, 'st', this.value)"></td>
      <td data-label="AG"><input type="number" value="${p.ag}" style="width:30px" onchange="updatePlayer(${idx}, 'ag', this.value)"></td>
      <td data-label="PA"><input type="number" value="${p.pa}" style="width:30px" onchange="updatePlayer(${idx}, 'pa', this.value)"></td>
      <td data-label="AV"><input type="number" value="${p.av}" style="width:30px" onchange="updatePlayer(${idx}, 'av', this.value)"></td>
      <td data-label="Skills">${skillPicker}</td>
      <td data-label="SPP"><input type="number" value="${p.spp}" style="width:40px" onchange="updatePlayer(${idx}, 'spp', this.value)"></td>
      <td data-label="Del"><button onclick="removePlayer(${idx})" style="color:red;border:none;background:none;cursor:pointer;font-weight:bold;">×</button></td>
    `;
    tbody.appendChild(row);
  });
  
  const nameInput = document.getElementById('teamEditNameInput');
  nameInput.oninput = function() {
    state.dirtyTeam.name = this.value;
    if (!state.editTeamId) {
      state.dirtyTeam.id = normalizeName(this.value);
      els.containers.manageTeamEditor.querySelector('input[readonly]').value = state.dirtyTeam.id;
    }
  };
}

window.changeTeamRace = (newRace) => {
  if (state.dirtyTeam.players.length > 0 && !confirm("Changing race will potentially break existing player positions. Continue?")) {
    renderTeamEditor(); return;
  }
  state.dirtyTeam.race = newRace;
  renderTeamEditor();
};

window.updatePlayer = (idx, f, v) => {
  const p = state.dirtyTeam.players[idx];
  if (['number','ma','st','ag','pa','av','spp'].includes(f)) p[f] = parseInt(v) || 0;
  else p[f] = v;
};

window.updatePlayerPos = (idx, v) => { 
  const p = state.dirtyTeam.players[idx];
  p.position = v;
  const r = state.gameData.races.find(r=>r.name===state.dirtyTeam.race);
  const pos = r?.positionals.find(x=>x.name===v);
  if(pos) Object.assign(p, {ma:pos.ma, st:pos.st, ag:pos.ag, pa:pos.pa, av:pos.av, skills:[...pos.skills]});
  renderTeamEditor();
};

window.addSmartPlayer = () => { 
  const t = state.dirtyTeam;
  const r = state.gameData.races.find(r=>r.name===t.race);
  const def = r?.positionals[0] || {name:'L',ma:6,st:3,ag:3,pa:4,av:8,skills:[]};
  const nextNum = (t.players.length > 0) ? Math.max(...t.players.map(p => p.number || 0)) + 1 : 1;
  t.players.push({number:nextNum, name:'Player', position:def.name, ...def, skills:[...def.skills], spp:0});
  renderTeamEditor();
};

window.removePlayer = (idx) => {
  state.dirtyTeam.players.splice(idx,1);
  renderTeamEditor();
};

window.addPlayerSkill = (playerIdx, skillName) => {
  if (!skillName) return;
  const p = state.dirtyTeam.players[playerIdx];
  if (!p.skills) p.skills = [];
  if (!p.skills.includes(skillName)) p.skills.push(skillName);
  renderTeamEditor();
};

window.removePlayerSkill = (playerIdx, skillIdx) => {
  state.dirtyTeam.players[playerIdx].skills.splice(skillIdx, 1);
  renderTeamEditor();
};

window.handleDeleteTeam = async (teamId) => {
  if(!confirm(`Delete team "${teamId}"?`)) return;
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  try {
    await apiDelete(PATHS.team(state.dirtyLeague.id, teamId), `Delete team ${teamId}`, key);
    const idx = state.dirtyLeague.teams.findIndex(t => t.id === teamId);
    if(idx !== -1) state.dirtyLeague.teams.splice(idx, 1);
    await apiSave(PATHS.leagueSettings(state.dirtyLeague.id), state.dirtyLeague, `Remove team ${teamId}`, key);
    renderManageTeamsList();
    setStatus('Team deleted.', 'ok');
  } catch(e) { setStatus(`Delete failed: ${e.message}`, 'error'); }
};

window.handleDeleteLeague = async () => {
  const l = state.dirtyLeague;
  if(!confirm(`DELETE ENTIRE LEAGUE "${l.name}"?`)) return;
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  try {
    for (const t of l.teams) {
      try { await apiDelete(PATHS.team(l.id, t.id), `Delete team ${t.id}`, key); } catch (e) {}
    }
    await apiDelete(PATHS.leagueSettings(l.id), `Delete league ${l.id}`, key);
    const freshIndex = (await apiGet(PATHS.leaguesIndex)) || [];
    const newIndex = freshIndex.filter(x => x.id !== l.id);
    await apiSave(PATHS.leaguesIndex, newIndex, `Remove league ${l.id} from index`, key);
    state.leaguesIndex = newIndex;
    state.editMode = 'league';
    goHome();
    setStatus('League deleted.', 'ok');
  } catch(e) { setStatus(`Delete failed: ${e.message}`, 'error'); }
};

// --- Refactored Save Workflow ---
els.buttons.manageSave.addEventListener('click', async () => {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  setStatus('Saving...', 'info');
  
  try {
    // 1. Saving a TEAM
    if (state.editMode === 'team') {
      const t = state.dirtyTeam;
      const l = state.dirtyLeague;
      
      if (!t.id) return setStatus('Invalid team name.', 'error');
      
      // Capture Colors
      const cp = document.getElementById('teamColorPrimary');
      const cs = document.getElementById('teamColorSecondary');
      if(cp && cs) {
          t.colors = { primary: cp.value, secondary: cs.value };
      }
      
      // Save the team file
      await apiSave(PATHS.team(l.id, t.id), t, `Save team ${t.name}`, key);
      
      // Update local league object's team metadata
      const existingIdx = l.teams.findIndex(x => x.id === t.id);
      
      // DEEP COPY to prevent reference bleeding
      const meta = JSON.parse(JSON.stringify({ 
        id: t.id, 
        name: t.name, 
        race: t.race, 
        coachName: t.coachName, 
        colors: t.colors 
      }));
      
      if (existingIdx >= 0) l.teams[existingIdx] = meta;
      else l.teams.push(meta);
      
      state.editTeamId = t.id;
      
      // Save League File to keep colors in sync
      await apiSave(PATHS.leagueSettings(l.id), l, `Update team list for ${t.name}`, key);
      
      setStatus('Team saved & League updated!', 'ok');
      return; 
    }
    
    // 2. Saving a LEAGUE
    const l = state.dirtyLeague;
    if (!l.id) return setStatus('League ID required.', 'error');
    if (!state.editLeagueId && state.leaguesIndex.find(x => x.id === l.id)) return setStatus('League ID exists.', 'error');
    
    l.name = els.inputs.leagueName.value;
    l.season = parseInt(els.inputs.leagueSeason.value);
    l.status = els.inputs.leagueStatus.value;
    l.settings.pointsWin = parseInt(els.inputs.ptsWin.value);
    l.settings.pointsDraw = parseInt(els.inputs.ptsDraw.value);
    l.settings.pointsLoss = parseInt(els.inputs.ptsLoss.value);
    l.settings.maxTeams = parseInt(els.inputs.maxTeams.value) || 16;
    l.settings.lockTeams = els.inputs.lockTeams.checked;
    
    await apiSave(PATHS.leagueSettings(l.id), l, `Save league ${l.id}`, key);
    
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
  } catch (e) { console.error(e); setStatus(`Save failed: ${e.message}`, 'error'); }
});

els.buttons.createLeague.addEventListener('click', () => handleManageLeague(null));
els.buttons.manageAddTeam.addEventListener('click', () => handleEditTeam(null));
els.buttons.manageBack.addEventListener('click', () => {
  if (state.editMode === 'team') { state.editMode = 'league'; renderManageForm(); }
  else goHome();
});

if(els.buttons.leagueBack) els.buttons.leagueBack.addEventListener('click', () => goHome());
if(els.buttons.teamBack) els.buttons.teamBack.addEventListener('click', () => {
  if (state.currentLeague) handleOpenLeague(state.currentLeague.id);
  else goHome();
});

els.buttons.teamManage.addEventListener('click', async () => {
  if (!state.currentLeague || !state.currentTeam) return;
  await handleManageLeague(state.currentLeague.id);
  await handleEditTeam(state.currentTeam.id);
});

if (els.buttons.scanBtn) els.buttons.scanBtn.addEventListener('click', async () => {
  els.containers.scanResults.innerHTML = '<div class="small">Scanning...</div>';
  try {
    const rootContents = await apiGet('data/leagues');
    if (!Array.isArray(rootContents)) throw new Error("Could not list directories.");
    
    const leagueDirs = rootContents.filter(x => x.type === 'dir').map(x => x.name);
    const indexIds = state.leaguesIndex.map(l => l.id);
    let html = '<table style="width:100%; font-size:0.9rem;">';
    let issuesFound = 0;
    
    for (const leagueId of leagueDirs) {
      if (!indexIds.includes(leagueId)) {
        const s = await apiGet(`data/leagues/${leagueId}/settings.json`);
        if (s) {
          issuesFound++;
          html += `<tr style="background:#fff0f0"><td><strong>GHOST</strong>: ${leagueId}</td><td style="text-align:right"><button onclick="restoreLeague('${leagueId}')">Restore</button></td></tr>`;
        }
      }
      
      const teamFiles = await apiGet(`data/leagues/${leagueId}/teams`);
      const s = await apiGet(`data/leagues/${leagueId}/settings.json`);
      if (Array.isArray(teamFiles) && s) {
        const regIds = s.teams.map(t => t.id);
        const orphans = teamFiles.filter(f => f.name.endsWith('.json')).filter(f => !regIds.includes(f.name.replace('.json', '')));
        orphans.forEach(f => {
          issuesFound++;
          html += `<tr><td>Orphan: ${f.name}</td><td><button onclick="attachTeam('${leagueId}', '${f.name}')">Attach</button></td></tr>`;
        });
      }
    }
    html += '</table>';
    els.containers.scanResults.innerHTML = (issuesFound === 0) ? '<div class="status ok">Clean.</div>' : html;
  } catch (e) { els.containers.scanResults.innerHTML = `<div class="status error">${e.message}</div>`; }
});

window.attachTeam = async (leagueId, filename) => {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Key needed', 'error');
  try {
    const tId = filename.replace('.json', '');
    const t = await apiGet(PATHS.team(leagueId, tId));
    const s = await apiGet(PATHS.leagueSettings(leagueId));
    s.teams.push({ id: t.id, name: t.name, race: t.race, coachName: t.coachName });
    await apiSave(PATHS.leagueSettings(leagueId), s, `Attach ${tId}`, key);
    els.buttons.scanBtn.click();
  } catch(e) { alert(e.message); }
};

window.restoreLeague = async (leagueId) => {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Key needed', 'error');
  try {
    const s = await apiGet(PATHS.leagueSettings(leagueId));
    const idx = await apiGet(PATHS.leaguesIndex) || [];
    idx.push({ id: s.id, name: s.name, season: s.season, status: s.status });
    await apiSave(PATHS.leaguesIndex, idx, `Restore ${leagueId}`, key);
    state.leaguesIndex = idx;
    goHome();
    els.buttons.scanBtn.click();
  } catch(e) { alert(e.message); }
};

window.deleteOrphanFile = async (leagueId, filename) => {
  if(!confirm(`Delete ${filename}?`)) return;
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Key needed', 'error');
  try {
    await apiDelete(`data/leagues/${leagueId}/teams/${filename}`, `Clean orphan ${filename}`, key);
    els.buttons.scanBtn.click();
  } catch(e) { alert(e.message); }
};

window.deleteLeagueFolder = async (leagueId) => {
  if(!confirm(`Delete Settings file for ${leagueId}?`)) return;
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Key needed', 'error');
  try {
    await apiDelete(PATHS.leagueSettings(leagueId), `Delete ghost league ${leagueId}`, key);
    els.buttons.scanBtn.click();
  } catch(e) { alert(e.message); }
};

init();
