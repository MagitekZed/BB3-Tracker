// app.js

// Your Worker URL
const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';

// DOM elements
const globalStatusEl = document.getElementById('globalStatus');

// Top nav
const navLeagueBtn = document.getElementById('navLeague');
const navAdminBtn = document.getElementById('navAdmin');

// Sections
const leagueViewSection = document.getElementById('leagueViewSection');
const teamViewSection = document.getElementById('teamViewSection');
const matchViewSection = document.getElementById('matchViewSection');
const scoreboardViewSection = document.getElementById('scoreboardViewSection');
const adminSection = document.getElementById('adminSection');

// League selector
const leagueSelect = document.getElementById('leagueSelect');
const leagueHeaderEl = document.getElementById('leagueHeader');
const standingsContainer = document.getElementById('standingsContainer');
const matchesContainer = document.getElementById('matchesContainer');
const inProgressContainer = document.getElementById('inProgressContainer');

// Team view
const teamBackBtn = document.getElementById('teamBackBtn');
const teamHeaderEl = document.getElementById('teamHeader');
const teamSummaryEl = document.getElementById('teamSummary');
const teamRosterContainer = document.getElementById('teamRosterContainer');

// Match view
const matchBackBtn = document.getElementById('matchBackBtn');
const matchHeaderEl = document.getElementById('matchHeader');
const matchSummaryEl = document.getElementById('matchSummary');
const matchInfoContainer = document.getElementById('matchInfoContainer');
const matchSPPContainer = document.getElementById('matchSPPContainer');
const openScoreboardBtn = document.getElementById('openScoreboardBtn');

// Scoreboard view
const scoreboardBackBtn = document.getElementById('scoreboardBackBtn');
const scoreboardHeaderEl = document.getElementById('scoreboardHeader');
const scoreboardSummaryEl = document.getElementById('scoreboardSummary');
const scoreboardCoreEl = document.getElementById('scoreboardCore');
const scoreboardPlayersEl = document.getElementById('scoreboardPlayers');

// Admin / JSON editor
const editKeyInput = document.getElementById('editKeyInput');
const rememberKeyBtn = document.getElementById('rememberKeyBtn');
const loadBtn = document.getElementById('loadBtn');
const saveBtn = document.getElementById('saveBtn');
const leagueTextarea = document.getElementById('leagueTextarea');
const adminStatusEl = document.getElementById('adminStatus');

// App state
const state = {
  rawData: null,        // full JSON from /api/league
  currentLeague: null,  // currently selected league object
  selectedLeagueId: null,
  selectedTeamId: null,
  selectedMatchId: null
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

// ---- Navigation helpers ----

function hideAllMainSections() {
  leagueViewSection.classList.add('hidden');
  teamViewSection.classList.add('hidden');
  matchViewSection.classList.add('hidden');
  scoreboardViewSection.classList.add('hidden');
  adminSection.classList.add('hidden');
}

function setNavActive(which) {
  // which: 'league' | 'admin' | null
  navLeagueBtn.classList.remove('active');
  navAdminBtn.classList.remove('active');
  if (which === 'league') navLeagueBtn.classList.add('active');
  if (which === 'admin') navAdminBtn.classList.add('active');
}

function showLeagueView() {
  setNavActive('league');
  hideAllMainSections();
  leagueViewSection.classList.remove('hidden');
}

function showAdminView() {
  setNavActive('admin');
  hideAllMainSections();
  adminSection.classList.remove('hidden');
}

navLeagueBtn.addEventListener('click', () => {
  state.selectedTeamId = null;
  state.selectedMatchId = null;
  showLeagueView();
});

navAdminBtn.addEventListener('click', () => {
  state.selectedTeamId = null;
  state.selectedMatchId = null;
  showAdminView();
});

if (teamBackBtn) {
  teamBackBtn.addEventListener('click', () => {
    state.selectedTeamId = null;
    showLeagueView();
  });
}

if (matchBackBtn) {
  matchBackBtn.addEventListener('click', () => {
    state.selectedMatchId = null;
    showLeagueView();
  });
}

if (scoreboardBackBtn) {
  scoreboardBackBtn.addEventListener('click', () => {
    hideAllMainSections();
    matchViewSection.classList.remove('hidden');
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
});

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

// ---- League selector ----

function renderLeagueSelector(rawData) {
  if (!leagueSelect || !rawData || !Array.isArray(rawData.leagues)) return;

  const leagues = rawData.leagues;
  leagueSelect.innerHTML = leagues
    .map(l => `<option value="${l.id}">${l.name} (Season ${l.season})</option>`)
    .join('');

  // If no selected league yet, default to first
  if (!state.selectedLeagueId && leagues.length > 0) {
    state.selectedLeagueId = leagues[0].id;
  }

  // Sync select value
  if (state.selectedLeagueId) {
    leagueSelect.value = state.selectedLeagueId;
  }

  leagueSelect.addEventListener('change', () => {
    state.selectedLeagueId = leagueSelect.value;
    const league = rawData.leagues.find(l => l.id === state.selectedLeagueId) || null;
    state.currentLeague = league;
    state.selectedTeamId = null;
    state.selectedMatchId = null;
    renderLeagueView();
    showLeagueView();
  });
}

// ---- Team Detail Rendering ----

function openTeamView(teamId) {
  state.selectedTeamId = teamId;
  renderTeamView();
  setNavActive(null);
  hideAllMainSections();
  teamViewSection.classList.remove('hidden');
}

function renderTeamView() {
  const league = state.currentLeague;
  if (!league || !state.selectedTeamId) {
    teamHeaderEl.textContent = 'Team Detail';
    teamSummaryEl.textContent = 'No team selected.';
    teamRosterContainer.innerHTML = '';
    return;
  }

  const team = league.teams.find(t => t.id === state.selectedTeamId);
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

// ---- Match Detail Rendering ----

function openMatchView(matchId) {
  state.selectedMatchId = matchId;
  renderMatchView();
  setNavActive(null);
  hideAllMainSections();
  matchViewSection.classList.remove('hidden');
}

function renderMatchView() {
  const league = state.currentLeague;
  if (!league || !state.selectedMatchId) {
    matchHeaderEl.textContent = 'Match Detail';
    matchSummaryEl.textContent = 'No match selected.';
    matchInfoContainer.innerHTML = '';
    matchSPPContainer.innerHTML = '';
    return;
  }

  const match = league.matches.find(m => m.id === state.selectedMatchId);
  if (!match) {
    matchHeaderEl.textContent = 'Match not found';
    matchSummaryEl.textContent = '';
    matchInfoContainer.innerHTML = '';
    matchSPPContainer.innerHTML = '';
    return;
  }

  const teamsById = new Map();
  league.teams.forEach(t => teamsById.set(t.id, t));

  const home = teamsById.get(match.homeTeamId);
  const away = teamsById.get(match.awayTeamId);

  matchHeaderEl.textContent = `${home ? home.name : match.homeTeamId} vs ${away ? away.name : match.awayTeamId}`;

  const scoreText = match.status === 'completed'
    ? `${match.score.home} - ${match.score.away}`
    : match.status === 'in_progress'
    ? `${match.score.home ?? 0} - ${match.score.away ?? 0} (in progress)`
    : 'Not played yet';

  matchSummaryEl.innerHTML = `
    Round ${match.round} &mdash; Status: <strong>${match.status.replace('_', ' ')}</strong><br/>
    Score: ${scoreText}<br/>
    Date: ${match.date || 'N/A'}
  `;

  // Basic info block
  const homeCas = match.casualties ? (match.casualties.homeInflicted || 0) : 0;
  const awayCas = match.casualties ? (match.casualties.awayInflicted || 0) : 0;

  matchInfoContainer.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Teams</h3>
      </div>
      <div class="small">
        Home: <strong>${home ? home.name : match.homeTeamId}</strong><br/>
        Away: <strong>${away ? away.name : match.awayTeamId}</strong>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Score & Casualties</h3>
      </div>
      <div class="small">
        Score: ${scoreText}<br/>
        Casualties inflicted: ${home ? home.name : 'Home'} ${homeCas} &mdash; ${away ? away.name : 'Away'} ${awayCas}
      </div>
    </div>
  `;

  // SPP log
  if (match.sppLog && match.sppLog.length) {
    const rows = match.sppLog.map(entry => {
      const team = teamsById.get(entry.teamId);
      const teamName = team ? team.name : entry.teamId;
      const player = team && team.players
        ? team.players.find(p => p.id === entry.playerId)
        : null;
      const playerName = player ? player.name : entry.playerId;

      return `
        <tr>
          <td>${teamName}</td>
          <td>${playerName}</td>
          <td>${entry.type}</td>
          <td>${entry.amount}</td>
        </tr>
      `;
    }).join('');

    matchSPPContainer.innerHTML = `
      <table>
        <thead>
          <tr>
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
  } else {
    matchSPPContainer.innerHTML = `<div class="small">No SPP log recorded for this match.</div>`;
  }
}

// ---- Scoreboard Rendering (read-only skeleton) ----

function openScoreboardView() {
  const league = state.currentLeague;
  if (!league || !state.selectedMatchId) return;
  renderScoreboardView();
  setNavActive(null);
  hideAllMainSections();
  scoreboardViewSection.classList.remove('hidden');
}

if (openScoreboardBtn) {
  openScoreboardBtn.addEventListener('click', openScoreboardView);
}

function renderScoreboardView() {
  const league = state.currentLeague;
  if (!league || !state.selectedMatchId) {
    scoreboardHeaderEl.textContent = 'Scoreboard';
    scoreboardSummaryEl.textContent = 'No match selected.';
    scoreboardCoreEl.innerHTML = '';
    scoreboardPlayersEl.innerHTML = '';
    return;
  }

  const match = league.matches.find(m => m.id === state.selectedMatchId);
  if (!match) {
    scoreboardHeaderEl.textContent = 'Scoreboard';
    scoreboardSummaryEl.textContent = 'Match not found.';
    scoreboardCoreEl.innerHTML = '';
    scoreboardPlayersEl.innerHTML = '';
    return;
  }

  const teamsById = new Map();
  league.teams.forEach(t => teamsById.set(t.id, t));

  const home = teamsById.get(match.homeTeamId);
  const away = teamsById.get(match.awayTeamId);

  scoreboardHeaderEl.textContent = `Scoreboard: ${home ? home.name : match.homeTeamId} vs ${away ? away.name : match.awayTeamId}`;

  const live = match.liveState || null;
  const scoreText = match.score
    ? `${match.score.home ?? 0} - ${match.score.away ?? 0}`
    : '0 - 0';

  const half = live ? live.half : null;
  const turnHome = live && live.turn ? live.turn.home : null;
  const turnAway = live && live.turn ? live.turn.away : null;
  const rrHome = live && live.rerolls ? live.rerolls.home : null;
  const rrAway = live && live.rerolls ? live.rerolls.away : null;

  const statusText = match.status === 'in_progress'
    ? 'In progress'
    : match.status === 'completed'
    ? 'Completed'
    : 'Not started';

  scoreboardSummaryEl.innerHTML = `
    Status: <strong>${statusText}</strong><br/>
    Round ${match.round} &mdash; Date: ${match.date || 'N/A'}
  `;

  scoreboardCoreEl.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Score</h3>
      </div>
      <div class="small">
        ${home ? home.name : 'Home'} vs ${away ? away.name : 'Away'}<br/>
        <strong>${scoreText}</strong>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Turn & Half</h3>
      </div>
      <div class="small">
        Half: ${half != null ? half : 'N/A'}<br/>
        ${home ? home.name : 'Home'} turn: ${turnHome != null ? turnHome : 'N/A'}<br/>
        ${away ? away.name : 'Away'} turn: ${turnAway != null ? turnAway : 'N/A'}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Rerolls</h3>
      </div>
      <div class="small">
        ${home ? home.name : 'Home'} rerolls: ${rrHome != null ? rrHome : 'N/A'}<br/>
        ${away ? away.name : 'Away'} rerolls: ${rrAway != null ? rrAway : 'N/A'}
      </div>
    </div>
  `;

  // Player live state (read-only placeholder)
  if (live && Array.isArray(live.playerStates) && live.playerStates.length > 0) {
    const rows = live.playerStates.map(ps => {
      const team = teamsById.get(ps.teamId);
      const teamName = team ? team.name : ps.teamId;
      const player = team && team.players
        ? team.players.find(p => p.id === ps.playerId)
        : null;
      const playerName = player ? player.name : ps.playerId;

      return `
        <tr>
          <td>${teamName}</td>
          <td>${playerName}</td>
          <td>${ps.status}</td>
        </tr>
      `;
    }).join('');

    scoreboardPlayersEl.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Team</th>
            <th>Player</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  } else {
    scoreboardPlayersEl.innerHTML = `
      <div class="small">
        No live player state recorded yet. When we add in-game tracking, this will show per-player status (ready, done, KO, etc.).
      </div>
    `;
  }
}

// ---- League View Rendering ----

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

function attachTeamLinks() {
  // After standings rendered, make team names clickable
  const links = standingsContainer.querySelectorAll('.team-link');
  links.forEach(el => {
    el.addEventListener('click', () => {
      const teamId = el.getAttribute('data-team-id');
      if (teamId) {
        openTeamView(teamId);
      }
    });
  });
}

function attachMatchLinks() {
  const buttons = matchesContainer.querySelectorAll('.match-link');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const matchId = btn.getAttribute('data-match-id');
      if (matchId) openMatchView(matchId);
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

  const rows = standings.map((s, idx) => {
    return `
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

  attachTeamLinks();
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
          <td>
            <button class="match-link" data-match-id="${m.id}">Details</button>
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
          <th>View</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  attachMatchLinks();
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
      renderLeagueSelector(data);
      state.currentLeague = data.leagues.find(l => l.id === state.selectedLeagueId) || data.leagues[0] || null;
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

    if (data.leagues && data.leagues.length > 0) {
      // default selected league
      state.selectedLeagueId = data.leagues[0].id;
      state.currentLeague = data.leagues[0];
    } else {
      state.currentLeague = null;
    }

    renderLeagueSelector(data);
    renderLeagueView();
    showLeagueView();
    setGlobalStatus('League data loaded.', 'ok');
  } catch (err) {
    console.error(err);
    setGlobalStatus(err.message, 'error');
  }
})();
