// js/ui.js
import { calculateTeamValue, getContrastColor, computeStandings } from './models.js';

// --- HELPER: Notification Toasts ---
export function showToast(msg, type = 'info') {
  if(!msg) return;
  const container = document.getElementById('toastContainer');
  if(!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  
  // Animate out
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- HELPER: View Navigation ---
export function showSection(sectionId) {
  window.scrollTo(0,0);
  // Hide all sections
  const sections = document.querySelectorAll('main > section');
  sections.forEach(el => el.classList.add('hidden'));
  
  // Show target
  const target = document.getElementById(sectionId);
  if(target) target.classList.remove('hidden');
}

// --- HELPER: Theme Injection ---
export function applyTeamTheme(team) {
  const root = document.documentElement;
  if (team && team.colors) {
    const prim = team.colors.primary || '#222';
    root.style.setProperty('--team-primary', prim);
    root.style.setProperty('--team-secondary', team.colors.secondary || '#c5a059');
    root.style.setProperty('--team-text', getContrastColor(prim));
  } else {
    // Defaults
    root.style.setProperty('--team-primary', '#222222');
    root.style.setProperty('--team-secondary', '#c5a059');
    root.style.setProperty('--team-text', '#ffffff');
  }
}

// --- RENDER: League List ---
export function renderLeagueList(leagues) {
  const container = document.getElementById('leagueListContainer');
  if (!leagues.length) {
    container.innerHTML = `<div class="panel-styled">No leagues found. Create one to get started.</div>`;
    return;
  }
  container.innerHTML = leagues.map(l => `
    <div class="league-card">
      <div class="league-card-main">
        <div class="league-card-title">${l.name}</div>
        <div class="league-meta">
          <span class="tag ${l.status === 'active' ? 'in_progress' : 'scheduled'}">${l.status}</span> 
          Season ${l.season} • ID: ${l.id}
        </div>
      </div>
      <div>
        <button class="link-button" onclick="window.app.handleOpenLeague('${l.id}')">Open</button>
        &nbsp;|&nbsp;
        <button class="link-button" onclick="window.app.handleManageLeague('${l.id}')">Manage</button>
      </div>
    </div>
  `).join('');
}

// --- RENDER: League Dashboard ---
export function renderLeagueView(league) {
  if (!league) return;
  
  // 1. Header
  document.getElementById('leagueHeader').innerHTML = `<h2>${league.name}</h2><div class="small">Season ${league.season} (${league.status})</div>`;
  
  // 2. Styles
  document.getElementById('leagueTeamsSection').className = 'panel-styled';
  document.getElementById('leagueMatchesSection').className = 'panel-styled';

  // 3. Standings
  const standings = computeStandings(league);
  const standingsHtml = standings.map((s, i) => `
    <tr>
      <td data-label="Rank">${i+1}</td>
      <td data-label="Team"><button class="link-button" onclick="window.app.handleOpenTeam('${league.id}', '${s.id}')">${s.name}</button></td>
      <td data-label="W-D-L">${s.wins}-${s.draws}-${s.losses}</td>
      <td data-label="Points">${s.points}</td>
      <td data-label="Diff">${s.tdDiff}/${s.casDiff}</td>
    </tr>`).join('');
    
  document.getElementById('standingsContainer').innerHTML = `
    <table class="responsive-table">
      <thead><tr><th>#</th><th>Team</th><th>W-D-L</th><th>Pts</th><th>Diff</th></tr></thead>
      <tbody>${standingsHtml}</tbody>
    </table>`;
    
  // 4. Roster Tiles (Quick View)
  const tilesHtml = league.teams.map(t => {
    const prim = t.colors?.primary || '#8a1c1c';
    return `
    <div class="roster-tile" style="border-top-color: ${prim}">
      <div class="roster-tile-title"><button class="team-link" onclick="window.app.handleOpenTeam('${league.id}', '${t.id}')">${t.name}</button></div>
      <div class="roster-tile-meta"><span><strong>Race:</strong> ${t.race}</span><span><strong>Coach:</strong> ${t.coachName}</span></div>
    </div>`;
  }).join('');
  document.getElementById('rosterQuickViewContainer').innerHTML = `<div class="roster-tiles">${tilesHtml}</div>`;
  
  // 5. Matches
  renderMatchesList(league);
}

function renderMatchesList(league) {
  const container = document.getElementById('matchesContainer');
  const inProgContainer = document.getElementById('inProgressContainer');
  
  if(!league.matches || !league.matches.length) {
    container.innerHTML = '<div class="small">No matches scheduled.</div>';
    inProgContainer.innerHTML = '';
    return;
  }
  
  const active = league.matches.filter(m => m.status === 'in_progress');
  const others = league.matches.filter(m => m.status !== 'in_progress').sort((a,b) => a.round - b.round);

  // Render Active
  let inProgHtml = '';
  if (active.length > 0) {
    inProgHtml = '<div class="card"><h4 style="color:#0066cc; margin-top:0;">Live Matches</h4><ul>' + 
      active.map(m => {
        const h = league.teams.find(t => t.id === m.homeTeamId)?.name || m.homeTeamId;
        const a = league.teams.find(t => t.id === m.awayTeamId)?.name || m.awayTeamId;
        return `<li style="margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:1px solid #eee;">
          <div style="font-weight:bold; font-size:0.9rem; color:#555;">Round ${m.round} <button class="link-button" style="float:right;" onclick="window.app.handleOpenScoreboard('${m.id}')"><strong>View Board</strong></button></div>
          <div style="margin-top:0.2rem; font-size:1.1rem;">${h} <span style="color:#aaa">vs</span> ${a}</div>
        </li>`;
      }).join('') + '</ul></div>';
  }
  inProgContainer.innerHTML = inProgHtml;

  // Render Scheduled
  const rows = others.map(m => {
    const h = league.teams.find(t => t.id === m.homeTeamId)?.name || m.homeTeamId;
    const a = league.teams.find(t => t.id === m.awayTeamId)?.name || m.awayTeamId;
    const score = m.status === 'completed' ? `${m.score.home}-${m.score.away}` : '';
    let action = m.status;
    if (m.status === 'scheduled') action = `<button class="link-button" onclick="window.app.handleStartMatch('${m.id}')" style="color:green; font-weight:bold">Start Match</button>`;
    
    return `<tr>
      <td data-label="Round">${m.round}</td>
      <td data-label="Home">${h}</td>
      <td data-label="Away">${a}</td>
      <td data-label="Score">${score}</td>
      <td data-label="Status"><span class="tag ${m.status}">${action}</span> <button onclick="window.app.handleDeleteMatch('${m.id}')" style="margin-left:5px; color:red; border:none; background:none; cursor:pointer;" title="Delete">🗑️</button></td>
    </tr>`;
  }).join('');
  
  const scheduledHeader = active.length > 0 ? '<h4 style="margin-top:2rem; color:#444;">Upcoming & Results</h4>' : '';
  container.innerHTML = `${scheduledHeader}<table class="responsive-table"><thead><tr><th>Rd</th><th>Home</th><th>Away</th><th>Score</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`; 
}

// --- RENDER: Team View ---
export function renderTeamView(team, gameData) {
  if(!team) return;
  
  // 1. Styled Header
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
         <button onclick="window.app.showSection('leagueViewSection')" class="secondary-btn">← Back</button>
         <button onclick="window.app.handleManageTeamDirect()" class="primary-btn">Manage</button>
      </div>
    `;
  }

  // 2. Summary
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
  
  // 3. Roster Table
  const rows = (team.players || []).map(p => {
    const skillsHtml = (p.skills||[]).map(s => `<span class="skill-tag" onclick="window.app.showSkill('${s}')">${s}</span>`).join(' ');
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
  document.getElementById('teamRosterContainer').innerHTML = `<table class="responsive-table"><thead><tr><th style="width:30px">#</th><th>Name</th><th>Pos</th><th>Cost</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th><th>SPP</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// --- RENDER: Match Setup (Shop) ---
export function renderMatchSetup(setupData, gameData) {
  const renderSide = (side) => {
    const t = setupData[side];
    const totalGold = t.pettyCash + t.treasurySpent;
    
    const commonItems = (gameData?.inducements || []).map(i => {
        const count = t.inducements.filter(x => x.name === i.name).length;
        return `<div class="shop-item">
            <div>${i.name} (${i.cost/1000}k)</div>
            <div><span style="margin-right:5px">x${count}</span><button class="shop-btn primary-btn" onclick="window.app.handleBuyInducement('${side}', '${i.name}', ${i.cost})">+</button></div>
        </div>`;
    }).join('');
    
    const starItems = (gameData?.starPlayers || []).map(i => {
        const hasIt = t.inducements.some(x => x.name === i.name);
        if (hasIt) return `<div class="shop-item"><div>${i.name}</div><div>✅</div></div>`;
        return `<div class="shop-item"><div>${i.name} (${i.cost/1000}k)</div><button class="shop-btn primary-btn" onclick="window.app.handleBuyInducement('${side}', '${i.name}', ${i.cost}, true)">Hire</button></div>`;
    }).join('');

    return `
      <div class="setup-column">
        <div class="setup-header" style="border-bottom-color:${t.colors?.primary||'#333'}">
            <h3 style="color:${t.colors?.primary||'#333'}">${t.name}</h3>
            <div>TV: ${t.tv/1000}k</div>
        </div>
        <div class="card" style="background:#eee">
            <div><strong>Petty Cash:</strong> ${t.pettyCash/1000}k</div>
            <div><strong>Treasury:</strong> ${t.treasury} <button class="shop-btn" onclick="window.app.handleAddTreasury('${side}')">+50k</button></div>
            <div style="margin-top:0.5rem; border-top:1px solid #ccc; padding-top:0.5rem;"><strong>Budget: ${totalGold/1000}k</strong></div>
        </div>
        <h4>Inducements</h4>
        <div class="inducement-list">${t.inducements.map(x => `<span class="tag">${x.name}</span>`).join(' ') || 'None'}</div>
        <div style="margin-top:1rem; max-height:300px; overflow-y:auto; border:1px solid #ccc;">
            <div style="background:#ddd; padding:5px; font-weight:bold;">Common</div>${commonItems}
            <div style="background:#ddd; padding:5px; font-weight:bold;">Star Players</div>${starItems}
        </div>
      </div>
    `;
  };

  document.getElementById('matchSetupContainer').innerHTML = `
    <div class="tv-bar"><span>${setupData.home.name} (${setupData.home.tv/1000}k)</span><span>VS</span><span>${setupData.away.name} (${setupData.away.tv/1000}k)</span></div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">${renderSide('home')}${renderSide('away')}</div>
    <div style="text-align:center; margin-top:2rem;"><button class="primary-btn" style="font-size:1.5rem; padding:1rem 2rem;" onclick="window.app.handleConfirmMatchStart()">🏈 KICK-OFF 🏈</button></div>
  `;
}

// --- RENDER: Jumbotron & Coach View ---
export function renderJumbotron(d) {
  // Names & Scores
  document.getElementById('sbHomeName').innerHTML = `<div class="big-team-text" style="color:${d.home.colors?.primary}; text-shadow:2px 2px 0 ${d.home.colors?.secondary}, 4px 4px 0px rgba(0,0,0,0.5)">${d.home.name}</div>`;
  document.getElementById('sbAwayName').innerHTML = `<div class="big-team-text" style="color:${d.away.colors?.primary}; text-shadow:2px 2px 0 ${d.away.colors?.secondary}, 4px 4px 0px rgba(0,0,0,0.5)">${d.away.name}</div>`;
  document.getElementById('sbHomeScore').textContent = d.home.score;
  document.getElementById('sbAwayScore').textContent = d.away.score;
  
  // Turn Counters (Safe text update)
  const homeTurn = document.getElementById('sbHomeTurn');
  const awayTurn = document.getElementById('sbAwayTurn');
  if(homeTurn) homeTurn.textContent = d.turn.home;
  if(awayTurn) awayTurn.textContent = d.turn.away;

  // Rosters
  const hCol = d.home.colors?.primary || '#222'; const hTxt = getContrastColor(hCol);
  const aCol = d.away.colors?.primary || '#222'; const aTxt = getContrastColor(aCol);
  document.getElementById('scoreboardHomeRoster').innerHTML = `<div class="roster-header" style="background:${hCol}; color:${hTxt}">Home - ${d.home.name}</div>` + renderLiveRoster(d.home.roster, 'home', true);
  document.getElementById('scoreboardAwayRoster').innerHTML = `<div class="roster-header" style="background:${aCol}; color:${aTxt}">Away - ${d.away.name}</div>` + renderLiveRoster(d.away.roster, 'away', true);
}

export function renderCoachView(d, side) {
  const team = d[side];
  const oppSide = side === 'home' ? 'away' : 'home';
  const oppTeam = d[oppSide];

  document.getElementById('coachTeamName').innerHTML = `<div class="coach-team-name" style="color:${team.colors?.text || '#fff'}; text-shadow:none;">${team.name}</div>`;
  document.getElementById('coachScoreDisplay').textContent = `${team.score} - ${oppTeam.score}`;
  document.getElementById('coachTurnDisplay').textContent = `Turn: ${d.turn[side]}`;

  let pips = '';
  for(let i=0; i<team.rerolls; i++) {
    pips += `<div class="reroll-pip ${i < (team.rerolls) ? 'active' : ''}" onclick="window.app.handleToggleReroll('${side}', ${i})"></div>`;
  }
  document.getElementById('coachRerolls').innerHTML = pips;
  document.getElementById('coachRosterList').innerHTML = renderLiveRoster(team.roster, side, false);
}

function renderLiveRoster(roster, side, readOnly) {
    return roster.map((p, idx) => {
      const live = p.live || {};
      let badges = '';
      if(live.td > 0) badges += `<span class="stat-badge">TD:${live.td}</span>`;
      if(live.cas > 0) badges += `<span class="stat-badge">CAS:${live.cas}</span>`;
      if(live.int > 0) badges += `<span class="stat-badge">INT:${live.int}</span>`;
      if(live.sentOff) badges += `<span class="stat-badge" style="background:#faa">Off</span>`;
      
      const skillTags = (p.skills || []).map(s => `<span class="skill-tag" onclick="event.stopPropagation(); window.app.showSkill('${s}')">${s}</span>`).join(' ');
      
      // Click handler goes to window.app
      const clickAttr = readOnly ? '' : `onclick="window.app.openPlayerActionSheet(${idx})"`;
      
      return `<div class="live-player-row ${live.used?'used':''} ${live.injured?'injured':''}" ${clickAttr}>
        <div class="player-info">
          <span class="player-name">#${p.number} ${p.name} ${badges}</span>
          <span class="player-pos">${p.position} | ${skillTags}</span>
        </div>
      </div>`;
    }).join('');
}
