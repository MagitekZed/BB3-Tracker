// app.js

// Your Worker URL
const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';

// DOM elements
const globalStatusEl = document.getElementById('globalStatus');

const navLeagueBtn = document.getElementById('navLeague');
const navAdminBtn = document.getElementById('navAdmin');

const leagueViewSection = document.getElementById('leagueViewSection');
const adminSection = document.getElementById('adminSection');

// League view elements
const leagueHeaderEl = document.getElementById('leagueHeader');
const standingsContainer = document.getElementById('standingsContainer');
const matchesContainer = document.getElementById('matchesContainer');
const inProgressContainer = document.getElementById('inProgressContainer');

// Admin / JSON editor elements
const editKeyInput = document.getElementById('editKeyInput');
const rememberKeyBtn = document.getElementById('rememberKeyBtn');
const loadBtn = document.getElementById('loadBtn');
const saveBtn = document.getElementById('saveBtn');
const leagueTextarea = document.getElementById('leagueTextarea');
const adminStatusEl = document.getElementById('adminStatus');

// App state
const state = {
  rawData: null,     // full JSON from /api/league
  currentLeague: null
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

// ---- Navigation between views ----

function showLeagueView() {
  navLeagueBtn.classList.add('active');
  navAdminBtn.classList.remove('active');
  leagueViewSection.classList.remove('hidden');
  adminSection.classList.add('hidden');
}

function showAdminView() {
  navLeagueBtn.classList.remove('active');
  navAdminBtn.classList.add('active');
  leagueViewSection.classList.add('hidden');
  adminSection.classList.remove('hidden');
}

navLeagueBtn.addEventListener('click', showLeagueView);
navAdminBtn.addEventListener('click', showAdminView);

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

async function fetchLeague() {
  const res = await fetch(`${API_BASE}/api/league`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load league.json: HTTP ${res.status} - ${text}`);
  }
  return res.json();
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

// ---- Rendering: League View ----

function renderLeagueHeader(league) {
  const totalTeams = league.teams.length;
  const completed = league.matches.filter(m => m.status === 'completed').length;
  const scheduled = league.matches.filter(m => m.status === 'scheduled').length;
  const inProgress = league.matches.filter(m => m.status === 'in_progress').length;

  leagueHeaderEl.innerHTML = `
    <h2>${league.name}</h2>
    <div class="small">
      Season ${league.season} &mdash; Status: ${league.status}
      <br />
      Teams: ${totalTeams} | Completed matches: ${completed} | Scheduled: ${scheduled}${
        inProgress ? ` | In progress: ${inProgress}` : ''
      }
    </div>
  `;
}

function renderStandings(league) {
  const standings = computeStandings(league);

  if (!standings.length) {
    standingsContainer.innerHTML = `
      <div class="small">No completed matches yet. Play some games!</div>
    `;
    return;
  }

  const rows = standings.map((s, idx) => {
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${s.name}<div class="small">${s.coachName || ''}</div></td>
        <td>${s.played}</td>
        <td>${s.wins}</td>
        <td>${s.draws}</td>
        <td>${s.losses}</td>
        <td>${s.points}</td>
        <td>${s.tdFor}/${s.tdAgainst} (${s.tdDiff >= 0 ? '+' : ''}${s.tdDiff})</td>
        <td>${s.casFor}/${s.casAgainst} (${s.casDiff >= 0 ? '+' : ''}${s.casDiff})</td>
      </tr>
    `;
  }).join('');

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
          <div class="small">Future: link scoreboard view by match ID</div>
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
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function renderLeagueView() {
  const league = state.currentLeague;
  if (!league) {
    leagueHeaderEl.innerHTML = '<div class="small">No league data loaded.</div>';
    standingsContainer.innerHTML = '';
    matchesContainer.innerHTML = '';
    return;
  }

  renderLeagueHeader(league);
  renderStandings(league);
  renderMatches(league);
}

// ---- Admin / JSON editor behavior ----

if (loadBtn) {
  loadBtn.addEventListener('click', async () => {
    try {
      setAdminStatus('Loading league.json...', 'info');
      const data = await fetchLeague();
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

      // Refresh in-memory state after save
      const data = await fetchLeague();
      state.rawData = data;
      state.currentLeague = (data.leagues && data.leagues[0]) || null;
      renderLeagueView();
      setGlobalStatus('League reloaded after save.', 'ok');
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
    const data = await fetchLeague();
    state.rawData = data;
    state.currentLeague = (data.leagues && data.leagues[0]) || null;

    renderLeagueView();
    setGlobalStatus('League data loaded.', 'ok');
  } catch (err) {
    console.error(err);
    setGlobalStatus(err.message, 'error');
  }
})();
