import { state, els } from './state.js';
import { PATHS } from './config.js';
import { apiGet, apiSave, apiDelete } from './api.js';
import { setStatus, getContrastColor, applyTeamTheme, ulid } from './utils.js';
import { showSection, updateBreadcrumbs, setActiveNav, goHome, showSkill, confirmModal, showInfoModal, scrollModalBodyTop } from './ui-core.js';
import { handleOpenLeague } from './ui-league.js';
import { calculateTeamValue, calculateCurrentTeamValue, isPlayerAvailableForMatch, computeBb2025WinningsGp, computeBb2025DedicatedFansDelta, computeBb2025SppGain, getBb2025AdvancementCost, applyBb2025SkillAdvancement, applyBb2025CharacteristicIncrease, getBb2025ValueIncreaseGp, getAdvancementCount } from './rules.js';
import { randomIntInclusive, rollDie } from './rng.js';

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
  
  const season = Number(l.season || 1);
  const seasonMatches = (l.matches || []).filter(m => (m.season ?? 1) === season);
  let nextRound = 1;
  if (seasonMatches.length > 0) {
    const maxR = Math.max(...seasonMatches.map(m => Number(m.round) || 0));
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
    const matchId = ulid();
    const newMatch = { id: matchId, season: l.season, round: round, homeTeamId: homeId, awayTeamId: awayId, status: 'scheduled', date: new Date().toISOString().split('T')[0] };
    l.matches = l.matches || [];
    l.matches.push(newMatch);
    await apiSave(PATHS.league(l.id), l, `Schedule match`, key);
    closeScheduleModal(); 
    handleOpenLeague(l.id);
    setStatus('Match scheduled.', 'ok');
  } catch(e) { setStatus(e.message, 'error'); }
}

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomIntInclusive(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildRoundRobinRounds(teamIds, { shuffle = false } = {}) {
  const original = Array.isArray(teamIds) ? teamIds.filter(Boolean) : [];
  let teams = shuffle ? shuffleArray(original) : [...original];
  if (teams.length < 2) return [];

  if (teams.length % 2 === 1) teams = [...teams, null];

  const n = teams.length;
  const rounds = [];
  let arr = [...teams];

  for (let r = 0; r < n - 1; r += 1) {
    const pairs = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (!a || !b) continue;
      const swap = (r % 2 === 1);
      pairs.push(swap ? [b, a] : [a, b]);
    }
    rounds.push(pairs);

    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr = [fixed, ...rest];
  }

  return rounds;
}

function pairKey(a, b) {
  return [String(a), String(b)].sort().join('|');
}

export async function openGenerateScheduleModal() {
  const l = state.currentLeague;
  if (!l) return;

  const season = Number(l.season || 1);
  const seasonMatches = (l.matches || []).filter(m => (m.season ?? 1) === season);
  const completed = seasonMatches.filter(m => m.status === 'completed').length;
  const live = seasonMatches.filter(m => m.status === 'in_progress').length;
  const scheduled = seasonMatches.filter(m => m.status === 'scheduled').length;

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.style.zIndex = '12000';

  const existingSummary = seasonMatches.length
    ? `<div class="small" style="color:#666; margin-top:0.35rem;">Existing Season ${season} matches: ${seasonMatches.length} total (${completed} completed, ${live} live, ${scheduled} scheduled).</div>`
    : `<div class="small" style="color:#666; margin-top:0.35rem;">No existing matches for Season ${season}.</div>`;

  const modeControls = seasonMatches.length
    ? `
      <div class="panel-styled" style="margin-top:0.75rem;">
        <div style="font-weight:800; margin-bottom:0.35rem;">If matches already exist</div>
        <label style="display:flex; gap:0.5rem; align-items:flex-start; margin-bottom:0.35rem;">
          <input type="radio" name="genSchedMode" value="append" checked>
          <span><strong>Append</strong> missing matchups (keeps all existing fixtures).</span>
        </label>
        <label style="display:flex; gap:0.5rem; align-items:flex-start;">
          <input type="radio" name="genSchedMode" value="overwrite">
          <span><strong>Overwrite scheduled</strong> matches only (keeps completed &amp; live matches).</span>
        </label>
      </div>
    `
    : `<input type="hidden" name="genSchedMode" value="append">`;

  modal.innerHTML = `
    <div class="modal-content" style="max-width:650px; width:95%;">
      <div class="modal-header">
        <h3>Generate Schedule</h3>
        <button class="close-btn" type="button">x</button>
      </div>

      <div class="small" style="color:#444;">Season ${season} &mdash; generate a round-robin schedule for all teams.</div>
      ${existingSummary}

      <div class="form-grid" style="margin-top:1rem;">
        <div class="form-field">
          <label>Games per opponent</label>
          <input id="genSchedGamesPerOpp" type="number" min="1" step="1" value="1">
        </div>
        <div class="form-field">
          <label>Shuffle order</label>
          <label style="display:flex; gap:0.5rem; align-items:center; margin-top:0.25rem;">
            <input id="genSchedShuffle" type="checkbox">
            <span class="small" style="color:#666;">Randomize the round-robin order</span>
          </label>
        </div>
      </div>

      ${modeControls}

      <div class="modal-actions" style="margin-top:1.25rem;">
        <button id="genSchedCancelBtn" class="secondary-btn">Cancel</button>
        <button id="genSchedGoBtn" class="primary-btn">Generate</button>
      </div>
    </div>
  `;

  const close = () => modal.remove();
  modal.querySelector('.close-btn').onclick = close;
  modal.querySelector('#genSchedCancelBtn').onclick = close;

  modal.querySelector('#genSchedGoBtn').onclick = async () => {
    const key = els.inputs.editKey.value;
    if (!key) return setStatus('Edit key required', 'error');

    const gamesPerOpponent = Math.max(1, parseInt(modal.querySelector('#genSchedGamesPerOpp')?.value, 10) || 1);
    const doShuffle = !!modal.querySelector('#genSchedShuffle')?.checked;
    const mode = modal.querySelector('input[name="genSchedMode"]:checked')?.value || 'append';

    const teamIds = (l.teams || []).map(t => t.id).filter(Boolean);
    if (teamIds.length < 2) {
      setStatus('Need at least 2 teams to generate a schedule.', 'error');
      return;
    }

    const originalMatches = JSON.parse(JSON.stringify(Array.isArray(l.matches) ? l.matches : []));
    const seasonMatchesAll = originalMatches.filter(m => (m.season ?? 1) === season);

    let workingMatches = originalMatches;
    const keptSeasonMatches = mode === 'overwrite'
      ? seasonMatchesAll.filter(m => m.status === 'completed' || m.status === 'in_progress')
      : seasonMatchesAll;

    if (mode === 'overwrite') {
      workingMatches = originalMatches.filter(m => (m.season ?? 1) !== season || m.status === 'completed' || m.status === 'in_progress');
    }

    const maxRound = keptSeasonMatches.length
      ? Math.max(...keptSeasonMatches.map(m => Number(m.round) || 0))
      : 0;
    let nextRound = maxRound + 1;

    // Initialize per-pair remaining counts.
    const remaining = new Map();
    for (let i = 0; i < teamIds.length; i += 1) {
      for (let j = i + 1; j < teamIds.length; j += 1) {
        remaining.set(pairKey(teamIds[i], teamIds[j]), gamesPerOpponent);
      }
    }

    const countExisting = (matches) => {
      for (const m of matches) {
        if (!m?.homeTeamId || !m?.awayTeamId) continue;
        if ((m.season ?? 1) !== season) continue;
        if (m.status === 'cancelled') continue;
        const key2 = pairKey(m.homeTeamId, m.awayTeamId);
        if (!remaining.has(key2)) continue;
        remaining.set(key2, Math.max(0, (remaining.get(key2) || 0) - 1));
      }
    };

    // In append mode, scheduled matches count towards the target. In overwrite mode, only kept matches do.
    countExisting(mode === 'overwrite' ? keptSeasonMatches : seasonMatchesAll);

    const baseRounds = buildRoundRobinRounds(teamIds, { shuffle: doShuffle });

    let addedCount = 0;
    for (let leg = 0; leg < gamesPerOpponent; leg += 1) {
      for (const roundPairs of baseRounds) {
        const matchesToAdd = [];
        for (const [h0, a0] of roundPairs) {
          const key2 = pairKey(h0, a0);
          const need = remaining.get(key2) || 0;
          if (need <= 0) continue;

          const home = (leg % 2 === 1) ? a0 : h0;
          const away = (leg % 2 === 1) ? h0 : a0;

          matchesToAdd.push({ homeTeamId: home, awayTeamId: away });
          remaining.set(key2, need - 1);
        }

        if (!matchesToAdd.length) continue;

        for (const x of matchesToAdd) {
          workingMatches.push({
            id: ulid(),
            season,
            round: nextRound,
            homeTeamId: x.homeTeamId,
            awayTeamId: x.awayTeamId,
            status: 'scheduled',
            date: new Date().toISOString().split('T')[0]
          });
          addedCount += 1;
        }

        nextRound += 1;
      }
    }

    const remainingPairs = [...remaining.values()].reduce((sum, v) => sum + (v > 0 ? 1 : 0), 0);
    if (remainingPairs > 0) {
      const ok = await confirmModal(
        'Some matchups could not be fully scheduled',
        `Generated ${addedCount} matches, but ${remainingPairs} matchups still need more games. Keep what was generated?`,
        'Keep',
        true
      );
      if (!ok) return;
    }

    try {
      l.matches = workingMatches;
      await apiSave(PATHS.league(l.id), l, `Generate schedule (Season ${season})`, key);
      close();
      handleOpenLeague(l.id);
      setStatus(`Schedule generated: ${addedCount} matches added.`, 'ok');
    } catch (e) {
      l.matches = originalMatches;
      setStatus(e.message, 'error');
    }
  };

  document.body.appendChild(modal);
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
    
    const homeTv = calculateTeamValue(homeTeam);
    const awayTv = calculateTeamValue(awayTeam);

    const getAvailableCount = (t) => (t.players || []).filter(isPlayerAvailableForMatch).length;
    const homeAvail = getAvailableCount(homeTeam);
    const awayAvail = getAvailableCount(awayTeam);
    const homeJourneysNeeded = Math.max(0, 11 - homeAvail);
    const awayJourneysNeeded = Math.max(0, 11 - awayAvail);

    const getJourneymanOptions = (teamRace) => {
      const raceData = state.gameData?.races?.find(r => r.name === teamRace);
      const candidates = (raceData?.positionals || [])
        .filter(p => (p.qtyMin === 0) && (p.qtyMax >= 12))
        .map(p => ({ name: p.name, cost: p.cost, ma: p.ma, st: p.st, ag: p.ag, pa: p.pa, av: p.av, skills: p.skills || [], primary: p.primary, secondary: p.secondary }));
      if (candidates.length) return candidates;
      return [{ name: 'Lineman (Journeyman)', cost: 50000, ma: 6, st: 3, ag: 3, pa: 4, av: 8, skills: [] }];
    };

    const homeJourneymanOptions = getJourneymanOptions(homeTeam.race);
    const awayJourneymanOptions = getJourneymanOptions(awayTeam.race);
    
    // Init Setup State
    state.setupMatch = {
        matchId: m.id,
        leagueId: l.id,
        round: m.round,
        homeTeam, awayTeam,
        tv: { home: homeTv, away: awayTv },
        available: { home: homeAvail, away: awayAvail },
        journeymen: {
          home: { needed: homeJourneysNeeded, type: homeJourneymanOptions[0]?.name || 'Lineman (Journeyman)', options: homeJourneymanOptions },
          away: { needed: awayJourneysNeeded, type: awayJourneymanOptions[0]?.name || 'Lineman (Journeyman)', options: awayJourneymanOptions }
        },
        ctv: { home: 0, away: 0 },
        higherSide: 'tie',
        pettyCash: { home: 0, away: 0 },
        treasurySpent: { home: 0, away: 0 },
        spendCap: { home: 0, away: 0 },
        inducements: { home: {}, away: {} },
        wizard: { step: 0, lock: null }
    };
    
    renderPreMatchSetup();
    els.preMatch.el.classList.remove('hidden');
    setStatus('Setup ready.', 'ok');
  } catch (e) { console.error(e); setStatus(e.message, 'error'); }
}

export function closePreMatchModal() {
  els.preMatch.el.classList.add('hidden');
}

export function handlePreMatchBack() {
  const s = state.setupMatch;
  if (!s?.wizard) return;
  if (s.wizard.step !== 1) return;
  s.wizard.step = 0;
  s.wizard.lock = null;
  renderPreMatchSetup();
  scrollModalBodyTop(els.preMatch.el);
}

export async function handlePreMatchPrimary() {
  const s = state.setupMatch;
  if (!s) return;
  s.wizard = s.wizard || { step: 0, lock: null };

  if (s.wizard.step === 0) {
    renderPreMatchSetup();
    if (s.higherSide === 'tie') {
      s.wizard.lock = { highSide: 'tie', lowSide: 'away', highTreasurySpent: 0 };
    } else {
      const highSide = s.higherSide;
      const lowSide = highSide === 'home' ? 'away' : 'home';
      const highTreasurySpent = s.treasurySpent?.[highSide] || 0;
      s.wizard.lock = { highSide, lowSide, highTreasurySpent };
    }
    s.wizard.step = 1;
    renderPreMatchSetup();
    scrollModalBodyTop(els.preMatch.el);
    return;
  }

  await confirmMatchStart();
}

function renderPreMatchSetup() {
  const s = state.setupMatch;
  const listAll = state.gameData?.inducements || [];
  const list = listAll.filter(i => i?.purchaseEnabled !== false);
  const stars = state.gameData?.starPlayers || [];
  s.wizard = s.wizard || { step: 0, lock: null };
  const w = s.wizard;

  const getPlaysFor = (star) => {
    const raw = star?.playsFor;
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === 'string') {
      return raw
        .split(/\r?\n|,\s*/)
        .map(x => x.trim())
        .filter(Boolean);
    }
    return [];
  };

  const getRaceData = (teamRace) => state.gameData?.races?.find(r => r.name === teamRace);
  const getTeamTags = (teamRace) => {
    const raceData = getRaceData(teamRace);
    const sr = Array.isArray(raceData?.specialRules) ? raceData.specialRules : (raceData?.specialRules ? [raceData.specialRules] : []);
    return raceData ? [teamRace, ...sr] : [teamRace];
  };
  const getJourneymanTemplate = (side) => {
    const typeName = s.journeymen?.[side]?.type;
    const options = s.journeymen?.[side]?.options || [];
    return options.find(o => o.name === typeName) || options[0] || { name: 'Lineman (Journeyman)', cost: 50000, ma: 6, st: 3, ag: 3, pa: 4, av: 8, skills: [] };
  };
  const computeCtvWithJourneymen = (team, side) => {
    const base = calculateCurrentTeamValue(team);
    const needed = s.journeymen?.[side]?.needed || 0;
    const jm = getJourneymanTemplate(side);
    return base + (needed * (jm.cost || 0));
  };

  s.ctv.home = computeCtvWithJourneymen(s.homeTeam, 'home');
  s.ctv.away = computeCtvWithJourneymen(s.awayTeam, 'away');
  if (s.ctv.home > s.ctv.away) s.higherSide = 'home';
  else if (s.ctv.away > s.ctv.home) s.higherSide = 'away';
  else s.higherSide = 'tie';
  
  // Header Info
  const headerHTML = `
     <div style="display:flex; justify-content:space-between; align-items:center; text-align:center;">
        <div style="flex:1; min-width:0;">
           <h4 style="margin:0; color:${s.homeTeam.colors.primary}; font-size:1.4rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.homeTeam.name}</h4>
           <div style="font-size:0.8rem; color:#666">${s.homeTeam.race}</div>
           <div style="font-weight:bold; font-size:1.1rem">CTV ${(s.ctv.home/1000)}k</div>
        </div>
        <div style="font-weight:bold; color:#666; padding:0 10px;">VS</div>
        <div style="flex:1; min-width:0;">
           <h4 style="margin:0; color:${s.awayTeam.colors.primary}; font-size:1.4rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.awayTeam.name}</h4>
           <div style="font-size:0.8rem; color:#666">${s.awayTeam.race}</div>
           <div style="font-weight:bold; font-size:1.1rem">CTV ${(s.ctv.away/1000)}k</div>
        </div>
     </div>
  `;
  
  const cardEl = els.preMatch.el.querySelector('.card');
  cardEl.innerHTML = headerHTML;

  const getInducementMax = (side, itemName) => {
    const item = list.find(i => i.name === itemName);
    if (!item) return null;
    const raceData = getRaceData(s[side + 'Team'].race);
    const sr = Array.isArray(raceData?.specialRules) ? raceData.specialRules : [];
    if (itemName === 'Bribes' && sr.includes('Bribery and Corruption')) return 6;
    return item.max ?? null;
  };

  const getInducementUnitCost = (side, itemName) => {
    const item = list.find(i => i.name === itemName);
    if (!item) return 0;
    const raceData = getRaceData(s[side + 'Team'].race);
    const sr = Array.isArray(raceData?.specialRules) ? raceData.specialRules : [];
    if (itemName === 'Bribes' && sr.includes('Bribery and Corruption')) return 50000;
    return item.cost || 0;
  };

  const calculateTotalSpent = (side) => {
    const starsAll = state.gameData?.starPlayers || [];
    let total = 0;
    for (const [key, count] of Object.entries(s.inducements[side])) {
      if (!count) continue;
      if (key.startsWith('Star: ')) {
        const name = key.replace('Star: ', '');
        const star = starsAll.find(x => x.name === name);
        if (star) total += star.cost;
      } else if (key === 'Mercenaries') total += count;
      else total += getInducementUnitCost(side, key) * count;
    }
    return total;
  };

  const computeBudgets = () => {
    const hSpent = calculateTotalSpent('home');
    const aSpent = calculateTotalSpent('away');

    let highSide = s.higherSide;
    if (w.step === 1 && w.lock?.highSide) highSide = w.lock.highSide;
    let lowSide = (highSide === 'home') ? 'away' : (highSide === 'away' ? 'home' : null);

    const homeTreasury = s.homeTeam.treasury || 0;
    const awayTreasury = s.awayTeam.treasury || 0;

    if (highSide === 'tie') {
      s.pettyCash.home = 0;
      s.pettyCash.away = 0;
      s.treasurySpent.home = 0;
      s.treasurySpent.away = 0;
      s.spendCap.home = 0;
      s.spendCap.away = 0;
      return { homeSpent: hSpent, awaySpent: aSpent };
    }

    const highTreasury = (highSide === 'home') ? homeTreasury : awayTreasury;
    const highSpent = (highSide === 'home') ? hSpent : aSpent;
    const highTreasurySpentLive = Math.min(highSpent, highTreasury);
    const highTreasurySpent = (w.step === 1 && w.lock && w.lock.highSide === highSide) ? (w.lock.highTreasurySpent || 0) : highTreasurySpentLive;

    const ctvDiff = Math.abs(s.ctv.home - s.ctv.away);
    const lowPetty = ctvDiff + highTreasurySpent;

    s.pettyCash[highSide] = 0;
    s.pettyCash[lowSide] = lowPetty;

    s.spendCap[highSide] = highTreasury;
    const lowTeamTreasury = (lowSide === 'home') ? homeTreasury : awayTreasury;
    const lowTopUpMax = Math.min(50000, lowTeamTreasury);
    s.spendCap[lowSide] = lowPetty + lowTopUpMax;

    s.treasurySpent[highSide] = highTreasurySpent;

    const lowSpent = (lowSide === 'home') ? hSpent : aSpent;
    const lowTreasurySpent = Math.max(0, Math.min(lowTopUpMax, lowSpent - lowPetty));
    s.treasurySpent[lowSide] = lowTreasurySpent;

    return { homeSpent: hSpent, awaySpent: aSpent };
  };

  const { homeSpent, awaySpent } = computeBudgets();

  const effectiveHighSide = (w.step === 1 && w.lock?.highSide) ? w.lock.highSide : s.higherSide;
  const homeTreasury = s.homeTeam.treasury || 0;
  const awayTreasury = s.awayTeam.treasury || 0;
  const homeTopUpMax = Math.min(50000, homeTreasury);
  const awayTopUpMax = Math.min(50000, awayTreasury);
  const homeBank = (effectiveHighSide === 'home') ? homeTreasury : (effectiveHighSide === 'tie' ? 0 : homeTopUpMax);
  const awayBank = (effectiveHighSide === 'away') ? awayTreasury : (effectiveHighSide === 'tie' ? 0 : awayTopUpMax);

  els.preMatch.homeBank.textContent = (homeBank/1000);
  els.preMatch.awayBank.textContent = (awayBank/1000);
  els.preMatch.homePetty.textContent = (s.pettyCash.home/1000);
  els.preMatch.awayPetty.textContent = (s.pettyCash.away/1000);
  els.preMatch.homeTotal.textContent = (s.spendCap.home/1000);
  els.preMatch.awayTotal.textContent = (s.spendCap.away/1000);

  if (els.preMatch.homeCtv) els.preMatch.homeCtv.textContent = (s.ctv.home/1000);
  if (els.preMatch.awayCtv) els.preMatch.awayCtv.textContent = (s.ctv.away/1000);
  if (els.preMatch.homeAvail) els.preMatch.homeAvail.textContent = s.available.home;
  if (els.preMatch.awayAvail) els.preMatch.awayAvail.textContent = s.available.away;
  if (els.preMatch.homeJourneys) els.preMatch.homeJourneys.textContent = s.journeymen.home.needed;
  if (els.preMatch.awayJourneys) els.preMatch.awayJourneys.textContent = s.journeymen.away.needed;

  if (els.preMatch.homeBudgetTitle) els.preMatch.homeBudgetTitle.textContent = `${s.homeTeam.name} Budget`;
  if (els.preMatch.awayBudgetTitle) els.preMatch.awayBudgetTitle.textContent = `${s.awayTeam.name} Budget`;

  if (els.preMatch.homeBankNote) {
    els.preMatch.homeBankNote.textContent = (effectiveHighSide === 'tie' || effectiveHighSide === 'home') ? '' : `Top-up max ${homeTopUpMax/1000}k (Treasury ${homeTreasury/1000}k)`;
  }
  if (els.preMatch.awayBankNote) {
    els.preMatch.awayBankNote.textContent = (effectiveHighSide === 'tie' || effectiveHighSide === 'away') ? '' : `Top-up max ${awayTopUpMax/1000}k (Treasury ${awayTreasury/1000}k)`;
  }

  const activeSide = (() => {
    if (w.step === 0) return s.higherSide === 'away' ? 'away' : 'home';
    if (w.lock?.lowSide) return w.lock.lowSide;
    if (effectiveHighSide === 'home') return 'away';
    if (effectiveHighSide === 'away') return 'home';
    return 'away';
  })();

  if (els.preMatch.homePanel) els.preMatch.homePanel.classList.toggle('hidden', activeSide !== 'home');
  if (els.preMatch.awayPanel) els.preMatch.awayPanel.classList.toggle('hidden', activeSide !== 'away');

  if (els.preMatch.backBtn) els.preMatch.backBtn.style.display = (w.step === 1) ? '' : 'none';
  if (els.preMatch.startBtn) {
    const otherName = activeSide === 'home' ? s.awayTeam.name : s.homeTeam.name;
    els.preMatch.startBtn.textContent = (w.step === 0) ? `Next: ${otherName}` : 'Confirm & Coin Toss';
  }
  if (els.preMatch.stepLabel) {
    if (w.step === 0) {
      const teamName = activeSide === 'home' ? s.homeTeam.name : s.awayTeam.name;
      els.preMatch.stepLabel.textContent = `Step 1/2: ${teamName} chooses inducements (locks opponent budget).`;
    } else {
      const teamName = activeSide === 'home' ? s.homeTeam.name : s.awayTeam.name;
      els.preMatch.stepLabel.textContent = `Step 2/2: ${teamName} chooses inducements (Back to edit opponent).`;
    }
  }

  const renderShop = (side, teamRace) => {
      const isHigh = (effectiveHighSide === side);
      const isTie = (effectiveHighSide === 'tie');
      const needed = s.journeymen?.[side]?.needed || 0;
      const opts = s.journeymen?.[side]?.options || [];
      const selected = s.journeymen?.[side]?.type;

      let html = '';
      html += `<div style="font-weight:bold; margin-bottom:6px; color:#444;">${isTie ? 'CTV TIED (No inducements by default)' : (isHigh ? 'Higher CTV (spends Treasury first)' : 'Lower CTV (Petty Cash after opponent spend)')}</div>`;

      if (needed > 0) {
        html += `<div class="small" style="margin-bottom:6px; color:#444;">Journeymen needed: <strong>${needed}</strong> (choose type)</div>`;
        html += `<select style="width:100%; margin-bottom:8px;" onchange="window.setJourneymanType('${side}', this.value)">`;
        html += opts.map(o => `<option value="${o.name}" ${o.name === selected ? 'selected' : ''}>${o.name} (${(o.cost/1000)}k)</option>`).join('');
        html += `</select>`;
      }

      list.forEach(item => {
          const count = s.inducements[side][item.name] || 0;
          const unitCost = getInducementUnitCost(side, item.name);
          const max = getInducementMax(side, item.name);
          const maxLabel = (max != null) ? ` • max ${max}` : '';
          const safeItemName = item.name.replace(/'/g, "\\'");
          html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:2px;"><div style="font-size:0.85rem; min-width:0;"><div><span onclick="window.showInducementInfo('${safeItemName}')" style="cursor:pointer; text-decoration:underline;">${item.name}</span></div><div style="color:#666">${unitCost/1000}k${maxLabel}</div></div><div style="display:flex; align-items:center; gap:5px;"><button onclick="window.changeInducement('${side}', '${safeItemName}', -1)" style="padding:0 5px;">-</button><span style="font-weight:bold; width:20px; text-align:center;">${count}</span><button onclick="window.changeInducement('${side}', '${safeItemName}', 1)" style="padding:0 5px;">+</button></div></div>`;
      });
      const teamTags = getTeamTags(teamRace);
      const eligibleStars = stars.filter(star => {
        const playsFor = getPlaysFor(star);
        const isAny = playsFor.some(p => p.toLowerCase().startsWith('any'));
        return isAny || playsFor.some(tag => teamTags.includes(tag));
      });
      if(eligibleStars.length > 0) {
          html += `<div style="font-weight:bold; margin-top:10px; border-bottom:2px solid #ccc;">Star Players</div>`;
          eligibleStars.forEach(star => {
              const safeName = star.name.replace(/'/g, "\\'");
              const isHired = s.inducements[side][`Star: ${star.name}`] === 1;
              const playsFor = getPlaysFor(star);
              const isAny = playsFor.some(p => p.toLowerCase().startsWith('any'));
              let reason = isAny ? (playsFor.find(p => p.toLowerCase().startsWith('any')) || 'Any') : (playsFor.find(t => teamTags.includes(t)) || "");
              html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px; border-bottom:1px solid #eee;"><div style="font-size:0.8rem; min-width:0;"><div><span onclick="window.showStarInfo('${safeName}')" style="cursor:pointer; text-decoration:underline;">${star.name}</span></div><div style="color:#666">${star.cost/1000}k - <span style="font-style:italic; font-size:0.75rem">(${reason})</span></div></div><div>${isHired ? `<button onclick="window.toggleStar('${side}', '${safeName}', 0)" style="color:red; font-size:0.8rem;">Remove</button>` : `<button onclick="window.toggleStar('${side}', '${safeName}', 1)" style="color:green; font-size:0.8rem;">Hire</button>`}</div></div>`;
          });
      }
      return html;
  };
  
  els.preMatch.homeList.innerHTML = renderShop('home', s.homeTeam.race);
  els.preMatch.awayList.innerHTML = renderShop('away', s.awayTeam.race);

  // Totals UI
  els.preMatch.homeSpent.textContent = (homeSpent/1000);
  els.preMatch.awaySpent.textContent = (awaySpent/1000);
  els.preMatch.homeOver.style.display = (homeSpent > s.spendCap.home) ? 'inline' : 'none';
  els.preMatch.awayOver.style.display = (awaySpent > s.spendCap.away) ? 'inline' : 'none';

  const renderSpendSummary = (side) => {
    const parts = [];
    const starsAll = state.gameData?.starPlayers || [];
    for (const [key, count] of Object.entries(s.inducements?.[side] || {})) {
      if (!count) continue;
      if (key.startsWith('Star: ')) {
        const name = key.replace('Star: ', '');
        const star = starsAll.find(x => x.name === name);
        if (star) parts.push(`${name} (${star.cost/1000}k)`);
        else parts.push(name);
        continue;
      }
      if (key === 'Mercenaries') {
        parts.push(`Mercenaries (${Math.round(count/1000)}k)`);
        continue;
      }
      const unit = getInducementUnitCost(side, key);
      const total = unit * count;
      parts.push(`${key}${count > 1 ? ` x${count}` : ''} (${total/1000}k)`);
    }
    return parts.join(' | ');
  };

  const updateSpendSplit = (side, spent) => {
    const petty = s.pettyCash?.[side] || 0;
    const treasuryCap = (effectiveHighSide === 'tie') ? 0 : ((side === effectiveHighSide) ? ((side === 'home') ? homeTreasury : awayTreasury) : Math.min(50000, (side === 'home') ? homeTreasury : awayTreasury));
    const pettyUsed = Math.min(spent, petty);
    const treasuryUsed = Math.min(treasuryCap, Math.max(0, spent - pettyUsed));

    if (side === 'home') {
      if (els.preMatch.homeSpentTreasury) els.preMatch.homeSpentTreasury.textContent = (treasuryUsed/1000);
      if (els.preMatch.homeSpentPetty) els.preMatch.homeSpentPetty.textContent = (pettyUsed/1000);
      if (els.preMatch.homeSpendSummary) els.preMatch.homeSpendSummary.textContent = renderSpendSummary('home');
    } else {
      if (els.preMatch.awaySpentTreasury) els.preMatch.awaySpentTreasury.textContent = (treasuryUsed/1000);
      if (els.preMatch.awaySpentPetty) els.preMatch.awaySpentPetty.textContent = (pettyUsed/1000);
      if (els.preMatch.awaySpendSummary) els.preMatch.awaySpendSummary.textContent = renderSpendSummary('away');
    }
  };

  updateSpendSplit('home', homeSpent);
  updateSpendSplit('away', awaySpent);
}

export function changeInducement(side, itemName, delta) {
  const list = state.gameData?.inducements || [];
  const item = list.find(i => i.name === itemName);
  if(!item) return;
  const current = state.setupMatch.inducements[side][itemName] || 0;
  const newVal = current + delta;
  if (newVal < 0) return;
  const raceData = state.gameData?.races?.find(r => r.name === state.setupMatch[side + 'Team'].race);
  const sr = Array.isArray(raceData?.specialRules) ? raceData.specialRules : [];
  const max = (itemName === 'Bribes' && sr.includes('Bribery and Corruption')) ? 6 : (item.max ?? null);
  if (max != null && newVal > max) return;
  state.setupMatch.inducements[side][itemName] = newVal;
  renderPreMatchSetup();
}

export function toggleStar(side, starName, val) {
    state.setupMatch.inducements[side][`Star: ${starName}`] = val;
    renderPreMatchSetup();
}

export function setCustomInducement(side, val) {
  const cost = parseInt(val) || 0;
  state.setupMatch.inducements[side]['Mercenaries'] = cost;
  renderPreMatchSetup();
}

export function setJourneymanType(side, typeName) {
  if (!state.setupMatch?.journeymen?.[side]) return;
  state.setupMatch.journeymen[side].type = typeName;
  renderPreMatchSetup();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function showInducementInfo(itemName) {
  const item = (state.gameData?.inducements || []).find(i => i.name === itemName);
  if (!item) return;
  const title = item.name;
  const costText = item.priceText || `${Math.round((item.cost || 0) / 1000)}k`;
  const rulesText = String(item.rulesText || '').trim();
  const html = `
    <div style="text-align:left">
      <div style="font-weight:bold; margin-bottom:0.25rem;">${escapeHtml(costText)}</div>
      ${item.max != null ? `<div class="small" style="color:#555; margin-bottom:0.5rem;">Max per match: <strong>${item.max}</strong></div>` : ''}
      ${rulesText ? `<div class="small" style="white-space:pre-wrap; color:#444; margin-top:0.75rem;">${escapeHtml(rulesText)}</div>` : `<div class="small" style="color:#666;">No rules text available.</div>`}
    </div>
  `;
  showInfoModal(title, html, true);
}

export function showStarInfo(starName) {
  const star = (state.gameData?.starPlayers || []).find(s => s.name === starName);
  if (!star) return;

  const skillsHtml = (star.skills || []).map(skill => (
    `<span class="skill-tag" style="cursor:pointer" onclick='window.showSkill(${JSON.stringify(skill)})'>${escapeHtml(skill)}</span>`
  )).join(' ');

  const playsFor = Array.isArray(star.playsFor) ? star.playsFor : (star.playsFor ? [star.playsFor] : []);
  const special = (star.specialRules || '').trim();

  const html = `
    <div style="text-align:left">
      <div class="small" style="color:#666; margin-bottom:0.35rem;">${escapeHtml(star.profile || 'Star Player')}</div>
      <div class="stat-grid" style="margin:0.5rem 0 0.75rem;">
        <div class="stat-box"><div class="stat-label">MA</div><div class="stat-value">${escapeHtml(star.ma)}</div></div>
        <div class="stat-box"><div class="stat-label">ST</div><div class="stat-value">${escapeHtml(star.st)}</div></div>
        <div class="stat-box"><div class="stat-label">AG</div><div class="stat-value">${escapeHtml(star.ag)}</div></div>
        <div class="stat-box"><div class="stat-label">PA</div><div class="stat-value">${escapeHtml(star.pa ?? '-')}</div></div>
        <div class="stat-box"><div class="stat-label">AV</div><div class="stat-value">${escapeHtml(star.av)}</div></div>
      </div>
      <div style="display:flex; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
        <div><strong>Cost:</strong> ${(star.cost || 0) / 1000}k</div>
        <div class="small" style="color:#666;"><strong>Plays For:</strong> ${escapeHtml(playsFor.join(', ') || '—')}</div>
      </div>
      ${skillsHtml ? `<div style="margin-top:0.75rem;"><div style="font-weight:bold; margin-bottom:0.25rem;">Skills</div><div class="card-skills" style="justify-content:flex-start;">${skillsHtml}</div></div>` : ''}
      ${special ? `<div style="margin-top:0.75rem;"><div style="font-weight:bold; margin-bottom:0.25rem;">Special Rules</div><div class="small" style="white-space:pre-wrap; color:#444;">${escapeHtml(special)}</div></div>` : ''}
    </div>
  `;

  showInfoModal(star.name, html, true);
}

export async function confirmMatchStart() {
  const { warnings, errors } = validatePreMatchSetup();
  if (errors.length) {
    setStatus(errors[0], 'error');
    return;
  }
  if (warnings.length) {
    const html = `<div style="text-align:left"><div style="font-weight:bold; margin-bottom:0.5rem;">Rule Warnings</div><ul style="margin:0; padding-left:1.2rem;">${warnings.map(w => `<li>${w}</li>`).join('')}</ul><div class="small" style="margin-top:0.75rem; color:#555;">You can proceed anyway, but the match may be outside standard league rules.</div></div>`;
    const ok = await confirmModal('Proceed with warnings?', html, 'Proceed Anyway', true, true);
    if (!ok) return;
  }
  runCoinFlip(state.setupMatch.homeTeam, state.setupMatch.awayTeam, (winnerSide) => { finalizeMatchStart(winnerSide); });
}

function validatePreMatchSetup() {
  const s = state.setupMatch;
  const list = state.gameData?.inducements || [];
  const stars = state.gameData?.starPlayers || [];
  const warnings = [];
  const errors = [];

  const getRaceData = (teamRace) => state.gameData?.races?.find(r => r.name === teamRace);
  const getSpecialRules = (teamRace) => {
    const rd = getRaceData(teamRace);
    return Array.isArray(rd?.specialRules) ? rd.specialRules : [];
  };

  const getInducementUnitCost = (side, itemName) => {
    const item = list.find(i => i.name === itemName);
    if (!item) return 0;
    const sr = getSpecialRules(s[side + 'Team'].race);
    if (itemName === 'Bribes' && sr.includes('Bribery and Corruption')) return 50000;
    return item.cost || 0;
  };

  const calcSpent = (side) => {
    let total = 0;
    for (const [key, count] of Object.entries(s.inducements[side] || {})) {
      if (!count) continue;
      if (key.startsWith('Star: ')) {
        const name = key.replace('Star: ', '');
        const star = stars.find(x => x.name === name);
        if (star) total += star.cost;
      } else if (key === 'Mercenaries') total += count;
      else total += getInducementUnitCost(side, key) * count;
    }
    return total;
  };

  const homeSpent = calcSpent('home');
  const awaySpent = calcSpent('away');

  const starCount = (side) => Object.entries(s.inducements[side] || {}).filter(([k, v]) => k.startsWith('Star: ') && v > 0).length;
  if (starCount('home') > 2) warnings.push(`Home has ${starCount('home')} Star Players (max 2 by default).`);
  if (starCount('away') > 2) warnings.push(`Away has ${starCount('away')} Star Players (max 2 by default).`);

  if (s.higherSide === 'tie' && (homeSpent > 0 || awaySpent > 0)) {
    warnings.push('CTV is tied. By default, neither team can spend Treasury, so inducements are not available.');
  }

  if (s.wizard?.lock?.highSide && s.wizard.lock.highSide !== 'tie' && s.higherSide !== 'tie' && s.higherSide !== s.wizard.lock.highSide) {
    warnings.push('CTV order changed after locking the first team. Consider going Back and re-locking to ensure the inducement budgets are correct.');
  }

  if (homeSpent > (s.spendCap.home || 0)) warnings.push(`Home is over the spend cap by ${Math.ceil((homeSpent - s.spendCap.home)/1000)}k.`);
  if (awaySpent > (s.spendCap.away || 0)) warnings.push(`Away is over the spend cap by ${Math.ceil((awaySpent - s.spendCap.away)/1000)}k.`);

  const checkRestricted = (side) => {
    const sr = getSpecialRules(s[side + 'Team'].race);
    const rd = getRaceData(s[side + 'Team'].race);
    const needs = [
      { name: 'Mortuary Assistant', rule: 'Masters of Undeath' },
      { name: 'Plague Doctor', rule: 'Favoured of Nurgle' },
      { name: 'Riotous Rookies', rule: 'Low Cost Linemen' }
    ];
    for (const n of needs) {
      if ((s.inducements[side]?.[n.name] || 0) > 0 && !sr.includes(n.rule)) warnings.push(`${side === 'home' ? 'Home' : 'Away'} has ${n.name} but does not have the \"${n.rule}\" special rule.`);
    }
    if ((s.inducements[side]?.['Wandering Apothecary'] || 0) > 0 && rd?.apothecaryAllowed === false) {
      warnings.push(`${side === 'home' ? 'Home' : 'Away'} purchased Wandering Apothecary but the roster cannot hire an Apothecary.`);
    }
  };
  checkRestricted('home');
  checkRestricted('away');

  // Basic sanity
  if (!s.homeTeam || !s.awayTeam) errors.push('Missing team data.');

  return { warnings, errors };
}

function runCoinFlip(homeTeam, awayTeam, callback) {
  const homeName = String(homeTeam?.name || 'Home');
  const awayName = String(awayTeam?.name || 'Away');

  const winnerSide = rollDie(2) === 1 ? 'home' : 'away';
  const winnerName = winnerSide === 'home' ? homeName : awayName;

  const homeColor = String(homeTeam?.colors?.primary || '#b00020');
  const awayColor = String(awayTeam?.colors?.primary || '#1d4ed8');
  const homeText = getContrastColor(homeColor);
  const awayText = getContrastColor(awayColor);
  const homeInitial = (homeName.trim().charAt(0) || 'H').toUpperCase();
  const awayInitial = (awayName.trim().charAt(0) || 'A').toUpperCase();

  const hiddenModals = [];
  document.querySelectorAll('.modal').forEach(existing => {
    if (!existing?.isConnected) return;
    if (existing.classList.contains('hidden')) return;
    if (getComputedStyle(existing).display === 'none') return;
    hiddenModals.push({ el: existing, prevDisplay: existing.style.display });
    existing.style.display = 'none';
  });

  const restoreHidden = () => {
    hiddenModals.forEach(({ el, prevDisplay }) => {
      if (!el?.isConnected) return;
      el.style.display = prevDisplay || '';
    });
  };

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.style.zIndex = '20000';

  modal.innerHTML = `
    <div class="modal-content coin-toss-modal" style="text-align:center;">
      <div class="modal-header"><h3>Coin Toss</h3></div>
      <div class="small coin-toss-sub">The winner goes first.</div>
      <div class="coin-toss-teams">
        <span class="team-chip coin-team-chip" style="--team-primary:${homeColor}; --team-text:${homeText};">${escapeHtml(homeName)}</span>
        <span class="coin-toss-vs">VS</span>
        <span class="team-chip coin-team-chip" style="--team-primary:${awayColor}; --team-text:${awayText};">${escapeHtml(awayName)}</span>
      </div>
      <div class="coin-scene coin-scene-lg">
        <div class="coin" id="coinEl">
          <div class="coin-face front" style="--coin-face-color:${homeColor}; --coin-text-color:${homeText};"><div class="coin-glyph">${escapeHtml(homeInitial)}</div></div>
          <div class="coin-face back" style="--coin-face-color:${awayColor}; --coin-text-color:${awayText};"><div class="coin-glyph">${escapeHtml(awayInitial)}</div></div>
        </div>
      </div>
      <div id="coinResult" class="coin-result" style="opacity:0;"><strong>${escapeHtml(winnerName)}</strong> wins the toss and goes first.</div>
      <div class="modal-actions coin-actions" style="justify-content:center;">
        <button id="coinCancelBtn" class="secondary-btn">Back</button>
        <button id="coinContinueBtn" class="primary-btn" disabled>Start Match</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => {
    modal.remove();
    restoreHidden();
  };

  const cancelBtn = modal.querySelector('#coinCancelBtn');
  const continueBtn = modal.querySelector('#coinContinueBtn');
  cancelBtn.onclick = () => close();
  continueBtn.onclick = () => {
    close();
    callback?.(winnerSide);
  };

  setTimeout(() => {
    const coin = modal.querySelector('#coinEl');
    if (coin) coin.style.transform = `rotateY(${winnerSide === 'home' ? 1800 : 1980}deg)`;
    setTimeout(() => {
      const result = modal.querySelector('#coinResult');
      if (result) result.style.opacity = '1';
      continueBtn.disabled = false;
    }, 2800);
  }, 120);
}

export async function finalizeMatchStart(activeSide) {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  const s = state.setupMatch;
  const l = state.currentLeague;
  const stars = state.gameData?.starPlayers || [];
  setStatus('Starting match...');
  try {
    const initRoster = (players) => (players || []).filter(isPlayerAvailableForMatch).map(p => ({
      playerId: p.id,
      number: p.number,
      name: p.name,
      position: p.position,
      ma: p.ma,
      st: p.st,
      ag: p.ag,
      pa: p.pa,
      av: p.av,
      skills: p.skills || [],
      cost: p.cost || 0,
      live: { used: false, injured: false, sentOff: false, td: 0, cas: 0, int: 0, comp: 0, ttmThrow: 0, ttmLand: 0, foul: 0 }
    }));

    const injectJourneymen = (baseRoster, side) => {
      const needed = s.journeymen?.[side]?.needed || 0;
      if (needed <= 0) return baseRoster;

      const typeName = s.journeymen?.[side]?.type;
      const options = s.journeymen?.[side]?.options || [];
       const tmpl = options.find(o => o.name === typeName) || options[0] || { name: 'Lineman (Journeyman)', cost: 50000, ma: 6, st: 3, ag: 3, pa: 4, av: 8, skills: [], primary: ['G'], secondary: [] };

      const maxNum = (baseRoster.length > 0) ? Math.max(...baseRoster.map(p => p.number || 0)) : 0;
      const out = [...baseRoster];
      for (let i = 0; i < needed; i++) {
        out.push({
          playerId: ulid(),
          isJourneyman: true,
          number: maxNum + 90 + i + 1,
          name: `Journeyman ${i + 1}`,
          position: tmpl.name,
          ma: tmpl.ma,
          st: tmpl.st,
          ag: tmpl.ag,
          pa: tmpl.pa,
          av: tmpl.av,
          primary: tmpl.primary || ['G'],
          secondary: tmpl.secondary || [],
          skills: [...(tmpl.skills || []), 'Loner (4+)'],
          cost: tmpl.cost || 0,
           live: { used: false, injured: false, sentOff: false, td: 0, cas: 0, int: 0, comp: 0, ttmThrow: 0, ttmLand: 0, foul: 0 }
        });
      }
      return out;
    };
    const injectStars = (baseRoster, side) => {
        const newRoster = [...baseRoster];
        for (const [key, count] of Object.entries(s.inducements[side])) {
            if (count > 0 && key.startsWith('Star: ')) {
                const name = key.replace('Star: ', '');
                const starData = stars.find(x => x.name === name);
                if (starData) newRoster.push({
                  playerId: ulid(),
                  isStar: true,
                  number: 99,
                  name: starData.name,
                  position: 'Star Player',
                  ma: starData.ma,
                  st: starData.st,
                  ag: starData.ag,
                  pa: starData.pa,
                  av: starData.av,
                  skills: starData.skills,
                  cost: starData.cost,
                   live: { used: false, injured: false, sentOff: false, td: 0, cas: 0, int: 0, comp: 0, ttmThrow: 0, ttmLand: 0, foul: 0 }
                });
            }
        }
        return newRoster;
    };

    const pregame = {
      ctv: { home: s.ctv.home, away: s.ctv.away },
      higherSide: s.higherSide,
      pettyCash: { home: s.pettyCash.home, away: s.pettyCash.away },
      treasurySpent: { home: s.treasurySpent.home, away: s.treasurySpent.away },
      journeymen: {
        home: { needed: s.journeymen.home.needed, type: s.journeymen.home.type },
        away: { needed: s.journeymen.away.needed, type: s.journeymen.away.type }
      }
    };

    // Apply treasury spend now; if the match is cancelled we restore it.
    const applySpend = async (team, sideLabel) => {
      const spend = pregame.treasurySpent[sideLabel] || 0;
      if (spend <= 0) return team;
      team.treasury = Math.max(0, (team.treasury || 0) - spend);
      await apiSave(PATHS.team(l.id, team.id), team, `Pregame inducements (${s.matchId})`, key);
      return team;
    };

    await applySpend(s.homeTeam, 'home');
    await applySpend(s.awayTeam, 'away');

    const activeData = {
      matchId: s.matchId, leagueId: l.id, round: l.matches.find(m=>m.id===s.matchId).round, status: 'in_progress', activeTeam: activeSide,
      pregame,
      home: { id: s.homeTeam.id, name: s.homeTeam.name, colors: s.homeTeam.colors, score: 0, roster: injectStars(injectJourneymen(initRoster(s.homeTeam.players), 'home'), 'home'), rerolls: s.homeTeam.rerolls || 0, apothecary: s.homeTeam.apothecary, inducements: s.inducements.home, ctv: s.ctv.home, tv: s.ctv.home },
      away: { id: s.awayTeam.id, name: s.awayTeam.name, colors: s.awayTeam.colors, score: 0, roster: injectStars(injectJourneymen(initRoster(s.awayTeam.players), 'away'), 'away'), rerolls: s.awayTeam.rerolls || 0, apothecary: s.awayTeam.apothecary, inducements: s.inducements.away, ctv: s.ctv.away, tv: s.ctv.away },
      turn: { home: 0, away: 0 }, log: []
    };
    await apiSave(PATHS.activeMatch(s.matchId), activeData, `Start match ${s.matchId}`, key);
    const m = l.matches.find(x => x.id === s.matchId);
    if(m) m.status = 'in_progress';
    await apiSave(PATHS.league(l.id), l, `Match in progress`, key);
    closePreMatchModal();
    handleOpenScoreboard(s.matchId);
    setStatus('Match started!', 'ok');
  } catch(e) { setStatus(e.message, 'error'); }
}

export async function handleOpenScoreboard(matchId) {
  setStatus('Loading live match...');
  try {
    const data = await apiGet(PATHS.activeMatch(matchId));
    if (!data) throw new Error("Active match file not found.");
    state.activeMatchData = data;
    renderJumbotron();
    showSection('scoreboard');
    updateBreadcrumbs([{ label: 'Leagues', action: goHome }, { label: state.currentLeague?.name || 'League', action: () => handleOpenLeague(state.activeMatchData.leagueId) }, { label: 'Live Match' }]);
    setActiveNav('match');
    if (state.activeMatchPollInterval) clearInterval(state.activeMatchPollInterval);
    state.activeMatchPollInterval = setInterval(async () => {
        try {
            if(!document.getElementById('sbHomeName') || els.sections.scoreboard.classList.contains('hidden')) return;
            const fresh = await apiGet(PATHS.activeMatch(matchId));
            if (fresh) { state.activeMatchData = fresh; renderJumbotron(); }
        } catch(e) { console.warn("Poll failed", e); }
    }, 5000); 
    setStatus('Live connection active.', 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
}

// --- Jumbotron & Coach Views (INDUCEMENTS UPDATED) ---

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
  els.containers.sbHomeRoster.innerHTML = `<div class="roster-header" style="background:${d.home.colors?.primary||'#222'}; color:${getContrastColor(d.home.colors?.primary||'#222')}">Home - ${d.home.name}</div>` + renderJumbotronInducements(d.home) + renderLiveRoster(d.home.roster, 'home', true);
  els.containers.sbAwayRoster.innerHTML = `<div class="roster-header" style="background:${d.away.colors?.primary||'#222'}; color:${getContrastColor(d.away.colors?.primary||'#222')}">Away - ${d.away.name}</div>` + renderJumbotronInducements(d.away) + renderLiveRoster(d.away.roster, 'away', true);
}

// Helper: Jumbotron Icons
function renderJumbotronInducements(team) {
    if (!team.inducements && !team.apothecary) return '';
    const mapping = { 
        "Blitzer's Best Kegs": "🍺", "Bribes": "💰", "Extra Team Training": "🏋️", 
        "Halfling Master Chef": "👨‍🍳", "Mortuary Assistant": "⚰️", "Plague Doctor": "🧪",
        "Riotous Rookies": "😡", "Wandering Apothecary": "💊", "Wizard": "⚡", "Biased Referee": "🃏"
    };
    let html = '<div class="jumbotron-icons">';
    if (team.apothecary) html += `<span title="Apothecary" class="jumbo-icon">🚑</span>`;
    if (team.inducements) {
        Object.entries(team.inducements).forEach(([k, v]) => {
            if (v > 0 && mapping[k]) html += `<span title="${k}" class="jumbo-icon">${mapping[k].repeat(v)}</span>`;
        });
    }
    html += '</div>';
    return html;
}

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
  const activeSide = d.activeTeam || 'home';
  const turnLabel = (activeSide === side) ? "YOUR TURN" : "OPPONENT'S TURN";
  const turnColor = (activeSide === side) ? "var(--pitch-green)" : "#888";
  els.containers.coachTeamName.innerHTML = `<div class="big-team-text" style="color:${team.colors?.text || '#fff'}; text-shadow:none;">${team.name}</div>`;
  els.containers.coachScore.textContent = `${team.score} - ${d[side==='home'?'away':'home'].score}`;
  els.containers.coachTurn.innerHTML = `Turn: ${d.turn[side]} <span style="background:${turnColor}; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-left:5px; vertical-align:middle;">${turnLabel}</span>`;
  let pips = '';
  for(let i=0; i<team.rerolls; i++) pips += `<div class="reroll-pip ${i < (team.rerolls) ? 'active' : ''}" onclick="window.toggleReroll('${side}', ${i})"></div>`;
  els.containers.coachRerolls.innerHTML = pips;
  
  // New Inducement Bar logic
  let inducementsHtml = `<div class="inducement-bar"><div class="inducement-title">INDUCEMENTS <span onclick="window.openInGameShop('${side}')" style="cursor:pointer; font-size:1.2rem;">⚙️</span></div>`;
  
  if (team.apothecary) {
      inducementsHtml += `<div class="inducement-chip" onclick="window.handleUseInducement('${side}', 'Apothecary')">🚑 Apothecary</div>`;
  }
  
  if (team.inducements) {
      const mapping = { "Blitzer's Best Kegs": "🍺", "Bribes": "💰", "Wizard": "⚡", "Halfling Master Chef": "👨‍🍳", "Wandering Apothecary": "💊" };
      Object.entries(team.inducements).forEach(([k, v]) => {
          if (v > 0 && !k.startsWith('Star:')) {
              const icon = mapping[k] || "📦";
              inducementsHtml += `<div class="inducement-chip" onclick="window.handleUseInducement('${side}', '${k}')">${icon} ${k} (${v})</div>`;
          }
      });
  }
  inducementsHtml += `</div>`;

  els.containers.coachRoster.innerHTML = inducementsHtml + renderLiveRoster(team.roster, side, false);
}

function renderLiveRoster(roster, side, readOnly) {
  return roster.map((p, idx) => {
    const live = p.live || {};
    let badges = '';
    if(live.td > 0) badges += `<span class="stat-badge">TD:${live.td}</span>`;
    if(live.cas > 0) badges += `<span class="stat-badge">CAS:${live.cas}</span>`;
    if(live.int > 0) badges += `<span class="stat-badge int">INT:${live.int}</span>`;
    if(live.comp > 0) badges += `<span class="stat-badge comp">CMP:${live.comp}</span>`;
    if(live.foul > 0) badges += `<span class="stat-badge foul">FL:${live.foul}</span>`;
    if(live.sentOff) badges += `<span class="stat-badge" style="background:#faa">Off</span>`;
    const skillTags = (p.skills || []).map(s => `<span class="skill-tag" onclick="event.stopPropagation(); window.showSkill('${s}')">${s}</span>`).join(' ');
    if (readOnly) return `<div class="live-player-row ${live.used?'used':''} ${live.injured?'injured':''}"><div class="player-info"><span class="player-name">#${p.number} ${p.name} ${badges}</span><span class="player-pos">${p.position} | ${skillTags}</span></div></div>`;
    return `<div class="live-player-row ${live.used?'used':''} ${live.injured?'injured':''}" onclick="window.openPlayerActionSheet(${idx})"><div class="player-info"><span class="player-name">#${p.number} ${p.name} ${badges}</span><span class="player-pos">${p.position} | ${skillTags}</span></div></div>`;
  }).join('');
}

export async function handleUseInducement(side, itemName) {
    const confirmed = await confirmModal(`Use ${itemName}?`, "This will decrease your available count.", "Use Item", false);
    if(!confirmed) return;
    
    const d = state.activeMatchData;
    // Special case for Apothecary boolean
    if (itemName === 'Apothecary') {
        if (d[side].apothecary) {
            d[side].apothecary = false; // Use it up
            renderCoachView();
            await updateLiveMatch(`Used Apothecary (${side})`);
        }
        return;
    }
    
    if (d[side].inducements[itemName] > 0) {
        d[side].inducements[itemName]--;
        renderCoachView();
        await updateLiveMatch(`Used ${itemName} (${side})`);
    }
}

// --- In-Game Shop Modal ---

export function openInGameShop(side) {
    const modal = document.createElement('div');
    modal.className = 'modal'; modal.style.display = 'flex'; modal.style.zIndex = '3000';
    modal.innerHTML = `<div class="modal-content" style="max-height:90vh; display:flex; flex-direction:column;"><div class="modal-header"><h3>Manage Inducements</h3><button class="close-btn">×</button></div><div class="modal-body-scroll" id="inGameShopList"></div><div class="modal-actions"><button class="primary-btn" id="igShopSave">Done (Save)</button></div></div>`;
    document.body.appendChild(modal);
    
    // Local copy to edit without saving yet
    const localInducements = JSON.parse(JSON.stringify(state.activeMatchData[side].inducements || {}));

    const renderList = () => {
        const list = (state.gameData?.inducements || []).filter(i => i?.purchaseEnabled !== false);
        let html = '';
        list.forEach(item => {
            const count = localInducements[item.name] || 0;
            html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:4px;"><div style="font-size:0.9rem; font-weight:bold;">${item.name}</div><div style="display:flex; align-items:center; gap:10px;"><button class="stat-btn-small" onclick="window.adjustInGameInducement('${item.name}', -1)">-</button><span style="font-weight:bold; width:20px; text-align:center;">${count}</span><button class="stat-btn-small" onclick="window.adjustInGameInducement('${item.name}', 1)">+</button></div></div>`;
        });
        document.getElementById('inGameShopList').innerHTML = html;
    };
    
    // PURELY LOCAL UPDATE
    window.adjustInGameInducement = (name, delta) => {
        const current = localInducements[name] || 0;
        const newVal = current + delta;
        if(newVal < 0) return;
        localInducements[name] = newVal;
        renderList();
    };
    
    renderList();

    const closeAndSave = async (shouldSave) => {
        if(shouldSave) {
            state.activeMatchData[side].inducements = localInducements;
            renderCoachView();
            await updateLiveMatch(`Updated Inducements (${side})`);
        }
        delete window.adjustInGameInducement;
        modal.remove();
    };

    modal.querySelector('.close-btn').onclick = () => closeAndSave(false);
    modal.querySelector('#igShopSave').onclick = () => closeAndSave(true);
}

// ... (Player Actions, Game Control Actions, Post-Game Sequence unchanged from previous step) ...
// ... (Included for completeness) ...

export function openPlayerActionSheet(idx) {
  state.selectedPlayerIdx = idx;
  const p = state.activeMatchData[state.coachSide].roster[idx];
  els.actionSheet.title.textContent = ``; 
  const content = els.actionSheet.el.querySelector('.action-sheet-content');
  const headerHtml = `<div class="player-card-header"><div class="player-card-name">#${p.number} ${p.name}</div><div class="player-card-meta">${p.position} | ${p.cost/1000}k</div></div><div class="stat-grid"><div class="stat-box"><span class="stat-label">MA</span><span class="stat-value">${p.ma}</span></div><div class="stat-box"><span class="stat-label">ST</span><span class="stat-value">${p.st}</span></div><div class="stat-box"><span class="stat-label">AG</span><span class="stat-value">${p.ag}+</span></div><div class="stat-box"><span class="stat-label">PA</span><span class="stat-value">${p.pa ? p.pa+'+' : '-'}</span></div><div class="stat-box"><span class="stat-label">AV</span><span class="stat-value">${p.av}+</span></div></div><div class="card-skills">${(p.skills||[]).map(s => `<span class="skill-tag">${s}</span>`).join('')}${(!p.skills || p.skills.length===0) ? '<span style="color:#999; font-style:italic">No skills</span>' : ''}</div>`;
  const actionsHtml = `<div class="sheet-grid"><button class="sheet-btn btn-td" onclick="window.handleSheetAction('td')"><div class="emoji">🏈</div>TD</button><button class="sheet-btn btn-cas" onclick="window.handleSheetAction('cas')"><div class="emoji">💥</div>CAS</button><button class="sheet-btn btn-int" onclick="window.handleSheetAction('int')"><div class="emoji">✋</div>INT</button><button class="sheet-btn btn-comp" onclick="window.handleSheetAction('comp')"><div class="emoji">🎯</div>COMP</button><button class="sheet-btn btn-foul" onclick="window.handleSheetAction('foul')"><div class="emoji">🥾</div>FOUL</button><button class="sheet-btn btn-inj" onclick="window.handleSheetAction('injured')"><div class="emoji">🤕</div>INJ</button><button class="sheet-btn btn-used" onclick="window.handleSheetAction('used')" style="grid-column: 1 / -1; height:60px;"><div class="emoji" style="font-size:1.2rem; display:inline;">💤</div> Toggle Used</button></div><label class="correction-toggle"><input type="checkbox" id="correctionMode" onchange="this.parentElement.parentElement.classList.toggle('correction-mode-active', this.checked)"> Correction Mode (Undo)</label>`;
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
  if (type === 'used') { p.live.used = !p.live.used; }
  else if (type === 'injured') { p.live.injured = !p.live.injured; }
  else if (type === 'td') {
    const newVal = (p.live.td || 0) + multiplier;
    if (newVal >= 0) { p.live.td = newVal; state.activeMatchData[side].score = Math.max(0, state.activeMatchData[side].score + multiplier); }
  }
  else if (type === 'cas') { const newVal = (p.live.cas || 0) + multiplier; if (newVal >= 0) p.live.cas = newVal; }
  else if (type === 'int') { const newVal = (p.live.int || 0) + multiplier; if (newVal >= 0) p.live.int = newVal; }
  else if (type === 'comp') { const newVal = (p.live.comp || 0) + multiplier; if (newVal >= 0) p.live.comp = newVal; }
  else if (type === 'foul') {
      const newVal = (p.live.foul || 0) + multiplier;
      if (newVal >= 0) { p.live.foul = newVal; if(!isUndo) p.live.used = true; }
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
  if (team.rerolls > 0) { team.rerolls--; renderCoachView(); updateLiveMatch(`${side} used Reroll`); }
}

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

    // Restore any pregame treasury spend (if present)
    try {
      const spent = state.activeMatchData.pregame?.treasurySpent;
      if (spent) {
        const homeT = await apiGet(PATHS.team(lId, state.activeMatchData.home.id));
        const awayT = await apiGet(PATHS.team(lId, state.activeMatchData.away.id));
        if (homeT && spent.home) {
          homeT.treasury = (homeT.treasury || 0) + spent.home;
          await apiSave(PATHS.team(lId, homeT.id), homeT, `Restore pregame treasury (${mId})`, key);
        }
        if (awayT && spent.away) {
          awayT.treasury = (awayT.treasury || 0) + spent.away;
          await apiSave(PATHS.team(lId, awayT.id), awayT, `Restore pregame treasury (${mId})`, key);
        }
      }
    } catch (e) {}

    await apiDelete(PATHS.activeMatch(mId), `Cancel ${mId}`, key);
    const l = await apiGet(PATHS.league(lId));
    const m = l.matches.find(x => x.id === mId);
    if(m) m.status = 'scheduled';
    await apiSave(PATHS.league(l.id), l, `Revert ${mId}`, key);
    handleOpenLeague(lId);
  } catch(e) { setStatus(e.message, 'error'); }
}

// --- POST GAME SEQUENCE (CHUNK 4) ---

const SKILL_CAT_BY_CODE = { A: 'Agility', D: 'Devious', G: 'General', M: 'Mutation', P: 'Passing', S: 'Strength' };

function pgGetPlayerKey(side, rosterIdx) {
  const r = state.activeMatchData?.[side]?.roster?.[rosterIdx];
  if (!r) return null;
  if (r.playerId) return `p:${r.playerId}`;
  return `t:${side}:${rosterIdx}`;
}

function pgGetRosterPlayer(side, rosterIdx) {
  return state.activeMatchData?.[side]?.roster?.[rosterIdx] || null;
}

function pgFindSkillDef(skillName) {
  const name = String(skillName || '').trim();
  if (!name) return null;
  const cats = state.gameData?.skillCategories;
  if (!cats) return null;
  for (const list of Object.values(cats)) {
    const found = (list || []).find(s => (typeof s === 'object' ? s.name : s) === name);
    if (found) return (typeof found === 'object') ? found : { name: found };
  }
  return null;
}

function pgGetResultForSide(side) {
  const d = state.activeMatchData;
  if (!d) return 'draw';
  const my = Number(d[side]?.score || 0);
  const opp = Number(d[side === 'home' ? 'away' : 'home']?.score || 0);
  if (my > opp) return 'win';
  if (my < opp) return 'loss';
  return 'draw';
}

function pgComputeMvpWinnerRosterIdx(side) {
  const pg = state.postGame;
  const mvp = pg?.teams?.[side]?.mvp;
  const nominees = Array.isArray(mvp?.nominees) ? mvp.nominees : [];
  const roll = Number(mvp?.rollD6 || 0);
  if (nominees.length === 0) return null;
  if (!roll || roll < 1 || roll > 6) return null;
  const idx = roll - 1;
  return nominees[idx] ?? null;
}

function pgGetTeamWinningsGp(side) {
  const pg = state.postGame;
  const t = pg?.teams?.[side];
  if (!t) return 0;
  if (t.winningsGpOverride != null && t.winningsGpOverride !== '') return Number(t.winningsGpOverride) || 0;
  return Number(t.winningsGpAuto) || 0;
}

function pgGetTeamDedicatedFansDelta(side) {
  const pg = state.postGame;
  const t = pg?.teams?.[side];
  if (!t) return 0;
  if (t.dedicatedFansDeltaOverride != null && t.dedicatedFansDeltaOverride !== '') return Number(t.dedicatedFansDeltaOverride) || 0;
  return computeBb2025DedicatedFansDelta({ result: t.result, dedicatedFans: t.dedicatedFansBefore, rollD6: t.dedicatedFansRollD6 });
}

function pgCharacteristicOptionsFromD8(rollD8) {
  const r = Number(rollD8);
  if (!r || r < 1 || r > 8) return [];
  if (r === 1) return ['av'];
  if (r === 2) return ['av', 'pa'];
  if (r === 3 || r === 4) return ['av', 'ma', 'pa'];
  if (r === 5) return ['ma', 'pa'];
  if (r === 6) return ['ag', 'ma'];
  if (r === 7) return ['ag', 'st'];
  if (r === 8) return ['av', 'ma', 'pa', 'ag', 'st'];
  return [];
}

function pgComputeExpensiveMistakeType(treasuryGp, rollD6) {
  const t = Number(treasuryGp) || 0;
  const roll = Number(rollD6) || 0;
  if (t < 100000 || !roll || roll < 1 || roll > 6) return null;

  const band = (t >= 600000) ? 5
    : (t >= 500000) ? 4
      : (t >= 400000) ? 3
        : (t >= 300000) ? 2
          : (t >= 200000) ? 1
            : 0; // 100-195

  const table = {
    1: ['Minor Incident', 'Minor Incident', 'Major Incident', 'Major Incident', 'Catastrophe', 'Catastrophe'],
    2: ['Crisis Averted', 'Minor Incident', 'Minor Incident', 'Major Incident', 'Major Incident', 'Major Incident'],
    3: ['Crisis Averted', 'Crisis Averted', 'Minor Incident', 'Minor Incident', 'Minor Incident', 'Major Incident'],
    4: ['Crisis Averted', 'Crisis Averted', 'Crisis Averted', 'Crisis Averted', 'Minor Incident', 'Minor Incident'],
    5: ['Crisis Averted', 'Crisis Averted', 'Crisis Averted', 'Crisis Averted', 'Crisis Averted', 'Crisis Averted'],
    6: ['Crisis Averted', 'Crisis Averted', 'Crisis Averted', 'Crisis Averted', 'Crisis Averted', 'Minor Incident']
  };

  return table[roll]?.[band] || null;
}

function pgComputeExpensiveMistakesDeltaGp({ treasuryGp, rollD6, rollD3, roll2d6Total }) {
  const t = Number(treasuryGp) || 0;
  const kind = pgComputeExpensiveMistakeType(t, rollD6);
  if (!kind) return { kind: null, deltaGp: 0, needs: null };

  if (kind === 'Crisis Averted') return { kind, deltaGp: 0, needs: null };
  if (kind === 'Minor Incident') {
    const d3 = Number(rollD3) || 0;
    if (d3 < 1 || d3 > 3) return { kind, deltaGp: 0, needs: 'd3' };
    return { kind, deltaGp: -(d3 * 10000), needs: null };
  }
  if (kind === 'Major Incident') {
    const half = Math.floor(t / 2);
    const rounded = Math.floor(half / 5000) * 5000;
    return { kind, deltaGp: rounded - t, needs: null };
  }
  if (kind === 'Catastrophe') {
    const total = Number(roll2d6Total) || 0;
    if (total < 2 || total > 12) return { kind, deltaGp: 0, needs: '2d6' };
    const keep = total * 10000;
    return { kind, deltaGp: keep - t, needs: null };
  }
  return { kind, deltaGp: 0, needs: null };
}

function pgComputeSppGain(side, rosterIdx) {
  const r = pgGetRosterPlayer(side, rosterIdx);
  if (!r || r.isStar) return 0;
  const mvpWinner = pgComputeMvpWinnerRosterIdx(side);
  return computeBb2025SppGain({
    td: r.live?.td || 0,
    cas: r.live?.cas || 0,
    int: r.live?.int || 0,
    comp: r.live?.comp || 0,
    ttmThrow: r.live?.ttmThrow || 0,
    ttmLand: r.live?.ttmLand || 0,
    isMvp: mvpWinner === rosterIdx
  });
}

function pgGetAdvListForPlayerKey(playerKey) {
  const pg = state.postGame;
  pg.advByPlayer = pg.advByPlayer || {};
  pg.advByPlayer[playerKey] = pg.advByPlayer[playerKey] || [];
  return pg.advByPlayer[playerKey];
}

function pgComputeAdvCostsSpp(playerKey) {
  const pg = state.postGame;
  const base = pg?.players?.[playerKey];
  const advs = pgGetAdvListForPlayerKey(playerKey);
  const baseCount = Number(base?.advancementCount || 0);
  const costs = [];
  let count = baseCount;
  for (const adv of advs) {
    const fakePlayer = { advancements: new Array(Math.max(0, count)).fill({}) };
    const cost = getBb2025AdvancementCost(fakePlayer, adv.kind) ?? 0;
    costs.push(cost);
    count += 1;
  }
  return costs;
}

function pgComputeSppSpend(playerKey) {
  return pgComputeAdvCostsSpp(playerKey).reduce((a, b) => a + (Number(b) || 0), 0);
}

function pgComputeTreasuryBeforeExpensiveMistakesGp(side) {
  const pg = state.postGame;
  const team = pg?.teams?.[side];
  if (!team) return 0;

  let t = Number(team.treasuryBeforeGp || 0);
  t += pgGetTeamWinningsGp(side);
  t += Number(team.otherTreasuryDeltaGp || 0);

  const staffCosts = state.gameData?.staffCosts || { assistantCoach: 10000, cheerleader: 10000, apothecary: 50000 };
  const base = team.staffBase || { assistantCoaches: 0, cheerleaders: 0, apothecary: false, rerolls: 0, race: '' };
  const desired = team.staffDesired || base;
  const coachDelta = (Number(desired.assistantCoaches || 0) - Number(base.assistantCoaches || 0)) * (Number(staffCosts.assistantCoach) || 0);
  const cheerDelta = (Number(desired.cheerleaders || 0) - Number(base.cheerleaders || 0)) * (Number(staffCosts.cheerleader) || 0);
  const apoDelta = ((!!desired.apothecary) === (!!base.apothecary)) ? 0 : ((!!desired.apothecary) ? Number(staffCosts.apothecary) || 0 : -(Number(staffCosts.apothecary) || 0));
  t -= coachDelta;
  t -= cheerDelta;
  t -= apoDelta;

  const race = state.gameData?.races?.find(r => r.name === base.race);
  const rrCost = Number(race?.rerollCost || 50000);
  const addRr = Math.max(0, Number(desired.addRerolls || 0));
  t -= addRr * rrCost * 2;

  const hires = pg?.hireByPlayer || {};
  for (const [key, h] of Object.entries(hires)) {
    if (!h?.hire) continue;
    const p = pg.players?.[key];
    if (!p?.isJourneyman) continue;

    const baseCost = Number(p.baseCost || 0);
    const advList = pgGetAdvListForPlayerKey(key);
    let tmp = { cost: baseCost, skills: Array.isArray(p.baseSkills) ? [...p.baseSkills] : [], ma: p.ma, st: p.st, ag: p.ag, pa: p.pa, av: p.av };
    for (const adv of advList) {
      if (adv.kind === 'characteristic' && adv.outcomeType === 'skill') {
        const def = pgFindSkillDef(adv.skillName);
        const { player } = applyBb2025SkillAdvancement(tmp, { skillName: adv.skillName, isSecondary: adv.skillFrom === 'secondary', isEliteSkill: !!def?.isElite });
        tmp = player;
      } else if (adv.kind === 'characteristic') {
        const { player } = applyBb2025CharacteristicIncrease(tmp, adv.statKey);
        tmp = player;
      } else {
        const def = pgFindSkillDef(adv.skillName);
        const { player } = applyBb2025SkillAdvancement(tmp, { skillName: adv.skillName, isSecondary: adv.kind === 'chosenSecondary', isEliteSkill: !!def?.isElite });
        tmp = player;
      }
    }
    t -= Number(tmp.cost || baseCost);
  }

  return t;
}

function pgValidate() {
  const pg = state.postGame;
  const warnings = [];
  if (!pg) return warnings;

  for (const side of ['home', 'away']) {
    const t = pg.teams?.[side];
    if (!t) continue;

    if (t.result !== 'draw') {
      const roll = Number(t.dedicatedFansRollD6 || 0);
      if (!roll || roll < 1 || roll > 6) warnings.push(`${t.name}: Dedicated Fans requires a D6 roll (enter 1-6).`);
    }

    const nominees = t.mvp?.nominees || [];
    if (nominees.length !== 6) warnings.push(`${t.name}: MVP should nominate exactly 6 players (currently ${nominees.length}).`);
    const mvpRoll = Number(t.mvp?.rollD6 || 0);
    if (!mvpRoll || mvpRoll < 1 || mvpRoll > 6) warnings.push(`${t.name}: MVP requires a D6 roll (enter 1-6).`);
  }

  for (const [key, base] of Object.entries(pg.players || {})) {
    const side = base.side;
    const idx = base.rosterIdx;
    const r = pgGetRosterPlayer(side, idx);
    if (!r || r.isStar) continue;
    const baseSpp = Number(base.baseSpp || 0);
    const gain = pgComputeSppGain(side, idx);
    const spend = pgComputeSppSpend(key);
    if ((baseSpp + gain) < spend) warnings.push(`#${r.number} ${r.name}: spending ${spend} SPP but only has ${baseSpp + gain}.`);

    const advs = pgGetAdvListForPlayerKey(key);

    const existingSkills = new Set((base.baseSkills || []).map(s => String(s).trim()).filter(Boolean));
    const pickedSkills = new Set();
    for (const adv of advs) {
      if (adv.kind === 'characteristic' && adv.outcomeType !== 'skill') continue;
      const skill = String(adv.skillName || '').trim();
      if (!skill) warnings.push(`#${r.number} ${r.name}: advancement missing a skill name.`);
      if (existingSkills.has(skill)) warnings.push(`#${r.number} ${r.name}: already has ${skill}.`);
      if (pickedSkills.has(skill)) warnings.push(`#${r.number} ${r.name}: duplicate skill selected (${skill}).`);
      pickedSkills.add(skill);

      const code = String(adv.categoryCode || '').trim().toUpperCase();
      const categoryName = SKILL_CAT_BY_CODE[code];
      if (!categoryName) warnings.push(`#${r.number} ${r.name}: missing/invalid skill category code.`);
      const def = pgFindSkillDef(skill);
      if (!def) warnings.push(`#${r.number} ${r.name}: skill not found in game data (${skill}).`);
      if (def && categoryName) {
        const foundInCategory = (state.gameData?.skillCategories?.[categoryName] || []).some(s => (typeof s === 'object' ? s.name : s) === skill);
        if (!foundInCategory) warnings.push(`#${r.number} ${r.name}: ${skill} is not in ${categoryName} skills.`);
      }

      const allowed = (adv.skillFrom === 'secondary' || adv.kind === 'chosenSecondary') ? (base.secondary || []) : (base.primary || []);
      if (code && Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(code)) {
        warnings.push(`#${r.number} ${r.name}: category ${code} not allowed (${(adv.skillFrom === 'secondary' || adv.kind === 'chosenSecondary') ? 'Secondary' : 'Primary'}).`);
      }
    }

    for (const adv of advs) {
      if (adv.kind !== 'characteristic') continue;
      const roll = Number(adv.rollD8 || 0);
      if (!roll || roll < 1 || roll > 8) warnings.push(`#${r.number} ${r.name}: Characteristic improvement requires a D8 roll (enter 1-8).`);
      if (adv.outcomeType === 'skill') continue;
      const options = pgCharacteristicOptionsFromD8(roll);
      if (!options.length) continue;
      if (!options.includes(String(adv.statKey || '').toLowerCase())) warnings.push(`#${r.number} ${r.name}: chosen characteristic not allowed by D8 roll (${roll}).`);
    }
  }

  for (const side of ['home', 'away']) {
    const t = pg.teams?.[side];
    if (!t) continue;
    const beforeEM = pgComputeTreasuryBeforeExpensiveMistakesGp(side);
    if (beforeEM < 0) warnings.push(`${t.name}: treasury would go negative before Expensive Mistakes (${Math.round(beforeEM / 1000)}k).`);
    if (beforeEM >= 100000) {
      const roll = Number(t.expensive?.rollD6 || 0);
      if (!roll || roll < 1 || roll > 6) warnings.push(`${t.name}: Expensive Mistakes requires a D6 roll (treasury ≥ 100k).`);
      const kind = pgComputeExpensiveMistakeType(beforeEM, roll);
      if (kind === 'Minor Incident') {
        const d3 = Number(t.expensive?.rollD3 || 0);
        if (!d3 || d3 < 1 || d3 > 3) warnings.push(`${t.name}: Minor Incident requires a D3 roll (enter 1-3).`);
      }
      if (kind === 'Catastrophe') {
        const total = Number(t.expensive?.roll2d6Total || 0);
        if (!total || total < 2 || total > 12) warnings.push(`${t.name}: Catastrophe requires a 2D6 total (enter 2-12).`);
      }
    }
  }

  return warnings;
}

function pgRenderBanner({ pg, d }) {
  return `
    <div class="panel-styled" style="margin-bottom:1rem; background:#eee;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem;">
        <div style="flex:1; text-align:center; min-width:0;">
          <div style="font-family:'Russo One',sans-serif; color:${pg.teams.home.colors.primary}; font-size:1.4rem; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${d.home.name}</div>
          <div style="font-size:2rem; font-weight:900;">${d.home.score}</div>
        </div>
        <div style="font-weight:900; color:#555; font-size:1.2rem;">VS</div>
        <div style="flex:1; text-align:center; min-width:0;">
          <div style="font-family:'Russo One',sans-serif; color:${pg.teams.away.colors.primary}; font-size:1.4rem; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${d.away.name}</div>
          <div style="font-size:2rem; font-weight:900;">${d.away.score}</div>
        </div>
      </div>
    </div>
  `;
}

function pgRenderStepLabel({ step, totalSteps, title }) {
  return `<div style="margin:0.25rem 0 0.75rem 0; color:#444;"><strong>Step ${step}/${totalSteps}:</strong> ${title}</div>`;
}

function pgRenderTeamPanel({ pg, side, title, inner }) {
  const t = pg.teams[side];
  return `
    <div class="panel-styled" style="box-shadow: 5px 5px 0 ${t.colors.secondary}; border: 1px solid #333;">
      <div style="font-family:'Russo One',sans-serif; font-size:1.4rem; color:${t.colors.primary}; text-transform:uppercase; line-height:1;">${t.name}</div>
      <div class="small" style="color:#555; margin-top:0.2rem;">${title}</div>
      <div style="margin-top:0.75rem;">${inner}</div>
    </div>
  `;
}

function pgRenderMvpPanel({ pg, d, side }) {
  const t = pg.teams[side];
  const roster = d[side].roster || [];
  const nominees = Array.isArray(t.mvp?.nominees) ? t.mvp.nominees : [];
  const roll = t.mvp?.rollD6 ?? '';
  const winnerIdx = pgComputeMvpWinnerRosterIdx(side);
  const winnerName = (winnerIdx == null) ? '—' : `#${roster[winnerIdx]?.number} ${roster[winnerIdx]?.name}`;

  const options = roster.map((p, i) => {
    const disabled = p.isStar ? 'disabled' : '';
    const checked = nominees.includes(i) ? 'checked' : '';
    return `
      <label style="display:flex; align-items:center; gap:0.5rem; padding:0.25rem 0;">
        <input type="checkbox" ${checked} ${disabled} onchange="window.pgToggleMvpNominee('${side}', ${i})">
        <span class="small">${p.isStar ? '(Star) ' : ''}#${p.number} ${p.name}</span>
      </label>
    `;
  }).join('');

  return pgRenderTeamPanel({
    pg,
    side,
    title: `Nominate 6 • Roll D6`,
    inner: `
      <div class="form-field">
        <label>D6 Roll</label>
        <div class="dice-input">
          <input type="number" min="1" max="6" value="${roll}" onchange="window.pgSetMvpRoll('${side}', this.value)">
          <button type="button" class="dice-btn" title="Roll D6" aria-label="Roll D6" onclick="window.rollDiceIntoInput(this, 6)">🎲</button>
        </div>
      </div>
      <div class="small" style="margin-top:0.5rem; color:#666;">Selected: ${nominees.length}/6 • Winner: <strong>${winnerName}</strong></div>
      <div class="panel-styled" style="margin-top:0.75rem; max-height:220px; overflow:auto;">${options}</div>
    `
  });
}

function pgRenderAdvEntry({ pg, side, rosterIdx, adv, advIdx, base, cost }) {
  const kindLabel = adv.kind === 'randomPrimary' ? 'Random Primary'
    : adv.kind === 'chosenPrimary' ? 'Chosen Primary'
      : adv.kind === 'chosenSecondary' ? 'Chosen Secondary'
        : 'Characteristic';

  const def = pgFindSkillDef(adv.skillName);
  const eliteTag = (!!def?.isElite && adv.skillName) ? `<span class="tag" style="background:#fff3cd; color:#664d03; margin-left:0.25rem;">ELITE +10k</span>` : '';

  const isSecondary = adv.kind === 'chosenSecondary' || adv.skillFrom === 'secondary';
  const allowedCodes = isSecondary ? (base?.secondary || []) : (base?.primary || []);
  const catOpts = (allowedCodes || []).map(c => `<option value="${c}" ${String(adv.categoryCode || '') === String(c) ? 'selected' : ''}>${c}</option>`).join('');

  let inner = '';
  if (adv.kind === 'characteristic') {
    const roll = adv.rollD8 ?? '';
    const options = pgCharacteristicOptionsFromD8(roll);
    const chooseSkill = adv.outcomeType === 'skill';
    const stat = String(adv.statKey || '');
    const statOpts = options.map(s => `<option value="${s}" ${stat === s ? 'selected' : ''}>${s.toUpperCase()}</option>`).join('');
    const skillFrom = adv.skillFrom || 'primary';
    const allowedForFallback = (skillFrom === 'secondary') ? (base?.secondary || []) : (base?.primary || []);
    const fallbackCatOpts = (allowedForFallback || []).map(c => `<option value="${c}" ${String(adv.categoryCode || '') === String(c) ? 'selected' : ''}>${c}</option>`).join('');

    inner = `
      <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:0.5rem;">
        <div class="form-field">
          <label>D8 Roll</label>
          <div class="dice-input">
            <input type="number" min="1" max="8" value="${roll}" onchange="window.pgUpdateAdvancement('${side}', ${rosterIdx}, ${advIdx}, 'rollD8', (this.value===''?null:parseInt(this.value)))">
            <button type="button" class="dice-btn" title="Roll D8" aria-label="Roll D8" onclick="window.rollDiceIntoInput(this, 8)">🎲</button>
          </div>
        </div>
        <div class="form-field">
          <label>Take</label>
          <select onchange="window.pgUpdateAdvancement('${side}', ${rosterIdx}, ${advIdx}, 'outcomeType', this.value)">
            <option value="stat" ${chooseSkill ? '' : 'selected'}>Characteristic</option>
            <option value="skill" ${chooseSkill ? 'selected' : ''}>Skill instead</option>
          </select>
        </div>
      </div>
      ${chooseSkill ? `
        <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:0.5rem; margin-top:0.5rem;">
          <div class="form-field">
            <label>Skill From</label>
            <select onchange="window.pgUpdateAdvancement('${side}', ${rosterIdx}, ${advIdx}, 'skillFrom', this.value)">
              <option value="primary" ${skillFrom === 'primary' ? 'selected' : ''}>Primary</option>
              <option value="secondary" ${skillFrom === 'secondary' ? 'selected' : ''}>Secondary</option>
            </select>
          </div>
          <div class="form-field">
            <label>Category</label>
            <select onchange="window.pgUpdateAdvancement('${side}', ${rosterIdx}, ${advIdx}, 'categoryCode', this.value)">${fallbackCatOpts}</select>
          </div>
        </div>
        <div class="form-field" style="margin-top:0.5rem;">
          <label>Skill</label>
          <input list="skillList" value="${String(adv.skillName || '')}" onchange="window.pgUpdateAdvancement('${side}', ${rosterIdx}, ${advIdx}, 'skillName', this.value)">
        </div>
      ` : `
        <div class="form-field" style="margin-top:0.5rem;">
          <label>Characteristic (${options.map(o => o.toUpperCase()).join('/') || '—'})</label>
          <select onchange="window.pgUpdateAdvancement('${side}', ${rosterIdx}, ${advIdx}, 'statKey', this.value)">
            <option value="">Select…</option>
            ${statOpts}
          </select>
        </div>
      `}
    `;
  } else {
    const categoryCode = String(adv.categoryCode || '');
    const catName = SKILL_CAT_BY_CODE[categoryCode] || '';
    inner = `
      <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:0.5rem;">
        <div class="form-field">
          <label>Category</label>
          <select onchange="window.pgUpdateAdvancement('${side}', ${rosterIdx}, ${advIdx}, 'categoryCode', this.value)">${catOpts}</select>
        </div>
        <div class="form-field">
          <label>Skill (${catName || '—'})</label>
          <input list="skillList" value="${String(adv.skillName || '')}" onchange="window.pgUpdateAdvancement('${side}', ${rosterIdx}, ${advIdx}, 'skillName', this.value)">
        </div>
      </div>
      ${adv.kind === 'randomPrimary' ? `<div class="small" style="margin-top:0.4rem; color:#666;">Random Primary: roll 2D6 twice on the Skill Table and pick one (enter chosen skill).</div>` : ''}
    `;
  }

  return `
    <div class="panel-styled" style="margin-top:0.5rem; padding:0.75rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
        <div style="font-weight:900; color:#333;">${kindLabel} <span class="small" style="color:#666;">(${Number(cost) || 0} SPP)</span>${eliteTag}</div>
        <button class="secondary-btn" onclick="window.pgRemoveAdvancement('${side}', ${rosterIdx}, ${advIdx})">Remove</button>
      </div>
      <div style="margin-top:0.5rem;">${inner}</div>
    </div>
  `;
}

function pgRenderPlayerCard({ pg, d, side, rosterIdx }) {
  const r = d?.[side]?.roster?.[rosterIdx];
  if (!r) return '';
  const key = pgGetPlayerKey(side, rosterIdx);
  const base = key ? pg.players?.[key] : null;
  const isStar = !!r.isStar;
  const isJourneyman = !!r.isJourneyman;

  const baseSpp = Number(base?.baseSpp || 0);
  const gain = pgComputeSppGain(side, rosterIdx);
  const spend = (key && !isStar) ? pgComputeSppSpend(key) : 0;
  const finalSpp = baseSpp + gain - spend;

  const tags = [
    isStar ? `<span class="tag" style="background:#f8d7da; color:#842029;">STAR</span>` : '',
    isJourneyman ? `<span class="tag" style="background:#e2e3e5; color:#41464b;">JOURNEYMAN</span>` : '',
    (pgComputeMvpWinnerRosterIdx(side) === rosterIdx) ? `<span class="tag" style="background:#d1e7dd; color:#0f5132;">MVP</span>` : ''
  ].filter(Boolean).join(' ');

  const skills = (base?.baseSkills || r.skills || []).filter(Boolean);
  const skillTags = skills.length
    ? skills.map(s => `<span class="skill-tag" onclick='event.stopPropagation(); window.showSkill(${JSON.stringify(String(s))})'>${s}</span>`).join(' ')
    : `<span class="small" style="color:#777; font-style:italic;">No skills</span>`;

  const advs = (key && !isStar) ? pgGetAdvListForPlayerKey(key) : [];
  const costs = (key && !isStar) ? pgComputeAdvCostsSpp(key) : [];

  const addBtns = isStar ? '' : `
    <div style="display:flex; flex-wrap:wrap; gap:0.4rem; margin-top:0.5rem;">
      <button onclick="window.pgAddAdvancement('${side}', ${rosterIdx}, 'randomPrimary')">+ Random Primary</button>
      <button onclick="window.pgAddAdvancement('${side}', ${rosterIdx}, 'chosenPrimary')">+ Chosen Primary</button>
      <button onclick="window.pgAddAdvancement('${side}', ${rosterIdx}, 'chosenSecondary')">+ Chosen Secondary</button>
      <button onclick="window.pgAddAdvancement('${side}', ${rosterIdx}, 'characteristic')">+ Characteristic</button>
    </div>
  `;

  return `
    <div class="panel-styled pg-player-card" style="margin-bottom:0.75rem;">
      <div class="pg-player-header">
        <div class="pg-player-left">
          <div class="pg-player-name">#${r.number} ${r.name}</div>
          <div class="small pg-player-pos">${r.position}</div>
          <div class="pg-player-tags">${tags}</div>
        </div>
        <div class="pg-player-right">
          <div class="small">SPP</div>
          <div class="pg-player-spp">${baseSpp} + ${gain} - ${spend} = ${finalSpp}</div>
        </div>
      </div>

      <div class="pg-stat-grid">
        <div class="stat-box"><span class="stat-label">TD</span><span class="stat-value">${r.live?.td || 0}</span><div class="pg-stat-buttons"><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${rosterIdx}, 'td', -1)">-</button><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${rosterIdx}, 'td', 1)">+</button></div></div>
        <div class="stat-box"><span class="stat-label">CAS*</span><span class="stat-value">${r.live?.cas || 0}</span><div class="pg-stat-buttons"><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${rosterIdx}, 'cas', -1)">-</button><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${rosterIdx}, 'cas', 1)">+</button></div></div>
        <div class="stat-box"><span class="stat-label">INT</span><span class="stat-value">${r.live?.int || 0}</span><div class="pg-stat-buttons"><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${rosterIdx}, 'int', -1)">-</button><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${rosterIdx}, 'int', 1)">+</button></div></div>
        <div class="stat-box"><span class="stat-label">COMP</span><span class="stat-value">${r.live?.comp || 0}</span><div class="pg-stat-buttons"><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${rosterIdx}, 'comp', -1)">-</button><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${rosterIdx}, 'comp', 1)">+</button></div></div>
        <div class="stat-box"><span class="stat-label">TTM T</span><span class="stat-value">${r.live?.ttmThrow || 0}</span><div class="pg-stat-buttons"><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${rosterIdx}, 'ttmThrow', -1)">-</button><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${rosterIdx}, 'ttmThrow', 1)">+</button></div></div>
        <div class="stat-box"><span class="stat-label">TTM L</span><span class="stat-value">${r.live?.ttmLand || 0}</span><div class="pg-stat-buttons"><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${rosterIdx}, 'ttmLand', -1)">-</button><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${rosterIdx}, 'ttmLand', 1)">+</button></div></div>
      </div>
      <div class="small" style="margin-top:0.35rem; color:#666;">* CAS should count only SPP-eligible casualties.</div>

      <div style="margin-top:0.5rem;">${skillTags}</div>
      ${addBtns}
      ${(advs || []).map((adv, advIdx) => pgRenderAdvEntry({ pg, side, rosterIdx, adv, advIdx, base, cost: costs[advIdx] })).join('')}
    </div>
  `;
}

function pgRenderInjuriesList({ pg, d }) {
  if (!pg.injuries || pg.injuries.length === 0) return `<div class="small" style="color:#666;">No injuries marked in match.</div>`;
  return pg.injuries.map((inj, i) => {
    const r = d?.[inj.side]?.roster?.[inj.rosterIdx];
    if (!r) return '';
    const t = pg.teams[inj.side];
    const isLasting = String(inj.outcome || '').startsWith('-');
    return `
      <div class="panel-styled" style="margin-bottom:0.5rem; display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
        <span class="tag" style="background:${t.colors.primary}; color:${getContrastColor(t.colors.primary)};">${t.name}</span>
        <strong>#${r.number} ${r.name}</strong>
        <select onchange="window.pgSetInjuryOutcome(${i}, this.value)">
          <option value="bh" ${inj.outcome === 'bh' ? 'selected' : ''}>Badly Hurt (Recover)</option>
          <option value="mng" ${inj.outcome === 'mng' ? 'selected' : ''}>Miss Next Game</option>
          <option value="-ma" ${inj.outcome === '-ma' ? 'selected' : ''}>-1 MA</option>
          <option value="-st" ${inj.outcome === '-st' ? 'selected' : ''}>-1 ST</option>
          <option value="-ag" ${inj.outcome === '-ag' ? 'selected' : ''}>-1 AG</option>
          <option value="-pa" ${inj.outcome === '-pa' ? 'selected' : ''}>-1 PA</option>
          <option value="-av" ${inj.outcome === '-av' ? 'selected' : ''}>-1 AV</option>
          <option value="dead" ${inj.outcome === 'dead' ? 'selected' : ''} style="color:red; font-weight:bold;">DEAD</option>
        </select>
        <label class="small" style="display:flex; align-items:center; gap:0.35rem; margin-left:auto;">
          <input type="checkbox" ${inj.tempRetire ? 'checked' : ''} ${isLasting ? '' : 'disabled'} onchange="window.pgToggleTempRetire(${i}, this.checked)">
          Temporarily Retire (TR)
        </label>
      </div>
    `;
  }).join('');
}

function pgRenderJourneymenList({ pg, d, side }) {
  const roster = d?.[side]?.roster || [];
  const cards = roster
    .map((p, idx) => ({ p, idx }))
    .filter(x => x.p.isJourneyman)
    .map(({ p, idx }) => {
      const key = pgGetPlayerKey(side, idx);
      const hire = pg.hireByPlayer?.[key] || { hire: false, name: p.name || '', number: p.number || '' };
      return `
        <div class="panel-styled" style="margin-bottom:0.5rem;">
          <label style="display:flex; align-items:center; gap:0.5rem;">
            <input type="checkbox" ${hire.hire ? 'checked' : ''} onchange="window.pgToggleHireJourneyman('${side}', ${idx}, this.checked)">
            <strong>#${p.number} ${p.name}</strong> <span class="small" style="color:#666;">(${p.position})</span>
          </label>
          ${hire.hire ? `
            <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:0.5rem; margin-top:0.5rem;">
              <div class="form-field">
                <label>Name</label>
                <input value="${String(hire.name || '')}" onchange="window.pgSetHireJourneymanField('${side}', ${idx}, 'name', this.value)">
              </div>
              <div class="form-field">
                <label>Number</label>
                <input type="number" value="${String(hire.number || '')}" onchange="window.pgSetHireJourneymanField('${side}', ${idx}, 'number', parseInt(this.value))">
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

  if (!cards) return `<div class="small" style="color:#666;">No journeymen played for this team.</div>`;
  return cards;
}

function pgRenderStaffPanel({ pg, side }) {
  const t = pg.teams[side];
  const base = t.staffBase;
  const desired = t.staffDesired;
  const staffCosts = state.gameData?.staffCosts || { assistantCoach: 10000, cheerleader: 10000, apothecary: 50000 };
  const coachDelta = (Number(desired.assistantCoaches || 0) - Number(base.assistantCoaches || 0)) * (Number(staffCosts.assistantCoach) || 0);
  const cheerDelta = (Number(desired.cheerleaders || 0) - Number(base.cheerleaders || 0)) * (Number(staffCosts.cheerleader) || 0);
  const apoDelta = ((!!desired.apothecary) === (!!base.apothecary)) ? 0 : ((!!desired.apothecary) ? Number(staffCosts.apothecary) || 0 : -(Number(staffCosts.apothecary) || 0));
  const race = state.gameData?.races?.find(r => r.name === base.race);
  const rrCost = Number(race?.rerollCost || 50000);
  const rrDelta = Math.max(0, Number(desired.addRerolls || 0)) * rrCost * 2;
  const totalSpend = coachDelta + cheerDelta + apoDelta + rrDelta;
  const treasuryAfter = pgComputeTreasuryBeforeExpensiveMistakesGp(side);

  return pgRenderTeamPanel({
    pg,
    side,
    title: `Treasury tracking`,
    inner: `
      <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:0.75rem;">
        <div class="form-field">
          <label>Assistant Coaches</label>
          <input type="number" min="0" value="${desired.assistantCoaches}" onchange="window.pgSetStaffField('${side}', 'assistantCoaches', this.value)">
          <div class="small" style="color:#666;">Was ${base.assistantCoaches}</div>
        </div>
        <div class="form-field">
          <label>Cheerleaders</label>
          <input type="number" min="0" value="${desired.cheerleaders}" onchange="window.pgSetStaffField('${side}', 'cheerleaders', this.value)">
          <div class="small" style="color:#666;">Was ${base.cheerleaders}</div>
        </div>
        <div class="form-field">
          <label>Apothecary</label>
          <select onchange="window.pgSetStaffField('${side}', 'apothecary', this.value==='true')">
            <option value="false" ${desired.apothecary ? '' : 'selected'}>No</option>
            <option value="true" ${desired.apothecary ? 'selected' : ''}>Yes</option>
          </select>
          <div class="small" style="color:#666;">Was ${base.apothecary ? 'Yes' : 'No'}</div>
        </div>
        <div class="form-field">
          <label>Add Team Re-rolls <span class="small" style="color:#666;">(double cost)</span></label>
          <input type="number" min="0" value="${desired.addRerolls}" onchange="window.pgSetStaffField('${side}', 'addRerolls', this.value)">
          <div class="small" style="color:#666;">Reroll cost: ${Math.round(rrCost / 1000)}k</div>
        </div>
      </div>
      <div class="form-field" style="margin-top:0.75rem;">
        <label>Other treasury adjustments (k) <span class="small" style="color:#666;">(negative = spend)</span></label>
        <input type="number" value="${Math.round(Number(t.otherTreasuryDeltaGp || 0) / 1000)}" onchange="window.pgSetOtherTreasuryDeltaK('${side}', this.value)">
      </div>
      <div style="margin-top:0.5rem; font-weight:900; color:#222;">Treasury before Expensive Mistakes: ${Math.round(treasuryAfter / 1000)}k</div>
      <div class="small" style="color:#666;">Staff/RR delta spend: ${Math.round(totalSpend / 1000)}k (positive = spend)</div>
    `
  });
}

function pgBuildPostGameHtml({ pg, d, step, totalSteps }) {
  let html = pgRenderBanner({ pg, d });

  if (step === 1) {
    html += pgRenderStepLabel({ step, totalSteps, title: 'Record outcome & collect winnings' });
    html += `<div class="small" style="color:#666; margin-bottom:0.75rem;">Winnings = ((Fan Attendance/2) + TD + (no stalling? +1)) x 10,000gp. Fan Attendance = both teams' Dedicated Fans.</div>`;

    const renderWinningsPanel = (side) => {
      const t = pg.teams[side];
      const opp = pg.teams[side === 'home' ? 'away' : 'home'];
      const myTd = Number(d[side].score || 0);
      const fa = Number(t.dedicatedFansBefore || 1) + Number(opp.dedicatedFansBefore || 1);
      const autoK = Math.round((Number(t.winningsGpAuto || 0)) / 1000);
      const finalK = Math.round(pgGetTeamWinningsGp(side) / 1000);
      const overrideK = (t.winningsGpOverride == null) ? '' : Math.round(Number(t.winningsGpOverride || 0) / 1000);
      return pgRenderTeamPanel({
        pg,
        side,
        title: `${t.result.toUpperCase()} - TD ${myTd} - Fan Attendance ${fa}`,
        inner: `
          <div class="form-field">
            <label><input type="checkbox" ${t.noStallingBonus ? 'checked' : ''} onchange="window.pgSetNoStalling('${side}', this.checked)"> No stalling (+1)</label>
          </div>
          <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:0.75rem; margin-top:0.5rem;">
            <div class="form-field">
              <label>Auto Winnings</label>
              <div style="font-weight:900; font-size:1.1rem;">${autoK}k</div>
            </div>
            <div class="form-field">
              <label>Override (k) <span class="small" style="color:#666;">(blank = auto)</span></label>
              <input type="number" value="${overrideK}" onchange="window.pgSetWinningsOverrideK('${side}', this.value)">
            </div>
          </div>
          <div style="margin-top:0.5rem; font-weight:900;">Final Winnings: ${finalK}k</div>
        `
      });
    };

    html += `<div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1rem;">${renderWinningsPanel('home')}${renderWinningsPanel('away')}</div>`;
    return html;
  }

  if (step === 2) {
    html += pgRenderStepLabel({ step, totalSteps, title: 'Update Dedicated Fans' });
    html += `<div class="small" style="color:#666; margin-bottom:0.75rem;">Win: roll D6; if roll >= DF then DF+1. Loss: roll D6; if roll < DF then DF-1. Draw: no change (DF stays 1-7).</div>`;

    const renderDfPanel = (side) => {
      const t = pg.teams[side];
      const rollEnabled = t.result !== 'draw';
      const deltaAuto = computeBb2025DedicatedFansDelta({ result: t.result, dedicatedFans: t.dedicatedFansBefore, rollD6: t.dedicatedFansRollD6 });
      const deltaFinal = pgGetTeamDedicatedFansDelta(side);
      const newDf = Math.max(1, Math.min(7, Number(t.dedicatedFansBefore || 1) + deltaFinal));
      return pgRenderTeamPanel({
        pg,
        side,
        title: `Result: ${t.result.toUpperCase()} • DF ${t.dedicatedFansBefore}`,
        inner: `
          <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:0.75rem;">
            <div class="form-field">
              <label>D6 Roll</label>
              <div class="dice-input">
                <input type="number" min="1" max="6" value="${t.dedicatedFansRollD6 ?? ''}" ${rollEnabled ? '' : 'disabled'} onchange="window.pgSetDedicatedFansRoll('${side}', this.value)">
                <button type="button" class="dice-btn" title="Roll D6" aria-label="Roll D6" ${rollEnabled ? '' : 'disabled'} onclick="window.rollDiceIntoInput(this, 6)">🎲</button>
              </div>
              ${!rollEnabled ? '<div class="small" style="color:#777;">Draw: no roll needed.</div>' : ''}
            </div>
            <div class="form-field">
              <label>Override ΔDF <span class="small" style="color:#666;">(blank = auto)</span></label>
              <select onchange="window.pgSetDedicatedFansDeltaOverride('${side}', this.value)">
                <option value="" ${(t.dedicatedFansDeltaOverride == null || t.dedicatedFansDeltaOverride === '') ? 'selected' : ''}>Auto (${deltaAuto >= 0 ? '+' : ''}${deltaAuto})</option>
                <option value="1" ${Number(t.dedicatedFansDeltaOverride) === 1 ? 'selected' : ''}>+1</option>
                <option value="0" ${Number(t.dedicatedFansDeltaOverride) === 0 ? 'selected' : ''}>0</option>
                <option value="-1" ${Number(t.dedicatedFansDeltaOverride) === -1 ? 'selected' : ''}>-1</option>
              </select>
            </div>
          </div>
          <div style="margin-top:0.5rem; font-weight:900;">New Dedicated Fans: ${newDf}</div>
        `
      });
    };

    html += `<div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1rem;">${renderDfPanel('home')}${renderDfPanel('away')}</div>`;
    return html;
  }

  if (step === 3) {
    html += pgRenderStepLabel({ step, totalSteps, title: 'Player advancement (SPP, MVP, spending)' });
    html += `<div class="small" style="color:#666; margin-bottom:0.75rem;">MVP: nominate 6 players, roll D6 to select one (1-6). Stars don't earn SPP; Journeymen do.</div>`;
    html += `<div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1rem;">${pgRenderMvpPanel({ pg, d, side: 'home' })}${pgRenderMvpPanel({ pg, d, side: 'away' })}</div>`;
    html += `
      <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap:1rem; margin-top:1rem;">
        <div>
          <div style="font-family:'Russo One',sans-serif; color:${pg.teams.home.colors.primary}; text-transform:uppercase; margin:0.25rem 0;">${d.home.name} Players</div>
          ${(d.home.roster || []).map((_, i) => pgRenderPlayerCard({ pg, d, side: 'home', rosterIdx: i })).join('')}
        </div>
        <div>
          <div style="font-family:'Russo One',sans-serif; color:${pg.teams.away.colors.primary}; text-transform:uppercase; margin:0.25rem 0;">${d.away.name} Players</div>
          ${(d.away.roster || []).map((_, i) => pgRenderPlayerCard({ pg, d, side: 'away', rosterIdx: i })).join('')}
        </div>
      </div>
    `;
    return html;
  }

  if (step === 4) {
    html += pgRenderStepLabel({ step, totalSteps, title: 'Hiring, firing & temporarily retiring' });
    html += `
      <div style="display:grid; grid-template-columns: 1fr; gap:1rem;">
        <div>
          <div class="small" style="color:#666; margin-bottom:0.5rem;">Mark lasting injuries and optionally set Temporarily Retiring (TR) for season-long recovery.</div>
          ${pgRenderInjuriesList({ pg, d })}
        </div>
        <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1rem;">
          <div>
            <div style="font-family:'Russo One',sans-serif; color:${pg.teams.home.colors.primary}; text-transform:uppercase; margin-bottom:0.35rem;">${d.home.name} Journeymen</div>
            ${pgRenderJourneymenList({ pg, d, side: 'home' })}
          </div>
          <div>
            <div style="font-family:'Russo One',sans-serif; color:${pg.teams.away.colors.primary}; text-transform:uppercase; margin-bottom:0.35rem;">${d.away.name} Journeymen</div>
            ${pgRenderJourneymenList({ pg, d, side: 'away' })}
          </div>
        </div>
        <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1rem;">
          ${pgRenderStaffPanel({ pg, side: 'home' })}
          ${pgRenderStaffPanel({ pg, side: 'away' })}
        </div>
      </div>
    `;
    return html;
  }

  if (step === 5) {
    html += pgRenderStepLabel({ step, totalSteps, title: 'Expensive mistakes' });
    html += `<div class="small" style="color:#666; margin-bottom:0.75rem;">If treasury >= 100k at this step, roll D6 and apply the Expensive Mistakes table.</div>`;

    const renderEM = (side) => {
      const t = pg.teams[side];
      const treasury = pgComputeTreasuryBeforeExpensiveMistakesGp(side);
      const required = treasury >= 100000;
      const roll = t.expensive?.rollD6 ?? '';
      const kind = pgComputeExpensiveMistakeType(treasury, t.expensive?.rollD6);
      const { deltaGp, needs } = pgComputeExpensiveMistakesDeltaGp({
        treasuryGp: treasury,
        rollD6: t.expensive?.rollD6,
        rollD3: t.expensive?.rollD3,
        roll2d6Total: t.expensive?.roll2d6Total
      });
      const after = treasury + deltaGp;

      return pgRenderTeamPanel({
        pg,
        side,
        title: `Treasury ${Math.round(treasury / 1000)}k`,
        inner: required ? `
          <div class="form-field">
            <label>D6 Roll</label>
            <div class="dice-input">
              <input type="number" min="1" max="6" value="${roll}" onchange="window.pgSetExpensiveField('${side}', 'rollD6', this.value)">
              <button type="button" class="dice-btn" title="Roll D6" aria-label="Roll D6" onclick="window.rollDiceIntoInput(this, 6)">🎲</button>
            </div>
          </div>
          <div style="margin-top:0.5rem; font-weight:900;">Result: ${kind || '—'}</div>
          ${kind === 'Minor Incident' ? `
            <div class="form-field" style="margin-top:0.5rem;">
              <label>D3 Roll (1-3)</label>
              <div class="dice-input">
                <input type="number" min="1" max="3" value="${t.expensive?.rollD3 ?? ''}" onchange="window.pgSetExpensiveField('${side}', 'rollD3', this.value)">
                <button type="button" class="dice-btn" title="Roll D3" aria-label="Roll D3" onclick="window.rollDiceIntoInput(this, 3)">🎲</button>
              </div>
            </div>
          ` : ''}
          ${kind === 'Catastrophe' ? `
            <div class="form-field" style="margin-top:0.5rem;">
              <label>2D6 Total (2-12)</label>
              <div class="dice-input">
                <input type="number" min="2" max="12" value="${t.expensive?.roll2d6Total ?? ''}" onchange="window.pgSetExpensiveField('${side}', 'roll2d6Total', this.value)">
                <button type="button" class="dice-btn" title="Roll 2D6 total" aria-label="Roll 2D6 total" onclick="window.rollDiceIntoInput(this, 6, 2)">🎲</button>
              </div>
            </div>
          ` : ''}
          ${(needs && kind) ? `<div class="small" style="color:#b02a37; margin-top:0.5rem;">Needs: ${needs === 'd3' ? 'D3 roll' : '2D6 total'}.</div>` : ''}
          <div style="margin-top:0.5rem; font-weight:900;">Treasury after: ${Math.round(after / 1000)}k</div>
        ` : `<div class="small" style="color:#666;">Treasury under 100k: no Expensive Mistakes roll required.</div>`
      });
    };

    html += `<div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1rem;">${renderEM('home')}${renderEM('away')}</div>`;
    return html;
  }

  html += pgRenderStepLabel({ step, totalSteps, title: 'Prepare for next fixture (review & commit)' });

  const warnings = pgValidate();

  const renderSideSummary = (side) => {
    const t = pg.teams[side];
    const winningsK = Math.round(pgGetTeamWinningsGp(side) / 1000);
    const dfDelta = pgGetTeamDedicatedFansDelta(side);
    const dfAfter = Math.max(1, Math.min(7, Number(t.dedicatedFansBefore || 1) + dfDelta));

    const beforeEM = pgComputeTreasuryBeforeExpensiveMistakesGp(side);
    const em = pgComputeExpensiveMistakesDeltaGp({
      treasuryGp: beforeEM,
      rollD6: t.expensive?.rollD6,
      rollD3: t.expensive?.rollD3,
      roll2d6Total: t.expensive?.roll2d6Total
    });
    const afterEM = beforeEM + Number(em.deltaGp || 0);

    const mvpIdx = pgComputeMvpWinnerRosterIdx(side);
    const mvpName = (mvpIdx == null) ? 'None' : (d[side].roster?.[mvpIdx]?.name || 'None');

    const totalSppSpent = (d[side].roster || []).reduce((sum, p, i) => {
      const key = pgGetPlayerKey(side, i);
      if (!key) return sum;
      return sum + (p.isStar ? 0 : pgComputeSppSpend(key));
    }, 0);

    return pgRenderTeamPanel({
      pg,
      side,
      title: `Review`,
      inner: `
        <div><strong>MVP:</strong> ${mvpName}</div>
        <div><strong>Winnings:</strong> ${winningsK}k</div>
        <div><strong>Dedicated Fans:</strong> ${t.dedicatedFansBefore} → ${dfAfter} (${dfDelta >= 0 ? '+' : ''}${dfDelta})</div>
        <div style="margin-top:0.5rem;"><strong>Treasury before Expensive Mistakes:</strong> ${Math.round(beforeEM / 1000)}k</div>
        <div><strong>Expensive Mistakes:</strong> ${em.kind || (beforeEM >= 100000 ? '—' : 'Not required')}</div>
        <div><strong>Treasury after Expensive Mistakes:</strong> ${Math.round(afterEM / 1000)}k</div>
        <div style="margin-top:0.5rem;"><strong>Total SPP spent:</strong> ${totalSppSpent}</div>
      `
    });
  };

  html += `<div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1rem;">${renderSideSummary('home')}${renderSideSummary('away')}</div>`;

  html += warnings.length
    ? `<div class="panel-styled" style="margin-top:1rem; border:1px solid #b02a37;">
        <div style="font-weight:900; color:#b02a37; margin-bottom:0.5rem;">Warnings (warn-and-allow)</div>
        <ul style="margin:0; padding-left:1.2rem;">${warnings.map(w => `<li class="small">${w}</li>`).join('')}</ul>
      </div>`
    : `<div class="panel-styled" style="margin-top:1rem; border:1px solid #2a7f2a;">
        <div style="font-weight:900; color:#2a7f2a;">No warnings detected.</div>
      </div>`;

  html += `<div class="small" style="margin-top:0.75rem; color:#666;">Click <strong>Commit & Finish</strong> to apply results to team files and save the match report.</div>`;
  return html;
}

export async function openPostGameModal() {
  if (state.activeMatchPollInterval) {
    clearInterval(state.activeMatchPollInterval);
    state.activeMatchPollInterval = null;
  }
  const d = state.activeMatchData;
  if (!d) return;

  const [homeT, awayT] = await Promise.all([
    apiGet(PATHS.team(d.leagueId, d.home.id)),
    apiGet(PATHS.team(d.leagueId, d.away.id))
  ]);
  if (!homeT || !awayT) throw new Error("Could not load team files for post-game.");

  const initTeamState = (side, teamFile, oppFile) => {
    const result = pgGetResultForSide(side);
    const myTd = Number(d[side].score || 0);
    const winningsGpAuto = computeBb2025WinningsGp({
      myTouchdowns: myTd,
      myDedicatedFans: teamFile.dedicatedFans || 1,
      oppDedicatedFans: oppFile.dedicatedFans || 1,
      noStallingBonus: true
    });
    return {
      teamId: teamFile.id,
      name: teamFile.name,
      colors: d[side].colors || teamFile.colors || { primary: '#222', secondary: '#c5a059' },
      race: teamFile.race,
      result,
      dedicatedFansBefore: teamFile.dedicatedFans || 1,
      treasuryBeforeGp: teamFile.treasury || 0,
      noStallingBonus: true,
      winningsGpAuto,
      winningsGpOverride: null,
      dedicatedFansRollD6: null,
      dedicatedFansDeltaOverride: null,
      mvp: { nominees: [], rollD6: null },
      staffBase: {
        assistantCoaches: teamFile.assistantCoaches || 0,
        cheerleaders: teamFile.cheerleaders || 0,
        apothecary: !!teamFile.apothecary,
        rerolls: teamFile.rerolls || 0,
        race: teamFile.race
      },
      staffDesired: {
        assistantCoaches: teamFile.assistantCoaches || 0,
        cheerleaders: teamFile.cheerleaders || 0,
        apothecary: !!teamFile.apothecary,
        addRerolls: 0
      },
      otherTreasuryDeltaGp: 0,
      expensive: { rollD6: null, rollD3: null, roll2d6Total: null }
    };
  };

  const players = {};
  const initPlayers = (side, teamFile) => {
    (d[side].roster || []).forEach((r, rosterIdx) => {
      const key = pgGetPlayerKey(side, rosterIdx);
      if (!key) return;
      const basePlayer = r.playerId ? (teamFile.players || []).find(p => p.id === r.playerId) : null;
      players[key] = {
        key,
        side,
        rosterIdx,
        playerId: r.playerId || null,
        isStar: !!r.isStar,
        isJourneyman: !!r.isJourneyman,
        baseSpp: Number(basePlayer?.spp || 0),
        advancementCount: getAdvancementCount(basePlayer),
        baseSkills: Array.isArray(basePlayer?.skills) ? [...basePlayer.skills] : (Array.isArray(r.skills) ? [...r.skills] : []),
        baseCost: Number(basePlayer?.cost ?? r.cost ?? 0),
        ma: basePlayer?.ma ?? r.ma,
        st: basePlayer?.st ?? r.st,
        ag: basePlayer?.ag ?? r.ag,
        pa: basePlayer?.pa ?? r.pa,
        av: basePlayer?.av ?? r.av,
        primary: (basePlayer?.primary ?? r.primary ?? []),
        secondary: (basePlayer?.secondary ?? r.secondary ?? [])
      };
    });
  };

  initPlayers('home', homeT);
  initPlayers('away', awayT);

  const injuries = [];
  const addInjuries = (side) => {
    (d[side].roster || []).forEach((p, idx) => {
      if (p.live?.injured) injuries.push({ side, rosterIdx: idx, outcome: 'bh', tempRetire: false });
    });
  };
  addInjuries('home');
  addInjuries('away');

  const hireByPlayer = {};
  const initHires = (side) => {
    (d[side].roster || []).forEach((p, idx) => {
      if (!p.isJourneyman) return;
      const key = pgGetPlayerKey(side, idx);
      if (!key) return;
      hireByPlayer[key] = { hire: false, name: p.name || `Journeyman ${idx + 1}`, number: p.number || '', position: p.position };
    });
  };
  initHires('home');
  initHires('away');

  state.postGame = {
    step: 1,
    teamFiles: { home: homeT, away: awayT },
    teams: {
      home: initTeamState('home', homeT, awayT),
      away: initTeamState('away', awayT, homeT)
    },
    players,
    advByPlayer: {},
    injuries,
    hireByPlayer
  };

  renderPostGameStep();
  els.postGame.el.classList.remove('hidden');
}

export function closePostGameModal() {
    els.postGame.el.classList.add('hidden');
    state.postGame = null;
}

export function manualAdjustStat(side, playerIdx, stat, delta) {
    const d = state.activeMatchData;
    const p = d[side].roster[playerIdx];
    if (!p || !p.live) return;
    const newVal = (p.live[stat] || 0) + delta;
    if (newVal >= 0) {
        p.live[stat] = newVal;
        renderPostGameStep(); 
    }
}

export function postGameRerender() {
  renderPostGameStep();
}

export function pgSetNoStalling(side, checked) {
  const pg = state.postGame;
  const t = pg?.teams?.[side];
  if (!t) return;
  t.noStallingBonus = !!checked;
  const opp = pg.teams?.[side === 'home' ? 'away' : 'home'];
  const d = state.activeMatchData;
  const myTd = Number(d?.[side]?.score || 0);
  t.winningsGpAuto = computeBb2025WinningsGp({
    myTouchdowns: myTd,
    myDedicatedFans: t.dedicatedFansBefore,
    oppDedicatedFans: opp?.dedicatedFansBefore || 1,
    noStallingBonus: t.noStallingBonus
  });
  renderPostGameStep();
}

export function pgSetWinningsOverrideK(side, valueK) {
  const pg = state.postGame;
  const t = pg?.teams?.[side];
  if (!t) return;
  const v = String(valueK ?? '').trim();
  if (v === '') t.winningsGpOverride = null;
  else t.winningsGpOverride = (Number(v) || 0) * 1000;
  renderPostGameStep();
}

export function pgSetDedicatedFansRoll(side, roll) {
  const pg = state.postGame;
  const t = pg?.teams?.[side];
  if (!t) return;
  t.dedicatedFansRollD6 = (roll === '' ? null : Number(roll));
  renderPostGameStep();
}

export function pgSetDedicatedFansDeltaOverride(side, delta) {
  const pg = state.postGame;
  const t = pg?.teams?.[side];
  if (!t) return;
  t.dedicatedFansDeltaOverride = (delta === '' ? null : Number(delta));
  renderPostGameStep();
}

export function pgToggleMvpNominee(side, rosterIdx) {
  const pg = state.postGame;
  const t = pg?.teams?.[side];
  if (!t) return;
  const r = pgGetRosterPlayer(side, rosterIdx);
  if (!r || r.isStar) return;
  t.mvp.nominees = Array.isArray(t.mvp.nominees) ? t.mvp.nominees : [];
  const idx = t.mvp.nominees.indexOf(rosterIdx);
  if (idx >= 0) t.mvp.nominees.splice(idx, 1);
  else t.mvp.nominees.push(rosterIdx);
  renderPostGameStep();
}

export function pgSetMvpRoll(side, roll) {
  const pg = state.postGame;
  const t = pg?.teams?.[side];
  if (!t) return;
  t.mvp.rollD6 = (roll === '' ? null : Number(roll));
  renderPostGameStep();
}

export function pgAddAdvancement(side, rosterIdx, kind) {
  const key = pgGetPlayerKey(side, rosterIdx);
  if (!key) return;
  const base = state.postGame?.players?.[key];
  if (!base || base.isStar) return;
  const list = pgGetAdvListForPlayerKey(key);
  const isSecondary = kind === 'chosenSecondary';
  const allowed = isSecondary ? (base.secondary || []) : (base.primary || []);
  const defaultCat = Array.isArray(allowed) && allowed.length ? allowed[0] : '';
  const adv = { kind, categoryCode: defaultCat, skillName: '', rollD8: null, statKey: '', outcomeType: (kind === 'characteristic' ? 'stat' : 'skill'), skillFrom: isSecondary ? 'secondary' : 'primary' };
  list.push(adv);
  renderPostGameStep();
}

export function pgRemoveAdvancement(side, rosterIdx, advIdx) {
  const key = pgGetPlayerKey(side, rosterIdx);
  if (!key) return;
  const list = pgGetAdvListForPlayerKey(key);
  if (advIdx < 0 || advIdx >= list.length) return;
  list.splice(advIdx, 1);
  renderPostGameStep();
}

export function pgUpdateAdvancement(side, rosterIdx, advIdx, field, value) {
  const key = pgGetPlayerKey(side, rosterIdx);
  if (!key) return;
  const list = pgGetAdvListForPlayerKey(key);
  const adv = list[advIdx];
  if (!adv) return;
  adv[field] = value;
  renderPostGameStep();
}

export function pgSetInjuryOutcome(injuryIdx, outcome) {
  const pg = state.postGame;
  if (!pg?.injuries?.[injuryIdx]) return;
  pg.injuries[injuryIdx].outcome = outcome;
  renderPostGameStep();
}

export function pgToggleTempRetire(injuryIdx, checked) {
  const pg = state.postGame;
  if (!pg?.injuries?.[injuryIdx]) return;
  pg.injuries[injuryIdx].tempRetire = !!checked;
  renderPostGameStep();
}

export function pgSetStaffField(side, field, value) {
  const pg = state.postGame;
  const t = pg?.teams?.[side];
  if (!t?.staffDesired) return;
  if (field === 'apothecary') t.staffDesired.apothecary = !!value;
  else t.staffDesired[field] = Number(value) || 0;
  renderPostGameStep();
}

export function pgSetOtherTreasuryDeltaK(side, valueK) {
  const pg = state.postGame;
  const t = pg?.teams?.[side];
  if (!t) return;
  const v = String(valueK ?? '').trim();
  t.otherTreasuryDeltaGp = (v === '' ? 0 : (Number(v) || 0) * 1000);
  renderPostGameStep();
}

export function pgToggleHireJourneyman(side, rosterIdx, checked) {
  const pg = state.postGame;
  const key = pgGetPlayerKey(side, rosterIdx);
  if (!key) return;
  pg.hireByPlayer = pg.hireByPlayer || {};
  pg.hireByPlayer[key] = pg.hireByPlayer[key] || {};
  pg.hireByPlayer[key].hire = !!checked;
  renderPostGameStep();
}

export function pgSetHireJourneymanField(side, rosterIdx, field, value) {
  const pg = state.postGame;
  const key = pgGetPlayerKey(side, rosterIdx);
  if (!key) return;
  pg.hireByPlayer = pg.hireByPlayer || {};
  pg.hireByPlayer[key] = pg.hireByPlayer[key] || {};
  pg.hireByPlayer[key][field] = value;
  renderPostGameStep();
}

export function pgSetExpensiveField(side, field, value) {
  const pg = state.postGame;
  const t = pg?.teams?.[side];
  if (!t) return;
  t.expensive = t.expensive || {};
  t.expensive[field] = (value === '' ? null : Number(value));
  renderPostGameStep();
}

function renderPostGameStepLegacy() {
    const pg = state.postGame;
    const d = state.activeMatchData;
    const body = els.postGame.body;
    const headerEl = els.postGame.el.querySelector('.modal-header');
    headerEl.innerHTML = `<h3>Post-Game Report</h3><button class="close-btn" onclick="window.closePostGameModal()">×</button>`;
    let html = '';
    if (pg.step === 1) { 
        const renderTeamRecord = (side, winningsKey, fansKey) => {
            const team = d[side];
            const winnings = pg[winningsKey];
            return `
            <div class="panel-styled" style="box-shadow: 6px 6px 0 ${team.colors.secondary}; border: 1px solid #333; margin-bottom: 1rem;">
                <div style="font-family: 'Russo One', sans-serif; font-size: 1.6rem; color: ${team.colors.primary}; text-transform: uppercase; margin-bottom: 0.5rem; line-height:1;">${team.name}</div>
                <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:0.5rem;">
                    <label style="font-weight:bold; color:#444;">Winnings (k)</label>
                    <input type="number" value="${winnings}" style="width: 100%; padding: 8px; font-weight:bold; box-sizing:border-box;" onchange="state.postGame.${winningsKey}=parseInt(this.value)">
                </div>
                <div style="display:flex; flex-direction:column; gap:0.5rem;">
                    <label style="font-weight:bold; color:#444;">Fan Factor</label>
                    <select style="width: 100%; padding: 8px; box-sizing:border-box;" onchange="state.postGame.${fansKey}=parseInt(this.value)">
                        <option value="0">Same</option>
                        <option value="1">+1</option>
                        <option value="-1">-1</option>
                    </select>
                </div>
            </div>`;
        };
        html = `<h4>Step 1: Match Records</h4><div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem;">${renderTeamRecord('home', 'homeWinnings', 'homeFans')}${renderTeamRecord('away', 'awayWinnings', 'awayFans')}</div>`;
    } else if (pg.step === 2) {
        const renderMvpSelect = (side) => {
            const team = d[side];
            const opts = team.roster.map((p, i) => `<option value="${i}">#${p.number} ${p.name}</option>`).join('');
            const shadow = team.colors.secondary;
            return `<div class="panel-styled" style="box-shadow: 4px 4px 0 ${shadow};"><h5 class="big-team-text" style="font-size:1.2rem; color:${team.colors.primary}; text-shadow:1px 1px 0 #fff;">${team.name} MVP</h5><div style="display: flex; flex-direction: column; gap: 0.5rem;"><select id="mvpSelect${side}" style="width: 100%; box-sizing: border-box; padding: 8px;" onchange="state.postGame.${side}Mvp=parseInt(this.value)"><option value="">Select MVP...</option>${opts}</select><button onclick="window.randomMvp('${side}')" style="width: 100%;">Randomize</button></div></div>`;
        };
        html = `<h4>Step 2: Accolades (MVP)</h4><div class="form-grid">${renderMvpSelect('home')}${renderMvpSelect('away')}</div>`;
    } else if (pg.step === 3) { 
        if (pg.injuries.length === 0) {
            html = `<h4>Step 3: Casualty Ward</h4><p>No injuries reported. Lucky day!</p>`;
        } else {
            html = `<h4>Step 3: Casualty Ward</h4>`;
            pg.injuries.forEach((p, i) => {
                const teamName = d[p.side].name;
                const teamColor = d[p.side].colors.primary;
                const badgeHtml = `<span style="background:${teamColor}; color:#fff; font-size:0.7rem; padding:2px 4px; border-radius:3px; margin-right:5px; vertical-align:middle;">${teamName.substring(0,3).toUpperCase()}</span>`;
                html += `<div class="panel-styled" style="margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;"><div>${badgeHtml} <strong>${p.name}</strong></div><select onchange="state.postGame.injuries[${i}].outcome=this.value"><option value="bh">Badly Hurt (Recover)</option><option value="mng">Miss Next Game</option><option value="-ma">-1 MA</option><option value="-st">-1 ST</option><option value="-ag">-1 AG</option><option value="-pa">-1 PA</option><option value="-av">-1 AV</option><option value="dead" style="color:red; font-weight:bold;">DEAD</option></select></div>`;
            });
        }
    } else if (pg.step === 4) { 
        html = `<h4>Step 4: Stat Corrections</h4><div class="form-grid" style="grid-template-columns: 1fr 1fr; gap:1rem; max-height:400px; overflow-y:auto;">`;
        ['home', 'away'].forEach(side => {
            html += `<div><h5 style="text-align:center; border-bottom:2px solid #ccc; padding-bottom:5px;">${d[side].name}</h5>`;
            d[side].roster.forEach((p, idx) => {
                if (p.position === 'Star Player') return; 
                html += `<div class="stat-adjust-card"><div style="font-weight:bold; font-size:0.8rem; width:80px;">#${p.number} ${p.name.split(' ')[0]}</div><div class="stat-adjust-row"><div class="stat-control"><span class="stat-adjust-label">TD</span><div><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${idx}, 'td', -1)">-</button> <b>${p.live.td}</b> <button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${idx}, 'td', 1)">+</button></div></div><div class="stat-control"><span class="stat-adjust-label">CAS</span><div><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${idx}, 'cas', -1)">-</button> <b>${p.live.cas}</b> <button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${idx}, 'cas', 1)">+</button></div></div><div class="stat-control"><span class="stat-adjust-label">INT</span><div><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${idx}, 'int', -1)">-</button> <b>${p.live.int}</b> <button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${idx}, 'int', 1)">+</button></div></div><div class="stat-control"><span class="stat-adjust-label">CMP</span><div><button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${idx}, 'comp', -1)">-</button> <b>${p.live.comp}</b> <button class="stat-btn-small" onclick="window.manualAdjustStat('${side}', ${idx}, 'comp', 1)">+</button></div></div><div class="stat-control"><span class="stat-adjust-label">MVP</span><div style="font-size:0.7rem;">${(pg[`${side}Mvp`] === idx) ? '🏆' : '-'}</div></div></div></div>`;
            });
            html += `</div>`;
        });
        html += `</div>`;
    } else if (pg.step === 5) { 
        html = `<h4>Step 5: Confirm & Save</h4><p>Review the SPP gains before committing.</p><div style="max-height:300px; overflow-y:auto;">`;
        ['home', 'away'].forEach(side => {
            const team = d[side];
            const mvpIdx = pg[`${side}Mvp`];
            const gainers = team.roster.map((p, i) => {
                const isMvp = (i === mvpIdx);
                const spp = (p.live.td * 3) + (p.live.cas * 2) + (p.live.int * 2) + (p.live.comp * 1) + (isMvp ? 4 : 0);
                return { ...p, sppGain: spp, isMvp };
            }).filter(p => p.sppGain > 0);
            html += `<div class="panel-styled"><h5>${team.name} (+${pg[`${side}Winnings`]}k)</h5>`;
            if (gainers.length === 0) html += `<div style="font-style:italic; color:#777;">No SPP gained.</div>`;
            else {
                html += `<table style="font-size:0.85rem;">`;
                gainers.forEach(g => {
                    const details = [];
                    if(g.live.td) details.push(`${g.live.td} TD`);
                    if(g.live.cas) details.push(`${g.live.cas} CAS`);
                    if(g.live.int) details.push(`${g.live.int} INT`);
                    if(g.live.comp) details.push(`${g.live.comp} COMP`);
                    if(g.isMvp) details.push(`MVP`);
                    html += `<tr><td>#${g.number} ${g.name}</td><td style="text-align:right;"><strong>+${g.sppGain} SPP</strong></td><td style="font-size:0.75rem; color:#666; text-align:right;">(${details.join(', ')})</td></tr>`;
                });
                html += `</table>`;
            }
            html += `</div>`;
        });
        html += `</div>`;
    }

    body.innerHTML = html;
    els.postGame.backBtn.style.display = (pg.step === 1) ? 'none' : 'inline-block';
    els.postGame.nextBtn.textContent = (pg.step === 5) ? 'Commit & Finish' : 'Next';
    
    const newNext = els.postGame.nextBtn.cloneNode(true);
    const newBack = els.postGame.backBtn.cloneNode(true);
    els.postGame.nextBtn.parentNode.replaceChild(newNext, els.postGame.nextBtn);
    els.postGame.backBtn.parentNode.replaceChild(newBack, els.postGame.backBtn);
    els.postGame.nextBtn = newNext;
    els.postGame.backBtn = newBack;
    
    els.postGame.nextBtn.onclick = () => {
        if (pg.step < 5) { state.postGame.step++; renderPostGameStep(); scrollModalBodyTop(els.postGame.el); }
        else { commitPostGame(); }
    };
    els.postGame.backBtn.onclick = () => {
        if (pg.step > 1) { state.postGame.step--; renderPostGameStep(); scrollModalBodyTop(els.postGame.el); }
    };
}

export function renderPostGameStep() {
  const pg = state.postGame;
  const d = state.activeMatchData;
  if (!pg || !d) return;

  const body = els.postGame.body;
  const headerEl = els.postGame.el.querySelector('.modal-header');
  headerEl.innerHTML = `<h3>Post-Game Sequence</h3><button class="close-btn" onclick="window.closePostGameModal()">×</button>`;

  const step = Number(pg.step || 1);
  const totalSteps = 6;

  body.innerHTML = pgBuildPostGameHtml({ pg, d, step, totalSteps });

  els.postGame.backBtn.style.display = (step === 1) ? 'none' : 'inline-block';
  els.postGame.nextBtn.textContent = (step === totalSteps) ? 'Commit & Finish' : 'Next';

  const newNext = els.postGame.nextBtn.cloneNode(true);
  const newBack = els.postGame.backBtn.cloneNode(true);
  els.postGame.nextBtn.parentNode.replaceChild(newNext, els.postGame.nextBtn);
  els.postGame.backBtn.parentNode.replaceChild(newBack, els.postGame.backBtn);
  els.postGame.nextBtn = newNext;
  els.postGame.backBtn = newBack;

  els.postGame.nextBtn.onclick = () => {
    if (step < totalSteps) { state.postGame.step++; renderPostGameStep(); scrollModalBodyTop(els.postGame.el); }
    else { commitPostGame(); }
  };
  els.postGame.backBtn.onclick = () => {
    if (step > 1) { state.postGame.step--; renderPostGameStep(); scrollModalBodyTop(els.postGame.el); }
  };
}

export function randomMvp(side) {
    const roster = state.activeMatchData[side].roster;
    const eligible = roster.map((p,i) => i).filter(i => roster[i].position !== 'Star Player'); 
    if(eligible.length === 0) return;
    const winnerIdx = eligible[randomIntInclusive(0, eligible.length - 1)];
    state.postGame[`${side}Mvp`] = winnerIdx;
    document.getElementById(`mvpSelect${side}`).value = winnerIdx;
}

export async function commitPostGame() {
  const key = els.inputs.editKey.value;
  const pg = state.postGame;
  const d = state.activeMatchData;
  if (!key) return setStatus('Edit key required', 'error');
  if (!pg || !d) return setStatus('Missing post-game context.', 'error');

  setStatus('Committing results...');
  try {
    const warnings = pgValidate();
    if (warnings.length) {
      const ok = await confirmModal(
        'Proceed with warnings?',
        `<div style="margin-bottom:0.75rem;">The following items may violate rules or data constraints:</div><ul style="margin:0; padding-left:1.2rem;">${warnings.map(w => `<li>${w}</li>`).join('')}</ul><div style="margin-top:0.75rem;">Proceed anyway?</div>`,
        'Proceed',
        true,
        true
      );
      if (!ok) return;
    }

    const homeT = await apiGet(PATHS.team(d.leagueId, d.home.id));
    const awayT = await apiGet(PATHS.team(d.leagueId, d.away.id));
    const league = await apiGet(PATHS.league(d.leagueId));
    if (!homeT || !awayT || !league) throw new Error('Could not load league/team files.');
    const leagueMatch = (league.matches || []).find(x => x.id === d.matchId) || null;
    const currentSeason = Number(league.season || 1);
    const matchSeason = (leagueMatch?.season == null) ? currentSeason : Number(leagueMatch.season);
    const matchType = String(leagueMatch?.type || 'regular');

    const processTeamUpdates = (team, matchSide, opponentName, myScore, oppScore) => {
      const sideState = pg.teams[matchSide];
      const roster = d[matchSide].roster || [];
      const mvpRosterIdx = pgComputeMvpWinnerRosterIdx(matchSide);

      // Prepare for next fixture: clear previous MNG (served this match)
      (team.players || []).forEach(p => { if (p.mng) p.mng = false; });

      // Step 1: Winnings
      const winningsGp = pgGetTeamWinningsGp(matchSide);
      team.treasury = (team.treasury || 0) + winningsGp;

      // Step 2: Dedicated Fans
      const dfDelta = pgGetTeamDedicatedFansDelta(matchSide);
      team.dedicatedFans = Math.max(1, Math.min(7, (team.dedicatedFans || 1) + dfDelta));

      // Step 3: Apply SPP gains + player records
      const playerRecords = [];
      roster.forEach((matchP, rosterIdx) => {
        const sppGain = pgComputeSppGain(matchSide, rosterIdx);
        if (!matchP.isStar && matchP.playerId) {
          const tp = (team.players || []).find(p => p.id === matchP.playerId);
          if (tp) tp.spp = (tp.spp || 0) + sppGain;
        }
        playerRecords.push({
          playerId: matchP.playerId || null,
          name: matchP.name,
          number: matchP.number,
          position: matchP.position,
          isJourneyman: !!matchP.isJourneyman,
          isStar: !!matchP.isStar,
          sppGain,
          stats: { ...(matchP.live || {}) },
          isMvp: mvpRosterIdx === rosterIdx
        });
      });

      // Step 3: Spend SPP / apply advancements to rostered players
      roster.forEach((matchP, rosterIdx) => {
        if (!matchP.playerId || matchP.isStar) return;
        const tp = (team.players || []).find(p => p.id === matchP.playerId);
        if (!tp) return;
        const key = pgGetPlayerKey(matchSide, rosterIdx);
        if (!key) return;
        const advs = pgGetAdvListForPlayerKey(key);
        const costs = pgComputeAdvCostsSpp(key);

        tp.advancements = Array.isArray(tp.advancements) ? tp.advancements : [];
        tp.sppSpent = Number(tp.sppSpent || 0);

        advs.forEach((adv, i) => {
          const costSpp = Number(costs[i] || 0);
          tp.spp = (tp.spp || 0) - costSpp;
          tp.sppSpent += costSpp;

          if (adv.kind === 'characteristic' && adv.outcomeType === 'skill') {
            const def = pgFindSkillDef(adv.skillName);
            const { player, valueIncreaseGp } = applyBb2025SkillAdvancement(tp, { skillName: adv.skillName, isSecondary: adv.skillFrom === 'secondary', isEliteSkill: !!def?.isElite });
            Object.assign(tp, player);
            tp.advancements.push({ id: ulid(), matchId: d.matchId, kind: adv.kind, outcomeType: 'skill', skillName: adv.skillName, categoryCode: adv.categoryCode, skillFrom: adv.skillFrom, isElite: !!def?.isElite, sppCost: costSpp, valueIncreaseGp, at: new Date().toISOString() });
          } else if (adv.kind === 'characteristic') {
            const { player, valueIncreaseGp } = applyBb2025CharacteristicIncrease(tp, adv.statKey);
            Object.assign(tp, player);
            tp.advancements.push({ id: ulid(), matchId: d.matchId, kind: adv.kind, outcomeType: 'stat', statKey: adv.statKey, rollD8: adv.rollD8 ?? null, sppCost: costSpp, valueIncreaseGp, at: new Date().toISOString() });
          } else {
            const def = pgFindSkillDef(adv.skillName);
            const isSecondary = adv.kind === 'chosenSecondary';
            const { player, valueIncreaseGp } = applyBb2025SkillAdvancement(tp, { skillName: adv.skillName, isSecondary, isEliteSkill: !!def?.isElite });
            Object.assign(tp, player);
            tp.advancements.push({ id: ulid(), matchId: d.matchId, kind: adv.kind, skillName: adv.skillName, categoryCode: adv.categoryCode, isElite: !!def?.isElite, sppCost: costSpp, valueIncreaseGp, at: new Date().toISOString() });
          }
        });
      });

      // Step 4: Injuries + Temporarily Retiring
      (pg.injuries || []).filter(x => x.side === matchSide).forEach(inj => {
        const matchP = roster[inj.rosterIdx];
        if (!matchP?.playerId) return;
        const tp = (team.players || []).find(p => p.id === matchP.playerId);
        if (!tp) return;
        const outcome = String(inj.outcome || '').trim();
        if (outcome === 'dead') tp.dead = true;
        else if (outcome === 'mng') tp.mng = true;
        else if (outcome.startsWith('-')) {
          const stat = outcome.substring(1);
          tp[stat] = (Number(tp[stat]) || 0) - 1;
          tp.injuries = (tp.injuries || '') + outcome + ',';
          if (inj.tempRetire) tp.tr = true;
        }
      });
      team.players = (team.players || []).filter(p => !p.dead);

      // Step 4: Staff/Rerolls + other treasury adjustments
      const desired = sideState.staffDesired;
      const staffCosts = state.gameData?.staffCosts || { assistantCoach: 10000, cheerleader: 10000, apothecary: 50000 };
      const base = sideState.staffBase;
      const coachDelta = (Number(desired.assistantCoaches || 0) - Number(base.assistantCoaches || 0)) * (Number(staffCosts.assistantCoach) || 0);
      const cheerDelta = (Number(desired.cheerleaders || 0) - Number(base.cheerleaders || 0)) * (Number(staffCosts.cheerleader) || 0);
      const apoDelta = ((!!desired.apothecary) === (!!base.apothecary)) ? 0 : ((!!desired.apothecary) ? Number(staffCosts.apothecary) || 0 : -(Number(staffCosts.apothecary) || 0));

      team.assistantCoaches = Number(desired.assistantCoaches || 0);
      team.cheerleaders = Number(desired.cheerleaders || 0);
      team.apothecary = !!desired.apothecary;
      team.treasury = (team.treasury || 0) - coachDelta - cheerDelta - apoDelta;

      const race = state.gameData?.races?.find(r => r.name === base.race);
      const rrCost = Number(race?.rerollCost || 50000);
      const addRr = Math.max(0, Number(desired.addRerolls || 0));
      if (addRr) {
        team.rerolls = Number(team.rerolls || 0) + addRr;
        team.treasury = (team.treasury || 0) - (addRr * rrCost * 2);
      }

      team.treasury = (team.treasury || 0) + Number(sideState.otherTreasuryDeltaGp || 0);

      // Step 4: Hire journeymen (if selected)
      roster.forEach((matchP, rosterIdx) => {
        if (!matchP.isJourneyman) return;
        const key = pgGetPlayerKey(matchSide, rosterIdx);
        const hire = pg.hireByPlayer?.[key];
        if (!hire?.hire) return;

        const baseInfo = pg.players?.[key];
        const baseCost = Number(baseInfo?.baseCost ?? matchP.cost ?? 0);
        const baseSkills = Array.isArray(baseInfo?.baseSkills) ? [...baseInfo.baseSkills] : (Array.isArray(matchP.skills) ? [...matchP.skills] : []);
        const stripped = baseSkills.filter(s => String(s).trim() !== 'Loner (4+)');

        let newPlayer = {
          id: ulid(),
          number: Number(hire.number || matchP.number || 0),
          name: String(hire.name || matchP.name || 'Journeyman'),
          position: matchP.position,
          rookieSeason: matchSeason,
          qty: 16,
          cost: baseCost,
          ma: matchP.ma,
          st: matchP.st,
          ag: matchP.ag,
          pa: matchP.pa,
          av: matchP.av,
          skills: stripped,
          primary: baseInfo?.primary || matchP.primary || ['G'],
          secondary: baseInfo?.secondary || matchP.secondary || [],
          spp: 0
        };

        // Add SPP gained this match
        newPlayer.spp = (newPlayer.spp || 0) + pgComputeSppGain(matchSide, rosterIdx);

        // Apply purchased advancements (and adjust cost)
        const advs = pgGetAdvListForPlayerKey(key);
        const costs = pgComputeAdvCostsSpp(key);
        newPlayer.advancements = [];
        newPlayer.sppSpent = 0;
        advs.forEach((adv, i) => {
          const costSpp = Number(costs[i] || 0);
          newPlayer.spp = (newPlayer.spp || 0) - costSpp;
          newPlayer.sppSpent += costSpp;
          if (adv.kind === 'characteristic' && adv.outcomeType === 'skill') {
            const def = pgFindSkillDef(adv.skillName);
            const { player, valueIncreaseGp } = applyBb2025SkillAdvancement(newPlayer, { skillName: adv.skillName, isSecondary: adv.skillFrom === 'secondary', isEliteSkill: !!def?.isElite });
            newPlayer = player;
            newPlayer.advancements.push({ id: ulid(), matchId: d.matchId, kind: adv.kind, outcomeType: 'skill', skillName: adv.skillName, categoryCode: adv.categoryCode, skillFrom: adv.skillFrom, isElite: !!def?.isElite, sppCost: costSpp, valueIncreaseGp, at: new Date().toISOString() });
          } else if (adv.kind === 'characteristic') {
            const { player, valueIncreaseGp } = applyBb2025CharacteristicIncrease(newPlayer, adv.statKey);
            newPlayer = player;
            newPlayer.advancements.push({ id: ulid(), matchId: d.matchId, kind: adv.kind, outcomeType: 'stat', statKey: adv.statKey, rollD8: adv.rollD8 ?? null, sppCost: costSpp, valueIncreaseGp, at: new Date().toISOString() });
          } else {
            const def = pgFindSkillDef(adv.skillName);
            const isSecondary = adv.kind === 'chosenSecondary';
            const { player, valueIncreaseGp } = applyBb2025SkillAdvancement(newPlayer, { skillName: adv.skillName, isSecondary, isEliteSkill: !!def?.isElite });
            newPlayer = player;
            newPlayer.advancements.push({ id: ulid(), matchId: d.matchId, kind: adv.kind, skillName: adv.skillName, categoryCode: adv.categoryCode, isElite: !!def?.isElite, sppCost: costSpp, valueIncreaseGp, at: new Date().toISOString() });
          }
        });

        team.treasury = (team.treasury || 0) - Number(newPlayer.cost || baseCost);
        team.players = team.players || [];
        team.players.push(newPlayer);
      });

      // Step 5: Expensive Mistakes (after all earnings/spend this step)
      const treasuryBeforeEM = team.treasury || 0;
      const em = pgComputeExpensiveMistakesDeltaGp({
        treasuryGp: treasuryBeforeEM,
        rollD6: sideState.expensive?.rollD6,
        rollD3: sideState.expensive?.rollD3,
        roll2d6Total: sideState.expensive?.roll2d6Total
      });
      team.treasury = (team.treasury || 0) + Number(em.deltaGp || 0);

      // Step 6: Prepare for next fixture
      team.teamValue = calculateTeamValue(team);

      if (!team.history) team.history = [];
      team.history.push({
        season: matchSeason,
        round: d.round,
        matchId: d.matchId,
        matchType,
        opponentName,
        result: myScore > oppScore ? 'Win' : myScore < oppScore ? 'Loss' : 'Draw',
        score: `${myScore}-${oppScore}`,
        winningsK: Math.round(winningsGp / 1000),
        winningsGp,
        dedicatedFansBefore: sideState.dedicatedFansBefore,
        dedicatedFansRollD6: sideState.dedicatedFansRollD6 ?? null,
        dedicatedFansDelta: dfDelta,
        tv: d[matchSide].tv,
        inducements: d[matchSide].inducements,
        playerRecords,
        expensiveMistakes: {
          treasuryBeforeGp: treasuryBeforeEM,
          rollD6: sideState.expensive?.rollD6 ?? null,
          rollD3: sideState.expensive?.rollD3 ?? null,
          roll2d6Total: sideState.expensive?.roll2d6Total ?? null,
          result: em.kind,
          deltaGp: em.deltaGp
        }
      });
    };

    processTeamUpdates(homeT, 'home', d.away.name, d.home.score, d.away.score);
    processTeamUpdates(awayT, 'away', d.home.name, d.away.score, d.home.score);

    await apiSave(PATHS.team(d.leagueId, homeT.id), homeT, `Post-game ${d.matchId} Home`, key);
    await apiSave(PATHS.team(d.leagueId, awayT.id), awayT, `Post-game ${d.matchId} Away`, key);

    const m = league.matches.find(x => x.id === d.matchId);
    if (m) {
      m.status = 'completed';
      m.score = { home: d.home.score, away: d.away.score };
      m.casualties = {
        homeInflicted: d.home.roster.reduce((sum, p) => sum + (p.live?.cas || 0), 0),
        awayInflicted: d.away.roster.reduce((sum, p) => sum + (p.live?.cas || 0), 0)
      };
      m.hasReport = true;
      m.reportId = d.matchId;
    }

    const report = {
      schemaVersion: 2,
      matchId: d.matchId,
      leagueId: d.leagueId,
      round: d.round,
      home: {
        name: d.home.name,
        score: d.home.score,
        tv: d.home.tv,
        inducements: d.home.inducements,
        winnings: Math.round(pgGetTeamWinningsGp('home') / 1000),
        winningsGp: pgGetTeamWinningsGp('home'),
        fanFactorChange: pgGetTeamDedicatedFansDelta('home'),
        dedicatedFansDelta: pgGetTeamDedicatedFansDelta('home'),
        mvp: (() => {
          const idx = pgComputeMvpWinnerRosterIdx('home');
          return (idx == null) ? 'None' : (d.home.roster[idx]?.name || 'None');
        })(),
        stats: d.home.roster
          .map(p => ({ name: p.name, number: p.number, live: p.live }))
          .filter(p => (p.live.td || 0) > 0 || (p.live.cas || 0) > 0 || (p.live.int || 0) > 0 || (p.live.comp || 0) > 0 || (p.live.foul || 0) > 0 || (p.live.ttmThrow || 0) > 0 || (p.live.ttmLand || 0) > 0),
        postGame: pg.teams.home
      },
      away: {
        name: d.away.name,
        score: d.away.score,
        tv: d.away.tv,
        inducements: d.away.inducements,
        winnings: Math.round(pgGetTeamWinningsGp('away') / 1000),
        winningsGp: pgGetTeamWinningsGp('away'),
        fanFactorChange: pgGetTeamDedicatedFansDelta('away'),
        dedicatedFansDelta: pgGetTeamDedicatedFansDelta('away'),
        mvp: (() => {
          const idx = pgComputeMvpWinnerRosterIdx('away');
          return (idx == null) ? 'None' : (d.away.roster[idx]?.name || 'None');
        })(),
        stats: d.away.roster
          .map(p => ({ name: p.name, number: p.number, live: p.live }))
          .filter(p => (p.live.td || 0) > 0 || (p.live.cas || 0) > 0 || (p.live.int || 0) > 0 || (p.live.comp || 0) > 0 || (p.live.foul || 0) > 0 || (p.live.ttmThrow || 0) > 0 || (p.live.ttmLand || 0) > 0),
        postGame: pg.teams.away
      }
    };

    await apiSave(PATHS.match(d.leagueId, d.matchId), report, `Match report ${d.matchId}`, key);
    await apiSave(PATHS.league(d.leagueId), league, `Complete match ${d.matchId}`, key);
    await apiDelete(PATHS.activeMatch(d.matchId), `Cleanup ${d.matchId}`, key);
    els.postGame.el.classList.add('hidden');
    handleOpenLeague(d.leagueId);
    setStatus('Match finalized successfully!', 'ok');
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

export async function handleEndGame() {
  const confirmed = await confirmModal("End Game?", "Proceed to Post-Game Sequence? (MVP, Winnings, etc.)", "Proceed", false);
  if(!confirmed) return;
  try { await openPostGameModal(); }
  catch (e) { setStatus(e.message, 'error'); }
}
