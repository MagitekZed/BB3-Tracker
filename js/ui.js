// js/ui.js
import { calculateTeamValue, getContrastColor } from './logic.js';

// DOM Cache
export const els = {
  globalStatus: document.getElementById('globalStatus'),
  toastContainer: document.getElementById('toastContainer'),
  // ... (Full list of IDs mapped here would be ideal, but we can access document directly for simplicity in this refactor)
};

export function setStatus(msg, type = 'info') {
  if(!msg) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.getElementById('toastContainer').appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

export function showSection(name) {
  window.scrollTo(0,0);
  const sections = ['leagueListSection', 'leagueViewSection', 'leagueManageSection', 'teamViewSection', 'scoreboardSection', 'coachSection', 'adminSection', 'matchSetupSection'];
  sections.forEach(s => document.getElementById(s).classList.add('hidden'));
  document.getElementById(name + 'Section').classList.remove('hidden'); // Maps 'leagueList' to 'leagueListSection'
}

export function applyTeamTheme(team) {
  const root = document.documentElement;
  if (team && team.colors) {
    root.style.setProperty('--team-primary', team.colors.primary || '#222');
    root.style.setProperty('--team-secondary', team.colors.secondary || '#c5a059');
    root.style.setProperty('--team-text', getContrastColor(team.colors.primary || '#222'));
  } else {
    root.style.setProperty('--team-primary', '#222222');
    root.style.setProperty('--team-secondary', '#c5a059');
    root.style.setProperty('--team-text', '#ffffff');
  }
}

// --- RENDER FUNCTIONS ---

export function renderLeagueList(leagues, onOpen, onManage) {
    const container = document.getElementById('leagueListContainer');
    if (!leagues.length) {
        container.innerHTML = `<div class="panel-styled">No leagues found. Create one to get started.</div>`;
        return;
    }
    container.innerHTML = leagues.map(l => `
      <div class="league-card">
        <div class="league-card-main"><div class="league-card-title">${l.name}</div><div class="league-meta"><span class="tag ${l.status === 'active' ? 'in_progress' : 'scheduled'}">${l.status}</span> Season ${l.season} • ID: ${l.id}</div></div>
        <div><button class="link-button" onclick="window.app.handleOpenLeague('${l.id}')">Open</button> | <button class="link-button" onclick="window.app.handleManageLeague('${l.id}')">Manage</button></div>
      </div>`).join('');
}

export function renderTeamHeader(team) {
    const hdrContainer = document.getElementById('teamViewHeaderContainer');
    if(hdrContainer) {
        const prim = team.colors?.primary || '#222';
        const text = getContrastColor(prim);
        hdrContainer.className = "team-header-card"; 
        hdrContainer.style.background = prim;
        hdrContainer.style.color = text;
        hdrContainer.innerHTML = `
          <div><h2 style="color:${text}; border:none; margin:0;">${team.name}</h2></div>
          <div class="team-header-actions">
             <button onclick="window.app.showSection('view')" class="secondary-btn">← Back</button>
             <button onclick="window.app.handleManageTeamDirect()" class="primary-btn">Manage</button>
          </div>
        `;
    }
}

export function renderTeamRoster(team, gameData) {
    const tv = calculateTeamValue(team, gameData);
    const staffInfo = `RR: ${team.rerolls||0} | Fan: ${team.dedicatedFans||0} | Apo: ${team.apothecary?'Yes':'No'}`;
    
    document.getElementById('teamSummary').innerHTML = `
      <div style="display:flex; justify-content:space-between; flex-wrap:wrap; border-bottom:1px solid #ccc; padding-bottom:0.5rem; margin-bottom:0.5rem;">
         <span><strong>Race:</strong> ${team.race}</span>
         <span><strong>Coach:</strong> ${team.coachName}</span>
         <span><strong>TV:</strong> ${(tv/1000)}k</span>
      </div>
      <div class="small" style="color:#666;">${staffInfo}</div>
    `;
    
    const rows = (team.players || []).map(p => {
      const skillsHtml = (p.skills||[]).map(s => `<span class="skill-tag" onclick="window.app.showSkill('${s}')">${s}</span>`).join(' ');
      const costK = p.cost ? Math.floor(p.cost/1000) + 'k' : '-';
      return `<tr><td data-label="#">${p.number||''}</td><td data-label="Name">${p.name}</td><td data-label="Pos">${p.position}</td><td data-label="Cost">${costK}</td><td data-label="MA">${p.ma}</td><td data-label="ST">${p.st}</td><td data-label="AG">${p.ag}</td><td data-label="PA">${p.pa}</td><td data-label="AV">${p.av}</td><td data-label="Skills">${skillsHtml}</td><td data-label="SPP">${p.spp}</td></tr>`;
    }).join('');
    
    document.getElementById('teamRosterContainer').innerHTML = `<table class="responsive-table"><thead><tr><th style="width:30px">#</th><th>Name</th><th>Pos</th><th>Cost</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th><th>SPP</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderLiveRoster(roster, side, readOnly) {
    return roster.map((p, idx) => {
      const live = p.live || {};
      let badges = '';
      if(live.td > 0) badges += `<span class="stat-badge">TD:${live.td}</span>`;
      if(live.cas > 0) badges += `<span class="stat-badge">CAS:${live.cas}</span>`;
      if(live.int > 0) badges += `<span class="stat-badge">INT:${live.int}</span>`;
      if(live.sentOff) badges += `<span class="stat-badge" style="background:#faa">Off</span>`;
  
      const skillTags = (p.skills || []).map(s => `<span class="skill-tag" onclick="event.stopPropagation(); window.app.showSkill('${s}')">${s}</span>`).join(' ');
  
      if (readOnly) {
          return `<div class="live-player-row ${live.used?'used':''} ${live.injured?'injured':''}"><div class="player-info"><span class="player-name">#${p.number} ${p.name} ${badges}</span><span class="player-pos">${p.position} | ${skillTags}</span></div></div>`;
      }
      return `<div class="live-player-row ${live.used?'used':''} ${live.injured?'injured':''}" onclick="window.app.openPlayerActionSheet(${idx})"><div class="player-info"><span class="player-name">#${p.number} ${p.name} ${badges}</span><span class="player-pos">${p.position} | ${skillTags}</span></div></div>`;
    }).join('');
}
