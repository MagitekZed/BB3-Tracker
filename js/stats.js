export function collectSeasonPlayerRows(teamFiles, season, opts = {}) {
  const options = {
    includeStars: false,
    includeJourneymen: false,
    includePlayoffs: false,
    ...opts
  };

  const rows = [];
  for (const [teamId, team] of teamFiles.entries()) {
    const teamName = team?.name || 'Unknown Team';
    const history = (team?.history || [])
      .filter(h => !h.season || h.season === season)
      .filter(h => options.includePlayoffs || String(h.matchType || 'regular') !== 'playoff');
    for (const h of history) {
      for (const pr of (h.playerRecords || [])) {
        if (!pr) continue;
        if (!options.includeStars && pr.isStar) continue;
        if (!options.includeJourneymen && pr.isJourneyman) continue;

        rows.push({
          teamId,
          teamName,
          playerId: pr.playerId,
          name: pr.name || 'Unknown',
          number: pr.number,
          position: pr.position || '',
          isMvp: !!pr.isMvp,
          sppGain: Number(pr.sppGain) || 0,
          td: Number(pr.stats?.td) || 0,
          cas: Number(pr.stats?.cas) || 0,
          int: Number(pr.stats?.int) || 0,
          comp: Number(pr.stats?.comp) || 0,
          foul: Number(pr.stats?.foul) || 0,
          ttmThrow: Number(pr.stats?.ttmThrow) || 0,
          ttmLand: Number(pr.stats?.ttmLand) || 0
        });
      }
    }
  }

  return rows;
}

export function aggregatePlayerStats(playerRows) {
  const map = new Map();
  for (const r of playerRows) {
    const id = r.playerId || `${r.teamName}:${r.name}:${r.number ?? ''}:${r.position ?? ''}`;
    const cur = map.get(id) || {
      playerId: r.playerId,
      name: r.name,
      number: r.number,
      position: r.position,
      teamId: r.teamId,
      teamName: r.teamName,
      games: 0,
      mvp: 0,
      sppGain: 0,
      td: 0,
      cas: 0,
      int: 0,
      comp: 0,
      foul: 0,
      ttmThrow: 0,
      ttmLand: 0
    };

    cur.games += 1;
    cur.mvp += r.isMvp ? 1 : 0;
    cur.sppGain += r.sppGain;
    cur.td += r.td;
    cur.cas += r.cas;
    cur.int += r.int;
    cur.comp += r.comp;
    cur.foul += r.foul;
    cur.ttmThrow += r.ttmThrow;
    cur.ttmLand += r.ttmLand;

    map.set(id, cur);
  }
  return Array.from(map.values());
}
