import { state, els } from './state.js';
import { PATHS } from './config.js';
import { apiGet, apiSave, apiDelete } from './api.js';
import { setStatus, getContrastColor, applyTeamTheme } from './utils.js';
import { showSection, updateBreadcrumbs, setActiveNav, goHome, showSkill } from './ui-core.js';
import { handleOpenLeague } from './ui-league.js';

// --- Scheduling ---

export function openScheduleModal() {
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
  
  let nextRound = 1;
  if(l.matches && l.matches.length > 0) {
      const maxR = Math.max(...l.matches.map(m => m.round));
      nextRound = maxR + 1;
  }
  els.scheduleModal.round.value = nextRound;
  els.scheduleModal.el.classList.remove('hidden');
}

export function closeScheduleModal() {
  els.scheduleModal.el.classList.add('hidden');
}

export async function handleScheduleMatch() {
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
    // We need to refresh the view. Importing renderLeagueView creates circular dependency.
    // Instead, we reload the league which is safer.
    handleOpenLeague(l.id);
    setStatus('Match scheduled.', 'ok');
  } catch(e) { setStatus(e.message, 'error'); }
}

// --- Live Match Init ---

export async function handleStartMatch(matchId) {
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
      turn: { home: 0, away: 0 }, log: []
    };
    
    await apiSave(PATHS.activeMatch(m.id), activeData, `Start match`, key);
    m.status = 'in_progress';
    await apiSave(PATHS.leagueSettings(l.id), l, `Match in progress`, key);
    
    handleOpenScoreboard(m.id);
    setStatus('Match started!', 'ok');
  } catch(e) { setStatus(e.message, 'error'); }
}

// --- Scoreboard / Jumbotron ---

export async function handleOpenScoreboard(matchId) {
  setStatus('Loading live match...');
  try {
    const data = await apiGet(PATHS.activeMatch(matchId));
    if (!data) throw new Error("Active match file not found.");
    state.activeMatchData = data;
    renderJumbotron();
    showSection('scoreboard');
    
    // Attempt to load league name for breadcrumbs if not loaded
    const leagueName = state.currentLeague?.name || 'League';
    
    updateBreadcrumbs([
      { label: 'Leagues', action: goHome },
      { label: leagueName, action: () => handleOpenLeague(state.activeMatchData.leagueId) },
      { label: 'Live Match' }
    ]);
    setActiveNav('match');
    
    if (state.activeMatchPollInterval) clearInterval(state.activeMatchPollInterval);
    state.activeMatchPollInterval = setInterval(async () => {
        try {
            if(!document.getElementById('sbHomeName') || els.sections.scoreboard.classList.contains('hidden')) {
                return;
            }
            const fresh = await apiGet(PATHS.activeMatch(matchId));
            if (fresh) { state.activeMatchData = fresh; renderJumbotron(); }
        } catch(e) { console.warn("Poll failed", e); }
    }, 5000); 
    setStatus('Live connection active.', 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
}

export function renderJumbotron() {
  const d = state.activeMatchData;
  els.containers.sbHomeName.innerHTML = `<div class="big-team-text" style="color:${d.home.colors?.primary}; text-shadow:2px 2px 0 ${d.home.colors?.secondary}, 4px 4px 0px rgba(0,0,0,0.5)">${d.home.name}</div>`;
  els.containers.sbAwayName.innerHTML = `<div class="big-team-text" style="color:${d.away.colors?.primary}; text-shadow:2px 2px 0 ${d.away.colors?.secondary}, 4px 4px 0px rgba(0,0,0,0.5)">${d.away.name}</div>`;
  els.containers.sbHomeScore.textContent = d.home.score;
  els.containers.sbAwayScore.textContent = d.away.score;
  
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

// --- Coach Mode ---

export function enterCoachMode(side) {
  state.coachSide = side;
  document.body.classList.add('mode-coach');
  const team = state.activeMatchData[side];
  applyTeamTheme(team); 
  renderCoachView();
  showSection('coach');
  if (state.activeMatchPollInterval) { clearInterval(state.activeMatchPollInterval); state.activeMatchPollInterval = null; }
}

export function exitCoachMode() {
  document.body.classList.remove('mode-coach');
  applyTeamTheme(null);
  handleOpenScoreboard(state.activeMatchData.matchId);
}

export function renderCoachView() {
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
    pips += `<div class="reroll-pip ${i < (team.rerolls) ? 'active' : ''}" onclick="window.toggleReroll('${side}', ${i})"></div>`;
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
      `<span class="skill-tag" onclick="event.stopPropagation(); window.showSkill('${s}')">${s}</span>`
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
      <div class="live-player-row ${live.used?'used':''} ${live.injured?'injured':''}" onclick="window.openPlayerActionSheet(${idx})">
        <div class="player-info">
          <span class="player-name">#${p.number} ${p.name} ${badges}</span>
          <span class="player-pos">${p.position} | ${skillTags}</span>
        </div>
      </div>
    `;
  }).join('');
}

// --- Player Actions ---

export function openPlayerActionSheet(idx) {
  state.selectedPlayerIdx = idx;
  const p = state.activeMatchData[state.coachSide].roster[idx];
  if(els.actionSheet.title) els.actionSheet.title.textContent = `#${p.number} ${p.name}`;
  els.actionSheet.el.classList.remove('hidden');
}

export function closeActionSheet() {
  els.actionSheet.el.classList.add('hidden');
  state.selectedPlayerIdx = null;
}

export function handleSheetAction(type) {
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
}

export async function updateLiveMatch(actionDesc) {
  const key = els.inputs.editKey.value;
  if(!key) return setStatus("Key needed.", "error");
  try {
    await apiSave(PATHS.activeMatch(state.activeMatchData.matchId), state.activeMatchData, actionDesc, key);
  } catch(e) { console.error(e); setStatus("Sync failed!", "error"); }
}

export function toggleReroll(side, idx) {
  const team = state.activeMatchData[side];
  if (team.rerolls > 0) {
      team.rerolls--;
      renderCoachView();
      updateLiveMatch(`${side} used Reroll`);
  }
}

// --- Game Control Actions ---

export async function handleCoachEndTurn() {
  const side = state.coachSide;
  const d = state.activeMatchData;
  d[side].roster.forEach(p => { if(p.live) p.live.used = false; });
  d.turn[side]++;
  renderCoachView();
  await updateLiveMatch(`End Turn: ${side}`);
  setStatus("Turn ended.", "ok");
}

export async function handleCancelGame() {
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
}

export async function handleEndGame() {
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
}
