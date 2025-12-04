export const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';

export const PATHS = {
  gameData: 'data/gameData.json',
  leaguesIndex: 'data/leagues/index.json',
  leagueSettings: (id) => `data/leagues/${id}/settings.json`,
  team: (leagueId, teamId) => `data/leagues/${leagueId}/teams/${teamId}.json`,
  activeMatch: (matchId) => `data/active_matches/${matchId}.json`
};
