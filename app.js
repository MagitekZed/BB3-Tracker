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

// --- INIT & ROUTING ---
async function init() {
  const storedKey = localStorage.getItem('bb3_edit_key');
  if (storedKey) document.getElementById('editKeyInput').value = storedKey;
  
  try {
    state.gameData = await apiGet(PATHS.gameData);
    state.leagues = await apiGet(PATHS.leaguesIndex) || [];
    renderLeagueList();
    populateSkillList();
    window.addEventListener('hashchange', handleRouting);
    handleRouting(); // Initial load
  } catch(e) { console.error(e); showToast("Init Failed: " + e.message); }
}

async function handleRouting() {
  const hash = window.location.hash.substring(1);
  const parts = hash.split('/'); // e.g., ['league', 'id', 'team', 'id']
  
  hideAllSections();
  stopPolling();

  if (!parts[0]) {
    updateBreadcrumbs(['Home']);
    document.getElementById('leagueListSection').classList.remove('hidden');
    return;
  }

  if (parts[0] === 'league' && parts[1]) {
    const lId = parts[1];
    if (!state.currentLeague || state.currentLeague.id !== lId) {
      state.currentLeague = await apiGet(PATHS.leagueSettings(lId));
    }
    
    if (parts[2] === 'team' && parts[3]) {
      // TEAM VIEW
      const tId = parts[3];
      state.currentTeam = await apiGet(PATHS.team(lId, tId));
      renderTeamView();
      updateBreadcrumbs(['Home', state.currentLeague.name, state.currentTeam.name], [`#`, `#league/${lId}`, null]);
      document.getElementById('teamViewSection').classList.remove('hidden');
    } 
    else if (parts[2] === 'edit-team' && parts[3]) {
      // TEAM EDIT
      const tId = parts[3];
      if(tId === 'new') state.dirtyData = createEmptyTeam();
      else state.dirtyData = await apiGet(PATHS.team(lId, tId));
      state.editMode = 'team';
      renderTeamEditor();
      updateBreadcrumbs(['Home', state.currentLeague.name, 'Edit Team']);
      document.getElementById('teamEditorSection').classList.remove('hidden');
    }
    else {
      // LEAGUE VIEW
      renderLeagueView();
      updateBreadcrumbs(['Home', state.currentLeague.name], ['#', null]);
      document.getElementById('leagueViewSection').classList.remove('hidden');
    }
  }
  else if (parts[0] === 'match' && parts[1]) {
    const mId = parts[1];
    await loadActiveMatch(mId);
    
    if (parts[2] === 'coach' && parts[3]) {
      // COACH MODE
      state.coachSide = parts[3]; // 'home' or 'away'
      renderCoachView();
      document.getElementById('coachSection').classList.remove('hidden');
    } else {
      // JUMBOTRON
      startPolling(mId);
      renderScoreboard();
      document.getElementById('scoreboardSection').classList.remove('hidden');
    }
  }
}

function updateBreadcrumbs(labels, links = []) {
  const el = document.getElementById('breadcrumbs');
  el.innerHTML = labels.map((l, i) => {
    if (links[i]) return `<span onclick="location.hash='${links[i]}'">${l}</span>`;
    return l;
  }).join(' > ');
}

function hideAllSections() {
  document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
}

// --- CORE RENDERERS ---

function renderLeagueView() {
  const l = state.currentLeague;
  document.getElementById('leagueHeader').innerHTML = `<h2>${l.name}</h2><div class="small">Season ${l.season} • ${l.status}</div>`;
  
  // Standings
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
  document.getElementById('standingsContainer').innerHTML = `<table><thead><tr><th>Team</th><th>W-D-L</th><th>Pts</th></tr></thead><tbody>
    ${sorted.map(t => `<tr><td><a href="#league/${l.id}/team/${t.id}">${t.name}</a></td><td>${t.w}-${t.d}-${t.l}</td><td>${t.pts}</td></tr>`).join('')}
  </tbody></table>`;

  // Matches
  const schedOpts = l.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  document.getElementById('schedHome').innerHTML = `<option value="">Home...</option>${schedOpts}`;
  document.getElementById('schedAway').innerHTML = `<option value="">Away...</option>${schedOpts}`;
  
  const matches = (l.matches||[]);
  document.getElementById('inProgressContainer').innerHTML = matches.filter(m => m.status === 'in_progress')
    .map(m => `<button class="primary-btn full-width" onclick="location.hash='#match/${m.id}'">🔴 LIVE: ${getTeamName(m.homeTeamId)} vs ${getTeamName(m.awayTeamId)}</button>`).join('');
    
  document.getElementById('matchesContainer').innerHTML = matches.filter(m => m.status !== 'in_progress').sort((a,b) => a.round - b.round)
    .map(m => {
      const label = `Rd ${m.round}: ${getTeamName(m.homeTeamId)} vs ${getTeamName(m.awayTeamId)}`;
      if (m.status === 'completed') return `<div class="card small">${label} (${m.score.home}-${m.score.away})</div>`;
      return `<div class="card small" style="display:flex; justify-content:space-between; align-items:center;">
        ${label} <button class="primary-btn" onclick="setupMatch('${m.id}')">Start</button>
      </div>`;
    }).join('');
}

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
        <td>${p.number}</td><td>${p.name}</td><td>${p.position}</td>
        <td><span class="${getStatClass('ma', p.ma)}">${p.ma}</span>-<span class="${getStatClass('st', p.st)}">${p.st}</span>-<span class="${getStatClass('ag', p.ag)}">${p.ag}+</span>-<span class="${getStatClass('av', p.av)}">${p.av}+</span></td>
        <td>${p.skills.map(s => `<span class="skill-pill ${getSkillClass(s)}" onclick="showSkill('${s}')">${s}</span>`).join('')}</td>
        <td>${p.spp}</td>
      </tr>`).join('')}</tbody></table>`;
      
  document.getElementById('teamEditBtn').onclick = () => location.hash = `#league/${state.currentLeague.id}/edit-team/${t.id}`;
}

// --- TEAM EDITOR & SHOP ---

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
      <td>${p.position}</td>
      <td style="font-size:0.8rem">${p.ma}-${p.st}-${p.ag}+-${p.av}+</td>
      <td>${p.skills.map(s => `<span class="skill-pill ${getSkillClass(s)}">${s}</span>`).join('')}</td>
      <td><input type="number" style="width:40px" value="${p.spp}" onchange="updatePlayer(${i}, 'spp', this.value)"></td>
      <td><button onclick="deletePlayer(${i})" style="color:red;border:none;background:none">×</button></td>
    </tr>
  `).join('');
  
  // Bind Inputs
  document.getElementById('teamEditName').onchange = (e) => t.name = e.target.value;
  document.getElementById('teamEditRerolls').onchange = (e) => { t.rerolls = parseInt(e.target.value); renderTeamEditor(); };
  document.getElementById('teamEditTreasury').onchange = (e) => t.treasury = parseInt(e.target.value);
}

function openShopModal() {
  const t = state.dirtyData;
  const race = state.gameData.races.find(r => r.name === t.race);
  if (!race) return;
  
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
  
  if ((t.treasury || 1000000) < pos.cost) {
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

// --- PRE-MATCH & INDUCEMENTS ---

window.setupMatch = async (matchId) => {
  const l = state.currentLeague;
  const m = l.matches.find(x => x.id === matchId);
  if(!m) return;
  
  try {
    const home = await apiGet(PATHS.team(l.id, m.homeTeamId));
    const away = await apiGet(PATHS.team(l.id, m.awayTeamId));
    
    // Check for existing active match first
    const existing = await apiGet(PATHS.activeMatch(matchId));
    if (existing) { location.hash = `#match/${matchId}`; return; }
    
    // Show Pre-Match Screen
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

// --- COACH MODE ---

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
  else if (type === 'mvp') p.live.mvp = !p.live.mvp;

  // Optimistic UI Update
  p.live.used = true; // Auto-mark used on action
  renderCoachView();
  closeActionSheet();
  
  await saveMatchState(`Player ${p.number} action: ${type}`);
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

// --- HELPERS ---

function calculateTV(team) {
  if (!team || !state.gameData) return 0;
  const playersCost = (team.players||[]).reduce((sum, p) => sum + (p.cost||0), 0);
  const race = state.gameData.races.find(r => r.name === team.race);
  const rrCost = (team.rerolls || 0) * (race ? race.rerollCost : 50000);
  // We should add treasury to "Total Asset Value" but typically TV is players + assets.
  // BB2020 TV is usually Players + Inducements. We'll stick to simple Players + RR for now.
  return playersCost + rrCost;
}

function getStatClass(stat, val) {
  if (stat === 'st') return val >= 4 ? 'stat-high' : (val <= 2 ? 'stat-low' : 'stat-avg');
  if (stat === 'ag' || stat === 'av') return val <= 2 ? 'stat-high' : 'stat-avg'; // AG 2+ is good
  return 'stat-avg';
}

function getSkillClass(skill) {
  const cats = state.gameData.skillCategories;
  if(cats.General.find(x=>x.name===skill)) return 'skill-gen';
  if(cats.Agility.find(x=>x.name===skill)) return 'skill-agi';
  if(cats.Strength.find(x=>x.name===skill)) return 'skill-str';
  if(cats.Passing.find(x=>x.name===skill)) return 'skill-pas';
  if(cats.Mutation.find(x=>x.name===skill)) return 'skill-mut';
  return '';
}

async function saveMatchState(msg) {
  showToast("Saving...");
  try {
    const key = document.getElementById('editKeyInput').value;
    await apiSave(PATHS.activeMatch(state.activeMatch.matchId), state.activeMatch, msg, key);
    showToast("Saved!", 1000);
  } catch(e) { showToast("Save Failed!"); console.error(e); }
}

function showToast(msg, time) {
  const el = document.getElementById('toast');
  el.innerText = msg;
  el.classList.remove('hidden');
  if (time) setTimeout(() => el.classList.add('hidden'), time);
}

// Utility for safe deletes
window.safeDelete = (name, callback) => {
  const modal = document.getElementById('confirmModal');
  const input = document.getElementById('confirmInput');
  document.getElementById('confirmText').innerText = `Type "${name}" to confirm deletion.`;
  input.classList.remove('hidden');
  input.value = '';
  modal.classList.remove('hidden');
  document.getElementById('confirmBtn').onclick = () => {
    if (input.value === name) {
      callback();
      closeModal('confirmModal');
    } else { alert("Name mismatch."); }
  };
};

// ... (Existing API functions apiGet, apiSave, apiDelete remain unchanged) ...
// ... (Scoreboard render logic mostly remains same but adapted to new structure) ...

// Glue code
function getTeamName(id) {
  const t = state.currentLeague.teams.find(x => x.id === id);
  return t ? t.name : id;
}

window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.closeActionSheet = () => document.getElementById('actionSheet').classList.add('hidden');
window.switchLeagueTab = (tab) => {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  event.target.classList.add('active');
};
window.updatePlayer = (i, f, v) => {
  if(['number','spp'].includes(f)) state.dirtyData.players[i][f] = parseInt(v);
  else state.dirtyData.players[i][f] = v;
};
window.deletePlayer = (i) => { state.dirtyData.players.splice(i,1); renderTeamEditor(); };

// Bind Save buttons
document.getElementById('teamSaveBtn').onclick = async () => {
  // Save logic same as before but using state.dirtyData
  const key = document.getElementById('editKeyInput').value;
  await apiSave(PATHS.team(state.currentLeague.id, state.dirtyData.id), state.dirtyData, "Update Team", key);
  showToast("Team Saved", 1500);
  window.history.back();
};

init();
