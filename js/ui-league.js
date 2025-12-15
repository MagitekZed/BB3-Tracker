import { state, els } from './state.js';
import { PATHS } from './config.js';
import { apiGet, apiSave, apiDelete } from './api.js';
import { setStatus, normalizeName, getContrastColor, ulid } from './utils.js';
import { computeStandings, computeSeasonStats } from './rules.js';
import { showSection, updateBreadcrumbs, setActiveNav, goHome, confirmModal } from './ui-core.js';
import { handleOpenTeam, handleEditTeam, renderTeamEditor } from './ui-team.js';
import { handleStartMatch, handleOpenScoreboard } from './ui-match.js';

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
    
    renderLeagueView();
    showSection('view');
    updateBreadcrumbs([{ label: 'Leagues', action: goHome }, { label: league.name }]);
    setActiveNav('leagues');

    setStatus(`League loaded: ${league.name}`, 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
}

export function renderLeagueView() {
  const l = state.currentLeague;
  if (!l) return;
  
  document.getElementById('leagueHeader').innerHTML = `<h2>${l.name}</h2><div class="small">Season ${l.season} (${l.status})</div>`;
  document.getElementById('leagueTeamsSection').className = 'panel-styled';
  document.getElementById('leagueMatchesSection').className = 'panel-styled';

  const standings = computeSeasonStats(l);
  els.containers.standings.innerHTML = `
    <div class="small" style="margin-bottom:0.5rem; color:#555;">Season ${l.season} standings</div>
    <table class="responsive-table">
      <thead>
        <tr>
          <th>#</th><th>Team</th><th>GP</th><th>W-D-L</th><th>Pts</th><th>TD F/A</th><th>CAS F/A</th>
        </tr>
      </thead>
      <tbody>${standings.map((s, i) => `
        <tr>
          <td data-label="Rank">${i+1}</td>
          <td data-label="Team"><button class="team-link" onclick="window.handleOpenTeam('${l.id}', '${s.id}')">${s.name}</button></td>
          <td data-label="GP">${s.games}</td>
          <td data-label="W-D-L">${s.wins}-${s.draws}-${s.losses}</td>
          <td data-label="Points">${s.points}</td>
          <td data-label="TD F/A">${s.tdFor}/${s.tdAgainst} (${s.tdDiff>=0?'+':''}${s.tdDiff})</td>
          <td data-label="CAS F/A">${s.casFor}/${s.casAgainst} (${s.casDiff>=0?'+':''}${s.casDiff})</td>
        </tr>`).join('')}
    </tbody></table>`;
  
  if (els.containers.rosterQuick) {
    els.containers.rosterQuick.innerHTML = `<div class="roster-tiles">
      ${l.teams.map(t => {
        const prim = t.colors?.primary || '#8a1c1c';
        return `
        <div class="roster-tile" style="border-top-color: ${prim}">
          <div class="roster-tile-title"><button class="team-link" onclick="window.handleOpenTeam('${l.id}', '${t.id}')">${t.name}</button></div>
          <div class="roster-tile-meta"><span><strong>Race:</strong> ${t.race}</span><span><strong>Coach:</strong> ${t.coachName}</span></div>
        </div>`;
      }).join('')}
    </div>`;
  }
  renderMatchesList(l);
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
