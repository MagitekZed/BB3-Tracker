import { state, els } from './state.js';
import { PATHS } from './config.js';
import { apiGet, apiSave, apiDelete } from './api.js';
import { setStatus } from './utils.js';
import { goHome, confirmModal } from './ui-core.js';

export async function handleScanRepo() {
  els.containers.scanResults.innerHTML = '<div class="small">Scanning...</div>';
  try {
    const rootContents = await apiGet('data/leagues');
    if (!Array.isArray(rootContents)) throw new Error("Could not list directories.");
    
    const leagueDirs = rootContents.filter(x => x.type === 'dir').map(x => x.name);
    const indexIds = state.leaguesIndex.map(l => l.id);
    let html = '<table style="width:100%; font-size:0.9rem;">';
    let issuesFound = 0;
    
    for (const leagueId of leagueDirs) {
      if (!indexIds.includes(leagueId)) {
        const s = await apiGet(`data/leagues/${leagueId}/settings.json`);
        if (s) {
          issuesFound++;
          html += `<tr style="background:#fff0f0"><td><strong>GHOST</strong>: ${leagueId}</td><td style="text-align:right"><button onclick="window.restoreLeague('${leagueId}')">Restore</button></td></tr>`;
        }
      }
      const teamFiles = await apiGet(`data/leagues/${leagueId}/teams`);
      const s = await apiGet(`data/leagues/${leagueId}/settings.json`);
      if (Array.isArray(teamFiles) && s) {
        const regIds = s.teams.map(t => t.id);
        const orphans = teamFiles.filter(f => f.name.endsWith('.json')).filter(f => !regIds.includes(f.name.replace('.json', '')));
        orphans.forEach(f => {
          issuesFound++;
          html += `<tr><td>Orphan: ${f.name}</td><td><button onclick="window.attachTeam('${leagueId}', '${f.name}')">Attach</button></td></tr>`;
        });
      }
    }
    html += '</table>';
    els.containers.scanResults.innerHTML = (issuesFound === 0) ? '<div class="status ok">Clean.</div>' : html;
  } catch (e) { els.containers.scanResults.innerHTML = `<div class="status error">${e.message}</div>`; }
}

export async function attachTeam(leagueId, filename) {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Key needed', 'error');
  try {
    const tId = filename.replace('.json', '');
    const t = await apiGet(PATHS.team(leagueId, tId));
    const s = await apiGet(PATHS.leagueSettings(leagueId));
    s.teams.push({ id: t.id, name: t.name, race: t.race, coachName: t.coachName });
    await apiSave(PATHS.leagueSettings(leagueId), s, `Attach ${tId}`, key);
    handleScanRepo();
  } catch(e) { alert(e.message); }
}

export async function restoreLeague(leagueId) {
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Key needed', 'error');
  try {
    const s = await apiGet(PATHS.leagueSettings(leagueId));
    const idx = await apiGet(PATHS.leaguesIndex) || [];
    idx.push({ id: s.id, name: s.name, season: s.season, status: s.status });
    await apiSave(PATHS.leaguesIndex, idx, `Restore ${leagueId}`, key);
    state.leaguesIndex = idx;
    goHome();
    handleScanRepo();
  } catch(e) { alert(e.message); }
}

export async function deleteOrphanFile(leagueId, filename) {
  const confirmed = await confirmModal("Delete Orphan File?", `Permanently delete file "${filename}"?`, "Delete", true);
  if(!confirmed) return;
  
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Key needed', 'error');
  try {
    await apiDelete(`data/leagues/${leagueId}/teams/${filename}`, `Clean orphan ${filename}`, key);
    handleScanRepo();
  } catch(e) { alert(e.message); }
}

export async function deleteLeagueFolder(leagueId) {
  const confirmed = await confirmModal("Delete League Folder?", `Permanently delete Settings file for "${leagueId}"?`, "Delete", true);
  if(!confirmed) return;
  
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Key needed', 'error');
  try {
    await apiDelete(PATHS.leagueSettings(leagueId), `Delete ghost league ${leagueId}`, key);
    handleScanRepo();
  } catch(e) { alert(e.message); }
}
