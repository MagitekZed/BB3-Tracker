// app.js

const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';
const PATHS = {
  gameData: 'data/gameData.json',
  leaguesIndex: 'data/leagues/index.json',
  leagueSettings: (id) => `data/leagues/${id}/settings.json`,
  team: (leagueId, teamId) => `data/leagues/${leagueId}/teams/${teamId}.json`,
  activeMatch: (matchId) => `data/active_matches/${matchId}.json`
};

// ---- DOM Elements ----
const els = {
  globalStatus: document.getElementById('globalStatus'),
  nav: {
    league: document.getElementById('navLeague'),
    admin: document.getElementById('navAdmin')
  },
  sections: {
    list: document.getElementById('leagueListSection'),
    view: document.getElementById('leagueViewSection'),
    manage: document.getElementById('leagueManageSection'),
    team: document.getElementById('teamViewSection'),
    scoreboard: document.getElementById('scoreboardSection'),
    admin: document.getElementById('adminSection')
  },
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
    sbHomeRoster: document.getElementById('scoreboardHomeRoster'),
    sbAwayRoster: document.getElementById('scoreboardAwayRoster'),
    sbScoreMain: document.getElementById('scoreboardScoreMain'),
    sbScoreMeta: document.getElementById('scoreboardScoreMeta')
  },
  buttons: {
    createLeague: document.getElementById('leagueCreateBtn'),
    leagueBack: document.getElementById('leagueBackBtn'),
    manageBack: document.getElementById('leagueManageBackBtn'),
    manageSave: document.getElementById('leagueManageSaveBtn'),
    manageAddTeam: document.getElementById('leagueManageAddNewTeamBtn'),
    teamBack: document.getElementById('teamBackBtn'),
    teamManage: document.getElementById('teamManageBtn'),
    sbBack: document.getElementById('scoreboardBackToMatchBtn'),
    schedAdd: document.getElementById('schedAddBtn'),
    rememberKey: document.getElementById('rememberKeyBtn'),
    // Admin
    scanBtn: document.getElementById('scanBtn'),
    loadBtn: document.getElementById('loadBtn'),
    saveBtn: document.getElementById('saveBtn')
  },
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
    // Sched
    schedRound: document.getElementById('schedRound'),
    schedHome: document.getElementById('schedHome'),
    schedAway: document.getElementById('schedAway'),
    adminText: document.getElementById('leagueTextarea')
  },
  cards: {
    leagueInfo: document.getElementById('leagueInfoCard'),
    leagueTeams: document.getElementById('leagueTeamsCard'),
    teamEditor: document.getElementById('teamEditorCard')
  },
  datalist: document.getElementById('skillList'),
  scanResults: document.getElementById('scanResults')
};

function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const state = {
  leaguesIndex: [],
  gameData: null,
  currentLeague: null,
  currentTeam: null,
  activeMatchData: null,
  activeMatchPollInterval: null,
  
  viewLeagueId: null,
  viewTeamId: null,
  
  editLeagueId: null,
  editTeamId: null,
  editMode: 'league',
  dirtyLeague: null,
  dirtyTeam: null
};

// ---- API ----
async function apiGet(path) {
  const url = `${API_BASE}/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url);
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

function setStatus(msg, type = 'info') {
  if (!els.globalStatus) return;
  els.globalStatus.textContent = msg;
  els.globalStatus.className = `status ${type}`;
}

// ---- Initialization ----
async function init() {
  setStatus('Initializing...');
  const storedKey = localStorage.getItem('bb3_edit_key');
  if (storedKey && els.inputs.editKey) els.inputs.editKey.value = storedKey;

  try {
    state.gameData = await apiGet(PATHS.gameData);
    populateSkillList();
    const index = await apiGet(PATHS.leaguesIndex);
    state.leaguesIndex = index || [];
    renderLeagueList();
    showSection('list');
    setStatus('Ready.', 'ok');
  } catch (e) {
    console.error(e);
    setStatus(`Init Failed: ${e.message}`, 'error');
  }
}

function showSection(name) {
  // Stop polling if leaving scoreboard
  if (state.activeMatchPollInterval) {
    clearInterval(state.activeMatchPollInterval);
    state.activeMatchPollInterval = null;
  }

  Object.values(els.sections).forEach(el => el.classList.add('hidden'));
  els.sections[name].classList.remove('hidden');
  
  if (name === 'admin') {
    els.nav.league.classList.remove('active');
    els.nav.admin.classList.add('active');
  } else {
    els.nav.league.classList.add('active');
    els.nav.admin.classList.remove('active');
  }
}

// ---- Nav Events ----
els.nav.league.addEventListener('click', () => { showSection('list'); renderLeagueList(); });
els.nav.admin.addEventListener('click', () => showSection('admin'));
if(els.buttons.rememberKey) {
  els.buttons.rememberKey.addEventListener('click', () => {
    const k = els.inputs.editKey.value;
    if(k) { localStorage.setItem('bb3_edit_key', k); setStatus('Key saved.', 'ok'); }
  });
}

// ============================================
// LEAGUE LOGIC
// ============================================

function renderLeagueList() {
  if (!state.leaguesIndex.length) {
    els.containers.leagueList.innerHTML = `<div class="small">No leagues found. Create one to get started.</div>`;
    return;
  }
  els.containers.leagueList.innerHTML = state.leaguesIndex.map(l => `
    <div class="league-card">
      <div class="league-card-main">
        <div class="league-card-title">${l.name}</div>
        <div class="small">ID: ${l.id} | Season ${l.season} | Status: ${l.status}</div>
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
    const settings = await apiGet(PATHS.leagueSettings(id));
    if (!settings) throw new Error("League settings file not found.");
    state.currentLeague = settings;
    state.viewLeagueId = id;
    renderLeagueView();
    showSection('view');
    setStatus('League loaded.', 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
};

function renderLeagueView() {
  const l = state.currentLeague;
  document.getElementById('leagueHeader').innerHTML = `<h2>${l.name}</h2><div class="small">Season ${l.season} (${l.status})</div>`;
  
  // Standings
  const standings = computeStandings(l);
  els.containers.standings.innerHTML = `<table><thead><tr><th>#</th><th>Team</th><th>W-D-L</th><th>Pts</th><th>Diff</th></tr></thead><tbody>
    ${standings.map((s, i) => `<tr><td>${i+1}</td><td><button class="team-link" onclick="handleOpenTeam('${l.id}', '${s.teamId}')">${s.name}</button></td><td>${s.wins}-${s.draws}-${s.losses}</td><td>${s.points}</td><td>${s.tdDiff}/${s.casDiff}</td></tr>`).join('')}
  </tbody></table>`;
  
  // Quick Roster
  if (els.containers.rosterQuick) {
    els.containers.rosterQuick.innerHTML = `<div class="roster-tiles">
      ${l.teams.map(t => `<div class="roster-tile"><div class="roster-tile-title"><button class="team-link" onclick="handleOpenTeam('${l.id}', '${t.id}')">${t.name}</button></div><div class="roster-tile-meta">${t.race} | ${t.coachName}</div></div>`).join('')}
    </div>`;
  }

  // Populate Schedule Dropdowns
  const homeSel = els.inputs.schedHome;
  const awaySel = els.inputs.schedAway;
  homeSel.innerHTML = '<option value="">Home Team...</option>';
  awaySel.innerHTML = '<option value="">Away Team...</option>';
  l.teams.forEach(t => {
    const opt = `<option value="${t.id}">${t.name}</option>`;
    homeSel.innerHTML += opt;
    awaySel.innerHTML += opt;
  });

  renderMatchesList(l);
}

function renderMatchesList(league) {
  if(!league.matches || !league.matches.length) {
    els.containers.matches.innerHTML = '<div class="small">No matches scheduled.</div>';
    return;
  }
  
  // Filter active vs scheduled
  const active = league.matches.filter(m => m.status === 'in_progress');
  const others = league.matches.filter(m => m.status !== 'in_progress').sort((a,b) => a.round - b.round);

  // In Progress
  let inProgHtml = '';
  if (active.length > 0) {
    inProgHtml = '<div class="card"><h4 style="color:#0066cc">Live Matches</h4><ul>' + 
      active.map(m => {
        const h = league.teams.find(t => t.id === m.homeTeamId)?.name || m.homeTeamId;
        const a = league.teams.find(t => t.id === m.awayTeamId)?.name || m.awayTeamId;
        return `<li>Round ${m.round}: ${h} vs ${a} <button class="link-button" onclick="handleOpenScoreboard('${m.id}')"><strong>View Board</strong></button></li>`;
      }).join('') + 
    '</ul></div>';
  }
  els.containers.inProgress.innerHTML = inProgHtml;

  // Scheduled / Completed
  const rows = others.map(m => {
    const h = league.teams.find(t => t.id === m.homeTeamId)?.name || m.homeTeamId;
    const a = league.teams.find(t => t.id === m.awayTeamId)?.name || m.awayTeamId;
    const score = m.status === 'completed' ? `${m.score.home}-${m.score.away}` : '';
    
    let action = m.status;
    if (m.status === 'scheduled') {
        action = `<button class="link-button" onclick="handleStartMatch('${m.id}')" style="color:green; font-weight:bold">Start Match</button>`;
    }

    return `<tr><td>${m.round}</td><td>${h}</td><td>${a}</td><td>${score}</td><td>${action}</td></tr>`;
  }).join('');
  
  els.containers.matches.innerHTML = `<table><thead><tr><th>Rd</th><th>Home</th><th>Away</th><th>Score</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`; 
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
    h.tdDiff += (hf - af); a.tdDiff += (af - hf);
    h.casDiff += (hCas - aCas); a.casDiff += (aCas - hCas);
    if (hf > af) { h.wins++; a.losses++; h.points += (league.settings.pointsWin||3); a.points += (league.settings.pointsLoss||0); }
    else if (hf < af) { a.wins++; h.losses++; a.points += (league.settings.pointsWin||3); h.points += (league.settings.pointsLoss||0); }
    else { h.draws++; a.draws++; h.points += (league.settings.pointsDraw||1); a.points += (league.settings.pointsDraw||1); }
  });
  return Array.from(map.values()).sort((a,b) => b.points - a.points);
}

// ============================================
// MATCH SCHEDULING & STARTING
// ============================================

els.buttons.schedAdd.addEventListener('click', async () => {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  
  const l = state.currentLeague;
  const round = parseInt(els.inputs.schedRound.value);
  const homeId = els.inputs.schedHome.value;
  const awayId = els.inputs.schedAway.value;
  
  if (!homeId || !awayId || homeId === awayId) return alert("Invalid team selection");
  
  setStatus('Scheduling match...');
  try {
    const matchId = `match_${Date.now()}`;
    const newMatch = {
      id: matchId,
      round: round,
      homeTeamId: homeId,
      awayTeamId: awayId,
      status: 'scheduled',
      date: new Date().toISOString().split('T')[0]
    };
    
    l.matches = l.matches || [];
    l.matches.push(newMatch);
    
    await apiSave(PATHS.leagueSettings(l.id), l, `Schedule match ${homeId} vs ${awayId}`, key);
    renderLeagueView();
    setStatus('Match scheduled.', 'ok');
  } catch(e) { setStatus(e.message, 'error'); }
});

window.handleStartMatch = async (matchId) => {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  if(!confirm("Start this match? This will create a live game file.")) return;

  setStatus('Initializing live match...');
  try {
    const l = state.currentLeague;
    const matchIdx = l.matches.findIndex(m => m.id === matchId);
    if(matchIdx === -1) throw new Error("Match not found");
    const m = l.matches[matchIdx];

    // 1. Fetch full team data for rosters
    const homeTeam = await apiGet(PATHS.team(l.id, m.homeTeamId));
    const awayTeam = await apiGet(PATHS.team(l.id, m.awayTeamId));
    
    if(!homeTeam || !awayTeam) throw new Error("Could not load team files.");

    // 2. Create Active Match Object
    const activeData = {
      matchId: m.id,
      leagueId: l.id,
      round: m.round,
      status: 'in_progress',
      home: { id: homeTeam.id, name: homeTeam.name, score: 0, roster: homeTeam.players },
      away: { id: awayTeam.id, name: awayTeam.name, score: 0, roster: awayTeam.players },
      turn: { home: 0, away: 0 },
      log: []
    };

    // 3. Save Active File
    await apiSave(PATHS.activeMatch(m.id), activeData, `Start match ${m.id}`, key);

    // 4. Update League Settings
    m.status = 'in_progress';
    await apiSave(PATHS.leagueSettings(l.id), l, `Set match ${m.id} to in_progress`, key);

    // 5. Go to Scoreboard
    handleOpenScoreboard(m.id);
    setStatus('Match started!', 'ok');

  } catch(e) { setStatus(e.message, 'error'); }
};

// ============================================
// LIVE SCOREBOARD
// ============================================

window.handleOpenScoreboard = async (matchId) => {
  setStatus('Loading live match...');
  try {
    const data = await apiGet(PATHS.activeMatch(matchId));
    if (!data) throw new Error("Active match file not found.");
    
    state.activeMatchData = data;
    renderScoreboard();
    showSection('scoreboard');
    
    // Start Polling
    if (state.activeMatchPollInterval) clearInterval(state.activeMatchPollInterval);
    state.activeMatchPollInterval = setInterval(async () => {
        try {
            const fresh = await apiGet(PATHS.activeMatch(matchId));
            if (fresh) {
                state.activeMatchData = fresh;
                renderScoreboard();
            }
        } catch(e) { console.warn("Poll failed", e); }
    }, 5000); // 5 seconds

    setStatus('Live connection active.', 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
};

function renderScoreboard() {
  const d = state.activeMatchData;
  els.containers.sbScoreMain.textContent = `${d.home.score} - ${d.away.score}`;
  els.containers.sbScoreMeta.textContent = `Round ${d.round} | ${d.home.name} vs ${d.away.name}`;
  
  els.containers.sbHomeRoster.innerHTML = `
    <h3>${d.home.name} (Home)</h3>
    <ul class="roster-list">
      ${d.home.roster.map(p => `<li>#${p.number} ${p.name} <span class="small">(${p.position})</span></li>`).join('')}
    </ul>
  `;
  
  els.containers.sbAwayRoster.innerHTML = `
    <h3>${d.away.name} (Away)</h3>
    <ul class="roster-list">
      ${d.away.roster.map(p => `<li>#${p.number} ${p.name} <span class="small">(${p.position})</span></li>`).join('')}
    </ul>
  `;
}

els.buttons.sbBack.addEventListener('click', () => {
  if (state.activeMatchPollInterval) clearInterval(state.activeMatchPollInterval);
  showSection('view');
  // Refresh league view to update status tags
  if (state.viewLeagueId) handleOpenLeague(state.viewLeagueId);
});

// ============================================
// MANAGEMENT (Teams, Players, Orphans)
// ============================================
// (Previous management code remains the same, included below for completeness)

window.handleManageLeague = async (id) => {
  state.editMode = 'league';
  state.editLeagueId = id;
  state.editTeamId = null;
  state.dirtyLeague = null;
  if (id) {
    try {
      const settings = await apiGet(PATHS.leagueSettings(id));
      state.dirtyLeague = JSON.parse(JSON.stringify(settings));
    } catch (e) { setStatus(e.message, 'error'); return; }
  } else {
    state.dirtyLeague = { id: '', name: '', season: 1, status: 'upcoming', settings: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, maxTeams: 16, lockTeams: false }, teams: [], matches: [] };
  }
  renderManageForm();
  showSection('manage');
};

function renderManageForm() {
  const l = state.dirtyLeague;
  const isNewLeague = !state.editLeagueId;
  els.inputs.leagueId.value = l.id;
  if (isNewLeague) {
    els.inputs.leagueId.placeholder = "Auto-generated from Name";
    els.inputs.leagueId.readOnly = true;
    els.inputs.leagueId.classList.add('faded');
  } else {
    els.inputs.leagueId.readOnly = true;
    els.inputs.leagueId.classList.remove('faded');
  }
  els.inputs.leagueName.value = l.name;
  els.inputs.leagueName.oninput = function() {
    state.dirtyLeague.name = this.value;
    if (isNewLeague) { state.dirtyLeague.id = normalizeName(this.value); els.inputs.leagueId.value = state.dirtyLeague.id; }
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
       delBtn.style.backgroundColor = '#d33';
       delBtn.style.color = 'white';
       delBtn.style.float = 'right';
       delBtn.style.marginTop = '1rem';
       delBtn.onclick = handleDeleteLeague;
       els.cards.leagueInfo.appendChild(delBtn);
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
      const fullTeam = await apiGet(PATHS.team(state.dirtyLeague.id, teamId));
      state.dirtyTeam = fullTeam || createEmptyTeam(teamId);
    } catch(e) { console.error(e); state.dirtyTeam = createEmptyTeam(teamId); }
  } else { state.dirtyTeam = createEmptyTeam(''); }
  renderManageForm(); 
};

function createEmptyTeam(id) {
  const defaultRace = state.gameData?.races?.[0]?.name || 'Human';
  return { id, name: 'New Team', race: defaultRace, coachName: '', players: [] };
}

function renderTeamEditor() {
  const t = state.dirtyTeam;
  const raceOpts = (state.gameData?.races || []).map(r => `<option value="${r.name}" ${t.race === r.name ? 'selected' : ''}>${r.name}</option>`).join('');
  const isNewTeam = !state.editTeamId;
  els.containers.manageTeamEditor.innerHTML = `
    <h3>${state.editTeamId ? 'Edit Team' : 'Add New Team'}</h3>
    <div class="form-grid">
      <div class="form-field"><label>File ID</label><input type="text" value="${t.id}" readonly class="faded" placeholder="Auto-generated"></div>
      <div class="form-field"><label>Name</label><input type="text" value="${t.name}" id="teamEditNameInput"></div>
      <div class="form-field"><label>Coach</label><input type="text" value="${t.coachName}" onchange="state.dirtyTeam.coachName = this.value"></div>
      <div class="form-field"><label>Race</label><select onchange="changeTeamRace(this.value)">${raceOpts}</select></div>
    </div>
    <h4>Roster</h4>
    <table class="roster-editor-table"><thead><tr><th>No</th><th>Name</th><th>Position</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th><th>SPP</th><th></th></tr></thead><tbody id="editorRosterBody"></tbody></table>
    <button onclick="addSmartPlayer()" style="margin-top:0.5rem">+ Add Player</button>
  `;
  const tbody = document.getElementById('editorRosterBody');
  const currentRaceObj = state.gameData?.races.find(r => r.name === t.race);
  const positionalOptions = (currentRaceObj?.positionals || []).map(pos => `<option value="${pos.name}">${pos.name} (${pos.cost/1000}k)</option>`).join('');
  t.players.forEach((p, idx) => {
    const posSelect = `<select style="width:100%" onchange="updatePlayerPos(${idx}, this.value)"><option value="" disabled>Select...</option>${positionalOptions.replace(`value="${p.position}"`, `value="${p.position}" selected`)}</select>`;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="number" value="${p.number||''}" style="width:30px" onchange="updatePlayer(${idx}, 'number', this.value)"></td>
      <td><input type="text" value="${p.name}" onchange="updatePlayer(${idx}, 'name', this.value)"></td>
      <td>${posSelect}</td>
      <td><input type="number" value="${p.ma}" style="width:30px" onchange="updatePlayer(${idx}, 'ma', this.value)"></td>
      <td><input type="number" value="${p.st}" style="width:30px" onchange="updatePlayer(${idx}, 'st', this.value)"></td>
      <td><input type="number" value="${p.ag}" style="width:30px" onchange="updatePlayer(${idx}, 'ag', this.value)"></td>
      <td><input type="number" value="${p.pa}" style="width:30px" onchange="updatePlayer(${idx}, 'pa', this.value)"></td>
      <td><input type="number" value="${p.av}" style="width:30px" onchange="updatePlayer(${idx}, 'av', this.value)"></td>
      <td><input type="text" value="${(p.skills||[]).join(',')}" list="skillList" onchange="updatePlayer(${idx}, 'skills', this.value)"></td>
      <td><input type="number" value="${p.spp}" style="width:40px" onchange="updatePlayer(${idx}, 'spp', this.value)"></td>
      <td><button onclick="removePlayer(${idx})" style="color:red;border:none;background:none;cursor:pointer">X</button></td>
    `;
    tbody.appendChild(row);
  });
  const nameInput = document.getElementById('teamEditNameInput');
  nameInput.oninput = function() {
    state.dirtyTeam.name = this.value;
    if (isNewTeam) { state.dirtyTeam.id = normalizeName(this.value); els.containers.manageTeamEditor.querySelector('input[readonly]').value = state.dirtyTeam.id; }
  };
}

window.changeTeamRace = (newRace) => {
  if (state.dirtyTeam.players.length > 0 && !confirm("Changing race will potentially break existing player positions. Continue?")) { renderTeamEditor(); return; }
  state.dirtyTeam.race = newRace;
  renderTeamEditor();
};
window.updatePlayer = (idx, field, value) => {
  const p = state.dirtyTeam.players[idx];
  if (field === 'skills') p.skills = value.split(',').map(s=>s.trim()).filter(Boolean);
  else if (['number','ma','st','ag','pa','av','spp'].includes(field)) p[field] = parseInt(value) || 0;
  else p[field] = value;
};
window.updatePlayerPos = (idx, newPosName) => {
  const p = state.dirtyTeam.players[idx];
  p.position = newPosName;
  const raceObj = state.gameData.races.find(r => r.name === state.dirtyTeam.race);
  if (!raceObj) return;
  const posObj = raceObj.positionals.find(pos => pos.name === newPosName);
  if (posObj) { p.ma = posObj.ma; p.st = posObj.st; p.ag = posObj.ag; p.pa = posObj.pa; p.av = posObj.av; p.skills = [...posObj.skills]; }
  renderTeamEditor();
};
window.addSmartPlayer = () => {
  const t = state.dirtyTeam;
  const raceObj = state.gameData?.races.find(r => r.name === t.race);
  const defaultPos = raceObj?.positionals?.[0] || { name: 'Lineman', ma:6, st:3, ag:3, pa:4, av:9, skills:[] };
  const nextNum = (t.players.length > 0) ? Math.max(...t.players.map(p => p.number || 0)) + 1 : 1;
  t.players.push({ number: nextNum, name: 'Player', position: defaultPos.name, ma: defaultPos.ma, st: defaultPos.st, ag: defaultPos.ag, pa: defaultPos.pa, av: defaultPos.av, skills: [...defaultPos.skills], spp: 0 });
  renderTeamEditor();
};
window.removePlayer = (idx) => { state.dirtyTeam.players.splice(idx, 1); renderTeamEditor(); };

window.handleDeleteTeam = async (teamId) => {
  if(!confirm(`Delete team "${teamId}"?`)) return;
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  try {
    const l = state.dirtyLeague;
    await apiDelete(PATHS.team(l.id, teamId), `Delete team ${teamId}`, key);
    const idx = l.teams.findIndex(t => t.id === teamId);
    if(idx !== -1) l.teams.splice(idx, 1);
    await apiSave(PATHS.leagueSettings(l.id), l, `Remove team ${teamId}`, key);
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
    for (const t of l.teams) { try { await apiDelete(PATHS.team(l.id, t.id), `Delete team ${t.id}`, key); } catch (e) {} }
    await apiDelete(PATHS.leagueSettings(l.id), `Delete league ${l.id}`, key);
    const freshIndex = (await apiGet(PATHS.leaguesIndex)) || [];
    const newIndex = freshIndex.filter(x => x.id !== l.id);
    await apiSave(PATHS.leaguesIndex, newIndex, `Remove league ${l.id} from index`, key);
    state.leaguesIndex = newIndex;
    state.editMode = 'league';
    showSection('list');
    renderLeagueList();
    setStatus('League deleted.', 'ok');
  } catch(e) { setStatus(`Delete failed: ${e.message}`, 'error'); }
};

els.buttons.manageSave.addEventListener('click', async () => {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  setStatus('Saving...', 'info');
  try {
    if (state.editMode === 'team') {
      const t = state.dirtyTeam;
      const l = state.dirtyLeague;
      if (!t.id) return setStatus('Invalid team name.', 'error');
      if (!state.editTeamId) {
        if (l.teams.find(x => x.id === t.id)) return setStatus('Team ID exists.', 'error');
      }
      await apiSave(PATHS.team(l.id, t.id), t, `Save team ${t.name}`, key);
      const existingIdx = l.teams.findIndex(x => x.id === t.id);
      const meta = { id: t.id, name: t.name, race: t.race, coachName: t.coachName };
      if (existingIdx >= 0) l.teams[existingIdx] = meta;
      else l.teams.push(meta);
      state.editTeamId = t.id;
      setStatus('Team saved locally. Save League to commit.', 'ok');
      state.editMode = 'league';
      renderManageForm();
      return; 
    }
    const l = state.dirtyLeague;
    if (!l.id) return setStatus('League ID required.', 'error');
    if (!state.editLeagueId && state.leaguesIndex.find(x => x.id === l.id)) return setStatus('League ID exists.', 'error');
    l.name = els.inputs.leagueName.value;
    l.season = parseInt(els.inputs.leagueSeason.value);
    l.status = els.inputs.leagueStatus.value;
    l.settings.pointsWin = parseInt(els.inputs.ptsWin.value);
    l.settings.pointsDraw = parseInt(els.inputs.ptsDraw.value);
    l.settings.pointsLoss = parseInt(els.inputs.ptsLoss.value);
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
    showSection('list');
    renderLeagueList();
  } catch (e) { console.error(e); setStatus(`Save failed: ${e.message}`, 'error'); }
});

els.buttons.createLeague.addEventListener('click', () => handleManageLeague(null));
els.buttons.manageAddTeam.addEventListener('click', () => handleEditTeam(null));
els.buttons.leagueBack.addEventListener('click', () => showSection('list'));
els.buttons.manageBack.addEventListener('click', () => { if (state.editMode === 'team') { state.editMode = 'league'; renderManageForm(); } else showSection('list'); });
els.buttons.teamBack.addEventListener('click', () => showSection('view'));
if(els.buttons.scanBtn) els.buttons.scanBtn.addEventListener('click', () => alert("Scanner logic included in previous step (omitted here for brevity, keep your existing logic!)"));

function populateSkillList() {
  if (!state.gameData?.skillCategories) return;
  const list = els.datalist;
  list.innerHTML = '';
  Object.values(state.gameData.skillCategories).flat().forEach(s => { const opt = document.createElement('option'); opt.value = (typeof s === 'object' && s.name) ? s.name : s; list.appendChild(opt); });
}

// NOTE: Please keep the Scanner/Attach logic from the previous step at the end of the file.
init();
