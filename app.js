// app.js

// ============================================
// CONFIGURATION & STATE
// ============================================

// UPDATE THIS URL TO YOUR WORKER URL
const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';

const PATHS = {
  gameData: 'data/gameData.json',
  leaguesIndex: 'data/leagues/index.json',
  leagueSettings: (id) => `data/leagues/${id}/settings.json`,
  team: (lid, tid) => `data/leagues/${lid}/teams/${tid}.json`,
  activeMatch: (mid) => `data/active_matches/${mid}.json`
};

const state = {
  leagues: [],
  gameData: null,
  currentLeague: null,
  currentTeam: null,
  activeMatch: null,
  pollInterval: null,
  editMode: null,
  dirtyData: null,
  coachSide: null,
  selectedPlayerIdx: null
};

// ============================================
// INITIALIZATION & ROUTING
// ============================================

async function init() {
  const storedKey = localStorage.getItem('bb3_edit_key');
  if (storedKey) document.getElementById('editKeyInput').value = storedKey;
  
  try {
    state.gameData = await apiGet(PATHS.gameData);
    state.leagues = await apiGet(PATHS.leaguesIndex) || [];
    populateSkillList();
    
    // Listen for hash changes
    window.addEventListener('hashchange', handleRouting);
    
    // Initial Route
    handleRouting(); 
  } catch(e) { 
    console.error(e); 
    showToast("Init Failed: " + e.message); 
  }
}

async function handleRouting() {
  const hash = window.location.hash.substring(1);
  const parts = hash.split('/'); // e.g. ['league', 'id', 'team', 'id']
  
  hideAllSections();
  stopPolling();

  // DEFAULT: LEAGUE LIST
  if (!parts[0]) {
    state.leagues = await apiGet(PATHS.leaguesIndex) || [];
    renderLeagueList();
    updateBreadcrumbs(['Home']);
    document.getElementById('leagueListSection').classList.remove('hidden');
    return;
  }

  // LEAGUE ROUTES
  if (parts[0] === 'league' && parts[1]) {
    const lId = parts[1];
    
    // Load League Data if needed
    if (!state.currentLeague || state.currentLeague.id !== lId) {
      state.currentLeague = await apiGet(PATHS.leagueSettings(lId));
    }
    
    // SUB-ROUTE: EDIT TEAM
    if (parts[2] === 'edit-team' && parts[3]) {
      const tId = parts[3];
      if(tId === 'new') state.dirtyData = createEmptyTeam();
      else state.dirtyData = await apiGet(PATHS.team(lId, tId));
      
      renderTeamEditor();
      updateBreadcrumbs(['Home', state.currentLeague.name, 'Edit Team']);
      document.getElementById('teamEditorSection').classList.remove('hidden');
    }
    // SUB-ROUTE: TEAM VIEW
    else if (parts[2] === 'team' && parts[3]) {
      const tId = parts[3];
      state.currentTeam = await apiGet(PATHS.team(lId, tId));
      renderTeamView();
      updateBreadcrumbs(['Home', state.currentLeague.name, state.currentTeam.name], [`#`, `#league/${lId}`, null]);
      document.getElementById('teamViewSection').classList.remove('hidden');
    } 
    // DEFAULT: LEAGUE VIEW
    else {
      renderLeagueView();
      updateBreadcrumbs(['Home', state.currentLeague.name], ['#', null]);
      document.getElementById('leagueViewSection').classList.remove('hidden');
    }
  }
  
  // MANAGE LEAGUE ROUTE
  else if (parts[0] === 'manage-league') {
    const lId = parts[1];
    if (lId === 'new') {
      state.dirtyData = { id: '', name: '', season: 1, status: 'upcoming', settings: { pointsWin:3, pointsDraw:1, pointsLoss:0 }, teams: [], matches: [] };
      document.getElementById('leagueManageIdInput').value = "Auto-generated";
    } else {
      if (!state.currentLeague || state.currentLeague.id !== lId) {
        state.currentLeague = await apiGet(PATHS.leagueSettings(lId));
      }
      state.dirtyData = JSON.parse(JSON.stringify(state.currentLeague));
      document.getElementById('leagueManageIdInput').value = state.dirtyData.id;
    }
    renderLeagueManager();
    updateBreadcrumbs(['Home', 'Manage League']);
    document.getElementById('leagueManageSection').classList.remove('hidden');
  }

  // MATCH ROUTES
  else if (parts[0] === 'match' && parts[1]) {
    const mId = parts[1];
    await loadActiveMatch(mId);
    
    // SUB-ROUTE: COACH MODE
    if (parts[2] === 'coach' && parts[3]) {
      state.coachSide = parts[3]; // 'home' or 'away'
      renderCoachView();
      document.getElementById('coachSection').classList.remove('hidden');
    } 
    // DEFAULT: JUMBOTRON
    else {
      renderScoreboard();
      startPolling(mId);
      document.getElementById('scoreboardSection').classList.remove('hidden');
    }
  }
}

function hideAllSections() {
  document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
}

function updateBreadcrumbs(labels, links = []) {
  const el = document.getElementById('breadcrumbs');
  el.innerHTML = labels.map((l, i) => {
    if (links[i]) return `<span onclick="location.hash='${links[i]}'">${l}</span>`;
    return l;
  }).join(' > ');
}

// ============================================
// API FUNCTIONS
// ============================================

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

// ============================================
// LEAGUE VIEWS
// ============================================

function renderLeagueList() {
  const container = document.getElementById('leagueListContainer');
  if (!state.leagues.length) {
    container.innerHTML = `<div style="padding:1rem; color:#666;">No leagues found. Create one!</div>`;
    return;
  }
  container.innerHTML = state.leagues.map(l => `
    <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-weight:bold; font-size:1.1rem; color:var(--primary-red)">${l.name}</div>
        <div style="font-size:0.85rem; color:#666;">Season ${l.season} • ${l.status}</div>
      </div>
      <button class="primary-btn" onclick="location.hash='#league/${l.id}'">Open</button>
    </div>
  `).join('');
  
  document.getElementById('leagueCreateBtn').onclick = () => location.hash = '#manage-league/new';
}

function renderLeagueView() {
  const l = state.currentLeague;
  document.getElementById('leagueHeader').innerHTML = `<h2>${l.name}</h2><div style="color:#666">Season ${l.season} (${l.status})</div>`;
  
  // Standings Calculation
  const teamsMap = new Map();
  l.teams.forEach(t => teamsMap.set(t.id, { ...t, w:0, d:0, l:0, pts:0 }));
  (l.matches||[]).filter(m => m.status === 'completed').forEach(m => {
    const h = teamsMap.get(m.homeTeamId); const a = teamsMap.get(m.awayTeamId);
    if (!h || !a) return;
    if (m.score.home > m.score.away) { h.w++; a.l++; h.pts += l.settings.pointsWin; a.pts += l.settings.pointsLoss; }
    else if (m.score.home < m.score.away) { a.w++; h.l++; a.pts += l.settings.pointsWin; h.pts += l.settings.pointsLoss; }
    else { h.d++; a.d++; h.pts += l.settings.pointsDraw; a.pts += l.settings.pointsDraw; }
  });
  
  const sorted = Array.from(teamsMap.values()).sort((a,b) => b.pts - a.pts);
  document.getElementById('standingsContainer').innerHTML = `<table><thead><tr><th>#</th><th>Team</th><th>W-D-L</th><th>Pts</th></tr></thead><tbody>
    ${sorted.map((t, i) => `<tr><td>${i+1}</td><td><a href="#league/${l.id}/team/${t.id}" style="color:var(--text-main); font-weight:bold; text-decoration:none">${t.name}</a></td><td>${t.w}-${t.d}-${t.l}</td><td style="font-weight:bold">${t.pts}</td></tr>`).join('')}
  </tbody></table>`;

  // Roster Quick View
  document.getElementById('rosterQuickViewContainer').innerHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:0.5rem; margin-top:0.5rem">
    ${l.teams.map(t => `<button class="secondary-btn" onclick="location.hash='#league/${l.id}/team/${t.id}'">${t.name}</button>`).join('')}
  </div>`;

  // Scheduling Dropdowns
  const schedOpts = l.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  document.getElementById('schedHome').innerHTML = `<option value="">Home...</option>${schedOpts}`;
  document.getElementById('schedAway').innerHTML = `<option value="">Away...</option>${schedOpts}`;
  
  // Matches List
  const matches = (l.matches||[]);
  document.getElementById('inProgressContainer').innerHTML = matches.filter(m => m.status === 'in_progress')
    .map(m => `<button class="primary-btn full-width" onclick="location.hash='#match/${m.id}'" style="background:var(--primary-red)">🔴 LIVE: ${getTeamName(m.homeTeamId)} vs ${getTeamName(m.awayTeamId)}</button>`).join('');
    
  document.getElementById('matchesContainer').innerHTML = matches.filter(m => m.status !== 'in_progress').sort((a,b) => a.round - b.round)
    .map(m => {
      const label = `Rd ${m.round}: ${getTeamName(m.homeTeamId)} vs ${getTeamName(m.awayTeamId)}`;
      if (m.status === 'completed') return `<div class="card" style="padding:0.5rem; font-size:0.9rem; background:#eee">${label} <strong>(${m.score.home}-${m.score.away})</strong></div>`;
      return `<div class="card" style="padding:0.5rem; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:0.9rem">${label}</span> <button class="primary-btn" style="padding:0.2rem 0.5rem; font-size:0.8rem" onclick="setupMatch('${m.id}')">Start</button>
      </div>`;
    }).join('');

  // Admin Tab Button
  document.getElementById('leagueManageBtn').onclick = () => location.hash = `#manage-league/${l.id}`;

  // Schedule Add Handler
  document.getElementById('schedAddBtn').onclick = async () => {
    const r = parseInt(document.getElementById('schedRound').value);
    const h = document.getElementById('schedHome').value;
    const a = document.getElementById('schedAway').value;
    if(!h || !a || h === a) return alert("Invalid selection");
    
    l.matches = l.matches || [];
    l.matches.push({ id: `match_${Date.now()}`, round: r, homeTeamId: h, awayTeamId: a, status: 'scheduled' });
    const key = document.getElementById('editKeyInput').value;
    await apiSave(PATHS.leagueSettings(l.id), l, "Add match", key);
    renderLeagueView();
  };
}

// ============================================
// TEAM VIEWS
// ============================================

function renderTeamView() {
  const t = state.currentTeam;
  const tv = calculateTV(t);
  document.getElementById('teamHeaderName').innerText = t.name;
  document.getElementById('teamTVBadge').innerText = `TV: ${Math.floor(tv/1000)}k`;
  document.getElementById('teamSummary').innerHTML = `Race: ${t.race} | Coach: ${t.coachName} | Treasury: ${t.treasury||0}k | Rerolls: ${t.rerolls||0}`;
  
  document.getElementById('teamRosterContainer').innerHTML = `<table>
    <thead><tr><th>#</th><th>Name</th><th>Pos</th><th>Stats</th><th>Skills</th><th>SPP</th></tr></thead>
    <tbody>${t.players.map(p => `
      <tr>
        <td>${p.number}</td>
        <td style="font-weight:bold">${p.name}</td>
        <td style="font-size:0.8rem; color:#666">${p.position}</td>
        <td><span class="${getStatClass('ma', p.ma)}">${p.ma}</span>-<span class="${getStatClass('st', p.st)}">${p.st}</span>-<span class="${getStatClass('ag', p.ag)}">${p.ag}+</span>-<span class="${getStatClass('av', p.av)}">${p.av}+</span></td>
        <td>${p.skills.map(s => `<span class="skill-pill ${getSkillClass(s)}" onclick="showSkill('${s}')">${s}</span>`).join('')}</td>
        <td>${p.spp}</td>
      </tr>`).join('')}</tbody></table>`;
      
  document.getElementById('teamEditBtn').onclick = () => location.hash = `#league/${state.currentLeague.id}/edit-team/${t.id}`;
}

// ============================================
// TEAM EDITOR & SHOP
// ============================================

function renderTeamEditor() {
  const t = state.dirtyData;
  const tv = calculateTV(t);
  document.getElementById('teamEditName').value = t.name;
  document.getElementById('teamEditCoach').value = t.coachName;
  document.getElementById('teamEditRerolls').value = t.rerolls || 0;
  document.getElementById('teamEditTreasury').value = t.treasury || 0;
  document.getElementById('teamEditTVBar').innerText = `Current TV: ${Math.floor(tv/1000)}k`;
  
  const raceOpts = state.gameData.races.map(r => `<option value="${r.name}">${r.name}</option>`).join('');
  document.getElementById('teamEditRace').innerHTML = raceOpts;
  document.getElementById('teamEditRace').value = t.race;

  document.getElementById('teamEditorRosterBody').innerHTML = t.players.map((p, i) => `
    <tr>
      <td><input type="number" style="width:30px" value="${p.number}" onchange="updatePlayer(${i}, 'number', this.value)"></td>
      <td><input value="${p.name}" onchange="updatePlayer(${i}, 'name', this.value)"></td>
      <td><span style="font-size:0.8rem">${p.position}</span></td>
      <td style="font-size:0.8rem">${p.ma}-${p.st}-${p.ag}+-${p.av}+</td>
      <td>${p.skills.map((s, si) => `<span class="skill-pill ${getSkillClass(s)}">${s} <span onclick="removeSkill(${i}, ${si})" style="color:red;cursor:pointer">×</span></span>`).join('')} 
          <button style="font-size:0.7rem; padding:0 4px" onclick="addSkillPrompt(${i})">+</button></td>
      <td><input type="number" style="width:40px" value="${p.spp}" onchange="updatePlayer(${i}, 'spp', this.value)"></td>
      <td><button onclick="deletePlayer(${i})" style="color:red;border:none;background:none;font-weight:bold">×</button></td>
    </tr>
  `).join('');
  
  // Bind Inputs
  document.getElementById('teamEditName').onchange = (e) => t.name = e.target.value;
  document.getElementById('teamEditRerolls').onchange = (e) => { t.rerolls = parseInt(e.target.value); renderTeamEditor(); };
  document.getElementById('teamEditTreasury').onchange = (e) => t.treasury = parseInt(e.target.value);
  
  // Save Action
  document.getElementById('teamSaveBtn').onclick = async () => {
    const key = document.getElementById('editKeyInput').value;
    if(!t.id) t.id = normalizeName(t.name);
    
    // Check if new team
    if(state.currentLeague && !state.currentLeague.teams.find(x => x.id === t.id)) {
      state.currentLeague.teams.push({ id: t.id, name: t.name, race: t.race, coachName: t.coachName });
      await apiSave(PATHS.leagueSettings(state.currentLeague.id), state.currentLeague, "Add team", key);
    }
    
    await apiSave(PATHS.team(state.currentLeague.id, t.id), t, "Update Team", key);
    showToast("Team Saved", 1500);
    window.history.back();
  };
  
  // Delete Action
  document.getElementById('teamDeleteBtn').onclick = () => {
    safeDelete(t.name, async () => {
      const key = document.getElementById('editKeyInput').value;
      await apiDelete(PATHS.team(state.currentLeague.id, t.id), "Delete Team", key);
      
      const idx = state.currentLeague.teams.findIndex(x => x.id === t.id);
      if (idx !== -1) {
        state.currentLeague.teams.splice(idx, 1);
        await apiSave(PATHS.leagueSettings(state.currentLeague.id), state.currentLeague, "Remove team from league", key);
      }
      location.hash = `#league/${state.currentLeague.id}`;
    });
  };
}

function changeTeamRace(newRace) {
  if (state.dirtyData.players.length > 0 && !confirm("Changing race will create conflict with existing players. Continue?")) return;
  state.dirtyData.race = newRace;
  renderTeamEditor();
}

function openShopModal() {
  const t = state.dirtyData;
  const race = state.gameData.races.find(r => r.name === t.race);
  if (!race) return alert("Invalid Race Data");
  
  document.getElementById('shopContainer').innerHTML = race.positionals.map(pos => `
    <div class="shop-item" onclick="buyPlayer('${pos.name}')">
      <div style="font-weight:bold">${pos.name}</div>
      <div style="color:#666; font-size:0.8rem">${Math.floor(pos.cost/1000)}k</div>
      <div style="font-size:0.8rem; margin-top:5px">MA${pos.ma} ST${pos.st} AG${pos.ag}+ AV${pos.av}+</div>
      <div style="font-size:0.75rem; color:#888; font-style:italic">${pos.skills.join(', ')}</div>
    </div>
  `).join('');
  document.getElementById('shopModal').classList.remove('hidden');
}

window.buyPlayer = (posName) => {
  const t = state.dirtyData;
  const race = state.gameData.races.find(r => r.name === t.race);
  const pos = race.positionals.find(p => p.name === posName);
  
  if ((t.treasury || 0) < pos.cost) {
    if(!confirm("Not enough treasury. Buy anyway?")) return;
  }
  
  t.treasury = (t.treasury || 1000000) - pos.cost;
  const nextNum = t.players.reduce((max, p) => Math.max(max, p.number||0), 0) + 1;
  t.players.push({
    number: nextNum, name: 'Rookie', position: pos.name,
    ma: pos.ma, st: pos.st, ag: pos.ag, pa: pos.pa, av: pos.av,
    skills: [...pos.skills], spp: 0, cost: pos.cost
  });
  
  closeModal('shopModal');
  renderTeamEditor();
};

window.updatePlayer = (i, f, v) => {
  if(['number','spp'].includes(f)) state.dirtyData.players[i][f] = parseInt(v);
  else state.dirtyData.players[i][f] = v;
};
window.deletePlayer = (i) => { state.dirtyData.players.splice(i,1); renderTeamEditor(); };
window.removeSkill = (pi, si) => { state.dirtyData.players[pi].skills.splice(si, 1); renderTeamEditor(); };
window.addSkillPrompt = (pi) => {
  const skill = prompt("Enter Skill Name (exact spelling):");
  if(skill) { state.dirtyData.players[pi].skills.push(skill); renderTeamEditor(); }
};

// ============================================
// MATCH SETUP & PLAY
// ============================================

window.setupMatch = async (matchId) => {
  const l = state.currentLeague;
  const m = l.matches.find(x => x.id === matchId);
  if(!m) return;
  
  try {
    const home = await apiGet(PATHS.team(l.id, m.homeTeamId));
    const away = await apiGet(PATHS.team(l.id, m.awayTeamId));
    
    // Check for existing active match
    const existing = await apiGet(PATHS.activeMatch(matchId));
    if (existing) { location.hash = `#match/${matchId}`; return; }
    
    // Pre-Match Screen
    const hTV = calculateTV(home);
    const aTV = calculateTV(away);
    const diff = hTV - aTV;
    
    document.getElementById('pmHomeName').innerText = home.name;
    document.getElementById('pmAwayName').innerText = away.name;
    document.getElementById('pmHomeTV').innerText = `TV ${Math.floor(hTV/1000)}k`;
    document.getElementById('pmAwayTV').innerText = `TV ${Math.floor(aTV/1000)}k`;
    
    const txt = document.getElementById('pmInducementText');
    if (diff < 0) txt.innerText = `${home.name} receives ${Math.floor(Math.abs(diff)/1000)}k petty cash.`;
    else if (diff > 0) txt.innerText = `${away.name} receives ${Math.floor(diff/1000)}k petty cash.`;
    else txt.innerText = "Teams are even.";

    document.getElementById('preMatchSection').classList.remove('hidden');
    document.getElementById('leagueViewSection').classList.add('hidden');
    
    document.getElementById('pmStartBtn').onclick = async () => {
       await createActiveMatch(m, home, away);
       location.hash = `#match/${matchId}`;
    };
  } catch(e) { alert(e.message); }
};

async function createActiveMatch(match, homeTeam, awayTeam) {
    const key = document.getElementById('editKeyInput').value;
    if (!key) return showToast("Edit key required");

    const initRoster = (players) => (players||[]).map(p => ({
        ...p, live: { used: false, injured: false, sentOff: false, td: 0, cas: 0, int: 0, mvp: false }
    }));

    const activeData = {
      matchId: match.id, leagueId: state.currentLeague.id, round: match.round, status: 'in_progress',
      home: { id: homeTeam.id, name: homeTeam.name, score: 0, roster: initRoster(homeTeam.players), rerolls: homeTeam.rerolls || 0 },
      away: { id: awayTeam.id, name: awayTeam.name, score: 0, roster: initRoster(awayTeam.players), rerolls: awayTeam.rerolls || 0 },
      turn: { home: 0, away: 0 }, log: []
    };
    
    await apiSave(PATHS.activeMatch(match.id), activeData, `Start match ${match.id}`, key);
    
    const l = state.currentLeague;
    const mIdx = l.matches.findIndex(x => x.id === match.id);
    if(mIdx !== -1) l.matches[mIdx].status = 'in_progress';
    await apiSave(PATHS.leagueSettings(l.id), l, `Set match ${match.id} in_progress`, key);
    
    state.activeMatch = activeData;
}

// ============================================
// LIVE MATCH (SCOREBOARD & COACH)
// ============================================

async function loadActiveMatch(mid) {
  state.activeMatch = await apiGet(PATHS.activeMatch(mid));
  if (!state.activeMatch) throw new Error("Match not found");
}

function renderScoreboard() {
  const d = state.activeMatch;
  if(!d) return;
  document.getElementById('sbHomeName').textContent = d.home.name;
  document.getElementById('sbAwayName').textContent = d.away.name;
  document.getElementById('sbHomeScore').textContent = d.home.score;
  document.getElementById('sbAwayScore').textContent = d.away.score;
  document.getElementById('sbTurn').textContent = `${d.turn.home} - ${d.turn.away}`;

  const renderSimpleRoster = (roster) => roster.map(p => `
    <div style="font-size:0.8rem; padding:4px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; ${p.live.used?'opacity:0.5':''} ${p.live.injured?'background:#fee;color:red':''}">
        <span>#${p.number} ${p.name}</span>
        <span>${p.position}</span>
    </div>
  `).join('');
  
  document.getElementById('sbHomeRoster').innerHTML = renderSimpleRoster(d.home.roster);
  document.getElementById('sbAwayRoster').innerHTML = renderSimpleRoster(d.away.roster);
  
  // Refresh Handler
  document.getElementById('sbRefreshBtn').onclick = () => loadActiveMatch(d.matchId).then(renderScoreboard);
  
  // End Game Handler
  document.getElementById('endGameBtn').onclick = async () => {
    if(!confirm("End Game? This will save results and delete the live match.")) return;
    const key = document.getElementById('editKeyInput').value;
    const l = await apiGet(PATHS.leagueSettings(d.leagueId));
    const m = l.matches.find(x => x.id === d.matchId);
    if(m) {
      m.status = 'completed';
      m.score = { home: d.home.score, away: d.away.score };
    }
    await apiSave(PATHS.leagueSettings(d.leagueId), l, `End match ${d.matchId}`, key);
    await apiDelete(PATHS.activeMatch(d.matchId), "Clean up match", key);
    location.hash = `#league/${d.leagueId}`;
  };
}

function renderCoachView() {
  const side = state.coachSide;
  const team = state.activeMatch[side];
  const opp = state.activeMatch[side === 'home' ? 'away' : 'home'];
  
  document.getElementById('coachTeamName').innerText = team.name;
  document.getElementById('coachScoreDisplay').innerText = `${team.score} - ${opp.score}`;
  document.getElementById('coachTurnDisplay').innerText = state.activeMatch.turn[side];
  
  // Rerolls
  let pips = '';
  for(let i=0; i<team.rerolls; i++) pips += `<span class="pip active" onclick="useReroll()"></span>`;
  document.getElementById('coachRerolls').innerHTML = pips || '<span style="font-size:0.8rem">None</span>';
  
  // Cards
  document.getElementById('coachRosterList').innerHTML = team.roster.map((p, idx) => {
    const live = p.live || {};
    let badges = '';
    if(live.td) badges += `<span class="badge">TD:${live.td}</span>`;
    if(live.cas) badges += `<span class="badge">CAS:${live.cas}</span>`;
    if(live.int) badges += `<span class="badge">INT:${live.int}</span>`;
    
    let classes = 'coach-card';
    if(live.used) classes += ' used';
    if(live.injured || live.sentOff) classes += ' injured';

    return `
      <div class="${classes}" onclick="openActionSheet(${idx})">
        <div class="coach-card-top">
          <span class="player-name">#${p.number} ${p.name}</span>
          <span class="player-pos">${p.position}</span>
        </div>
        <div style="font-size:0.85rem; color:#444;">${p.skills.join(', ')}</div>
        <div class="card-badges">${badges}</div>
      </div>
    `;
  }).join('');
}

// Coach Actions
window.openActionSheet = (idx) => {
  state.selectedPlayerIdx = idx;
  const p = state.activeMatch[state.coachSide].roster[idx];
  document.getElementById('actionSheetTitle').innerText = `#${p.number} ${p.name}`;
  document.getElementById('actionSheet').classList.remove('hidden');
};

window.doAction = async (type) => {
  const p = state.activeMatch[state.coachSide].roster[state.selectedPlayerIdx];
  p.live = p.live || {};
  
  if (type === 'td') { p.live.td = (p.live.td||0)+1; state.activeMatch[state.coachSide].score++; }
  else if (type === 'cas') p.live.cas = (p.live.cas||0)+1;
  else if (type === 'int') p.live.int = (p.live.int||0)+1;
  else if (type === 'inj') p.live.injured = !p.live.injured;
  else if (type === 'sentOff') p.live.sentOff = !p.live.sentOff;

  p.live.used = true;
  renderCoachView();
  closeActionSheet();
  await saveMatchState(`Player ${p.number} ${type}`);
};

window.useReroll = async () => {
  if (state.activeMatch[state.coachSide].rerolls > 0) {
    state.activeMatch[state.coachSide].rerolls--;
    renderCoachView();
    await saveMatchState("Used Reroll");
  }
};

document.getElementById('coachEndTurnBtn').onclick = async () => {
  const side = state.coachSide;
  state.activeMatch[side].roster.forEach(p => { if(p.live) p.live.used = false; });
  state.activeMatch.turn[side]++;
  renderCoachView();
  await saveMatchState(`End Turn ${side}`);
};

async function saveMatchState(msg) {
  showToast("Saving...");
  try {
    const key = document.getElementById('editKeyInput').value;
    await apiSave(PATHS.activeMatch(state.activeMatch.matchId), state.activeMatch, msg, key);
    showToast("Saved!", 1000);
  } catch(e) { showToast("Save Failed!"); }
}

window.enterCoachMode = (side) => location.hash = `#match/${state.activeMatch.matchId}/coach/${side}`;

// ============================================
// MANAGERS (LEAGUE)
// ============================================

function renderLeagueManager() {
  const l = state.dirtyData;
  document.getElementById('leagueManageNameInput').value = l.name;
  document.getElementById('leagueManageSeasonInput').value = l.season;
  document.getElementById('leagueManageStatusSelect').value = l.status;
  document.getElementById('leagueManagePointsWinInput').value = l.settings.pointsWin;
  document.getElementById('leagueManagePointsDrawInput').value = l.settings.pointsDraw;
  document.getElementById('leagueManagePointsLossInput').value = l.settings.pointsLoss;
  
  document.getElementById('leagueManageTeamsList').innerHTML = l.teams.map(t => `
    <div style="display:flex; justify-content:space-between; padding:0.5rem; border-bottom:1px solid #eee">
      <span>${t.name} (${t.race})</span>
      <button class="secondary-btn" style="padding:0 0.5rem" onclick="location.hash='#league/${l.id}/edit-team/${t.id}'">Edit</button>
    </div>
  `).join('');

  document.getElementById('leagueManageNameInput').onchange = (e) => {
    l.name = e.target.value;
    if(!l.id) { l.id = normalizeName(l.name); document.getElementById('leagueManageIdInput').value = l.id; }
  };
  
  document.getElementById('leagueManageSaveBtn').onclick = async () => {
    const key = document.getElementById('editKeyInput').value;
    l.season = parseInt(document.getElementById('leagueManageSeasonInput').value);
    l.status = document.getElementById('leagueManageStatusSelect').value;
    l.settings.pointsWin = parseInt(document.getElementById('leagueManagePointsWinInput').value);
    l.settings.pointsDraw = parseInt(document.getElementById('leagueManagePointsDrawInput').value);
    l.settings.pointsLoss = parseInt(document.getElementById('leagueManagePointsLossInput').value);
    
    await apiSave(PATHS.leagueSettings(l.id), l, "Save League", key);
    
    // Update Index
    const index = await apiGet(PATHS.leaguesIndex) || [];
    const entry = { id: l.id, name: l.name, season: l.season, status: l.status };
    const idx = index.findIndex(x => x.id === l.id);
    if(idx >= 0) index[idx] = entry; else index.push(entry);
    await apiSave(PATHS.leaguesIndex, index, "Update Index", key);
    
    location.hash = `#league/${l.id}`;
  };
  
  document.getElementById('leagueManageDeleteBtn').onclick = () => {
    safeDelete(l.id, async () => {
      const key = document.getElementById('editKeyInput').value;
      await apiDelete(PATHS.leagueSettings(l.id), "Delete League", key);
      const index = await apiGet(PATHS.leaguesIndex) || [];
      const newIndex = index.filter(x => x.id !== l.id);
      await apiSave(PATHS.leaguesIndex, newIndex, "Update Index", key);
      location.hash = '';
    });
  };
  
  document.getElementById('leagueManageAddTeamBtn').onclick = () => location.hash = `#league/${l.id}/edit-team/new`;
}

// ============================================
// UTILITIES
// ============================================

function calculateTV(team) {
  if (!team || !state.gameData) return 0;
  const playersCost = (team.players||[]).reduce((sum, p) => sum + (p.cost||0), 0);
  const race = state.gameData.races.find(r => r.name === team.race);
  const rrCost = (team.rerolls || 0) * (race ? race.rerollCost : 50000);
  return playersCost + rrCost;
}

function getStatClass(stat, val) {
  if (stat === 'st') return val >= 4 ? 'stat-high' : (val <= 2 ? 'stat-low' : 'stat-avg');
  if (stat === 'ag' || stat === 'av') return val <= 2 ? 'stat-high' : 'stat-avg'; 
  return 'stat-avg';
}

function getSkillClass(skill) {
  if(!state.gameData) return '';
  const cats = state.gameData.skillCategories;
  if(cats.General.find(x=>x.name===skill)) return 'skill-gen';
  if(cats.Agility.find(x=>x.name===skill)) return 'skill-agi';
  if(cats.Strength.find(x=>x.name===skill)) return 'skill-str';
  if(cats.Passing.find(x=>x.name===skill)) return 'skill-pas';
  if(cats.Mutation.find(x=>x.name===skill)) return 'skill-mut';
  return '';
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function showToast(msg, time) {
  const el = document.getElementById('toast');
  el.innerText = msg;
  el.classList.remove('hidden');
  if (time) setTimeout(() => el.classList.add('hidden'), time);
}

function populateSkillList() {
  if (!state.gameData?.skillCategories) return;
  const list = document.getElementById('skillList');
  list.innerHTML = '';
  Object.values(state.gameData.skillCategories).flat().forEach(s => {
    const opt = document.createElement('option');
    opt.value = (typeof s === 'object') ? s.name : s; 
    list.appendChild(opt);
  });
}

function startPolling(matchId) {
  stopPolling();
  state.pollInterval = setInterval(async () => {
    try {
      const fresh = await apiGet(PATHS.activeMatch(matchId));
      if (fresh) { state.activeMatch = fresh; renderScoreboard(); }
    } catch(e) { console.warn("Poll failed", e); }
  }, 5000);
}

function stopPolling() {
  if (state.pollInterval) { clearInterval(state.pollInterval); state.pollInterval = null; }
}

function createEmptyTeam() {
  const defaultRace = state.gameData?.races?.[0]?.name || 'Human';
  return { id: '', name: 'New Team', race: defaultRace, coachName: '', players: [], treasury: 1000000, rerolls: 0 };
}

window.safeDelete = (name, callback) => {
  const modal = document.getElementById('confirmModal');
  const input = document.getElementById('confirmInput');
  document.getElementById('confirmText').innerText = `Type "${name}" to confirm deletion.`;
  input.classList.remove('hidden');
  input.value = '';
  modal.classList.remove('hidden');
  document.getElementById('confirmBtn').onclick = () => {
    if (input.value === name) { callback(); closeModal('confirmModal'); } 
    else { alert("Name mismatch."); }
  };
};

window.showSkill = (skillName) => {
  const cleanName = skillName.replace(/\(\+.*\)/, '').trim(); 
  let desc = "No description available.";
  if (state.gameData?.skillCategories) {
    for (const cat in state.gameData.skillCategories) {
      const found = state.gameData.skillCategories[cat].find(s => s.name.startsWith(cleanName));
      if (found) { desc = found.description; break; }
    }
  }
  document.getElementById('skillModalTitle').textContent = skillName;
  document.getElementById('skillModalBody').textContent = desc;
  document.getElementById('skillModal').classList.remove('hidden');
};

window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.closeActionSheet = () => document.getElementById('actionSheet').classList.add('hidden');
window.switchLeagueTab = (tab) => {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  event.target.classList.add('active');
};
document.getElementById('rememberKeyBtn').onclick = () => {
  localStorage.setItem('bb3_edit_key', document.getElementById('editKeyInput').value);
  showToast("Key Saved", 1000);
};

// Start
init();
