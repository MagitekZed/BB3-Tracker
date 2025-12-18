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
          <span class="tag ${l.status === 'active' ? 'in_progress' : 'scheduled'}">${l.status}</span>
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

  if (state.leagueTab !== 'playerStats') {
    toolsEl.innerHTML = '';
    return;
  }

  const existing = toolsEl.querySelector('input[data-role="league-player-search"]');
  if (existing) {
    const nextValue = state.leaguePlayerSearch || '';
    if (existing.value !== nextValue) existing.value = nextValue;
    return;
  }

  toolsEl.innerHTML = '';
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search players...';
  input.value = state.leaguePlayerSearch || '';
  input.setAttribute('data-role', 'league-player-search');
  input.addEventListener('input', (e) => setLeaguePlayerSearch(e.target.value));
  toolsEl.appendChild(input);
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

export function renderLeagueView() {
  const l = state.currentLeague;
  if (!l) return;
  
  document.getElementById('leagueHeader').innerHTML = `<h2>${l.name}</h2><div class="small">Season ${l.season} (${l.status})</div>`;
  document.getElementById('leagueTeamsSection').className = 'panel-styled';
  document.getElementById('leagueMatchesSection').className = 'panel-styled';

  if (!state.leagueTab) state.leagueTab = 'standings';
  renderLeagueTabs();

  const headingEl = els.leagueView?.tabHeading;
  if (headingEl) headingEl.textContent = getTabLabel(state.leagueTab);

  renderLeagueTabTools();
  void renderLeagueTabContent(l);
  renderMatchesList(l);
}

let leagueTabLoadToken = 0;
async function renderLeagueTabContent(league) {
  const token = ++leagueTabLoadToken;

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

function renderStandingsTab(league) {
  const standings = computeSeasonStats(league);
  els.containers.standings.innerHTML = `
    <div class="small" style="margin-bottom:0.5rem; color:#555;">Season ${league.season} standings</div>
    <div class="table-scroll">
      <table class="league-table">
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

function getSeasonPlayerStats(league, teamFiles) {
  const key = `${league.id}:${league.season}`;
  const cached = state.leagueStatsCache;
  if (cached?.key === key && Array.isArray(cached.players)) return cached.players;

  const players = aggregatePlayerStats(collectSeasonPlayerRows(teamFiles, league.season));
  state.leagueStatsCache = { key, players };
  return players;
}

function renderLeadersTab(league, teamFiles) {
  const season = league.season;
  const players = getSeasonPlayerStats(league, teamFiles);

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
    <div class="small" style="margin-bottom:0.75rem; color:#555;">Season ${season} leaders</div>
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
  const season = league.season;
  const standings = computeSeasonStats(league);
  const tvK = (team) => {
    const tv = Number(team?.teamValue);
    return Number.isFinite(tv) && tv > 0 ? `${Math.round(tv / 1000)}k` : '-';
  };

  els.containers.standings.innerHTML = `
    <div class="small" style="margin-bottom:0.5rem; color:#555;">Season ${season} team stats</div>
    <div class="table-scroll">
      <table class="league-table">
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
                <td>${tvK(team)}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderPlayerStatsTab(league, teamFiles) {
  const season = league.season;
  const q = (state.leaguePlayerSearch || '').trim().toLowerCase();
  let players = [...getSeasonPlayerStats(league, teamFiles)];

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
    <div class="small" style="margin-bottom:0.5rem; color:#555;">Season ${season} player stats</div>
    ${players.length ? `
      <div class="table-scroll">
        <table class="league-table">
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

export function renderMatchesList(league) {
  if(!league.matches || !league.matches.length) {
    els.containers.matches.innerHTML = '<div class="small">No matches scheduled.</div>';
    return;
  }
  
  const active = league.matches.filter(m => m.status === 'in_progress');
  const others = league.matches.filter(m => m.status !== 'in_progress').sort((a,b) => a.round - b.round);

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
}

export function renderManageForm() {
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
    if (isNewLeague) state.dirtyLeague.slug = normalizeName(this.value);
  };
  
  els.inputs.leagueSeason.value = l.season;
  els.inputs.leagueStatus.value = l.status;
  els.inputs.ptsWin.value = l.settings.pointsWin;
  els.inputs.ptsDraw.value = l.settings.pointsDraw;
  els.inputs.ptsLoss.value = l.settings.pointsLoss;
  els.inputs.maxTeams.value = l.settings.maxTeams || 16;
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
