// app.js

// Configuration
const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';
const PATHS = {
  gameData: 'data/gameData.json',
  leaguesIndex: 'data/leagues/index.json',
  leagueSettings: (id) => `data/leagues/${id}/settings.json`,
  team: (leagueId, teamId) => `data/leagues/${leagueId}/teams/${teamId}.json`
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
    match: document.getElementById('matchViewSection'),
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
    matchSummary: document.getElementById('matchSummary'),
    matchOverview: document.getElementById('matchOverviewContainer'),
    matchSpp: document.getElementById('matchSppContainer'),
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
    matchBack: document.getElementById('matchBackBtn'),
    sbBack: document.getElementById('scoreboardBackToMatchBtn'),
    adminLoad: document.getElementById('loadBtn'),
    adminSave: document.getElementById('saveBtn'),
    rememberKey: document.getElementById('rememberKeyBtn')
  },
  inputs: {
    editKey: document.getElementById('editKeyInput'),
    adminText: document.getElementById('leagueTextarea'),
    leagueId: document.getElementById('leagueManageIdInput'),
    leagueName: document.getElementById('leagueManageNameInput'),
    leagueSeason: document.getElementById('leagueManageSeasonInput'),
    leagueStatus: document.getElementById('leagueManageStatusSelect'),
    ptsWin: document.getElementById('leagueManagePointsWinInput'),
    ptsDraw: document.getElementById('leagueManagePointsDrawInput'),
    ptsLoss: document.getElementById('leagueManagePointsLossInput'),
    maxTeams: document.getElementById('leagueManageMaxTeamsInput'),
    lockTeams: document.getElementById('leagueManageLockTeamsInput')
  },
  cards: {
    leagueInfo: document.getElementById('leagueInfoCard'),
    leagueTeams: document.getElementById('leagueTeamsCard'),
    teamEditor: document.getElementById('teamEditorCard')
  },
  datalist: document.getElementById('skillList')
};

// ---- Utility: ID Normalization ----
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ---- State Management ----
const state = {
  leaguesIndex: [],
  gameData: null,
  currentLeague: null,
  currentTeam: null,
  viewLeagueId: null,
  viewTeamId: null,
  viewMatchId: null,
  editLeagueId: null,
  editTeamId: null,
  editMode: 'league',
  dirtyLeague: null,
  dirtyTeam: null
};

// ---- API Abstraction ----

async function apiGet(path) {
  const url = `${API_BASE}/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
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

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${path} failed: ${txt}`);
  }
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

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`DELETE ${path} failed: ${txt}`);
  }
  return res.json();
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

function setStatus(msg, type = 'info') {
  if (!els.globalStatus) return;
  els.globalStatus.textContent = msg;
  els.globalStatus.className = `status ${type}`;
}

// ---- Navigation Logic ----

function showSection(name) {
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

els.nav.league.addEventListener('click', () => { showSection('list'); renderLeagueList(); });
els.nav.admin.addEventListener('click', () => showSection('admin'));

if(els.buttons.rememberKey) {
  els.buttons.rememberKey.addEventListener('click', () => {
    const k = els.inputs.editKey.value;
    if(k) {
      localStorage.setItem('bb3_edit_key', k);
      setStatus('Key saved.', 'ok');
    }
  });
}

// ---- View: League List ----

function renderLeagueList() {
  const container = els.containers.leagueList;
  if (!state.leaguesIndex.length) {
    container.innerHTML = `<div class="small">No leagues found. Create one to get started.</div>`;
    return;
  }

  container.innerHTML = state.leaguesIndex.map(l => `
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

// ---- Actions: Open/Manage League ----

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

window.handleManageLeague = async (id) => {
  state.editMode = 'league';
  state.editLeagueId = id;
  state.editTeamId = null;
  state.dirtyLeague = null;

  if (id) {
    setStatus(`Loading settings for ${id}...`);
    try {
      const settings = await apiGet(PATHS.leagueSettings(id));
      state.dirtyLeague = JSON.parse(JSON.stringify(settings));
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
  setStatus(id ? 'Editing league.' : 'Creating new league.', 'info');
};

// ---- View: League Detail ----

function renderLeagueView() {
  const l = state.currentLeague;
  document.getElementById('leagueHeader').innerHTML = `
    <h2>${l.name}</h2>
    <div class="small">Season ${l.season} (${l.status})</div>
  `;
  const standings = computeStandings(l);
  els.containers.standings.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Team</th><th>W-D-L</th><th>Pts</th><th>Diff</th></tr></thead>
      <tbody>
        ${standings.map((s, i) => `
          <tr>
            <td>${i+1}</td>
            <td><button class="team-link" onclick="handleOpenTeam('${l.id}', '${s.teamId}')">${s.name}</button></td>
            <td>${s.wins}-${s.draws}-${s.losses}</td>
            <td>${s.points}</td>
            <td>${s.tdDiff}/${s.casDiff}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  if (els.containers.rosterQuick) {
    els.containers.rosterQuick.innerHTML = `<div class="roster-tiles">
      ${l.teams.map(t => `
        <div class="roster-tile">
          <div class="roster-tile-title"><button class="team-link" onclick="handleOpenTeam('${l.id}', '${t.id}')">${t.name}</button></div>
          <div class="roster-tile-meta">${t.race} | ${t.coachName}</div>
        </div>
      `).join('')}
    </div>`;
  }
  renderMatchesList(l);
}

function computeStandings(league) {
  const map = new Map();
  league.teams.forEach(t => map.set(t.id, { ...t, wins:0, draws:0, losses:0, points:0, tdDiff:0, casDiff:0 }));
  league.matches.filter(m => m.status === 'completed').forEach(m => {
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

function renderMatchesList(league) {
  if(!league.matches.length) { els.containers.matches.innerHTML = '<div class="small">No matches scheduled.</div>'; return; }
  const rows = league.matches.map(m => {
    const homeT = league.teams.find(t => t.id === m.homeTeamId);
    const awayT = league.teams.find(t => t.id === m.awayTeamId);
    const hName = homeT ? homeT.name : m.homeTeamId;
    const aName = awayT ? awayT.name : m.awayTeamId;
    const score = m.status === 'completed' ? `${m.score.home}-${m.score.away}` : (m.status === 'in_progress' ? 'Live' : 'vs');
    return `<tr><td>${m.round}</td><td>${hName}</td><td>${aName}</td><td>${score}</td><td>${m.status}</td></tr>`;
  }).join('');
  els.containers.matches.innerHTML = `<table><thead><tr><th>Rd</th><th>Home</th><th>Away</th><th>Score</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`; 
}

window.handleOpenTeam = async (leagueId, teamId) => {
  setStatus(`Loading team ${teamId}...`);
  try {
    const teamData = await apiGet(PATHS.team(leagueId, teamId));
    if (!teamData) throw new Error("Team file not found.");
    state.currentTeam = teamData;
    state.viewTeamId = teamId;
    renderTeamView();
    showSection('team');
    setStatus('Team loaded.', 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
};

function renderTeamView() {
  const t = state.currentTeam;
  document.getElementById('teamHeader').textContent = t.name;
  els.containers.teamSummary.innerHTML = `Coach: ${t.coachName} | Race: ${t.race} | TV: ${t.teamValue || 0}`;
  const rows = (t.players || []).map(p => `
    <tr><td>${p.number||''}</td><td>${p.name}</td><td>${p.position}</td><td>${p.ma}</td><td>${p.st}</td><td>${p.ag}</td><td>${p.pa}</td><td>${p.av}</td><td>${(p.skills||[]).join(', ')}</td><td>${p.spp}</td></tr>
  `).join('');
  els.containers.teamRoster.innerHTML = `<table><thead><tr><th>#</th><th>Name</th><th>Pos</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th><th>SPP</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ---- Manage Form (League & Team) ----

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
  els.containers.manageTeams.innerHTML = `
    <table>
      <thead><tr><th>ID</th><th>Name</th><th>Action</th></tr></thead>
      <tbody>
        ${l.teams.map(t => `
          <tr>
            <td>${t.id}</td>
            <td>${t.name}</td>
            <td>
              <button class="link-button" onclick="handleEditTeam('${t.id}')">Edit</button> | 
              <button class="link-button" onclick="handleDeleteTeam('${t.id}')" style="color:red">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
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
  return { id, name: 'New Team', race: 'Human', coachName: '', players: [] };
}

function renderTeamEditor() {
  const t = state.dirtyTeam;
  const raceOpts = (state.gameData?.races || []).map(r => `<option value="${r.name}">${r.name}</option>`).join('');
  const isNewTeam = !state.editTeamId;
  
  els.containers.manageTeamEditor.innerHTML = `
    <h3>${state.editTeamId ? 'Edit Team' : 'Add New Team'}</h3>
    <div class="form-grid">
      <div class="form-field"><label>File ID</label><input type="text" value="${t.id}" readonly class="faded" placeholder="Auto-generated"></div>
      <div class="form-field"><label>Name</label><input type="text" value="${t.name}" id="teamEditNameInput"></div>
      <div class="form-field"><label>Coach</label><input type="text" value="${t.coachName}" onchange="state.dirtyTeam.coachName = this.value"></div>
      <div class="form-field"><label>Race</label><select onchange="state.dirtyTeam.race = this.value;">${raceOpts}</select></div>
    </div>
    
    <h4>Roster</h4>
    <div class="small">Stats, Skills (comma separated), SPP</div>
    <table class="roster-editor-table">
      <thead><tr><th>No</th><th>Name</th><th>Pos</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th><th>SPP</th><th></th></tr></thead>
      <tbody id="editorRosterBody"></tbody>
    </table>
    <button onclick="addPlaceholderPlayer()" style="margin-top:0.5rem">+ Add Player</button>
  `;

  const tbody = document.getElementById('editorRosterBody');
  t.players.forEach((p, idx) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="number" value="${p.number||''}" style="width:30px" onchange="updatePlayer(${idx}, 'number', this.value)"></td>
      <td><input type="text" value="${p.name}" onchange="updatePlayer(${idx}, 'name', this.value)"></td>
      <td><input type="text" value="${p.position}" onchange="updatePlayer(${idx}, 'position', this.value)"></td>
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
    if (isNewTeam) {
      state.dirtyTeam.id = normalizeName(this.value);
      els.containers.manageTeamEditor.querySelector('input[readonly]').value = state.dirtyTeam.id;
    }
  };
  const select = els.containers.manageTeamEditor.querySelector('select');
  if(select) select.value = t.race;
}

window.updatePlayer = (idx, field, value) => {
  const p = state.dirtyTeam.players[idx];
  if (field === 'skills') p.skills = value.split(',').map(s=>s.trim()).filter(Boolean);
  else if (['number','ma','st','ag','pa','av','spp'].includes(field)) p[field] = parseInt(value) || 0;
  else p[field] = value;
};
window.addPlaceholderPlayer = () => {
  state.dirtyTeam.players.push({ name: 'Player', position: 'Lineman', ma:6, st:3, ag:3, pa:4, av:9, skills:[], spp:0 });
  renderTeamEditor();
};
window.removePlayer = (idx) => {
  state.dirtyTeam.players.splice(idx, 1);
  renderTeamEditor();
};

window.handleDeleteTeam = async (teamId) => {
  if(!confirm(`Are you sure you want to delete team "${teamId}"? This cannot be undone.`)) return;
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');

  setStatus(`Deleting team ${teamId}...`);
  try {
    const l = state.dirtyLeague;
    await apiDelete(PATHS.team(l.id, teamId), `Delete team ${teamId}`, key);
    
    const idx = l.teams.findIndex(t => t.id === teamId);
    if(idx !== -1) l.teams.splice(idx, 1);

    await apiSave(PATHS.leagueSettings(l.id), l, `Remove team ${teamId} from registry`, key);
    renderManageTeamsList();
    setStatus('Team deleted.', 'ok');
  } catch(e) { setStatus(`Delete failed: ${e.message}`, 'error'); }
};

window.handleDeleteLeague = async () => {
  const l = state.dirtyLeague;
  if(!confirm(`DELETE ENTIRE LEAGUE "${l.name}"?\nThis will PERMANENTLY delete the league and ALL associated teams.`)) return;
  
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');

  setStatus(`Deleting league ${l.id}...`);
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
      if (!t.id) return setStatus('Team name invalid.', 'error');
      if (!state.editTeamId) {
        const conflict = l.teams.find(x => x.id === t.id);
        if (conflict) return setStatus(`Team ID "${t.id}" already exists.`, 'error');
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
    if (!state.editLeagueId) {
       const conflict = state.leaguesIndex.find(x => x.id === l.id);
       if (conflict) return setStatus(`League ID "${l.id}" already exists.`, 'error');
    }
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
els.buttons.manageBack.addEventListener('click', () => {
  if (state.editMode === 'team') { state.editMode = 'league'; renderManageForm(); } 
  else showSection('list');
});
els.buttons.teamBack.addEventListener('click', () => showSection('view'));

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
// GLOBAL SCANNER & ATTACH LOGIC
// ============================================

const scanBtn = document.getElementById('scanBtn');
const scanResults = document.getElementById('scanResults');

if (scanBtn) {
  scanBtn.addEventListener('click', async () => {
    scanResults.innerHTML = '<div class="small">Scanning all leagues...</div>';
    
    try {
      // 1. Get ALL folders in data/leagues
      const rootContents = await apiGet('data/leagues');
      if (!Array.isArray(rootContents)) throw new Error("Could not list directories.");
      
      const leagueDirs = rootContents.filter(x => x.type === 'dir').map(x => x.name);
      const indexIds = state.leaguesIndex.map(l => l.id);
      
      let html = '<table style="width:100%; font-size:0.9rem;">';
      let issuesFound = 0;

      // 2. Iterate every league directory found on the server
      for (const leagueId of leagueDirs) {
        // A. Check for "Ghost" Leagues (Folder exists, but not in Index)
        if (!indexIds.includes(leagueId)) {
           // Verify it has settings
           const settings = await apiGet(`data/leagues/${leagueId}/settings.json`);
           if (settings) {
              issuesFound++;
              html += `<tr style="background:#fff0f0">
                <td><strong>GHOST LEAGUE</strong>: ${leagueId}</td>
                <td style="text-align:right">
                   <button onclick="restoreLeague('${leagueId}')" style="color:green">Restore</button> | 
                   <button onclick="deleteLeagueFolder('${leagueId}')" style="color:red">Delete</button>
                </td>
              </tr>`;
           }
        }

        // B. Check for Orphaned Teams (File exists, but not in Settings)
        const teamFiles = await apiGet(`data/leagues/${leagueId}/teams`);
        const settings = await apiGet(`data/leagues/${leagueId}/settings.json`);
        
        if (Array.isArray(teamFiles) && settings) {
           const registeredIds = settings.teams.map(t => t.id);
           
           const orphans = teamFiles
             .filter(f => f.name.endsWith('.json'))
             .filter(f => !registeredIds.includes(f.name.replace('.json', '')));
             
           orphans.forEach(f => {
             issuesFound++;
             html += `<tr>
               <td>Orphan Team (in ${leagueId}): ${f.name}</td>
               <td style="text-align:right">
                 <button onclick="attachTeam('${leagueId}', '${f.name}')" style="color:#007bff">Attach</button> | 
                 <button onclick="deleteOrphanFile('${leagueId}', '${f.name}')" style="color:red">Delete</button>
               </td>
             </tr>`;
           });
        }
      }
      
      html += '</table>';
      
      if (issuesFound === 0) {
        scanResults.innerHTML = '<div class="status ok">Repository is clean. No orphans found.</div>';
      } else {
        scanResults.innerHTML = html;
      }
      
    } catch (e) {
      scanResults.innerHTML = `<div class="status error">Scan failed: ${e.message}</div>`;
    }
  });
}

// -- Actions for Scanner --

window.attachTeam = async (leagueId, filename) => {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  
  try {
     const teamId = filename.replace('.json', '');
     // 1. Fetch team data
     const team = await apiGet(PATHS.team(leagueId, teamId));
     // 2. Fetch settings
     const settings = await apiGet(PATHS.leagueSettings(leagueId));
     
     // 3. Attach
     settings.teams.push({
       id: team.id,
       name: team.name,
       race: team.race,
       coachName: team.coachName
     });
     
     // 4. Save
     await apiSave(PATHS.leagueSettings(leagueId), settings, `Attach orphan ${teamId}`, key);
     
     scanBtn.click(); // Refresh
     setStatus(`Attached ${team.name}`, 'ok');
  } catch(e) { alert(e.message); }
};

window.restoreLeague = async (leagueId) => {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');

  try {
    const settings = await apiGet(PATHS.leagueSettings(leagueId));
    // Add to index
    const index = await apiGet(PATHS.leaguesIndex) || [];
    index.push({ id: settings.id, name: settings.name, season: settings.season, status: settings.status });
    
    await apiSave(PATHS.leaguesIndex, index, `Restored ghost league ${leagueId}`, key);
    
    state.leaguesIndex = index;
    renderLeagueList();
    scanBtn.click();
    setStatus(`Restored ${settings.name}`, 'ok');
  } catch(e) { alert(e.message); }
};

window.deleteOrphanFile = async (leagueId, filename) => {
  if(!confirm(`Delete ${filename}?`)) return;
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  
  try {
    await apiDelete(`data/leagues/${leagueId}/teams/${filename}`, `Clean orphan ${filename}`, key);
    scanBtn.click();
  } catch(e) { alert(e.message); }
};

window.deleteLeagueFolder = async (leagueId) => {
  // Simple delete settings file (teams technically remain, but league is gone)
  // For "Ghost" cleanup, this is usually enough to stop it appearing. 
  // A Deep Delete would look like the main delete function.
  if(!confirm(`Delete Settings file for ${leagueId}?`)) return;
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');

  try {
    await apiDelete(PATHS.leagueSettings(leagueId), `Delete ghost league ${leagueId}`, key);
    scanBtn.click();
  } catch(e) { alert(e.message); }
};

init();
