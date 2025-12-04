// js/models.js

/**
 * Calculates the total Team Value (TV) based on BB2020 rules.
 */
export function calculateTeamValue(team, gameData) {
  if (!team) return 0;
  
  // 1. Players (Base Cost)
  const playerCost = (team.players || []).reduce((sum, p) => sum + (parseInt(p.cost) || 0), 0);
  
  // 2. Rerolls
  const race = gameData?.races.find(r => r.name === team.race);
  const rerollCost = (team.rerolls || 0) * (race ? race.rerollCost : 50000);
  
  // 3. Sideline Staff
  const staffData = gameData?.staffCosts || { assistantCoach: 10000, cheerleader: 10000, apothecary: 50000 };
  const coachesCost = (team.assistantCoaches || 0) * staffData.assistantCoach;
  const cheerCost = (team.cheerleaders || 0) * staffData.cheerleader;
  const apoCost = (team.apothecary ? staffData.apothecary : 0);
  
  return playerCost + rerollCost + coachesCost + cheerCost + apoCost;
}

/**
 * Generates a fresh Team Object structure.
 */
export function createEmptyTeam(id, race) {
  return { 
    id, 
    name: 'New Team', 
    race: race || 'Human', 
    coachName: '', 
    players: [], 
    colors: { primary: '#222222', secondary: '#c5a059' },
    treasury: 1000000, 
    rerolls: 0, 
    apothecary: false, 
    assistantCoaches: 0, 
    cheerleaders: 0, 
    dedicatedFans: 1
  };
}

/**
 * Determines if text should be white or black based on background hex.
 */
export function getContrastColor(hex) {
  if(!hex) return '#ffffff';
  // Convert hex to RGB
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  // YIQ equation
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#111111' : '#ffffff';
}

/**
 * Sanitizes a string for use as a filename/ID.
 */
export function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Computes W/D/L and Points from raw match history.
 */
export function computeStandings(league) {
  const map = new Map();
  
  // Initialize all teams
  league.teams.forEach(t => map.set(t.id, { ...t, wins:0, draws:0, losses:0, points:0, tdDiff:0, casDiff:0 }));
  
  // Process Matches
  (league.matches||[]).filter(m => m.status === 'completed').forEach(m => {
    const h = map.get(m.homeTeamId);
    const a = map.get(m.awayTeamId);
    if(!h || !a) return;
    
    const hf = m.score?.home || 0;
    const af = m.score?.away || 0;
    const hCas = m.casualties?.homeInflicted || 0;
    const aCas = m.casualties?.awayInflicted || 0;
    
    h.tdDiff += (hf - af);
    a.tdDiff += (af - hf);
    h.casDiff += (hCas - aCas);
    a.casDiff += (aCas - hCas);
    
    if (hf > af) { 
      h.wins++; a.losses++; 
      h.points += (league.settings.pointsWin||3); 
      a.points += (league.settings.pointsLoss||0); 
    } else if (hf < af) { 
      a.wins++; h.losses++; 
      a.points += (league.settings.pointsWin||3); 
      h.points += (league.settings.pointsLoss||0); 
    } else { 
      h.draws++; a.draws++; 
      h.points += (league.settings.pointsDraw||1); 
      a.points += (league.settings.pointsDraw||1); 
    }
  });
  
  return Array.from(map.values()).sort((a,b) => b.points - a.points);
}
