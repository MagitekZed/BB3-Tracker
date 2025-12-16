import { state } from './state.js';

export function calculateTeamValue(team) {
  if (!team) return 0;
  
  // 1. Sum Player Costs
  const playerCost = (team.players || []).reduce((sum, p) => sum + (parseInt(p.cost) || 0), 0);
  
  // 2. Rerolls
  const race = state.gameData?.races.find(r => r.name === team.race);
  const rerollCost = (team.rerolls || 0) * (race ? race.rerollCost : 50000);
  
  // 3. Sideline Staff
  const staffData = state.gameData?.staffCosts || { assistantCoach: 10000, cheerleader: 10000, apothecary: 50000 };
  const coachesCost = (team.assistantCoaches || 0) * staffData.assistantCoach;
  const cheerCost = (team.cheerleaders || 0) * staffData.cheerleader;
  const apoCost = (team.apothecary ? staffData.apothecary : 0);
  
  // Dedicated Fans are usually NOT part of Team Value for inducements, 
  // but BB2020 rules vary on "Current TV" vs "CTV". 
  // For now, we exclude them from the sum as per standard TV calculation.
  
  return playerCost + rerollCost + coachesCost + cheerCost + apoCost;
}

export function isPlayerAvailableForMatch(player) {
  if (!player) return false;
  if (player.dead) return false;
  if (player.mng) return false;
  if (player.tr) return false;
  return true;
}

export function calculateCurrentTeamValue(team) {
  if (!team) return 0;

  const availablePlayers = (team.players || []).filter(isPlayerAvailableForMatch);
  const playerCost = availablePlayers.reduce((sum, p) => sum + (parseInt(p.cost) || 0), 0);

  const race = state.gameData?.races.find(r => r.name === team.race);
  const rerollCost = (team.rerolls || 0) * (race ? race.rerollCost : 50000);

  const staffData = state.gameData?.staffCosts || { assistantCoach: 10000, cheerleader: 10000, apothecary: 50000 };
  const coachesCost = (team.assistantCoaches || 0) * staffData.assistantCoach;
  const cheerCost = (team.cheerleaders || 0) * staffData.cheerleader;
  const apoCost = (team.apothecary ? staffData.apothecary : 0);

  return playerCost + rerollCost + coachesCost + cheerCost + apoCost;
}

export function computeStandings(league) {
  return computeSeasonStats(league);
}

// ==============================
// BB2025 League Play Helpers
// ==============================

export function computeBb2025WinningsGp({ myTouchdowns = 0, myDedicatedFans = 1, oppDedicatedFans = 1, noStallingBonus = true }) {
  const fanAttendance = (Number(myDedicatedFans) || 0) + (Number(oppDedicatedFans) || 0);
  const base = (fanAttendance / 2) + (Number(myTouchdowns) || 0) + (noStallingBonus ? 1 : 0);
  // Can produce 5,000gp increments when fanAttendance is odd.
  return Math.round(base * 10000);
}

export function computeBb2025DedicatedFansDelta({ result /* 'win'|'loss'|'draw' */, dedicatedFans = 1, rollD6 = null }) {
  const df = Number(dedicatedFans) || 1;
  const roll = (rollD6 == null || rollD6 === '') ? null : Number(rollD6);
  if (result === 'draw') return 0;
  if (!roll || roll < 1 || roll > 6) return 0;
  if (result === 'win') return (roll >= df) ? 1 : 0;
  if (result === 'loss') return (roll < df) ? -1 : 0;
  return 0;
}

export function computeBb2025SppGain({ td = 0, cas = 0, int = 0, comp = 0, ttmThrow = 0, ttmLand = 0, isMvp = false }) {
  return (Number(td) || 0) * 3
    + (Number(cas) || 0) * 2
    + (Number(int) || 0) * 2
    + (Number(comp) || 0) * 1
    + (Number(ttmThrow) || 0) * 1
    + (Number(ttmLand) || 0) * 1
    + (isMvp ? 4 : 0);
}

export function getAdvancementCount(player) {
  return Array.isArray(player?.advancements) ? player.advancements.length : 0;
}

export function getBb2025AdvancementCost(player, kind /* 'randomPrimary'|'chosenPrimary'|'chosenSecondary'|'characteristic' */) {
  const idx = Math.min(getAdvancementCount(player), 5);
  const costs = state.gameData?.advancement?.sppCosts;
  if (!costs) return null;
  const arr = costs[kind];
  if (!Array.isArray(arr)) return null;
  return arr[idx] ?? null;
}

export function getBb2025ValueIncreaseGp({ kind /* 'primarySkill'|'secondarySkill'|'av'|'ma'|'pa'|'ag'|'st' */, isEliteSkill = false }) {
  const vi = state.gameData?.advancement?.valueIncreases;
  if (!vi) return 0;
  const base = Number(vi[kind] || 0);
  const elite = isEliteSkill ? Number(vi.eliteSkillBonus || 0) : 0;
  return base + elite;
}

export function applyBb2025SkillAdvancement(player, { skillName, isSecondary = false, isEliteSkill = false } = {}) {
  const out = { ...(player || {}) };
  out.skills = Array.isArray(out.skills) ? [...out.skills] : [];
  if (skillName) out.skills.push(skillName);

  const delta = getBb2025ValueIncreaseGp({ kind: isSecondary ? 'secondarySkill' : 'primarySkill', isEliteSkill });
  out.cost = (Number(out.cost) || 0) + delta;
  return { player: out, valueIncreaseGp: delta };
}

export function applyBb2025CharacteristicIncrease(player, statKey /* 'ma'|'st'|'ag'|'pa'|'av' */) {
  const out = { ...(player || {}) };
  const key = String(statKey || '').toLowerCase();
  const current = out[key];

  if (current == null) return { player: out, valueIncreaseGp: 0 };

  if (key === 'ag' || key === 'pa') {
    const cur = Number(current);
    if (!Number.isFinite(cur) || cur < 1) return { player: out, valueIncreaseGp: 0 };
    out[key] = Math.max(1, cur - 1);
  } else {
    const cur = Number(current);
    if (!Number.isFinite(cur)) return { player: out, valueIncreaseGp: 0 };
    out[key] = cur + 1;
  }

  const delta = getBb2025ValueIncreaseGp({ kind: key });
  out.cost = (Number(out.cost) || 0) + delta;
  return { player: out, valueIncreaseGp: delta };
}

/**
 * Compute season-level stats for each team in a league.
 * Returns an array sorted for standings and a map for quick lookup.
 */
export function computeSeasonStats(league, season = league?.season) {
  const ptsWin = league.settings?.pointsWin ?? 3;
  const ptsDraw = league.settings?.pointsDraw ?? 1;
  const ptsLoss = league.settings?.pointsLoss ?? 0;

  const base = (t) => ({
    id: t.id,
    name: t.name,
    race: t.race,
    coachName: t.coachName,
    games: 0,
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

  const map = new Map();
  (league.teams || []).forEach(t => map.set(t.id, base(t)));

  (league.matches || [])
    .filter(m => m.status === 'completed')
    // future-friendly: allow match.season override, otherwise assume current season
    .filter(m => !m.season || m.season === season)
    .forEach(m => {
      const h = map.get(m.homeTeamId);
      const a = map.get(m.awayTeamId);
      if (!h || !a) return;

      const hf = m.score?.home || 0;
      const af = m.score?.away || 0;
      const hCas = m.casualties?.homeInflicted || 0;
      const aCas = m.casualties?.awayInflicted || 0;

      h.games++; a.games++;
      h.tdFor += hf; h.tdAgainst += af; h.tdDiff += (hf - af);
      a.tdFor += af; a.tdAgainst += hf; a.tdDiff += (af - hf);
      h.casFor += hCas; h.casAgainst += aCas; h.casDiff += (hCas - aCas);
      a.casFor += aCas; a.casAgainst += hCas; a.casDiff += (aCas - hCas);

      if (hf > af) {
        h.wins++; a.losses++;
        h.points += ptsWin; a.points += ptsLoss;
      } else if (hf < af) {
        a.wins++; h.losses++;
        a.points += ptsWin; h.points += ptsLoss;
      } else {
        h.draws++; a.draws++;
        h.points += ptsDraw; a.points += ptsDraw;
      }
    });

  const list = Array.from(map.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.tdDiff !== a.tdDiff) return b.tdDiff - a.tdDiff;
    return b.casDiff - a.casDiff;
  });

  return list;
}
