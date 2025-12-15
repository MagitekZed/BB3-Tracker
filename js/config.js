export const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';

export const PATHS = {
  gameData: 'data/gameData.json',
  leaguesIndex: 'data/leagues/index.json',
  league: (leagueId) => `data/leagues/${leagueId}/league.json`,
  team: (leagueId, teamId) => `data/leagues/${leagueId}/teams/${teamId}.json`,
  match: (leagueId, matchId) => `data/leagues/${leagueId}/matches/${matchId}.json`,
  activeMatch: (matchId) => `data/active_matches/${matchId}.json`
};
