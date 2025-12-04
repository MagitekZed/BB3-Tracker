import { state, els } from './state.js';
import { PATHS } from './config.js';
import { apiGet, apiSave, apiDelete } from './api.js';
import { setStatus, normalizeName, getContrastColor, applyTeamTheme } from './utils.js';
import { calculateTeamValue } from './rules.js';
import { showSection, updateBreadcrumbs, goHome, showSkill } from './ui-core.js';
import { handleOpenLeague, handleManageLeague, renderManageForm } from './ui-league.js';

export async function handleOpenTeam(leagueId, teamId) {
  setStatus(`Loading team ${teamId}...`);
  try {
    const teamData = await apiGet(PATHS.team(leagueId, teamId));
    if (!teamData) throw new Error("Team file not found.");
    state.currentTeam = teamData;
    state.viewTeamId = teamId;
    
    applyTeamTheme(teamData);
    
    const hdrContainer = els.containers.teamViewHeader;
    if(hdrContainer) {
        const prim = teamData.colors?.primary || '#222';
        const text = getContrastColor(prim);
        hdrContainer.className = "team-header-card"; 
        hdrContainer.style.background = prim;
        hdrContainer.style.color = text;
        hdrContainer.innerHTML = `
          <div><h2 style="color:${text}; border:none; margin:0;">${teamData.name}</h2></div>
          <div class="team-header-actions">
             <button onclick="showSection('view')" class="secondary-btn">← Back</button>
             <button onclick="window.handleManageTeamDirect()" class="primary-btn">Manage</button>
          </div>
        `;
    }

    renderTeamView();
    showSection('team');
    updateBreadcrumbs([{ label: 'Leagues', action: goHome }, { label: state.currentLeague.name, action: () => handleOpenLeague(leagueId) }, { label: teamData.name }]);
    setStatus('Team loaded.', 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
}

export async function handleManageTeamDirect() {
  if (!state.currentLeague || !state.currentTeam) return;
  await handleManageLeague(state.currentLeague.id);
  // Set return path to team view
  state.editorReturnPath = 'teamView';
  await handleEditTeam(state.currentTeam.id);
}

export function renderTeamView() {
  const t = state.currentTeam;
  const tv = calculateTeamValue(t);
  
  const staffInfo = `RR: ${t.rerolls||0} | Fan: ${t.dedicatedFans||0} | Apo: ${t.apothecary?'Yes':'No'}`;
  
  els.containers.teamSummary.innerHTML = `
    <div style="display:flex; justify-content:space-between; flex-wrap:wrap; border-bottom:1px solid #ccc; padding-bottom:0.5rem; margin-bottom:0.5rem;">
       <span><strong>Race:</strong> ${t.race}</span>
       <span><strong>Coach:</strong> ${t.coachName}</span>
       <span><strong>TV:</strong> ${(tv/1000)}k</span>
    </div>
    <div class="small" style="color:#666;">${staffInfo}</div>
  `;
  
  const rows = (t.players || []).map(p => {
    const skillsHtml = (p.skills||[]).map(s => 
      `<span class="skill-tag" onclick="window.showSkill('${s}')">${s}</span>`
    ).join(' ');
    const costK = p.cost ? Math.floor(p.cost/1000) + 'k' : '-';
    return `
    <tr>
      <td data-label="#">${p.number||''}</td>
      <td data-label="Name">${p.name}</td>
      <td data-label="Pos">${p.position}</td>
      <td data-label="Cost">${costK}</td>
      <td data-label="MA">${p.ma}</td>
      <td data-label="ST">${p.st}</td>
      <td data-label="AG">${p.ag}</td>
      <td data-label="PA">${p.pa}</td>
      <td data-label="AV">${p.av}</td>
      <td data-label="Skills">${skillsHtml}</td>
      <td data-label="SPP">${p.spp}</td>
    </tr>`;
  }).join('');
  els.containers.teamRoster.innerHTML = `<table class="responsive-table"><thead><tr><th style="width:30px">#</th><th>Name</th><th>Pos</th><th>Cost</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th><th>SPP</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// --- Team Editor ---

export async function handleEditTeam(teamId) {
  state.editMode = 'team';
  state.editTeamId = teamId;
  
  if (teamId) {
    try {
      const t = await apiGet(PATHS.team(state.dirtyLeague.id, teamId));
      state.dirtyTeam = t || createEmptyTeam(teamId);
    } catch(e) { console.error(e); state.dirtyTeam = createEmptyTeam(teamId); }
  } else {
    state.dirtyTeam = createEmptyTeam('');
  }
  renderManageForm(); 
}

function createEmptyTeam(id) {
  const defaultRace = state.gameData?.races?.[0]?.name || 'Human';
  return { 
    id, 
    name: 'New Team', 
    race: defaultRace, 
    coachName: '', 
    players: [], 
    colors: { primary: '#222222', secondary: '#c5a059' },
    treasury: 1000000, rerolls: 0, apothecary: false, assistantCoaches: 0, cheerleaders: 0, dedicatedFans: 1
  };
}

export function updateLiveTV() {
  const tvDisplay = document.getElementById('editorTvDisplay');
  if(tvDisplay && state.dirtyTeam) {
    const val = calculateTeamValue(state.dirtyTeam);
    tvDisplay.textContent = `Calculated TV: ${(val/1000)}k`;
  }
}

export function renderTeamEditor() {
  const t = state.dirtyTeam;
  const raceOpts = (state.gameData?.races || []).map(r => `<option value="${r.name}" ${t.race === r.name ? 'selected' : ''}>${r.name}</option>`).join('');
  const race = state.gameData?.races.find(r => r.name === t.race);
  const rrCost = race ? race.rerollCost : 50000;
  
  els.containers.manageTeamEditor.innerHTML = `
    <h3>${state.editTeamId ? 'Edit Team' : 'Add New Team'}</h3>
    
    <div class="form-grid">
      <div class="form-field"><label>Name</label><input type="text" value="${t.name}" id="teamEditNameInput"></div>
      <div class="form-field"><label>Coach</label><input type="text" value="${t.coachName}" onchange="state.dirtyTeam.coachName = this.value"></div>
      <div class="form-field"><label>Race</label><select onchange="window.changeTeamRace(this.value)">${raceOpts}</select></div>
      <div class="form-field"><label>File ID</label><input type="text" value="${t.id}" readonly class="faded" placeholder="Auto-generated"></div>
    </div>
    
    <div class="form-grid" style="margin-top:1rem; padding:1rem; background:#f4f4f4; border-radius:4px;">
      <div class="form-field"><label>Primary Color</label><input type="color" id="teamColorPrimary" value="${t.colors?.primary || '#222222'}" style="width:100%; height:40px"></div>
      <div class="form-field"><label>Secondary Color</label><input type="color" id="teamColorSecondary" value="${t.colors?.secondary || '#c5a059'}" style="width:100%; height:40px"></div>
    </div>
    
    <div class="card" style="margin-top:1rem;">
      <h4>Team Resources</h4>
      <div class="form-grid">
        <div class="form-field"><label>Treasury</label><input type="number" value="${t.treasury||0}" onchange="state.dirtyTeam.treasury=parseInt(this.value)"></div>
        <div class="form-field"><label>Rerolls (${Math.floor(rrCost/1000)}k)</label><input type="number" value="${t.rerolls||0}" oninput="state.dirtyTeam.rerolls=parseInt(this.value); window.updateLiveTV()"></div>
        <div class="form-field"><label>Fans</label><input type="number" value="${t.dedicatedFans||1}" onchange="state.dirtyTeam.dedicatedFans=parseInt(this.value)"></div>
        <div class="form-field"><label>Asst. Coaches (10k)</label><input type="number" value="${t.assistantCoaches||0}" oninput="state.dirtyTeam.assistantCoaches=parseInt(this.value); window.updateLiveTV()"></div>
        <div class="form-field"><label>Cheerleaders (10k)</label><input type="number" value="${t.cheerleaders||0}" oninput="state.dirtyTeam.cheerleaders=parseInt(this.value); window.updateLiveTV()"></div>
        <div class="form-field"><label>Apothecary (50k)</label><select oninput="state.dirtyTeam.apothecary=(this.value==='true'); window.updateLiveTV()"><option value="false" ${!t.apothecary?'selected':''}>No</option><option value="true" ${t.apothecary?'selected':''}>Yes</option></select></div>
      </div>
      <div id="editorTvDisplay" style="margin-top:0.5rem; font-weight:bold; color:var(--primary-red); font-size:1.1rem;">Calculated TV: ${calculateTeamValue(t)/1000}k</div>
    </div>
    
    <h4>Roster</h4>
    <div class="manager-toolbar">
      <button onclick="window.addSmartPlayer()" class="primary-btn">+ Hire Player</button>
    </div>
    
    <table class="responsive-table roster-editor-table">
      <thead><tr><th style="width:40px">#</th><th>Name</th><th>Position</th><th>Cost</th><th style="width:40px">MA</th><th style="width:40px">ST</th><th style="width:40px">AG</th><th style="width:40px">PA</th><th style="width:40px">AV</th><th>Skills</th><th style="width:50px">SPP</th><th style="width:30px"></th></tr></thead>
      <tbody id="editorRosterBody"></tbody>
    </table>
  `;

  const tbody = document.getElementById('editorRosterBody');
  const currentRaceObj = state.gameData?.races.find(r => r.name === t.race);
  const positionalOptions = (currentRaceObj?.positionals || []).map(pos => `<option value="${pos.name}">${pos.name}</option>`).join('');
  
  let allSkillsHtml = '<option value="">+ Skill...</option>';
  if (state.gameData?.skillCategories) {
    Object.values(state.gameData.skillCategories).flat().forEach(s => {
      const sName = (typeof s === 'object') ? s.name : s;
      allSkillsHtml += `<option value="${sName}">${sName}</option>`;
    });
  }

  t.players.forEach((p, idx) => {
    const posSelect = `<select style="width:100%; font-size:0.8rem;" onchange="window.updatePlayerPos(${idx}, this.value)"><option value="" disabled>Pos...</option>${positionalOptions.replace(`value="${p.position}"`, `value="${p.position}" selected`)}</select>`;
    
    const currentSkills = (p.skills || []).map((skill, sIdx) => `
      <span class="skill-pill">${skill}<span class="remove-skill" onclick="window.removePlayerSkill(${idx}, ${sIdx})">×</span></span>
    `).join('');
    
    const skillPicker = `<div class="skill-editor-container">${currentSkills}<select class="skill-select" onchange="window.addPlayerSkill(${idx}, this.value)">${allSkillsHtml}</select></div>`;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="#"><input type="number" value="${p.number||''}" style="width:30px" onchange="window.updatePlayer(${idx}, 'number', this.value)"></td>
      <td data-label="Name"><input type="text" value="${p.name}" onchange="window.updatePlayer(${idx}, 'name', this.value)"></td>
      <td data-label="Pos">${posSelect}</td>
      <td data-label="Cost"><input type="number" value="${p.cost||0}" style="width:60px" step="5000" oninput="window.updatePlayer(${idx}, 'cost', this.value)"></td>
      <td data-label="MA"><input type="number" value="${p.ma}" style="width:30px" onchange="window.updatePlayer(${idx}, 'ma', this.value)"></td>
      <td data-label="ST"><input type="number" value="${p.st}" style="width:30px" onchange="window.updatePlayer(${idx}, 'st', this.value)"></td>
      <td data-label="AG"><input type="number" value="${p.ag}" style="width:30px" onchange="window.updatePlayer(${idx}, 'ag', this.value)"></td>
      <td data-label="PA"><input type="number" value="${p.pa}" style="width:30px" onchange="window.updatePlayer(${idx}, 'pa', this.value)"></td>
      <td data-label="AV"><input type="number" value="${p.av}" style="width:30px" onchange="window.updatePlayer(${idx}, 'av', this.value)"></td>
      <td data-label="Skills">${skillPicker}</td>
      <td data-label="SPP"><input type="number" value="${p.spp}" style="width:40px" onchange="window.updatePlayer(${idx}, 'spp', this.value)"></td>
      <td data-label="Del"><button onclick="window.removePlayer(${idx})" style="color:red;border:none;background:none;cursor:pointer;font-weight:bold;">×</button></td>
    `;
    tbody.appendChild(row);
  });
  
  const nameInput = document.getElementById('teamEditNameInput');
  nameInput.oninput = function() {
    state.dirtyTeam.name = this.value;
    if (!state.editTeamId) {
      state.dirtyTeam.id = normalizeName(this.value);
      els.containers.manageTeamEditor.querySelector('input[readonly]').value = state.dirtyTeam.id;
    }
  };
}

export function changeTeamRace(newRace) {
  if (state.dirtyTeam.players.length > 0 && !confirm("Changing race will potentially break existing player positions. Continue?")) {
    renderTeamEditor(); return;
  }
  state.dirtyTeam.race = newRace;
  renderTeamEditor();
}

export function updatePlayer(idx, f, v) {
  const p = state.dirtyTeam.players[idx];
  if (['number','ma','st','ag','pa','av','spp','cost'].includes(f)) p[f] = parseInt(v) || 0;
  else p[f] = v;
  if(f === 'cost') updateLiveTV(); 
}

export function updatePlayerPos(idx, v) { 
  const p = state.dirtyTeam.players[idx];
  p.position = v;
  const r = state.gameData.races.find(r=>r.name===state.dirtyTeam.race);
  const pos = r?.positionals.find(x=>x.name===v);
  if(pos) {
      Object.assign(p, {ma:pos.ma, st:pos.st, ag:pos.ag, pa:pos.pa, av:pos.av, cost:pos.cost, skills:[...pos.skills]});
  }
  renderTeamEditor(); 
}

export function addSmartPlayer() { 
  const t = state.dirtyTeam;
  const r = state.gameData.races.find(r=>r.name===t.race);
  const def = r?.positionals[0] || {name:'L',ma:6,st:3,ag:3,pa:4,av:8,cost:50000,skills:[]};
  const nextNum = (t.players.length > 0) ? Math.max(...t.players.map(p => p.number || 0)) + 1 : 1;
  t.players.push({number:nextNum, name:'Player', position:def.name, ...def, skills:[...def.skills], spp:0});
  renderTeamEditor();
}

export function removePlayer(idx) {
  state.dirtyTeam.players.splice(idx,1);
  renderTeamEditor();
}

export function addPlayerSkill(playerIdx, skillName) {
  if (!skillName) return;
  const p = state.dirtyTeam.players[playerIdx];
  if (!p.skills) p.skills = [];
  if (!p.skills.includes(skillName)) p.skills.push(skillName);
  renderTeamEditor();
}

export function removePlayerSkill(playerIdx, skillIdx) {
  state.dirtyTeam.players[playerIdx].skills.splice(skillIdx, 1);
  renderTeamEditor();
}

export async function handleDeleteTeam(teamId) {
  if(!confirm(`Delete team "${teamId}"?`)) return;
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  try {
    await apiDelete(PATHS.team(state.dirtyLeague.id, teamId), `Delete team ${teamId}`, key);
    const idx = state.dirtyLeague.teams.findIndex(t => t.id === teamId);
    if(idx !== -1) state.dirtyLeague.teams.splice(idx, 1);
    await apiSave(PATHS.leagueSettings(state.dirtyLeague.id), state.dirtyLeague, `Remove team ${teamId}`, key);
    // Reuse renderManageTeamsList but we can't import it easily due to circular refs, 
    // so we re-render the form instead.
    renderManageForm(); 
    setStatus('Team deleted.', 'ok');
  } catch(e) { setStatus(`Delete failed: ${e.message}`, 'error'); }
}

export async function saveTeam(key) {
  const t = state.dirtyTeam;
  const l = state.dirtyLeague;
  
  if (!t.id) return setStatus('Invalid team name.', 'error');
  
  // Capture Colors
  const cp = document.getElementById('teamColorPrimary');
  const cs = document.getElementById('teamColorSecondary');
  if(cp && cs) {
      t.colors = { primary: cp.value, secondary: cs.value };
  }
  
  // Save Team File
  t.teamValue = calculateTeamValue(t); 
  await apiSave(PATHS.team(l.id, t.id), t, `Save team ${t.name}`, key);
  
  // Update local league object's team metadata
  const existingIdx = l.teams.findIndex(x => x.id === t.id);
  const meta = JSON.parse(JSON.stringify({ 
    id: t.id, 
    name: t.name, 
    race: t.race, 
    coachName: t.coachName, 
    colors: t.colors 
  }));
  
  if (existingIdx >= 0) l.teams[existingIdx] = meta;
  else l.teams.push(meta);
  
  state.editTeamId = t.id;
  
  await apiSave(PATHS.leagueSettings(l.id), l, `Update team list for ${t.name}`, key);
  
  setStatus('Team saved & League updated!', 'ok');
}
