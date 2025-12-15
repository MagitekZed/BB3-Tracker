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

export function computeStandings(league) {
  return computeSeasonStats(league);
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
