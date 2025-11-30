// app.js

// Your Worker URL
const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';

// DOM elements
const globalStatusEl = document.getElementById('globalStatus');

// Nav buttons
const navLeagueBtn = document.getElementById('navLeague');
const navAdminBtn = document.getElementById('navAdmin');

// Sections
const leagueListSection = document.getElementById('leagueListSection');
const leagueViewSection = document.getElementById('leagueViewSection');
const leagueManageSection = document.getElementById('leagueManageSection');
const teamViewSection = document.getElementById('teamViewSection');
const matchViewSection = document.getElementById('matchViewSection');
const scoreboardSection = document.getElementById('scoreboardSection');
const adminSection = document.getElementById('adminSection');

// League list elements
const leagueListContainer = document.getElementById('leagueListContainer');
const leagueCreateBtn = document.getElementById('leagueCreateBtn');

// League detail elements
const leagueBackBtn = document.getElementById('leagueBackBtn');
const leagueHeaderEl = document.getElementById('leagueHeader');
const standingsContainer = document.getElementById('standingsContainer');
const matchesContainer = document.getElementById('matchesContainer');
const inProgressContainer = document.getElementById('inProgressContainer');

// League manage elements
const leagueManageHeader = document.getElementById('leagueManageHeader');
const leagueManageBackBtn = document.getElementById('leagueManageBackBtn');
const leagueManageStatusEl = document.getElementById('leagueManageStatus');

const leagueInfoCard = document.getElementById('leagueInfoCard');

const leagueManageIdInput = document.getElementById('leagueManageIdInput');
const leagueManageNameInput = document.getElementById('leagueManageNameInput');
const leagueManageSeasonInput = document.getElementById('leagueManageSeasonInput');
const leagueManageStatusSelect = document.getElementById('leagueManageStatusSelect');
const leagueManagePointsWinInput = document.getElementById('leagueManagePointsWinInput');
const leagueManagePointsDrawInput = document.getElementById('leagueManagePointsDrawInput');
const leagueManagePointsLossInput = document.getElementById('leagueManagePointsLossInput');
const leagueManageMaxTeamsInput = document.getElementById('leagueManageMaxTeamsInput');
const leagueManageLockTeamsInput = document.getElementById('leagueManageLockTeamsInput');

const leagueManageTeamsList = document.getElementById('leagueManageTeamsList');
const leagueManageTeamEditor = document.getElementById('leagueManageTeamEditor');
const leagueManageAddNewTeamBtn = document.getElementById('leagueManageAddNewTeamBtn');
const leagueManageSaveBtn = document.getElementById('leagueManageSaveBtn');

// Team view elements
const teamBackBtn = document.getElementById('teamBackBtn');
const teamHeaderEl = document.getElementById('teamHeader');
const teamManageBtn = document.getElementById('teamManageBtn');
const teamSummaryEl = document.getElementById('teamSummary');
const teamRosterContainer = document.getElementById('teamRosterContainer');

// Match view elements
const matchBackBtn = document.getElementById('matchBackBtn');
const matchHeaderEl = document.getElementById('matchHeader');
const matchSummaryEl = document.getElementById('matchSummary');
const matchOverviewContainer = document.getElementById('matchOverviewContainer');
const matchSppContainer = document.getElementById('matchSppContainer');
const matchOpenScoreboardBtn = document.getElementById('matchOpenScoreboardBtn');

// Scoreboard elements
const scoreboardHeaderEl = document.getElementById('scoreboardHeader');
const scoreboardMetaEl = document.getElementById('scoreboardMeta');
const scoreboardHomeRosterEl = document.getElementById('scoreboardHomeRoster');
const scoreboardAwayRosterEl = document.getElementById('scoreboardAwayRoster');
const scoreboardScoreMainEl = document.getElementById('scoreboardScoreMain');
const scoreboardScoreMetaEl = document.getElementById('scoreboardScoreMeta');
const scoreboardBackToMatchBtn = document.getElementById('scoreboardBackToMatchBtn');

// Admin / JSON editor elements
const editKeyInput = document.getElementById('editKeyInput');
const rememberKeyBtn = document.getElementById('rememberKeyBtn');
const loadBtn = document.getElementById('loadBtn');
const saveBtn = document.getElementById('saveBtn');
const leagueTextarea = document.getElementById('leagueTextarea');
const adminStatusEl = document.getElementById('adminStatus');

// App state
const state = {
  rawData: null,         // full JSON from /api/league
  leagues: [],
  currentLeagueId: null,
  selectedTeamId: null,
  selectedMatchId: null,
  editingLeagueId: null,
  editingTeamId: null,
  gameData: null
};

// ---- Utility status helpers ----

function setGlobalStatus(msg, type = 'info') {
  if (!globalStatusEl) return;
  globalStatusEl.textContent = msg || '';
  globalStatusEl.className = 'status';
  if (type === 'error') globalStatusEl.classList.add('error');
  if (type === 'ok') globalStatusEl.classList.add('ok');
}

function setAdminStatus(msg, type = 'info') {
  if (!adminStatusEl) return;
  adminStatusEl.textContent = msg || '';
  adminStatusEl.className = 'status';
  if (type === 'error') adminStatusEl.classList.add('error');
  if (type === 'ok') adminStatusEl.classList.add('ok');
}

function setLeagueManageStatus(msg, type = 'info') {
  if (!leagueManageStatusEl) return;
  leagueManageStatusEl.textContent = msg || '';
  leagueManageStatusEl.className = 'small';
  if (type === 'error') leagueManageStatusEl.style.color = 'red';
  else if (type === 'ok') leagueManageStatusEl.style.color = '#0a0';
  else leagueManageStatusEl.style.color = '#666';
}

// ---- Helpers to get current objects ----

function getLeagueById(id) {
  return state.leagues.find(l => l.id === id) || null;
}

function getCurrentLeague() {
  return getLeagueById(state.currentLeagueId);
}

function getTeamById(league, teamId) {
  return league.teams.find(t => t.id === teamId) || null;
}

function getMatchById(league, matchId) {
  return league.matches.find(m => m.id === matchId) || null;
}

// ---- Navigation / view toggling ----

function hideAllMainSections() {
  leagueListSection.classList.add('hidden');
  leagueViewSection.classList.add('hidden');
  leagueManageSection.classList.add('hidden');
  teamViewSection.classList.add('hidden');
  matchViewSection.classList.add('hidden');
  scoreboardSection.classList.add('hidden');
  adminSection.classList.add('hidden');
}

function showLeagueShell() {
  navLeagueBtn.classList.add('active');
  navAdminBtn.classList.remove('active');
  adminSection.classList.add('hidden');
}

function showAdminShell() {
  navLeagueBtn.classList.remove('active');
  navAdminBtn.classList.add('active');
  adminSection.classList.remove('hidden');

  leagueListSection.classList.add('hidden');
  leagueViewSection.classList.add('hidden');
  leagueManageSection.classList.add('hidden');
  teamViewSection.classList.add('hidden');
  matchViewSection.classList.add('hidden');
  scoreboardSection.classList.add('hidden');
}

function showLeagueListView() {
  showLeagueShell();
  hideAllMainSections();
  leagueListSection.classList.remove('hidden');
}

function showLeagueView() {
  showLeagueShell();
  hideAllMainSections();
  leagueViewSection.classList.remove('hidden');
}

function showLeagueManageView() {
  showLeagueShell();
  hideAllMainSections();
  leagueManageSection.classList.remove('hidden');
}

function showTeamView() {
  showLeagueShell();
  hideAllMainSections();
  teamViewSection.classList.remove('hidden');
}

function showMatchView() {
  showLeagueShell();
  hideAllMainSections();
  matchViewSection.classList.remove('hidden');
}

function showScoreboardView() {
  showLeagueShell();
  hideAllMainSections();
  scoreboardSection.classList.remove('hidden');
}

// Nav click handlers
navLeagueBtn.addEventListener('click', () => {
  state.selectedTeamId = null;
  state.selectedMatchId = null;
  state.editingLeagueId = null;
  state.editingTeamId = null;
  showLeagueListView();
  renderLeagueList();
});

navAdminBtn.addEventListener('click', () => {
  showAdminShell();
});

// Back buttons
if (leagueBackBtn) {
  leagueBackBtn.addEventListener('click', () => {
    state.currentLeagueId = null;
    state.selectedTeamId = null;
    state.selectedMatchId = null;
    showLeagueListView();
    renderLeagueList();
  });
}

if (leagueManageBackBtn) {
  leagueManageBackBtn.addEventListener('click', () => {
    state.editingLeagueId = null;
    state.editingTeamId = null;
    showLeagueListView();
    renderLeagueList();
  });
}

if (teamBackBtn) {
  teamBackBtn.addEventListener('click', () => {
    state.selectedTeamId = null;
    showLeagueView();
    renderLeagueView();
  });
}

if (teamManageBtn) {
  teamManageBtn.addEventListener('click', () => {
    const league = getCurrentLeague();
    if (!league || !state.selectedTeamId) return;

    state.editingLeagueId = league.id;
    state._editingLeagueLocal = league;
    state.editingTeamId = state.selectedTeamId;

    leagueManageHeader.textContent = 'Manage Team';
    showLeagueManageView();
    renderLeagueManageTeamsList(league);
    renderLeagueManageTeamEditor(state.selectedTeamId);
    setLeagueManageStatus(`Editing team ${state.selectedTeamId}. Changes are not saved until you save the league.`, 'info');
  });
}

if (matchBackBtn) {
  matchBackBtn.addEventListener('click', () => {
    state.selectedMatchId = null;
    showLeagueView();
    renderLeagueView();
  });
}

if (scoreboardBackToMatchBtn) {
  scoreboardBackToMatchBtn.addEventListener('click', () => {
    showMatchView();
    renderMatchView();
  });
}

// ---- Edit key handling ----

(function initEditKey() {
  const stored = localStorage.getItem('bb3_edit_key');
  if (stored && editKeyInput) {
    editKeyInput.value = stored;
  }
})();

if (rememberKeyBtn) {
  rememberKeyBtn.addEventListener('click', () => {
    const key = (editKeyInput.value || '').trim();
    if (!key) {
      setAdminStatus('Edit key is empty; nothing to remember.', 'error');
      return;
    }
    localStorage.setItem('bb3_edit_key', key);
    setAdminStatus('Edit key saved on this device.', 'ok');
  });
}

// ---- API helpers ----

async function fetchLeagueData() {
  const res = await fetch(`${API_BASE}/api/league`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load league.json: HTTP ${res.status} - ${text}`);
  }
  return res.json();
}

async function fetchGameData() {
  try {
    const res = await fetch('data/gameData.json');
    if (!res.ok) {
      throw new Error(`Failed to load gameData.json: HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error('Error loading gameData.json', err);
    return null;
  }
}

async function saveLeagueJSON(jsonText, editKey) {
  if (!editKey) {
    throw new Error('Edit key is required to save.');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error('Invalid JSON: ' + e.message);
  }

  const res = await fetch(`${API_BASE}/api/league`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Edit-Key': editKey
    },
    body: JSON.stringify({
      league: parsed,
      message: 'Update league from web UI'
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Save failed: HTTP ${res.status} - ${text}`);
  }

  return res.json();
}

// ---- Standings computation ----

function computeStandings(league) {
  const teamsById = new Map();
  league.teams.forEach(team => {
    teamsById.set(team.id, team);
  });

  const standings = new Map();

  function ensureTeam(teamId) {
    if (!standings.has(teamId)) {
      const t = teamsById.get(teamId);
      standings.set(teamId, {
        teamId,
        name: t ? t.name : teamId,
        coachName: t ? t.coachName : '',
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
        tdFor: 0,
        tdAgainst: 0,
        tdDiff: 0,
        casFor: 0,
        casAgainst: 0,
        casDiff: 0
      });
    }
    return standings.get(teamId);
  }

  league.matches
    .filter(m => m.status === 'completed')
    .forEach(match => {
      const home = ensureTeam(match.homeTeamId);
      const away = ensureTeam(match.awayTeamId);

      const hf = (match.score && match.score.home != null) ? match.score.home : 0;
      const af = (match.score && match.score.away != null) ? match.score.away : 0;

      const hCasF = match.casualties ? (match.casualties.homeInflicted || 0) : 0;
      const aCasF = match.casualties ? (match.casualties.awayInflicted || 0) : 0;

      home.played += 1;
      away.played += 1;

      home.tdFor += hf;
      home.tdAgainst += af;
      away.tdFor += af;
      away.tdAgainst += hf;

      home.casFor += hCasF;
      home.casAgainst += aCasF;
      away.casFor += aCasF;
      away.casAgainst += hCasF;

      if (hf > af) {
        home.wins += 1;
        away.losses += 1;
        home.points += league.settings.pointsWin;
        away.points += league.settings.pointsLoss;
      } else if (hf < af) {
        away.wins += 1;
        home.losses += 1;
        away.points += league.settings.pointsWin;
        home.points += league.settings.pointsLoss;
      } else {
        home.draws += 1;
        away.draws += 1;
        home.points += league.settings.pointsDraw;
        away.points += league.settings.pointsDraw;
      }
    });

  standings.forEach(s => {
    s.tdDiff = s.tdFor - s.tdAgainst;
    s.casDiff = s.casFor - s.casAgainst;
  });

  const arr = Array.from(standings.values());

  arr.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.tdDiff !== a.tdDiff) return b.tdDiff - a.tdDiff;
    if (b.casDiff !== a.casDiff) return b.casDiff - a.casDiff;
    return a.name.localeCompare(b.name);
  });

  return arr;
}

// ---- Rendering: League List ----

function renderLeagueList() {
  const leagues = state.leagues || [];

  if (!leagues.length) {
    leagueListContainer.innerHTML = `
      <div class="small">No leagues defined yet. Use "Create New League" or the Admin view to add one.</div>
    `;
    return;
  }

  const cards = leagues.map(l => {
    const completed = l.matches.filter(m => m.status === 'completed').length;
    const scheduled = l.matches.filter(m => m.status === 'scheduled').length;
    const inProgress = l.matches.filter(m => m.status === 'in_progress').length;
    return `
      <div class="league-card">
        <div class="league-card-main">
          <div class="league-card-title">${l.name}</div>
          <div class="small">
            ID: ${l.id} &mdash; Season ${l.season} &mdash; Status: ${l.status}<br/>
            Teams: ${l.teams.length} | Completed: ${completed} | Scheduled: ${scheduled}${
              inProgress ? ` | In progress: ${inProgress}` : ''
            }
          </div>
        </div>
        <div>
          <button class="link-button league-open-btn" data-league-id="${l.id}">Open</button>
          &nbsp;|&nbsp;
          <button class="link-button league-manage-btn" data-league-id="${l.id}">Manage</button>
        </div>
      </div>
    `;
  }).join('');

  leagueListContainer.innerHTML = cards;

  leagueListContainer.querySelectorAll('.league-open-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-league-id');
      if (!id) return;
      state.currentLeagueId = id;
      state.selectedTeamId = null;
      state.selectedMatchId = null;
      showLeagueView();
      renderLeagueView();
    });
  });

  leagueListContainer.querySelectorAll('.league-manage-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-league-id');
      if (!id) return;
      openLeagueManage(id);
    });
  });
}

// ---- League Manage: helpers ----

function openLeagueManage(leagueIdOrNull) {
  state.editingLeagueId = leagueIdOrNull || null;
  state.editingTeamId = null;

  const isNew = !leagueIdOrNull;
  let league;

  if (isNew) {
    league = {
      id: '',
      name: '',
      season: 1,
      status: 'upcoming',
      settings: {
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
        tiebreakers: ['points', 'tdDiff', 'casDiff'],
        maxTeams: 16,
        lockTeams: false
      },
      teams: [],
      matches: []
    };
  } else {
    league = getLeagueById(leagueIdOrNull);
    if (!league) {
      setGlobalStatus('League not found for management.', 'error');
      return;
    }
  }

  state._editingLeagueLocal = isNew ? league : league;

  populateLeagueManageForm(league);
  renderLeagueManageTeamsList(league);
  renderLeagueManageTeamEditor(null);

  leagueManageHeader.textContent = isNew ? 'Create New League' : `Manage League: ${league.name}`;
  setLeagueManageStatus(isNew ? 'Fill out the fields to create a new league.' : 'Editing existing league.', 'info');

  showLeagueManageView();
}

function populateLeagueManageForm(league) {
  leagueManageIdInput.value = league.id || '';
  leagueManageNameInput.value = league.name || '';
  leagueManageSeasonInput.value = league.season != null ? league.season : 1;
  leagueManageStatusSelect.value = league.status || 'active';

  const s = league.settings || {};
  leagueManagePointsWinInput.value = s.pointsWin != null ? s.pointsWin : 3;
  leagueManagePointsDrawInput.value = s.pointsDraw != null ? s.pointsDraw : 1;
  leagueManagePointsLossInput.value = s.pointsLoss != null ? s.pointsLoss : 0;
  leagueManageMaxTeamsInput.value = s.maxTeams != null ? s.maxTeams : 16;
  leagueManageLockTeamsInput.checked = !!s.lockTeams;
}

function renderLeagueManageTeamsList(league) {
  if (!league.teams || !league.teams.length) {
    leagueManageTeamsList.innerHTML = `<div class="small">No teams in this league yet.</div>`;
    return;
  }

  const rows = league.teams.map(t => `
    <tr>
      <td>${t.id}</td>
      <td>${t.name}</td>
      <td>${t.race || ''}</td>
      <td>${t.coachName || ''}</td>
      <td>
        <button class="link-button league-team-edit-btn" data-team-id="${t.id}">Edit</button>
        &nbsp;|&nbsp;
        <button class="link-button league-team-remove-btn" data-team-id="${t.id}">Remove</button>
      </td>
    </tr>
  `).join('');

  leagueManageTeamsList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Race</th>
          <th>Coach</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  leagueManageTeamsList.querySelectorAll('.league-team-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const teamId = btn.getAttribute('data-team-id');
      state.editingTeamId = teamId;
      renderLeagueManageTeamEditor(teamId);
    });
  });

  leagueManageTeamsList.querySelectorAll('.league-team-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const teamId = btn.getAttribute('data-team-id');
      removeTeamFromEditingLeague(teamId);
    });
  });
}

function removeTeamFromEditingLeague(teamId) {
  const league = state._editingLeagueLocal;
  if (!league) return;
  const idx = league.teams.findIndex(t => t.id === teamId);
  if (idx === -1) return;

  league.teams.splice(idx, 1);
  if (state.editingTeamId === teamId) {
    state.editingTeamId = null;
    renderLeagueManageTeamEditor(null);
  }
  renderLeagueManageTeamsList(league);
  setLeagueManageStatus(`Removed team ${teamId} from league (not saved yet).`, 'info');
}

function renderLeagueManageTeamEditor(teamIdOrNull) {
  const league = state._editingLeagueLocal;
  if (!league) {
    if (leagueInfoCard) leagueInfoCard.style.display = '';
    leagueManageTeamEditor.innerHTML = '';
    return;
  }

  // If no specific team is selected, show a helper message and keep league info visible
  if (!teamIdOrNull) {
    if (leagueInfoCard) leagueInfoCard.style.display = '';
    leagueManageTeamEditor.innerHTML = `<div class="small">Select a team to edit, or add a new team.</div>`;
    return;
  }

  const team = league.teams.find(t => t.id === teamIdOrNull);
  if (!team) {
    if (leagueInfoCard) leagueInfoCard.style.display = '';
    leagueManageTeamEditor.innerHTML = `<div class="small">Team not found.</div>`;
    return;
  }

  // When actively editing a team, hide the league-level edit block so this view is "about the team only"
  if (leagueInfoCard) leagueInfoCard.style.display = 'none';

  const gameData = state.gameData || {};
  const races = Array.isArray(gameData.races) ? gameData.races : [];

  // Race field can be either a dropdown (if gameData is available) or a free text input as a fallback
  let raceFieldHtml;
  if (races.length) {
    let options = races
      .map(r => `<option value="${r}" ${r === (team.race || '') ? 'selected' : ''}>${r}</option>`)
      .join('');
    if (team.race && !races.includes(team.race)) {
      options += `<option value="${team.race}" selected>${team.race} (custom)</option>`;
    }
    raceFieldHtml = `
      <div class="form-field">
        <label>Race</label>
        <select id="teamEditRaceSelect">
          <option value="">-- Select race --</option>
          ${options}
        </select>
      </div>
    `;
  } else {
    raceFieldHtml = `
      <div class="form-field">
        <label>Race</label>
        <input type="text" id="teamEditRaceInput" value="${team.race || ''}" />
      </div>
    `;
  }

  leagueManageTeamEditor.innerHTML = `
    <h3>Edit Team</h3>
    <div class="form-grid">
      <div class="form-field">
        <label>Team ID</label>
        <input type="text" id="teamEditIdInput" value="${team.id}" />
        <div class="small">Internal ID; must be unique in this league.</div>
      </div>
      <div class="form-field">
        <label>Team Name</label>
        <input type="text" id="teamEditNameInput" value="${team.name || ''}" />
      </div>
      ${raceFieldHtml}
      <div class="form-field">
        <label>Coach Name</label>
        <input type="text" id="teamEditCoachInput" value="${team.coachName || ''}" />
      </div>
      <div class="form-field">
        <label>Team Value (TV)</label>
        <input type="number" id="teamEditTvInput" value="${team.teamValue != null ? team.teamValue : ''}" />
      </div>
      <div class="form-field">
        <label>Treasury</label>
        <input type="number" id="teamEditTreasuryInput" value="${team.treasury != null ? team.treasury : 0}" />
      </div>
      <div class="form-field">
        <label>Rerolls</label>
        <input type="number" id="teamEditRerollsInput" value="${team.rerolls != null ? team.rerolls : 0}" />
      </div>
      <div class="form-field">
        <label>Dedicated Fans</label>
        <input type="number" id="teamEditDfInput" value="${team.dedicatedFans != null ? team.dedicatedFans : 0}" />
      </div>
    </div>
    <div class="small" style="margin-top: 0.5rem;">
      Player rosters will be editable in a separate view later; this is team-level meta only.
    </div>
  `;

  // Wire input change -> update team object in memory
  const idInput = document.getElementById('teamEditIdInput');
  const nameInput = document.getElementById('teamEditNameInput');
  const raceInput = document.getElementById('teamEditRaceInput');
  const raceSelect = document.getElementById('teamEditRaceSelect');
  const coachInput = document.getElementById('teamEditCoachInput');
  const tvInput = document.getElementById('teamEditTvInput');
  const treasuryInput = document.getElementById('teamEditTreasuryInput');
  const rerollsInput = document.getElementById('teamEditRerollsInput');
  const dfInput = document.getElementById('teamEditDfInput');

  function apply() {
    team.id = idInput.value.trim();
    team.name = nameInput.value.trim();
    if (raceSelect) {
      team.race = raceSelect.value || '';
    } else if (raceInput) {
      team.race = raceInput.value.trim();
    }
    team.coachName = coachInput.value.trim();
    team.teamValue = tvInput.value ? parseInt(tvInput.value, 10) : null;
    team.treasury = treasuryInput.value ? parseInt(treasuryInput.value, 10) : 0;
    team.rerolls = rerollsInput.value ? parseInt(rerollsInput.value, 10) : 0;
    team.dedicatedFans = dfInput.value ? parseInt(dfInput.value, 10) : 0;
  }

  [idInput, nameInput, raceInput, raceSelect, coachInput, tvInput, treasuryInput, rerollsInput, dfInput]
    .filter(Boolean)
    .forEach(input => {
      input.addEventListener('input', () => {
        apply();
        renderLeagueManageTeamsList(league); // update ID/name in the list as you type
      });
    });
}

// Add new team
if (leagueManageAddNewTeamBtn) {
  leagueManageAddNewTeamBtn.addEventListener('click', () => {
    const league = state._editingLeagueLocal;
    if (!league) return;

    const newId = `team_${Date.now()}`;
    const newTeam = {
      id: newId,
      name: 'New Team',
      race: '',
      coachName: '',
      treasury: 0,
      rerolls: 0,
      dedicatedFans: 0,
      teamValue: null,
      players: []
    };

    league.teams.push(newTeam);
    state.editingTeamId = newId;

    renderLeagueManageTeamsList(league);
    renderLeagueManageTeamEditor(newId);
    setLeagueManageStatus(`Added new team ${newId} (not saved yet).`, 'info');
  });
}

// Save League Changes
if (leagueManageSaveBtn) {
  leagueManageSaveBtn.addEventListener('click', async () => {
    try {
      const key = (editKeyInput.value || '').trim();
      if (!key) {
        setLeagueManageStatus('Edit key is required to save. Enter it in the Admin section.', 'error');
        return;
      }

      let league = state._editingLeagueLocal;
      if (!league) {
        setLeagueManageStatus('No league loaded for editing.', 'error');
        return;
      }

      const newId = leagueManageIdInput.value.trim();
      if (!newId) {
        setLeagueManageStatus('League ID is required.', 'error');
        return;
      }

      league.id = newId;
      league.name = leagueManageNameInput.value.trim() || 'Unnamed League';
      league.season = leagueManageSeasonInput.value ? parseInt(leagueManageSeasonInput.value, 10) : 1;
      league.status = leagueManageStatusSelect.value || 'active';

      league.settings = league.settings || {};
      league.settings.pointsWin = leagueManagePointsWinInput.value ? parseInt(leagueManagePointsWinInput.value, 10) : 3;
      league.settings.pointsDraw = leagueManagePointsDrawInput.value ? parseInt(leagueManagePointsDrawInput.value, 10) : 1;
      league.settings.pointsLoss = leagueManagePointsLossInput.value ? parseInt(leagueManagePointsLossInput.value, 10) : 0;
      league.settings.maxTeams = leagueManageMaxTeamsInput.value ? parseInt(leagueManageMaxTeamsInput.value, 10) : 16;
      league.settings.lockTeams = !!leagueManageLockTeamsInput.checked;

      if (!state.editingLeagueId) {
        if (state.leagues.some(l => l.id === newId)) {
          setLeagueManageStatus('A league with that ID already exists. Choose a different ID.', 'error');
          return;
        }
        state.leagues.push(league);
      } else {
        const other = state.leagues.find(l => l.id === newId && l !== league);
        if (other) {
          setLeagueManageStatus('Another league already has that ID. Choose a different ID.', 'error');
          return;
        }
      }

      state.rawData = state.rawData || {};
      state.rawData.leagues = state.leagues;

      setLeagueManageStatus('Saving league changes to GitHub...', 'info');

      const result = await saveLeagueJSON(JSON.stringify(state.rawData, null, 2), key);
      console.log(result);

      const data = await fetchLeagueData();
      state.rawData = data;
      state.leagues = data.leagues || [];

      state.currentLeagueId = newId;
      state.editingLeagueId = newId;

      setLeagueManageStatus('League changes saved.', 'ok');
      setGlobalStatus('League data reloaded after save.', 'ok');

      renderLeagueList();
      renderLeagueView();
    } catch (err) {
      console.error(err);
      setLeagueManageStatus(err.message, 'error');
    }
  });
}

// Create New League button
if (leagueCreateBtn) {
  leagueCreateBtn.addEventListener('click', () => {
    openLeagueManage(null);
  });
}

// ---- Rendering: League Detail ----

function renderLeagueHeader(league) {
  const totalTeams = league.teams.length;
  const completed = league.matches.filter(m => m.status === 'completed').length;
  const scheduled = league.matches.filter(m => m.status === 'scheduled').length;
  const inProgress = league.matches.filter(m => m.status === 'in_progress').length;

  leagueHeaderEl.innerHTML = `
    <h2>${league.name}</h2>
    <div class="small">
      ID: ${league.id} &mdash; Season ${league.season} &mdash; Status: ${league.status}
      <br />
      Teams: ${totalTeams} | Completed matches: ${completed} | Scheduled: ${scheduled}${
        inProgress ? ` | In progress: ${inProgress}` : ''
      }
    </div>
  `;
}

function openTeamView(teamId) {
  state.selectedTeamId = teamId;
  showTeamView();
  renderTeamView();
}

function attachTeamLinks(rootEl) {
  if (!rootEl) return;
  const links = rootEl.querySelectorAll('.team-link');
  links.forEach(el => {
    el.addEventListener('click', () => {
      const teamId = el.getAttribute('data-team-id');
      if (teamId) openTeamView(teamId);
    });
  });
}

function renderStandings(league) {
  const standings = computeStandings(league);

  if (!standings.length) {
    standingsContainer.innerHTML = `
      <div class="small">No completed matches yet. Play some games!</div>
    `;
    return;
  }

  const rows = standings.map((s, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>
        <button class="team-link" data-team-id="${s.teamId}">
          ${s.name}
        </button>
        <div class="small">${s.coachName || ''}</div>
      </td>
      <td>${s.played}</td>
      <td>${s.wins}</td>
      <td>${s.draws}</td>
      <td>${s.losses}</td>
      <td>${s.points}</td>
      <td>${s.tdFor}/${s.tdAgainst} (${s.tdDiff >= 0 ? '+' : ''}${s.tdDiff})</td>
      <td>${s.casFor}/${s.casAgainst} (${s.casDiff >= 0 ? '+' : ''}${s.casDiff})</td>
    </tr>
  `).join('');

  standingsContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Team</th>
          <th>G</th>
          <th>W</th>
          <th>D</th>
          <th>L</th>
          <th>Pts</th>
          <th>TD For/Against (Diff)</th>
          <th>Cas For/Against (Diff)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  attachTeamLinks(standingsContainer);
}

function openMatchView(matchId) {
  state.selectedMatchId = matchId;
  showMatchView();
  renderMatchView();
}

function renderMatches(league) {
  const teamsById = new Map();
  league.teams.forEach(t => teamsById.set(t.id, t));

  const hasInProgress = league.matches.some(m => m.status === 'in_progress');

  if (hasInProgress) {
    const inProg = league.matches.filter(m => m.status === 'in_progress');
    const links = inProg.map(m => {
      const home = teamsById.get(m.homeTeamId);
      const away = teamsById.get(m.awayTeamId);
      return `
        <li>
          Round ${m.round}: ${home ? home.name : m.homeTeamId}
          vs
          ${away ? away.name : m.awayTeamId}
          <span class="tag in_progress">In progress</span>
        </li>
      `;
    }).join('');
    inProgressContainer.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>Game(s) in Progress</h3>
          <div class="small">Future: scoreboard resume links</div>
        </div>
        <ul>
          ${links}
        </ul>
      </div>
    `;
  } else {
    inProgressContainer.innerHTML = '';
  }

  if (!league.matches.length) {
    matchesContainer.innerHTML = `
      <div class="small">No matches defined for this league yet.</div>
    `;
    return;
  }

  const rows = league.matches
    .slice()
    .sort((a, b) => a.round - b.round || a.id.localeCompare(b.id))
    .map(m => {
      const home = teamsById.get(m.homeTeamId);
      const away = teamsById.get(m.awayTeamId);
      let scoreDisplay = '';
      if (m.status === 'completed') {
        scoreDisplay = `${m.score.home} - ${m.score.away}`;
      } else if (m.status === 'scheduled') {
        scoreDisplay = 'vs';
      } else if (m.status === 'in_progress') {
        scoreDisplay = `${m.score.home ?? 0} - ${m.score.away ?? 0}`;
      }

      const tagClass = m.status === 'completed'
        ? 'completed'
        : m.status === 'in_progress'
        ? 'in_progress'
        : 'scheduled';

      return `
        <tr>
          <td>${m.round}</td>
          <td>${home ? home.name : m.homeTeamId}</td>
          <td>${away ? away.name : m.awayTeamId}</td>
          <td>${scoreDisplay}</td>
          <td>
            <span class="tag ${tagClass}">${m.status.replace('_', ' ')}</span>
          </td>
          <td>${m.date || ''}</td>
          <td>
            <button class="link-button match-view-btn" data-match-id="${m.id}">View</button>
          </td>
        </tr>
      `;
    }).join('');

  matchesContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Round</th>
          <th>Home</th>
          <th>Away</th>
          <th>Score</th>
          <th>Status</th>
          <th>Date</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  matchesContainer.querySelectorAll('.match-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-match-id');
      if (id) openMatchView(id);
    });
  });
}

function renderLeagueView() {
  const league = getCurrentLeague();
  if (!league) {
    leagueHeaderEl.innerHTML = '<div class="small">No league selected.</div>';
    standingsContainer.innerHTML = '';
    matchesContainer.innerHTML = '';
    return;
  }

  renderLeagueHeader(league);
  renderStandings(league);
  renderMatches(league);
}

// ---- Rendering: Team View ----

function renderTeamView() {
  const league = getCurrentLeague();
  if (!league || !state.selectedTeamId) {
    teamHeaderEl.textContent = 'Team Detail';
    teamSummaryEl.textContent = 'No team selected.';
    teamRosterContainer.innerHTML = '';
    return;
  }

  const team = getTeamById(league, state.selectedTeamId);
  if (!team) {
    teamHeaderEl.textContent = 'Team not found';
    teamSummaryEl.textContent = '';
    teamRosterContainer.innerHTML = '';
    return;
  }

  teamHeaderEl.textContent = team.name;

  const standings = computeStandings(league);
  const entry = standings.find(s => s.teamId === team.id);

  const recordText = entry
    ? `Record: ${entry.wins}-${entry.draws}-${entry.losses} in ${entry.played} game${entry.played === 1 ? '' : 's'}`
    : 'No completed games yet.';

  const tdText = entry
    ? `TD: ${entry.tdFor}/${entry.tdAgainst} (diff ${entry.tdDiff >= 0 ? '+' : ''}${entry.tdDiff})`
    : '';

  const casText = entry
    ? `Cas: ${entry.casFor}/${entry.casAgainst} (diff ${entry.casDiff >= 0 ? '+' : ''}${entry.casDiff})`
    : '';

  teamSummaryEl.innerHTML = `
    <div class="team-meta">
      Coach: <strong>${team.coachName || 'Unknown'}</strong> &mdash;
      Race: <strong>${team.race || 'Unknown'}</strong>
    </div>
    <div class="team-meta">
      TV: ${team.teamValue != null ? team.teamValue : 'N/A'} &mdash;
      Treasury: ${team.treasury != null ? team.treasury : 0} &mdash;
      Rerolls: ${team.rerolls != null ? team.rerolls : 0} &mdash;
      Dedicated Fans: ${team.dedicatedFans != null ? team.dedicatedFans : 0}
    </div>
    <div class="team-meta">
      ${recordText}
      ${tdText ? `<br/>${tdText}` : ''}
      ${casText ? `<br/>${casText}` : ''}
    </div>
  `;

  if (!team.players || !team.players.length) {
    teamRosterContainer.innerHTML = `<div class="small">No players on this team yet.</div>`;
    return;
  }

  const rows = team.players
    .slice()
    .sort((a, b) => (a.number || 0) - (b.number || 0))
    .map(p => {
      const skills = (p.skills || []).join(', ');
      const injuries = (p.injuries || []).join(', ');
      const statusBits = [];
      if (p.status) {
        if (p.status.mng) statusBits.push('MNG');
        if (p.status.dead) statusBits.push('Dead');
        if (p.status.retired) statusBits.push('Retired');
      }
      const statusText = statusBits.join(', ');

      return `
        <tr>
          <td>${p.number != null ? p.number : ''}</td>
          <td>${p.name}</td>
          <td>${p.position || ''}</td>
          <td>${p.ma != null ? p.ma : ''}</td>
          <td>${p.st != null ? p.st : ''}</td>
          <td>${p.ag != null ? p.ag : ''}</td>
          <td>${p.pa != null ? p.pa : ''}</td>
          <td>${p.av != null ? p.av : ''}</td>
          <td>${skills}</td>
          <td>${p.spp != null ? p.spp : 0}</td>
          <td>${p.level != null ? p.level : ''}</td>
          <td>${injuries}</td>
          <td>${statusText}</td>
        </tr>
      `;
    }).join('');

  teamRosterContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Pos</th>
          <th>MA</th>
          <th>ST</th>
          <th>AG</th>
          <th>PA</th>
          <th>AV</th>
          <th>Skills</th>
          <th>SPP</th>
          <th>Lvl</th>
          <th>Injuries</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// ---- Rendering: Match View ----

function renderMatchView() {
  const league = getCurrentLeague();
  if (!league || !state.selectedMatchId) {
    matchHeaderEl.textContent = 'Match Detail';
    matchSummaryEl.textContent = 'No match selected.';
    matchOverviewContainer.innerHTML = '';
    matchSppContainer.innerHTML = '';
    return;
  }

  const match = getMatchById(league, state.selectedMatchId);
  if (!match) {
    matchHeaderEl.textContent = 'Match not found';
    matchSummaryEl.textContent = '';
    matchOverviewContainer.innerHTML = '';
    matchSppContainer.innerHTML = '';
    return;
  }

  const home = getTeamById(league, match.homeTeamId);
  const away = getTeamById(league, match.awayTeamId);

  matchHeaderEl.textContent = `Round ${match.round} — ${home ? home.name : match.homeTeamId} vs ${away ? away.name : match.awayTeamId}`;

  const scoreText = match.status === 'completed'
    ? `${match.score.home} - ${match.score.away}`
    : match.status === 'scheduled'
    ? 'Scheduled'
    : `${match.score.home ?? 0} - ${match.score.away ?? 0} (in progress)`;

  matchSummaryEl.innerHTML = `
    <div>
      Status: <strong>${match.status.replace('_', ' ')}</strong>${
        match.date ? ` &mdash; Date: ${match.date}` : ''
      }
    </div>
    <div>
      Score: ${scoreText}
    </div>
 `;

  const homeCas = match.casualties ? (match.casualties.homeInflicted || 0) : 0;
  const awayCas = match.casualties ? (match.casualties.awayInflicted || 0) : 0;

  matchOverviewContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Side</th>
          <th>Team</th>
          <th>Score</th>
          <th>Casualties Inflicted</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Home</td>
          <td>${home ? home.name : match.homeTeamId}</td>
          <td>${match.score && match.score.home != null ? match.score.home : 0}</td>
          <td>${homeCas}</td>
        </tr>
        <tr>
          <td>Away</td>
          <td>${away ? away.name : match.awayTeamId}</td>
          <td>${match.score && match.score.away != null ? match.score.away : 0}</td>
          <td>${awayCas}</td>
        </tr>
      </tbody>
    </table>
  `;

  if (!match.sppLog || !match.sppLog.length) {
    matchSppContainer.innerHTML = `<div class="small">No SPP log recorded for this match.</div>`;
  } else {
    const teamsById = new Map();
    league.teams.forEach(t => teamsById.set(t.id, t));

    const playersById = new Map();
    league.teams.forEach(t => {
      (t.players || []).forEach(p => playersById.set(p.id, { teamId: t.id, player: p }));
    });

    const rows = match.sppLog.map((entry, idx) => {
      const team = teamsById.get(entry.teamId);
      const playerInfo = playersById.get(entry.playerId);
      const playerName = playerInfo ? playerInfo.player.name : entry.playerId;
      const teamName = team ? team.name : entry.teamId;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${teamName}</td>
          <td>${playerName}</td>
          <td>${entry.type}</td>
          <td>${entry.amount}</td>
        </tr>
      `;
    }).join('');

    matchSppContainer.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>Player</th>
            <th>Event</th>
            <th>SPP</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  if (matchOpenScoreboardBtn) {
    matchOpenScoreboardBtn.onclick = () => {
      showScoreboardView();
      renderScoreboardView();
    };
  }
}

// ---- Rendering: Scoreboard View ----

function renderScoreboardView() {
  const league = getCurrentLeague();
  if (!league || !state.selectedMatchId) {
    scoreboardHeaderEl.textContent = 'Scoreboard';
    scoreboardMetaEl.textContent = 'No match selected.';
    scoreboardHomeRosterEl.innerHTML = '';
    scoreboardAwayRosterEl.innerHTML = '';
    scoreboardScoreMainEl.textContent = '';
    scoreboardScoreMetaEl.textContent = '';
    return;
  }

  const match = getMatchById(league, state.selectedMatchId);
  if (!match) {
    scoreboardHeaderEl.textContent = 'Scoreboard';
    scoreboardMetaEl.textContent = 'Match not found.';
    scoreboardHomeRosterEl.innerHTML = '';
    scoreboardAwayRosterEl.innerHTML = '';
    scoreboardScoreMainEl.textContent = '';
    scoreboardScoreMetaEl.textContent = '';
    return;
  }

  const home = getTeamById(league, match.homeTeamId);
  const away = getTeamById(league, match.awayTeamId);

  scoreboardHeaderEl.textContent = `Round ${match.round} — Scoreboard`;

  const half = match.liveState ? match.liveState.half : null;
  const turnHome = match.liveState && match.liveState.turn ? match.liveState.turn.home : null;
  const turnAway = match.liveState && match.liveState.turn ? match.liveState.turn.away : null;

  scoreboardMetaEl.innerHTML = `
    <div>
      ${home ? home.name : match.homeTeamId} vs ${away ? away.name : match.awayTeamId}
    </div>
    <div>
      Status: <strong>${match.status.replace('_', ' ')}</strong>${
        half ? ` &mdash; Half: ${half}` : ''
      }${
        turnHome != null && turnAway != null
          ? ` &mdash; Turns (Home/Away): ${turnHome}/${turnAway}`
          : ''
      }
    </div>
  `;

  const homeScore = match.score && match.score.home != null ? match.score.home : 0;
  const awayScore = match.score && match.score.away != null ? match.score.away : 0;

  scoreboardScoreMainEl.textContent = `${homeScore} - ${awayScore}`;
  scoreboardScoreMetaEl.innerHTML = `
    <div>${home ? home.name : match.homeTeamId} (Home)</div>
    <div>${away ? away.name : match.awayTeamId} (Away)</div>
  `;

  if (home) {
    const rows = (home.players || []).map(p => `<li>#${p.number ?? ''} ${p.name}</li>`).join('');
    scoreboardHomeRosterEl.innerHTML = `
      <h3>${home.name}</h3>
      <div class="small">Home team roster (read-only)</div>
      <ul>${rows}</ul>
    `;
  } else {
    scoreboardHomeRosterEl.innerHTML = `<div class="small">Home team not found.</div>`;
  }

  if (away) {
    const rows = (away.players || []).map(p => `<li>#${p.number ?? ''} ${p.name}</li>`).join('');
    scoreboardAwayRosterEl.innerHTML = `
      <h3>${away.name}</h3>
      <div class="small">Away team roster (read-only)</div>
      <ul>${rows}</ul>
    `;
  } else {
    scoreboardAwayRosterEl.innerHTML = `<div class="small">Away team not found.</div>`;
  }
}

// ---- Admin / JSON editor behavior ----

if (loadBtn) {
  loadBtn.addEventListener('click', async () => {
    try {
      setAdminStatus('Loading league.json...', 'info');
      const data = await fetchLeagueData();
      leagueTextarea.value = JSON.stringify(data, null, 2);
      setAdminStatus('Loaded league.json', 'ok');
    } catch (err) {
      console.error(err);
      setAdminStatus(err.message, 'error');
    }
  });
}

if (saveBtn) {
  saveBtn.addEventListener('click', async () => {
    try {
      setAdminStatus('Saving league.json...', 'info');
      const key = (editKeyInput.value || '').trim();
      const result = await saveLeagueJSON(leagueTextarea.value, key);
      console.log(result);
      setAdminStatus('Saved league.json (new commit created).', 'ok');

      const data = await fetchLeagueData();
      state.rawData = data;
      state.leagues = data.leagues || [];
      state.currentLeagueId = state.leagues[0] ? state.leagues[0].id : null;
      renderLeagueList();
      renderLeagueView();
      setGlobalStatus('League data reloaded after save.', 'ok');
    } catch (err) {
      console.error(err);
      setAdminStatus(err.message, 'error');
    }
  });
}

// ---- Initial load ----

(async function init() {
  try {
    setGlobalStatus('Loading league data...');
    const [leagueData, gameData] = await Promise.all([
      fetchLeagueData(),
      fetchGameData()
    ]);

    state.rawData = leagueData;
    state.leagues = leagueData.leagues || [];
    state.currentLeagueId = state.leagues[0] ? state.leagues[0].id : null;
    state.gameData = gameData;

    renderLeagueList();
    showLeagueListView();
    setGlobalStatus('League data loaded.', 'ok');
  } catch (err) {
    console.error(err);
    setGlobalStatus(err.message, 'error');
  }
})()
