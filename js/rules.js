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
  const map = new Map();
  league.teams.forEach(t => map.set(t.id, { ...t, wins:0, draws:0, losses:0, points:0, tdDiff:0, casDiff:0 }));
  
  (league.matches||[]).filter(m => m.status === 'completed').forEach(m => {
    const h = map.get(m.homeTeamId); 
    const a = map.get(m.awayTeamId);
    if(!h || !a) return;
    
    const hf = m.score?.home || 0; 
    const af = m.score?.away || 0;
    const hCas = m.casualties?.homeInflicted || 0; 
    const aCas = m.casualties?.awayInflicted || 0;
    
    h.tdDiff += (hf - af); a.tdDiff += (af - hf);
    h.casDiff += (hCas - aCas); a.casDiff += (aCas - hCas);
    
    const ptsWin = league.settings.pointsWin ?? 3;
    const ptsDraw = league.settings.pointsDraw ?? 1;
    const ptsLoss = league.settings.pointsLoss ?? 0;

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
  
  return Array.from(map.values()).sort((a,b) => b.points - a.points);
}
