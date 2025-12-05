import { state, els } from './state.js';
import { PATHS } from './config.js';
import { apiGet, apiSave, apiDelete } from './api.js';
import { setStatus, getContrastColor, applyTeamTheme } from './utils.js';
import { showSection, updateBreadcrumbs, setActiveNav, goHome, showSkill } from './ui-core.js';
import { handleOpenLeague } from './ui-league.js';
import { calculateTeamValue } from './rules.js';

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
    handleOpenLeague(l.id);
    setStatus('Match scheduled.', 'ok');
  } catch(e) { setStatus(e.message, 'error'); }
}

// --- Pre-Match Setup (Chunk 2) ---

export async function handleStartMatch(matchId) {
  setStatus('Loading match setup...');
  try {
    const l = state.currentLeague;
    const matchIdx = l.matches.findIndex(m => m.id === matchId);
    if(matchIdx === -1) throw new Error("Match not found");
    
    // Load Teams
    const m = l.matches[matchIdx];
    const homeTeam = await apiGet(PATHS.team(l.id, m.homeTeamId));
    const awayTeam = await apiGet(PATHS.team(l.id, m.awayTeamId));
    if(!homeTeam || !awayTeam) throw new Error("Could not load team files.");
    
    // Calculate TV
    const homeTv = calculateTeamValue(homeTeam);
    const awayTv = calculateTeamValue(awayTeam);
    
    // Calculate Petty Cash
    let homePetty = 0; 
    let awayPetty = 0;
    if (homeTv < awayTv) homePetty = awayTv - homeTv;
    if (awayTv < homeTv) awayPetty = homeTv - awayTv;
    
    // Init Setup State
    state.setupMatch = {
        matchId: m.id,
        homeTeam, awayTeam,
        homeTv, awayTv,
        pettyCash: { home: homePetty, away: awayPetty },
        inducements: { home: {}, away: {} }
    };
    
    renderPreMatchSetup();
    els.preMatch.el.classList.remove('hidden');
    setStatus('Setup ready.', 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
}

export function closePreMatchModal() {
  els.preMatch.el.classList.add('hidden');
}

function renderPreMatchSetup() {
  const s = state.setupMatch;
  const list = state.gameData?.inducements || [];
  const stars = state.gameData?.starPlayers || [];
  
  // Header Info: Styles injected directly
  els.preMatch.homeName.innerHTML = `<span style="font-size:1.5rem; color:${s.homeTeam.colors.primary}">${s.homeTeam.name}</span><div style="font-size:0.8rem; color:#666">${s.homeTeam.race}</div>`;
  els.preMatch.awayName.innerHTML = `<span style="font-size:1.5rem; color:${s.awayTeam.colors.primary}">${s.awayTeam.name}</span><div style="font-size:0.8rem; color:#666">${s.awayTeam.race}</div>`;
  
  els.preMatch.homeTv.textContent = (s.homeTv/1000) + 'k';
  els.preMatch.awayTv.textContent = (s.awayTv/1000) + 'k';
  
  // Treasury Display
  els.preMatch.homeBank.textContent = (s.homeTeam.treasury || 0)/1000;
  els.preMatch.awayBank.textContent = (s.awayTeam.treasury || 0)/1000;
  els.preMatch.homePetty.textContent = s.pettyCash.home/1000;
  els.preMatch.awayPetty.textContent = s.pettyCash.away/1000;
  
  const hTotal = (s.homeTeam.treasury||0) + s.pettyCash.home;
  const aTotal = (s.awayTeam.treasury||0) + s.pettyCash.away;
  
  els.preMatch.homeTotal.textContent = (hTotal/1000);
  els.preMatch.awayTotal.textContent = (aTotal/1000);

  // Render Shops
  const renderShop = (side, teamRace, totalBudget) => {
      let html = '';
      
      // Generic Inducements
      list.forEach(item => {
          const count = s.inducements[side][item.name] || 0;
          html += `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:2px;">
                <div style="font-size:0.85rem;">
                    <div>${item.name}</div>
                    <div style="color:#666">${item.cost/1000}k</div>
                </div>
                <div style="display:flex; align-items:center; gap:5px;">
                    <button onclick="window.changeInducement('${side}', '${item.name}', -1)" style="padding:0 5px;">-</button>
                    <span style="font-weight:bold; width:20px; text-align:center;">${count}</span>
                    <button onclick="window.changeInducement('${side}', '${item.name}', 1)" style="padding:0 5px;">+</button>
                </div>
            </div>
          `;
      });
      
      // Star Players
      const raceData = state.gameData?.races.find(r => r.name === teamRace);
      const teamTags = raceData ? [teamRace, ...(raceData.specialRules || [])] : [teamRace];
      
      const eligibleStars = stars.filter(star => {
          return star.playsFor.includes("Any") || star.playsFor.some(tag => teamTags.includes(tag));
      });
      
      if(eligibleStars.length > 0) {
          html += `<div style="font-weight:bold; margin-top:10px; border-bottom:2px solid #ccc;">Star Players</div>`;
          eligibleStars.forEach(star => {
              const isHired = s.inducements[side][`Star: ${star.name}`] === 1;
              // Determine reason
              let reason = "";
              if (star.playsFor.includes("Any")) reason = "Any";
              else {
                  const match = star.playsFor.find(t => teamTags.includes(t));
                  if (match) reason = match;
              }

              html += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px; border-bottom:1px solid #eee;">
                    <div style="font-size:0.8rem;">
                        <div>${star.name}</div>
                        <div style="color:#666">${star.cost/1000}k - <span style="font-style:italic; font-size:0.75rem">(${reason})</span></div>
                    </div>
                    <div>
                        ${isHired 
                          ? `<button onclick="window.toggleStar('${side}', '${star.name}', 0)" style="color:red; font-size:0.8rem;">Remove</button>` 
                          : `<button onclick="window.toggleStar('${side}', '${star.name}', 1)" style="color:green; font-size:0.8rem;">Hire</button>`
                        }
                    </div>
                </div>
              `;
          });
      }
      
      return html;
  };
  
  els.preMatch.homeList.innerHTML = renderShop('home', s.homeTeam.race, hTotal);
  els.preMatch.awayList.innerHTML = renderShop('away', s.awayTeam.race, aTotal);
  
  updateInducementTotals();
}

export function changeInducement(side, itemName, delta) {
  const list = state.gameData?.inducements || [];
  const item = list.find(i => i.name === itemName);
  if(!item) return;
  
  const current = state.setupMatch.inducements[side][itemName] || 0;
  const newVal = current + delta;
  
  if (newVal < 0) return;
  if (item.max && newVal > item.max) return;
  
  state.setupMatch.inducements[side][itemName] = newVal;
  renderPreMatchSetup();
}

export function toggleStar(side, starName, val) {
    state.setupMatch.inducements[side][`Star: ${starName}`] = val;
    renderPreMatchSetup();
}

export function setCustomInducement(side, val) {
  // Deprecated in favor of explicit star list, but keeping for custom mercs if needed
  const cost = parseInt(val) || 0;
  state.setupMatch.inducements[side]['Mercenaries'] = cost;
  renderPreMatchSetup();
}

function updateInducementTotals() {
  const s = state.setupMatch;
  const list = state.gameData?.inducements || [];
  const stars = state.gameData?.starPlayers || [];
  
  const calcSpent = (side) => {
      let total = 0;
      for (const [key, count] of Object.entries(s.inducements[side])) {
          if (count === 0) continue;
          
          if (key.startsWith('Star: ')) {
              const name = key.replace('Star: ', '');
              const star = stars.find(x => x.name === name);
              if (star) total += star.cost;
          } else if (key === 'Mercenaries') {
              total += count;
          } else {
              const data = list.find(i => i.name === key);
              if(data) total += (data.cost * count);
          }
      }
      return total;
  };
  
  const hSpent = calcSpent('home');
  const aSpent = calcSpent('away');
  
  els.preMatch.homeSpent.textContent = (hSpent/1000);
  els.preMatch.awaySpent.textContent = (aSpent/1000);
  
  const hBudget = (s.homeTeam.treasury||0) + s.pettyCash.home;
  const aBudget = (s.awayTeam.treasury||0) + s.pettyCash.away;
  
  els.preMatch.homeOver.style.display = (hSpent > hBudget) ? 'inline' : 'none';
  els.preMatch.awayOver.style.display = (aSpent > aBudget) ? 'inline' : 'none';
  
  // Disable start if over budget
  els.preMatch.startBtn.disabled = (hSpent > hBudget || aSpent > aBudget);
}

// --- Start Game (Finalize Setup) ---

export async function confirmMatchStart() {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  
  const s = state.setupMatch;
  const l = state.currentLeague;
  const stars = state.gameData?.starPlayers || [];
  
  setStatus('Starting match...');
  try {
    const initRoster = (players) => (players||[]).map(p => ({
        ...p,
        live: { used: false, injured: false, sentOff: false, td: 0, cas: 0, int: 0 }
    }));
    
    // Inject Star Players into Rosters
    const injectStars = (baseRoster, side) => {
        const newRoster = [...baseRoster];
        for (const [key, count] of Object.entries(s.inducements[side])) {
            if (count > 0 && key.startsWith('Star: ')) {
                const name = key.replace('Star: ', '');
                const starData = stars.find(x => x.name === name);
                if (starData) {
                    newRoster.push({
                        number: 99, // Star Number
                        name: starData.name,
                        position: 'Star Player',
                        ma: starData.ma, st: starData.st, ag: starData.ag, pa: starData.pa, av: starData.av,
                        skills: starData.skills,
                        cost: starData.cost,
                        spp: 0,
                        live: { used: false, injured: false, sentOff: false, td: 0, cas: 0, int: 0 }
                    });
                }
            }
        }
        return newRoster;
    };

    const activeData = {
      matchId: s.matchId, 
      leagueId: l.id, 
      round: l.matches.find(m=>m.id===s.matchId).round, 
      status: 'in_progress',
      home: { 
          id: s.homeTeam.id, 
          name: s.homeTeam.name, 
          colors: s.homeTeam.colors, 
          score: 0, 
          roster: injectStars(initRoster(s.homeTeam.players), 'home'), 
          rerolls: s.homeTeam.rerolls || 0, 
          apothecary: s.homeTeam.apothecary,
          inducements: s.inducements.home,
          tv: s.homeTv 
      },
      away: { 
          id: s.awayTeam.id, 
          name: s.awayTeam.name, 
          colors: s.awayTeam.colors, 
          score: 0, 
          roster: injectStars(initRoster(s.awayTeam.players), 'away'), 
          rerolls: s.awayTeam.rerolls || 0, 
          apothecary: s.awayTeam.apothecary,
          inducements: s.inducements.away,
          tv: s.awayTv
      },
      turn: { home: 0, away: 0 }, 
      log: []
    };
    
    // Save Active Match
    await apiSave(PATHS.activeMatch(s.matchId), activeData, `Start match ${s.matchId}`, key);
    
    // Update League Status
    const m = l.matches.find(x => x.id === s.matchId);
    if(m) m.status = 'in_progress';
    await apiSave(PATHS.leagueSettings(l.id), l, `Match in progress`, key);
    
    closePreMatchModal();
    handleOpenScoreboard(s.matchId);
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
  
  // Render Inducements if any
  let inducementsHtml = '';
  if (team.inducements && Object.keys(team.inducements).length > 0) {
      const items = Object.entries(team.inducements)
        .filter(([k,v]) => v > 0)
        .map(([k,v]) => k.startsWith('Star:') ? '' : k === 'Star Players' ? `Mercs(${v/1000}k)` : `${v}x ${k}`)
        .filter(x => x !== '')
        .join(', ');
      if(items) inducementsHtml = `<div style="font-size:0.8rem; margin-bottom:5px; color:#ddd">Items: ${items}</div>`;
  }

  els.containers.coachRoster.innerHTML = inducementsHtml + renderLiveRoster(team.roster, side, false);
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
