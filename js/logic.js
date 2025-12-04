// js/logic.js

export function calculateTeamValue(team, gameData) {
  if (!team) return 0;
  const playerCost = (team.players || []).reduce((sum, p) => sum + (parseInt(p.cost) || 0), 0);
  
  const race = gameData?.races.find(r => r.name === team.race);
  const rerollCost = (team.rerolls || 0) * (race ? race.rerollCost : 50000);
  
  const staffData = gameData?.staffCosts || { assistantCoach: 10000, cheerleader: 10000, apothecary: 50000 };
  const coachesCost = (team.assistantCoaches || 0) * staffData.assistantCoach;
  const cheerCost = (team.cheerleaders || 0) * staffData.cheerleader;
  const apoCost = (team.apothecary ? staffData.apothecary : 0);
  
  return playerCost + rerollCost + coachesCost + cheerCost + apoCost;
}

export function getContrastColor(hex) {
  if(!hex) return '#ffffff';
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#111111' : '#ffffff';
}

export function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

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
