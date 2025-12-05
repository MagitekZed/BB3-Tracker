import { state, els } from './state.js';
import { PATHS } from './config.js';
import { apiGet, apiSave, apiDelete } from './api.js';
import { setStatus, getContrastColor, applyTeamTheme } from './utils.js';
import { showSection, updateBreadcrumbs, setActiveNav, goHome, showSkill, confirmModal } from './ui-core.js';
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

  const renderShop = (side, teamRace) => {
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
              // SAFE NAME: Escape single quotes for HTML attribute
              const safeName = star.name.replace(/'/g, "\\'");
              const isHired = s.inducements[side][`Star: ${star.name}`] === 1;
              
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
                          ? `<button onclick="window.toggleStar('${side}', '${safeName}', 0)" style="color:red; font-size:0.8rem;">Remove</button>` 
                          : `<button onclick="window.toggleStar('${side}', '${safeName}', 1)" style="color:green; font-size:0.8rem;">Hire</button>`
                        }
                    </div>
                </div>
              `;
          });
      }
      
      return html;
  };
  
  els.preMatch.homeList.innerHTML = renderShop('home', s.homeTeam.race);
  els.preMatch.awayList.innerHTML = renderShop('away', s.awayTeam.race);
  
  updateInducementTotals();
}

// Logic: Check budget before adding!
export function changeInducement(side, itemName, delta) {
  const list = state.gameData?.inducements || [];
  const item = list.find(i => i.name === itemName);
  if(!item) return;
  
  const current = state.setupMatch.inducements[side][itemName] || 0;
  const newVal = current + delta;
  
  if (newVal < 0) return;
  if (item.max && newVal > item.max) return;
  
  // Calculate potential cost (Check Budget)
  if (delta > 0) {
      const currentSpent = calculateTotalSpent(side);
      const budget = getBudget(side);
      if (currentSpent + item.cost > budget) {
          // Allow removing, but block adding if over budget
          return setStatus("Not enough gold!", "error");
      }
  }
  
  state.setupMatch.inducements[side][itemName] = newVal;
  renderPreMatchSetup();
}

export function toggleStar(side, starName, val) {
    if (val === 1) { // Hiring
        const stars = state.gameData?.starPlayers || [];
        const star = stars.find(x => x.name === starName);
        if (star) {
            const currentSpent = calculateTotalSpent(side);
            const budget = getBudget(side);
            if (currentSpent + star.cost > budget) {
                return setStatus(`Not enough gold for ${starName}!`, "error");
            }
        }
    }
    state.setupMatch.inducements[side][`Star: ${starName}`] = val;
    renderPreMatchSetup();
}

export function setCustomInducement(side, val) {
  const cost = parseInt(val) || 0;
  state.setupMatch.inducements[side]['Mercenaries'] = cost;
  renderPreMatchSetup();
}

// Helper functions for budget logic
function getBudget(side) {
    const s = state.setupMatch;
    return (s[side + 'Team'].treasury || 0) + s.pettyCash[side];
}

function calculateTotalSpent(side) {
    const s = state.setupMatch;
    const list = state.gameData?.inducements || [];
    const stars = state.gameData?.starPlayers || [];
    
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
}

function updateInducementTotals() {
  const hSpent = calculateTotalSpent('home');
  const aSpent = calculateTotalSpent('away');
  
  els.preMatch.homeSpent.textContent = (hSpent/1000);
  els.preMatch.awaySpent.textContent = (aSpent/1000);
  
  const hBudget = getBudget('home');
  const aBudget = getBudget('away');
  
  els.preMatch.homeOver.style.display = (hSpent > hBudget) ? 'inline' : 'none';
  els.preMatch.awayOver.style.display = (aSpent > aBudget) ? 'inline' : 'none';
  
  // Disable start if over budget
  els.preMatch.startBtn.disabled = (hSpent > hBudget || aSpent > aBudget);
}

// ... (Start Game, Jumbotron, Coach Mode, Player Actions - UNCHANGED) ...
// (Including them for completeness as requested)

// --- Start Game (Finalize Setup) ---

export async function confirmMatchStart() {
  runCoinFlip(state.setupMatch.homeTeam.name, state.setupMatch.awayTeam.name, (winnerSide) => {
      finalizeMatchStart(winnerSide);
  });
}

function runCoinFlip(homeName, awayName, callback) {
    const winnerSide = Math.random() > 0.5 ? 'home' : 'away';
    const winnerName = winnerSide === 'home' ? homeName : awayName;
    const homeInitial = homeName.charAt(0).toUpperCase();
    const awayInitial = awayName.charAt(0).toUpperCase();

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '3000'; 
    modal.innerHTML = `
      <div class="modal-content" style="text-align:center;">
          <h3>Coin Toss</h3>
          <div class="coin-scene">
              <div class="coin" id="coinEl">
                  <div class="coin-face front">${homeInitial}</div>
                  <div class="coin-face back">${awayInitial}</div>
              </div>
          </div>
          <div id="coinResult" style="opacity:0; transition: opacity 1s; font-size:1.2rem; margin-top:1rem;">
              <strong>${winnerName}</strong> wins the toss!
          </div>
          <div class="modal-actions" style="justify-content:center; margin-top:2rem;">
              <button id="coinContinueBtn" class="primary-btn" style="opacity:0; pointer-events:none;">Start Match</button>
          </div>
      </div>
    `;
    document.body.appendChild(modal);

    setTimeout(() => {
        const coin = modal.querySelector('#coinEl');
        const rotation = winnerSide === 'home' ? 1800 : 1980; 
        coin.style.transform = `rotateY(${rotation}deg)`;
        
        setTimeout(() => {
            modal.querySelector('#coinResult').style.opacity = '1';
            const btn = modal.querySelector('#coinContinueBtn');
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            
            btn.onclick = () => {
                modal.remove();
                callback(winnerSide);
            };
        }, 3000);
    }, 100);
}

export async function finalizeMatchStart(activeSide) {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  
  const s = state.setupMatch;
  const l = state.currentLeague;
  const stars = state.gameData?.starPlayers || [];
  
  setStatus('Starting match...');
  try {
    const initRoster = (players) => (players||[]).map(p => ({
        ...p,
        live: { used: false, injured: false, sentOff: false, td: 0, cas: 0, int: 0, comp: 0, foul: 0 }
    }));
    
    const injectStars = (baseRoster, side) => {
        const newRoster = [...baseRoster];
        for (const [key, count] of Object.entries(s.inducements[side])) {
            if (count > 0 && key.startsWith('Star: ')) {
                const name = key.replace('Star: ', '');
                const starData = stars.find(x => x.name === name);
                if (starData) {
                    newRoster.push({
                        number: 99, 
                        name: starData.name,
                        position: 'Star Player',
                        ma: starData.ma, st: starData.st, ag: starData.ag, pa: starData.pa, av: starData.av,
                        skills: starData.skills,
                        cost: starData.cost,
                        spp: 0,
                        live: { used: false, injured: false, sentOff: false, td: 0, cas: 0, int: 0, comp: 0, foul: 0 }
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
      activeTeam: activeSide, 
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
    
    await apiSave(PATHS.activeMatch(s.matchId), activeData, `Start match ${s.matchId}`, key);
    
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
  const activeSide = d.activeTeam || 'home'; 
  
  const getIndicator = (side) => (activeSide === side ? `<span class="turn-indicator">🏈</span>` : '');

  els.containers.sbHomeName.innerHTML = `<div class="big-team-text" style="color:${d.home.colors?.primary}; text-shadow:2px 2px 0 ${d.home.colors?.secondary}, 4px 4px 0px rgba(0,0,0,0.5)">${d.home.name}</div>`;
  els.containers.sbAwayName.innerHTML = `<div class="big-team-text" style="color:${d.away.colors?.primary}; text-shadow:2px 2px 0 ${d.away.colors?.secondary}, 4px 4px 0px rgba(0,0,0,0.5)">${d.away.name}</div>`;
  els.containers.sbHomeScore.textContent = d.home.score;
  els.containers.sbAwayScore.textContent = d.away.score;
  
  const homeTurnEl = document.getElementById('sbHomeTurn');
  const awayTurnEl = document.getElementById('sbAwayTurn');
  if(homeTurnEl) homeTurnEl.innerHTML = `${d.turn.home} ${getIndicator('home')}`;
  if(awayTurnEl) awayTurnEl.innerHTML = `${d.turn.away} ${getIndicator('away')}`;
  
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
  
  const activeSide = d.activeTeam || 'home';
  const turnLabel = (activeSide === side) ? "YOUR TURN" : "OPPONENT'S TURN";
  const turnColor = (activeSide === side) ? "var(--pitch-green)" : "#888";

  els.containers.coachTeamName.innerHTML = `<div class="big-team-text" style="color:${team.colors?.text || '#fff'}; text-shadow:none;">${team.name}</div>`;
  els.containers.coachScore.textContent = `${team.score} - ${oppTeam.score}`;
  els.containers.coachTurn.innerHTML = `Turn: ${d.turn[side]} <span style="background:${turnColor}; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-left:5px; vertical-align:middle;">${turnLabel}</span>`;

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
    // Chunk 3: New Badges
    if(live.td > 0) badges += `<span class="stat-badge">TD:${live.td}</span>`;
    if(live.cas > 0) badges += `<span class="stat-badge">CAS:${live.cas}</span>`;
    if(live.int > 0) badges += `<span class="stat-badge int">INT:${live.int}</span>`;
    if(live.comp > 0) badges += `<span class="stat-badge comp">CMP:${live.comp}</span>`;
    if(live.foul > 0) badges += `<span class="stat-badge foul">FL:${live.foul}</span>`;
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
  
  els.actionSheet.title.textContent = ``; 
  const content = els.actionSheet.el.querySelector('.action-sheet-content');
  
  const headerHtml = `
    <div class="player-card-header">
        <div class="player-card-name">#${p.number} ${p.name}</div>
        <div class="player-card-meta">${p.position} | ${p.cost/1000}k</div>
    </div>
    
    <div class="stat-grid">
        <div class="stat-box"><span class="stat-label">MA</span><span class="stat-value">${p.ma}</span></div>
        <div class="stat-box"><span class="stat-label">ST</span><span class="stat-value">${p.st}</span></div>
        <div class="stat-box"><span class="stat-label">AG</span><span class="stat-value">${p.ag}+</span></div>
        <div class="stat-box"><span class="stat-label">PA</span><span class="stat-value">${p.pa ? p.pa+'+' : '-'}</span></div>
        <div class="stat-box"><span class="stat-label">AV</span><span class="stat-value">${p.av}+</span></div>
    </div>
    
    <div class="card-skills">
        ${(p.skills||[]).map(s => `<span class="skill-tag">${s}</span>`).join('')}
        ${(!p.skills || p.skills.length===0) ? '<span style="color:#999; font-style:italic">No skills</span>' : ''}
    </div>
  `;
  
  const actionsHtml = `
    <div class="sheet-grid">
        <button class="sheet-btn btn-td" onclick="window.handleSheetAction('td')"><div class="emoji">🏈</div>TD</button>
        <button class="sheet-btn btn-cas" onclick="window.handleSheetAction('cas')"><div class="emoji">💥</div>CAS</button>
        <button class="sheet-btn btn-int" onclick="window.handleSheetAction('int')"><div class="emoji">✋</div>INT</button>
        
        <button class="sheet-btn btn-comp" onclick="window.handleSheetAction('comp')"><div class="emoji">🎯</div>COMP</button>
        <button class="sheet-btn btn-foul" onclick="window.handleSheetAction('foul')"><div class="emoji">🥾</div>FOUL</button>
        <button class="sheet-btn btn-inj" onclick="window.handleSheetAction('injured')"><div class="emoji">🤕</div>INJ</button>
        
        <button class="sheet-btn btn-used" onclick="window.handleSheetAction('used')" style="grid-column: 1 / -1; height:60px;">
            <div class="emoji" style="font-size:1.2rem; display:inline;">💤</div> Toggle Used
        </button>
    </div>
    
    <label class="correction-toggle">
        <input type="checkbox" id="correctionMode" onchange="this.parentElement.parentElement.classList.toggle('correction-mode-active', this.checked)">
        Correction Mode (Undo)
    </label>
  `;
  
  const closeHtml = `<button onclick="window.closeActionSheet()" style="position:absolute; top:10px; right:10px; background:none; border:none; font-size:1.5rem; color:#555;">×</button>`;

  content.innerHTML = closeHtml + headerHtml + actionsHtml;
  content.classList.remove('correction-mode-active');
  
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
  
  const correctionEl = document.getElementById('correctionMode');
  const isUndo = correctionEl && correctionEl.checked;
  const multiplier = isUndo ? -1 : 1;
  
  if (type === 'used') {
      p.live.used = !p.live.used; 
  }
  else if (type === 'injured') {
      p.live.injured = !p.live.injured; 
  }
  else if (type === 'td') {
    const newVal = (p.live.td || 0) + multiplier;
    if (newVal >= 0) {
        p.live.td = newVal;
        state.activeMatchData[side].score = Math.max(0, state.activeMatchData[side].score + multiplier);
    }
  }
  else if (type === 'cas') {
      const newVal = (p.live.cas || 0) + multiplier;
      if (newVal >= 0) p.live.cas = newVal;
  }
  else if (type === 'int') {
      const newVal = (p.live.int || 0) + multiplier;
      if (newVal >= 0) p.live.int = newVal;
  }
  else if (type === 'comp') {
      const newVal = (p.live.comp || 0) + multiplier;
      if (newVal >= 0) p.live.comp = newVal;
  }
  else if (type === 'foul') {
      const newVal = (p.live.foul || 0) + multiplier;
      if (newVal >= 0) {
          p.live.foul = newVal;
          if(!isUndo) p.live.used = true; 
      }
  }
  
  closeActionSheet();
  renderCoachView();
  updateLiveMatch(`Update ${p.name} ${type} (Undo:${isUndo})`);
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
  d.activeTeam = (side === 'home') ? 'away' : 'home';
  
  renderCoachView();
  await updateLiveMatch(`End Turn: ${side}`);
  setStatus("Turn ended. Swapping Sides.", "ok");
}

export async function handleCancelGame() {
  const confirmed = await confirmModal("Cancel Game?", "Are you sure you want to cancel this match? It will be reverted to 'Scheduled' status.", "Cancel Game", true);
  if(!confirmed) return;
  
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

// --- POST GAME SEQUENCE (CHUNK 4) ---

export function openPostGameModal() {
    const d = state.activeMatchData;
    state.postGame = {
        step: 1,
        homeWinnings: 0, awayWinnings: 0,
        homeFans: 0, awayFans: 0,
        homeMvp: null, awayMvp: null,
        injuries: []
    };
    
    // Identify injuries
    const getInjuries = (roster, side) => roster.map((p, i) => ({ ...p, originalIdx: i, side })).filter(p => p.live.injured);
    state.postGame.injuries = [...getInjuries(d.home.roster, 'home'), ...getInjuries(d.away.roster, 'away')];
    
    renderPostGameStep();
    els.postGame.el.classList.remove('hidden');
}

export function closePostGameModal() {
    els.postGame.el.classList.add('hidden');
    state.postGame = null;
}

export function renderPostGameStep() {
    const pg = state.postGame;
    const d = state.activeMatchData;
    const body = els.postGame.body;
    
    // Header
    const headerEl = els.postGame.el.querySelector('.modal-header');
    headerEl.innerHTML = `<h3>Post-Game Report</h3><button class="close-btn" onclick="window.closePostGameModal()">×</button>`;
    
    let html = '';

    if (pg.step === 1) { 
        // Helper for Step 1 Panel
        const renderTeamRecord = (side, winningsKey, fansKey) => {
            const team = d[side];
            const winnings = pg[winningsKey];
            
            return `
            <div class="panel-styled" style="box-shadow: 6px 6px 0 ${team.colors.secondary}; border: 1px solid #333; margin-bottom: 1rem;">
                <div style="font-family: 'Russo One', sans-serif; font-size: 1.6rem; color: ${team.colors.primary}; text-transform: uppercase; margin-bottom: 0.5rem; line-height:1;">
                    ${team.name}
                </div>
                <div style="display:grid; grid-template-columns: 1fr auto; gap: 0.5rem; align-items:center; margin-bottom: 0.5rem;">
                    <label style="font-weight:bold; color:#444;">Winnings (k)</label>
                    <input type="number" value="${winnings}" style="width: 80px; padding: 6px; font-weight:bold;" onchange="state.postGame.${winningsKey}=parseInt(this.value)">
                </div>
                <div style="display:grid; grid-template-columns: 1fr auto; gap: 0.5rem; align-items:center;">
                    <label style="font-weight:bold; color:#444;">Fan Factor</label>
                    <select style="width: 100px; padding: 6px;" onchange="state.postGame.${fansKey}=parseInt(this.value)">
                        <option value="0">Same</option>
                        <option value="1">+1</option>
                        <option value="-1">-1</option>
                    </select>
                </div>
            </div>`;
        };

        html = `
          <h4>Step 1: Match Records</h4>
          <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem;">
             ${renderTeamRecord('home', 'homeWinnings', 'homeFans')}
             ${renderTeamRecord('away', 'awayWinnings', 'awayFans')}
          </div>
        `;
    } else if (pg.step === 2) { // MVP
        const renderMvpSelect = (side) => {
            const team = d[side];
            const opts = team.roster.map((p, i) => `<option value="${i}">#${p.number} ${p.name}</option>`).join('');
            const shadow = team.colors.secondary;
            return `
              <div class="panel-styled" style="box-shadow: 4px 4px 0 ${shadow};">
                 <h5 class="big-team-text" style="font-size:1.2rem; color:${team.colors.primary}; text-shadow:1px 1px 0 #fff;">${team.name} MVP</h5>
                 <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <select id="mvpSelect${side}" style="width: 100%; box-sizing: border-box; padding: 8px;" onchange="state.postGame.${side}Mvp=parseInt(this.value)">
                        <option value="">Select MVP...</option>${opts}
                    </select>
                    <button onclick="window.randomMvp('${side}')" style="width: 100%;">Randomize</button>
                 </div>
              </div>`;
        };
        html = `<h4>Step 2: Accolades (MVP)</h4><div class="form-grid">${renderMvpSelect('home')}${renderMvpSelect('away')}</div>`;
    } else if (pg.step === 3) { // Injuries
        if (pg.injuries.length === 0) {
            html = `<h4>Step 3: Casualty Ward</h4><p>No injuries reported. Lucky day!</p>`;
        } else {
            html = `<h4>Step 3: Casualty Ward</h4>`;
            pg.injuries.forEach((p, i) => {
                // Team Badge Logic
                const teamName = d[p.side].name;
                const teamColor = d[p.side].colors.primary;
                const badgeHtml = `<span style="background:${teamColor}; color:#fff; font-size:0.7rem; padding:2px 4px; border-radius:3px; margin-right:5px; vertical-align:middle;">${teamName.substring(0,3).toUpperCase()}</span>`;

                html += `
                  <div class="panel-styled" style="margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;">
                     <div>${badgeHtml} <strong>${p.name}</strong></div>
                     <select onchange="state.postGame.injuries[${i}].outcome=this.value">
                        <option value="bh">Badly Hurt (Recover)</option>
                        <option value="mng">Miss Next Game</option>
                        <option value="-ma">-1 MA</option>
                        <option value="-st">-1 ST</option>
                        <option value="-ag">-1 AG</option>
                        <option value="-pa">-1 PA</option>
                        <option value="-av">-1 AV</option>
                        <option value="dead" style="color:red; font-weight:bold;">DEAD</option>
                     </select>
                  </div>`;
            });
        }
    } else if (pg.step === 4) { // Summary
        html = `<h4>Step 4: Confirm & Save</h4><p>Ready to commit these results to the permanent team records?</p>`;
        html += `<ul><li>Home: +${pg.homeWinnings}k, MVP #${d.home.roster[pg.homeMvp]?.number||'?'}</li>`;
        html += `<li>Away: +${pg.awayWinnings}k, MVP #${d.away.roster[pg.awayMvp]?.number||'?'}</li>`;
        html += `<li>Injuries Processed: ${pg.injuries.length}</li></ul>`;
    }

    body.innerHTML = html;
    
    // Button Logic
    els.postGame.backBtn.style.display = (pg.step === 1) ? 'none' : 'inline-block';
    els.postGame.nextBtn.textContent = (pg.step === 4) ? 'Commit & Finish' : 'Next';
    
    // Clear old listeners to prevent stacking (simple approach)
    const newNext = els.postGame.nextBtn.cloneNode(true);
    const newBack = els.postGame.backBtn.cloneNode(true);
    els.postGame.nextBtn.parentNode.replaceChild(newNext, els.postGame.nextBtn);
    els.postGame.backBtn.parentNode.replaceChild(newBack, els.postGame.backBtn);
    els.postGame.nextBtn = newNext;
    els.postGame.backBtn = newBack;
    
    els.postGame.nextBtn.onclick = () => {
        if (pg.step < 4) { state.postGame.step++; renderPostGameStep(); }
        else { commitPostGame(); }
    };
    els.postGame.backBtn.onclick = () => {
        if (pg.step > 1) { state.postGame.step--; renderPostGameStep(); }
    };
}

export function randomMvp(side) {
    const roster = state.activeMatchData[side].roster;
    const eligible = roster.map((p,i) => i).filter(i => roster[i].position !== 'Star Player'); // Stars can't be MVP
    if(eligible.length === 0) return;
    const winnerIdx = eligible[Math.floor(Math.random() * eligible.length)];
    state.postGame[`${side}Mvp`] = winnerIdx;
    document.getElementById(`mvpSelect${side}`).value = winnerIdx;
}

export async function commitPostGame() {
    const key = els.inputs.editKey.value;
    const pg = state.postGame;
    const d = state.activeMatchData;
    
    setStatus('Committing results...');
    try {
        // Load Fresh Teams
        const homeT = await apiGet(PATHS.team(d.leagueId, d.home.id));
        const awayT = await apiGet(PATHS.team(d.leagueId, d.away.id));
        
        // Helper to update team
        const updateTeam = (team, matchSide, winnings, fans, mvpIdx) => {
            team.treasury = (team.treasury || 0) + (winnings * 1000);
            team.dedicatedFans = Math.max(1, (team.dedicatedFans || 1) + fans);
            
            // Map roster updates
            team.players.forEach((p, i) => {
                // Find matching player in match data (by number)
                const matchP = d[matchSide].roster.find(mp => mp.number === p.number);
                if (!matchP) return; // Maybe a journeyman not in main file?
                
                // SPP
                let sppGain = (matchP.live.td * 3) + (matchP.live.cas * 2) + (matchP.live.int * 2) + (matchP.live.comp * 1);
                if (matchP === d[matchSide].roster[mvpIdx]) sppGain += 4;
                p.spp = (p.spp || 0) + sppGain;
                
                // Injuries
                const injury = pg.injuries.find(inj => inj.side === matchSide && inj.originalIdx === d[matchSide].roster.indexOf(matchP));
                if (injury && injury.outcome) {
                    if (injury.outcome === 'dead') {
                        p.dead = true; // Mark for deletion or filter
                        // For now, let's rename to DEAD to keep record? Or just delete? Prompt said "remove".
                        // Splice is tricky inside forEach. Let's mark and filter later.
                    } else if (injury.outcome === 'mng') {
                        p.mng = true;
                    } else if (injury.outcome.startsWith('-')) {
                        const stat = injury.outcome.substring(1); // 'ma', 'st'
                        p[stat] = (p[stat] || 0) - 1;
                        p.injuries = (p.injuries || []) + injury.outcome + ',';
                    }
                }
            });
            // Filter dead
            team.players = team.players.filter(p => !p.dead);
        };
        
        updateTeam(homeT, 'home', pg.homeWinnings, pg.homeFans, pg.homeMvp);
        updateTeam(awayT, 'away', pg.awayWinnings, pg.awayFans, pg.awayMvp);
        
        // Save Teams
        await apiSave(PATHS.team(d.leagueId, homeT.id), homeT, `Post-game ${d.matchId} Home`, key);
        await apiSave(PATHS.team(d.leagueId, awayT.id), awayT, `Post-game ${d.matchId} Away`, key);
        
        // Update League
        const league = await apiGet(PATHS.leagueSettings(d.leagueId));
        const m = league.matches.find(x => x.id === d.matchId);
        if(m) {
            m.status = 'completed';
            m.score = { home: d.home.score, away: d.away.score };
            m.casualties = { 
                homeInflicted: d.home.roster.reduce((sum, p) => sum + (p.live?.cas||0), 0),
                awayInflicted: d.away.roster.reduce((sum, p) => sum + (p.live?.cas||0), 0)
            };
        }
        await apiSave(PATHS.leagueSettings(d.leagueId), league, `Complete match ${d.matchId}`, key);
        
        // Delete Match
        await apiDelete(PATHS.activeMatch(d.matchId), `Cleanup ${d.matchId}`, key);
        
        // Reset and Go Home
        els.postGame.el.classList.add('hidden');
        handleOpenLeague(d.leagueId);
        setStatus('Match finalized successfully!', 'ok');
        
    } catch(e) { setStatus(e.message, 'error'); }
}

export async function handleEndGame() {
  const confirmed = await confirmModal("End Game?", "Proceed to Post-Game Sequence? (MVP, Winnings, etc.)", "Proceed", false);
  if(!confirmed) return;
  openPostGameModal(); // CHUNK 4 ENTRY POINT
}
