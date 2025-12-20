import { state, els } from './state.js';
import { PATHS } from './config.js';
import { apiGet, apiSave, apiDelete } from './api.js';
import { setStatus, normalizeName, getContrastColor, applyTeamTheme, ulid } from './utils.js';
import { calculateTeamValue, calculateCurrentTeamValue, computeSeasonStats, isPlayerAvailableForMatch, getBb2025AdvancementCost, applyBb2025SkillAdvancement, applyBb2025CharacteristicIncrease } from './rules.js';
import { showSection, updateBreadcrumbs, goHome, showSkill, confirmModal } from './ui-core.js';
import { handleOpenLeague, handleManageLeague, renderManageForm } from './ui-league.js';

export async function handleOpenTeam(leagueId, teamId) {
  const teamName = state.currentLeague?.teams?.find(t => t.id === teamId)?.name;
  setStatus(`Loading team${teamName ? `: ${teamName}` : ''}...`);
  try {
    const teamData = await apiGet(PATHS.team(leagueId, teamId));
    if (!teamData) throw new Error("Team file not found.");
    state.currentTeam = teamData;
    state.viewTeamId = teamId;
    state.teamTab = 'overview';
    state.teamDevDraft = {};
    
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
             <button onclick="window.handleOpenLeague('${leagueId}')" class="secondary-btn">&larr; Back</button>
             <button onclick="window.handleManageTeamDirect()" class="primary-btn">Manage</button>
          </div>
        `;
    }

    renderTeamView();
    showSection('team');
    updateBreadcrumbs([{ label: 'Leagues', action: goHome }, { label: state.currentLeague.name, action: () => handleOpenLeague(leagueId) }, { label: teamData.name }]);
    setStatus(`Team loaded: ${teamData.name}`, 'ok');
  } catch (e) { setStatus(e.message, 'error'); }
}

export async function handleManageTeamDirect() {
  if (!state.currentLeague || !state.currentTeam) return;
  await handleManageLeague(state.currentLeague.id);
  state.editorReturnPath = 'teamView';
  await handleEditTeam(state.currentTeam.id);
}

export function renderTeamView() {
  const t = state.currentTeam;
  const tv = calculateTeamValue(t);
  const ctv = calculateCurrentTeamValue(t);

  const roster = Array.isArray(t.players) ? t.players : [];
  const availableCount = roster.filter(isPlayerAvailableForMatch).length;
  const mngCount = roster.filter(p => !!p?.mng).length;
  const trCount = roster.filter(p => !!p?.tr).length;
  const deadCount = roster.filter(p => !!p?.dead).length;

  const treasuryK = Math.floor((Number(t.treasury) || 0) / 1000);
  const trophyActive = Number(t.trophyRerollSeason || 0) === Number(state.currentLeague?.season || 0);
  const rrLabel = trophyActive ? `${t.rerolls || 0} (+1 Trophy)` : `${t.rerolls || 0}`;
  const staffInfo = `RR: ${rrLabel} | DF: ${t.dedicatedFans || 0} | Apo: ${t.apothecary ? 'Yes' : 'No'} | AC: ${t.assistantCoaches || 0} | Cheer: ${t.cheerleaders || 0}`;
  const showRedraftTab = String(state.currentLeague?.status || '') === 'offseason';
  if (!showRedraftTab && state.teamTab === 'redraft') state.teamTab = 'overview';

  const seasonStats = state.currentLeague ? computeSeasonStats(state.currentLeague).find(s => s.id === t.id) : null;
  const season = state.currentLeague?.season;
  const history = (t.history || []).filter(h => (h.season ?? 1) === season);
  const matchLogRows = history.map(h => `
    <tr>
      <td data-label="Rnd">${h.round ?? '-'}</td>
      <td data-label="Opponent">${h.opponentName || '-'}</td>
      <td data-label="Result">${h.result || '-'}</td>
      <td data-label="Score">${h.score || '-'}</td>
      <td data-label="Winnings">${h.winnings ? h.winnings + 'k' : '-'}</td>
    </tr>
  `).join('');

  els.containers.teamSummary.innerHTML = `
    <div class="panel-styled" style="margin-bottom:0.75rem;">
      <div class="season-stats-grid" style="margin-bottom:0.35rem;">
        <div><strong>Race:</strong> ${t.race}</div>
        <div><strong>Coach:</strong> ${t.coachName || '-'}</div>
        <div><strong>Treasury:</strong> ${treasuryK}k</div>
        <div><strong>TV / CTV:</strong> ${Math.floor(tv / 1000)}k / ${Math.floor(ctv / 1000)}k</div>
        <div><strong>Players:</strong> ${roster.length} (Avail ${availableCount}${mngCount ? ` &bull; MNG ${mngCount}` : ''}${trCount ? ` &bull; TR ${trCount}` : ''}${deadCount ? ` &bull; Dead ${deadCount}` : ''})</div>
      </div>
      <div class="small" style="color:#666;">${staffInfo}</div>
    </div>

    <div class="league-tabs-header" style="margin-bottom:0.75rem;">
      <h3 style="margin:0;">Team</h3>
      <div class="league-tabs team-tabs">
        <button class="secondary-btn league-tab-btn ${state.teamTab === 'overview' ? 'active' : ''}" onclick="window.setTeamTab('overview')">Overview</button>
        <button class="secondary-btn league-tab-btn ${state.teamTab === 'roster' ? 'active' : ''}" onclick="window.setTeamTab('roster')">Roster</button>
        <button class="secondary-btn league-tab-btn ${state.teamTab === 'development' ? 'active' : ''}" onclick="window.setTeamTab('development')">Development</button>
        <button class="secondary-btn league-tab-btn ${state.teamTab === 'staff' ? 'active' : ''}" onclick="window.setTeamTab('staff')">Staff &amp; Treasury</button>
        ${showRedraftTab ? `<button class="secondary-btn league-tab-btn ${state.teamTab === 'redraft' ? 'active' : ''}" onclick="window.setTeamTab('redraft')">Re-draft</button>` : ''}
        <button class="secondary-btn league-tab-btn ${state.teamTab === 'history' ? 'active' : ''}" onclick="window.setTeamTab('history')">History</button>
      </div>
    </div>
  `;

  els.containers.teamRoster.innerHTML = renderTeamTabContent({ team: t, season, seasonStats, history, matchLogRows });
}

export function setTeamTab(tab) {
  state.teamTab = tab;
  renderTeamView();
}

function renderTeamTabContent({ team, season, seasonStats, history, matchLogRows }) {
  const tab = state.teamTab || 'overview';
  const roster = Array.isArray(team.players) ? team.players : [];
  const race = state.gameData?.races?.find(r => r.name === team.race) || null;

  if (tab === 'overview') {
    return `
      <div class="panel-styled" style="margin-bottom:0.75rem;">
        <h4 style="margin-top:0;">Season ${season || '-'} Stats</h4>
        ${seasonStats ? `
          <div class="season-stats-grid">
            <div><strong>Record:</strong> ${seasonStats.wins}-${seasonStats.draws}-${seasonStats.losses} (${seasonStats.games} GP)</div>
            <div><strong>Points:</strong> ${seasonStats.points}</div>
            <div><strong>TD F/A:</strong> ${seasonStats.tdFor}/${seasonStats.tdAgainst} (${seasonStats.tdDiff >= 0 ? '+' : ''}${seasonStats.tdDiff})</div>
            <div><strong>CAS F/A:</strong> ${seasonStats.casFor}/${seasonStats.casAgainst} (${seasonStats.casDiff >= 0 ? '+' : ''}${seasonStats.casDiff})</div>
          </div>
        ` : `<div class="small" style="color:#666;">No completed games yet.</div>`}
      </div>

      <div class="panel-styled">
        <h4 style="margin-top:0;">Season Match Log</h4>
        ${history.length ? `
          <table class="responsive-table">
            <thead><tr><th>Rnd</th><th>Opponent</th><th>Result</th><th>Score</th><th>Winnings</th></tr></thead>
            <tbody>${matchLogRows}</tbody>
          </table>
        ` : `<div class="small" style="color:#666;">No games logged for this season.</div>`}
      </div>
    `;
  }

  if (tab === 'roster') {
    const positionals = Array.isArray(race?.positionals) ? race.positionals : [];
    const nextNumber = getNextPlayerNumber(roster);
    const posOptions = positionals.map(p => {
      const costK = Math.floor((Number(p.cost) || 0) / 1000);
      return `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)} (${costK}k)</option>`;
    }).join('');

    const rows = roster.map(p => {
      const skillsHtml = (p.skills || []).map(s =>
        `<span class="skill-tag" onclick="window.showSkill('${s}')">${s}</span>`
      ).join(' ');
      const costK = p.cost ? Math.floor(p.cost / 1000) + 'k' : '-';
      const status = [
        p.dead ? `<span class="stat-badge" style="background:#a00; color:#fff;">DEAD</span>` : '',
        p.tr ? `<span class="stat-badge" style="background:#666; color:#fff;">TR</span>` : '',
        p.mng ? `<span class="stat-badge" style="background:#c97a00; color:#111;">MNG</span>` : ''
      ].filter(Boolean).join(' ');
      const canFire = !p.isStar && !p.isJourneyman;

      return `
        <tr>
          <td data-label="#">${p.number || ''}</td>
          <td data-label="Name">${escapeHtml(p.name || '-')}</td>
          <td data-label="Pos">${escapeHtml(p.position || '-')}</td>
          <td data-label="Status">${status || '<span class="small" style="color:#666;">OK</span>'}</td>
          <td data-label="Cost">${costK}</td>
          <td data-label="MA">${p.ma ?? '-'}</td>
          <td data-label="ST">${p.st ?? '-'}</td>
          <td data-label="AG">${p.ag ?? '-'}</td>
          <td data-label="PA">${p.pa ?? '-'}</td>
          <td data-label="AV">${p.av ?? '-'}</td>
          <td data-label="Skills">${skillsHtml || '<span class="small" style="color:#666;">None</span>'}</td>
          <td data-label="SPP">${p.spp ?? 0}</td>
          <td data-label="Actions">${canFire ? `<button class="danger-btn" onclick="window.fireTeamPlayer('${p.id}')">Fire</button>` : ''}</td>
        </tr>
      `;
    }).join('');

    const rosterTable = roster.length
      ? `<table class="responsive-table"><thead><tr><th style="width:30px">#</th><th>Name</th><th>Pos</th><th>Status</th><th>Cost</th><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th><th>SPP</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="small" style="color:#666;">No players yet.</div>`;

    return `
      <div class="panel-styled" style="margin-bottom:0.75rem;">
        <h4 style="margin-top:0;">Hire Player</h4>
        <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
          <div class="form-field">
            <label>Position</label>
            <select id="teamHirePos">${posOptions || `<option value="">No roster data</option>`}</select>
          </div>
          <div class="form-field">
            <label>Name (optional)</label>
            <input id="teamHireName" type="text" placeholder="Player name..." />
          </div>
          <div class="form-field">
            <label>Number</label>
            <input id="teamHireNumber" type="number" min="1" max="99" value="${nextNumber}" />
          </div>
        </div>
        <div class="small" style="color:#666; margin-top:0.35rem;">Paid from Treasury. Firing players gives no refund. Team Draft List max is 16 players.</div>
        <div style="margin-top:0.6rem; display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:flex-end;">
          <button class="primary-btn" onclick="window.teamHirePlayer()">Hire</button>
        </div>
      </div>

      <div class="panel-styled">
        <h4 style="margin-top:0;">Roster</h4>
        ${rosterTable}
      </div>
    `;
  }

  if (tab === 'development') {
    const devPlayers = roster.filter(p => !p?.isStar && !p?.isJourneyman);
    const playerCards = devPlayers.map(p => renderDevelopmentCard({ team, player: p, race })).join('');
    return `
      <div class="panel-styled" style="margin-bottom:0.75rem;">
        <h4 style="margin-top:0;">Development (SPP)</h4>
        <div class="small" style="color:#666;">Spend SPP to buy Skills or Characteristic improvements. Dice are not rolled in-app; enter results where needed.</div>
      </div>

      ${playerCards || `<div class="panel-styled"><div class="small" style="color:#666;">No eligible players.</div></div>`}
    `;
  }

  if (tab === 'staff') {
    const staffCosts = state.gameData?.staffCosts || { assistantCoach: 10000, cheerleader: 10000, apothecary: 50000 };
    const rerollCost = Number(race?.rerollCost) || 50000;
    const buyRerollCost = rerollCost * 2;
    const treasuryGp = Number(team.treasury) || 0;
    return `
      <div class="panel-styled" style="margin-bottom:0.75rem;">
        <h4 style="margin-top:0;">Staff &amp; Treasury</h4>
        <div class="season-stats-grid">
          <div><strong>Treasury:</strong> ${formatK(treasuryGp)}</div>
          <div><strong>Re-rolls:</strong> ${team.rerolls || 0}</div>
          <div><strong>Assistant Coaches:</strong> ${team.assistantCoaches || 0}</div>
          <div><strong>Cheerleaders:</strong> ${team.cheerleaders || 0}</div>
          <div><strong>Apothecary:</strong> ${team.apothecary ? 'Yes' : 'No'}</div>
          <div><strong>Dedicated Fans:</strong> ${team.dedicatedFans || 0}</div>
        </div>
      </div>

      <div class="panel-styled" style="margin-bottom:0.75rem;">
        <h4 style="margin-top:0;">Team Re-rolls</h4>
        <div class="small" style="color:#666; margin-bottom:0.5rem;">Buying a re-roll between games costs double: ${formatK(buyRerollCost)} each. Removing gives no refund.</div>
        <div class="staff-row">
          <div class="staff-row-left"><strong>Re-rolls</strong><div class="small" style="color:#666;">Base: ${formatK(rerollCost)}</div></div>
          <div class="staff-row-controls">
            <button class="secondary-btn" onclick="window.teamAdjustRerolls(-1)">-</button>
            <div class="staff-row-count">${team.rerolls || 0}</div>
            <button class="primary-btn" onclick="window.teamAdjustRerolls(1)">+</button>
          </div>
        </div>
      </div>

      <div class="panel-styled" style="margin-bottom:0.75rem;">
        <h4 style="margin-top:0;">Sideline Staff</h4>

        <div class="staff-row">
          <div class="staff-row-left"><strong>Assistant Coaches</strong><div class="small" style="color:#666;">${formatK(staffCosts.assistantCoach)} each</div></div>
          <div class="staff-row-controls">
            <button class="secondary-btn" onclick="window.teamAdjustStaff('assistantCoaches', -1)">-</button>
            <div class="staff-row-count">${team.assistantCoaches || 0}</div>
            <button class="primary-btn" onclick="window.teamAdjustStaff('assistantCoaches', 1)">+</button>
          </div>
        </div>

        <div class="staff-row">
          <div class="staff-row-left"><strong>Cheerleaders</strong><div class="small" style="color:#666;">${formatK(staffCosts.cheerleader)} each</div></div>
          <div class="staff-row-controls">
            <button class="secondary-btn" onclick="window.teamAdjustStaff('cheerleaders', -1)">-</button>
            <div class="staff-row-count">${team.cheerleaders || 0}</div>
            <button class="primary-btn" onclick="window.teamAdjustStaff('cheerleaders', 1)">+</button>
          </div>
        </div>

        <div class="staff-row">
          <div class="staff-row-left"><strong>Apothecary</strong><div class="small" style="color:#666;">${formatK(staffCosts.apothecary)} (one-time)</div></div>
          <div class="staff-row-controls">
            ${team.apothecary
              ? `<button class="danger-btn" onclick="window.teamSetApothecary(false)">Remove</button>`
              : `<button class="primary-btn" onclick="window.teamSetApothecary(true)">Buy</button>`}
          </div>
        </div>
      </div>

      <div class="panel-styled">
        <h4 style="margin-top:0;">Manual Treasury Adjustment</h4>
        <div class="form-grid">
          <div class="form-field">
            <label>Amount (k)</label>
            <input id="teamTreasuryAdjustK" type="number" step="5" placeholder="e.g. 50" />
          </div>
          <div class="form-field">
            <label>Reason (optional)</label>
            <input id="teamTreasuryAdjustReason" type="text" placeholder="Notes..." />
          </div>
        </div>
        <div class="small" style="color:#666; margin-top:0.35rem;">Use this for corrections or commissioner adjustments.</div>
        <div style="margin-top:0.6rem; display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:flex-end;">
          <button class="secondary-btn" onclick="window.teamApplyTreasuryAdjust(-1)">Spend</button>
          <button class="primary-btn" onclick="window.teamApplyTreasuryAdjust(1)">Add</button>
        </div>
      </div>
    `;
  }

  if (tab === 'redraft') {
    return renderRedraftTab({ team, season });
  }

  if (tab === 'history') {
    const txs = Array.isArray(team.transactions) ? [...team.transactions] : [];
    txs.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    const mostRecentTxId = txs[0]?.id || null;

    const txRows = txs.map((tx, idx) => {
      const when = tx.at ? new Date(tx.at).toLocaleString() : '-';
      const type = tx.type || '-';
      const label = tx.label || '-';
      const cancelledAt = tx.cancelledAt ? new Date(tx.cancelledAt).toLocaleString() : null;
      const dTre = tx?.delta?.treasuryGp;
      const dTv = tx?.delta?.tvGp;
      const dSpp = tx?.delta?.sppCost;

      const isMostRecent = mostRecentTxId && tx.id === mostRecentTxId && idx === 0;
      const cancelledBadge = tx.cancelledAt ? `<span class="tx-badge cancelled">CANCELLED</span>` : '';

      let revertCell = '';
      if (isMostRecent) {
        if (tx.cancelledAt || !tx.undoBefore) {
          revertCell = `<button class="secondary-btn" disabled>Revert Changes</button>`;
        } else {
          revertCell = `<button class="danger-btn" onclick="window.revertMostRecentTeamChange('${tx.id}')">Revert Changes</button>`;
        }
      }

      return `
        <tr>
          <td data-label="When">${escapeHtml(when)}${cancelledAt ? `<div class="small tx-cancelled-at">Cancelled: ${escapeHtml(cancelledAt)}</div>` : ''}</td>
          <td data-label="Type">${escapeHtml(type)}</td>
          <td data-label="Detail">${escapeHtml(label)}${cancelledBadge}</td>
          <td data-label="Treasury">${dTre == null ? '-' : escapeHtml(formatSignedK(dTre))}</td>
          <td data-label="TV">${dTv == null ? '-' : escapeHtml(formatSignedK(dTv))}</td>
          <td data-label="SPP">${dSpp == null ? '-' : escapeHtml(String(dSpp))}</td>
          <td data-label="Revert">${revertCell}</td>
        </tr>
      `;
    }).join('');

    const txTable = txs.length
      ? `<table class="responsive-table"><thead><tr><th>When</th><th>Type</th><th>Detail</th><th>Treasury</th><th>TV</th><th>SPP</th><th>Revert</th></tr></thead><tbody>${txRows}</tbody></table>`
      : `<div class="small" style="color:#666;">No transactions yet.</div>`;

    const allHistory = Array.isArray(team.history) ? [...team.history] : [];
    allHistory.sort((a, b) => {
      const sa = Number(a.season) || 0;
      const sb = Number(b.season) || 0;
      if (sb !== sa) return sb - sa;
      return (Number(b.round) || 0) - (Number(a.round) || 0);
    });

    const historyRows = allHistory.map(h => `
      <tr>
        <td data-label="Season">${h.season ?? '-'}</td>
        <td data-label="Round">${h.round ?? '-'}</td>
        <td data-label="Opponent">${escapeHtml(h.opponentName || '-')}</td>
        <td data-label="Result">${escapeHtml(h.result || '-')}</td>
        <td data-label="Score">${escapeHtml(h.score || '-')}</td>
        <td data-label="Winnings">${h.winningsK != null ? escapeHtml(String(h.winningsK) + 'k') : (h.winnings ? escapeHtml(String(h.winnings) + 'k') : '-')}</td>
      </tr>
    `).join('');

    const historyTable = allHistory.length
      ? `<table class="responsive-table"><thead><tr><th>Season</th><th>Round</th><th>Opponent</th><th>Result</th><th>Score</th><th>Winnings</th></tr></thead><tbody>${historyRows}</tbody></table>`
      : `<div class="small" style="color:#666;">No games logged.</div>`;

    return `
      <div class="panel-styled" style="margin-bottom:0.75rem;">
        <h4 style="margin-top:0;">Transactions</h4>
        ${txTable}
      </div>

      <div class="panel-styled">
        <h4 style="margin-top:0;">Match History</h4>
        ${historyTable}
      </div>
    `;
  }

  return `<div class="panel-styled"><div class="small" style="color:#666;">Unknown tab.</div></div>`;
}

// ==============================
// Phase 7: Off-season Re-drafting
// ==============================

function ensureTeamRedraftState({ team, fromSeason, toSeason }) {
  const leagueId = state.currentLeague?.id || null;
  const existing = state.teamRedraft;
  if (
    !existing ||
    existing.leagueId !== leagueId ||
    existing.teamId !== team.id ||
    existing.fromSeason !== fromSeason ||
    existing.toSeason !== toSeason
  ) {
    state.teamRedraft = {
      leagueId,
      teamId: team.id,
      fromSeason,
      toSeason,
      step: 1,
      capEnabled: true,
      capGp: 1300000,
      recoveryRolls: {},
      recoveryApplied: false,
      draftPlayers: JSON.parse(JSON.stringify(Array.isArray(team.players) ? team.players : [])),
      rehire: {},
      newHires: [],
      staffDraft: {
        rerolls: Number(team.rerolls || 0),
        apothecary: !!team.apothecary,
        assistantCoaches: Number(team.assistantCoaches || 0),
        cheerleaders: Number(team.cheerleaders || 0)
      }
    };
  }
  return state.teamRedraft;
}

function computeTeamSeasonRecord(league, teamId, season) {
  const s = Number(season || 1);
  const matches = (league?.matches || [])
    .filter(m => m.status === 'completed')
    .filter(m => (m.season ?? s) === s);

  let games = 0;
  let wins = 0;
  let draws = 0;

  for (const m of matches) {
    if (m.homeTeamId !== teamId && m.awayTeamId !== teamId) continue;
    games += 1;

    const hs = Number(m.score?.home ?? 0);
    const as = Number(m.score?.away ?? 0);

    if (hs > as) {
      if (m.homeTeamId === teamId) wins += 1;
      continue;
    }
    if (as > hs) {
      if (m.awayTeamId === teamId) wins += 1;
      continue;
    }

    // Tie: in play-offs a winner may be recorded via winnerTeamId
    if (m.winnerTeamId) {
      if (m.winnerTeamId === teamId) wins += 1;
      continue;
    }

    draws += 1;
  }

  return { games, wins, draws };
}

function computeRedraftBudget({ league, team, fromSeason, capEnabled, capGp }) {
  const treasuryGp = Number(team?.treasury || 0);
  const baseGp = 1000000;
  const record = computeTeamSeasonRecord(league, team?.id, fromSeason);
  const bonusGamesGp = record.games * 20000;
  const bonusWinsGp = record.wins * 20000;
  const bonusDrawsGp = record.draws * 10000;
  const totalGp = baseGp + treasuryGp + bonusGamesGp + bonusWinsGp + bonusDrawsGp;

  const cap = Number(capGp || 0) || 1300000;
  const cappedGp = capEnabled ? Math.min(totalGp, cap) : totalGp;
  const capApplied = capEnabled && totalGp > cap;

  return {
    baseGp,
    treasuryGp,
    record,
    bonusGamesGp,
    bonusWinsGp,
    bonusDrawsGp,
    totalGp,
    capGp: cap,
    capEnabled: !!capEnabled,
    capApplied,
    finalGp: cappedGp
  };
}

function getAgentFeeGp(player, fromSeason) {
  const from = Number(fromSeason || 1);
  const rookieSeason = Number(player?.rookieSeason || from);
  const seasonsPlayed = Math.max(1, from - rookieSeason + 1);
  return seasonsPlayed * 20000;
}

function getPositional(race, positionName) {
  const name = String(positionName || '').trim();
  if (!race || !name) return null;
  return (race.positionals || []).find(p => p.name === name) || null;
}

function listInjuryReductions(player) {
  const raw = String(player?.injuries || '');
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  return parts.filter(p => p.startsWith('-'));
}

function applyRedraftRecovery({ draft, team }) {
  const roster = Array.isArray(draft.draftPlayers) ? draft.draftPlayers : [];
  const mod = team?.apothecary ? 1 : 0;
  const missing = [];

  roster.forEach(p => {
    if (!p?.tr) return;
    const reductions = listInjuryReductions(p);
    if (!reductions.length) return;

    const newInjuries = String(p.injuries || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    reductions.forEach((code, idx) => {
      const key = `${p.id}:${idx}:${code}`;
      const rollRaw = draft.recoveryRolls?.[key];
      const roll = (rollRaw == null || rollRaw === '') ? null : Number(rollRaw);
      if (!roll || roll < 1 || roll > 6) {
        missing.push(`${p.number ? `#${p.number} ` : ''}${p.name}: ${code}`);
        return;
      }

      if (roll + mod >= 4) {
        const stat = code.substring(1);
        p[stat] = (Number(p[stat]) || 0) + 1;
        const removeIdx = newInjuries.findIndex(x => x === code);
        if (removeIdx >= 0) newInjuries.splice(removeIdx, 1);
      }
    });

    p.injuries = newInjuries.length ? (newInjuries.join(',') + ',') : '';
  });

  draft.recoveryApplied = true;
  return { missing };
}

function computeRedraftSpend({ draft, race, fromSeason }) {
  const staffCosts = state.gameData?.staffCosts || { assistantCoach: 10000, cheerleader: 10000, apothecary: 50000 };
  const rerollCost = Number(race?.rerollCost || 50000);

  const staff = draft.staffDraft || {};
  const staffSpentGp =
    (Number(staff.assistantCoaches || 0) * Number(staffCosts.assistantCoach || 0))
    + (Number(staff.cheerleaders || 0) * Number(staffCosts.cheerleader || 0))
    + ((!!staff.apothecary) ? Number(staffCosts.apothecary || 0) : 0)
    + (Number(staff.rerolls || 0) * rerollCost);

  const roster = Array.isArray(draft.draftPlayers) ? draft.draftPlayers : [];
  const rehireIdSet = new Set(
    Object.entries(draft.rehire || {})
      .filter(([, v]) => !!v)
      .map(([id]) => String(id))
  );
  const rehired = roster.filter(p => rehireIdSet.has(String(p?.id)));
  const rehireSpentGp = rehired.reduce((sum, p) => sum + (Number(p.cost || 0) + getAgentFeeGp(p, fromSeason)), 0);

  const newHires = Array.isArray(draft.newHires) ? draft.newHires : [];
  const newHireSpentGp = newHires.reduce((sum, h) => {
    const pos = getPositional(race, h.position);
    return sum + (Number(pos?.cost || 0));
  }, 0);

  return {
    staffSpentGp,
    rehireSpentGp,
    newHireSpentGp,
    totalSpentGp: staffSpentGp + rehireSpentGp + newHireSpentGp,
    rehiredCount: rehired.length,
    newHireCount: newHires.length
  };
}

function renderRedraftTab({ team, season }) {
  const league = state.currentLeague;
  if (!league) return `<div class="panel-styled"><div class="small" style="color:#666;">No league loaded.</div></div>`;

  const fromSeason = Number(season || league.season || 1);
  const toSeason = fromSeason + 1;

  const race = state.gameData?.races?.find(r => r.name === team.race) || null;
  if (!race) return `<div class="panel-styled"><div class="small" style="color:#b00020;">Race rules not found.</div></div>`;

  const draft = ensureTeamRedraftState({ team, fromSeason, toSeason });
  const budget = computeRedraftBudget({
    league,
    team,
    fromSeason,
    capEnabled: draft.capEnabled,
    capGp: draft.capGp
  });

  const trophyNextSeason = Number(team.trophyRerollSeason || 0) === toSeason;

  const step = Number(draft.step || 1);
  const stepLabel = step === 1 ? 'Rest & Relaxation' : step === 2 ? 'Raise Funds' : 'Re-draft Team';
  const stepTotal = 3;

  const header = `
    <div class="panel-styled" style="margin-bottom:0.75rem;">
      <div class="league-subheading">Off-season Re-drafting</div>
      <div class="small" style="color:#666; text-align:center;">Step ${step}/${stepTotal}: ${escapeHtml(stepLabel)} (Season ${fromSeason} → ${toSeason})</div>
      ${trophyNextSeason ? `<div class="small" style="margin-top:0.5rem; color:#2e7d32; text-align:center;">League Trophy: +1 Team Re-roll for Season ${toSeason} (counts for TV, costs 0gp).</div>` : ''}
    </div>
  `;

  if (step === 1) {
    const roster = Array.isArray(draft.draftPlayers) ? draft.draftPlayers : [];
    const mngCount = roster.filter(p => !!p?.mng).length;
    const trPlayers = roster.filter(p => !!p?.tr);
    const mod = team.apothecary ? 1 : 0;

    const rows = trPlayers.flatMap(p => {
      const reductions = listInjuryReductions(p);
      return reductions.map((code, idx) => {
        const key = `${p.id}:${idx}:${code}`;
        const val = draft.recoveryRolls?.[key] ?? '';
        return `
          <tr>
            <td data-label="Player">${escapeHtml(p.number ? `#${p.number} ` : '')}${escapeHtml(p.name || '-')}</td>
            <td data-label="Injury">${escapeHtml(code)}</td>
            <td data-label="Roll"><input type="number" min="1" max="6" value="${escapeHtml(val)}" onchange="window.teamRedraftSetRecoveryRoll(${JSON.stringify(key)}, this.value)" style="width:80px;"></td>
            <td data-label="Target" class="small" style="color:#666;">4+${mod ? ` (with +${mod})` : ''}</td>
          </tr>
        `;
      });
    }).join('');

    return header + `
      <div class="panel-styled" style="margin-bottom:0.75rem;">
        <h4 style="margin-top:0;">Recovery</h4>
        <div class="small" style="color:#666; margin-bottom:0.5rem;">
          Players marked as MNG recover before the next season. Temporarily Retired (TR) players may heal during the off-season.
        </div>
        <div class="season-stats-grid">
          <div><strong>MNG players:</strong> ${mngCount}</div>
          <div><strong>TR players:</strong> ${trPlayers.length}</div>
          <div><strong>Apothecary:</strong> ${team.apothecary ? 'Yes (+1 to TR recovery rolls)' : 'No'}</div>
        </div>
      </div>

      <div class="panel-styled">
        <h4 style="margin-top:0;">TR Recovery Rolls</h4>
        ${rows ? `
          <div class="table-scroll">
            <table class="responsive-table">
              <thead><tr><th>Player</th><th>Injury</th><th>Roll</th><th>Target</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        ` : `<div class="small" style="color:#666;">No TR characteristic reductions to roll for.</div>`}
        <div class="small" style="color:#666; margin-top:0.5rem;">Enter the D6 results; the app does not roll dice.</div>
      </div>

      <div class="modal-actions" style="margin-top:0.75rem; justify-content:space-between;">
        <button class="secondary-btn" onclick="window.teamRedraftReset()">Reset</button>
        <button class="primary-btn" onclick="window.teamRedraftNext()">Next</button>
      </div>
    `;
  }

  if (step === 2) {
    const totalK = Math.round(budget.totalGp / 1000);
    const finalK = Math.round(budget.finalGp / 1000);

    return header + `
      <div class="panel-styled" style="margin-bottom:0.75rem;">
        <h4 style="margin-top:0;">Re-draft Budget</h4>
        <div class="small" style="color:#666; margin-bottom:0.5rem;">Budget = 1,000,000 + Treasury + bonuses from last season.</div>
        <div class="season-stats-grid">
          <div><strong>Base:</strong> ${formatK(budget.baseGp)}</div>
          <div><strong>Treasury:</strong> ${formatK(budget.treasuryGp)}</div>
          <div><strong>Fixtures:</strong> ${budget.record.games} (${formatK(budget.bonusGamesGp)})</div>
          <div><strong>Wins:</strong> ${budget.record.wins} (${formatK(budget.bonusWinsGp)})</div>
          <div><strong>Draws:</strong> ${budget.record.draws} (${formatK(budget.bonusDrawsGp)})</div>
          <div><strong>Total:</strong> ${totalK}k</div>
          <div><strong>Final Budget:</strong> ${finalK}k</div>
        </div>
        <div style="margin-top:0.75rem;">
          <label style="display:flex; align-items:center; gap:0.5rem;">
            <input type="checkbox" ${draft.capEnabled ? 'checked' : ''} onchange="window.teamRedraftSetCapEnabled(this.checked)">
            Use recommended budget cap (${Math.round(budget.capGp / 1000)}k)
          </label>
          ${budget.capApplied ? `<div class="small" style="color:#b00020; margin-top:0.35rem;">Cap applied: ${totalK}k → ${finalK}k</div>` : ''}
        </div>
      </div>

      <div class="modal-actions" style="justify-content:space-between;">
        <button class="secondary-btn" onclick="window.teamRedraftBack()">Back</button>
        <button class="primary-btn" onclick="window.teamRedraftNext()">Next</button>
      </div>
    `;
  }

  // Step 3: Team builder
  const spend = computeRedraftSpend({ draft, race, fromSeason });
  const remainingGp = budget.finalGp - spend.totalSpentGp;
  const remainingK = Math.round(remainingGp / 1000);

  const roster = Array.isArray(draft.draftPlayers) ? draft.draftPlayers : [];
  const eligible = roster.filter(p => !p?.isStar && !p?.isJourneyman && !p?.dead);
  const rehireRows = eligible.map(p => {
    const checked = !!draft.rehire?.[p.id];
    const feeGp = getAgentFeeGp(p, fromSeason);
    const totalGp = Number(p.cost || 0) + feeGp;
    const rookieSeason = Number(p.rookieSeason || fromSeason);
    const seasonsPlayed = Math.max(1, fromSeason - rookieSeason + 1);
    const status = [p.tr ? 'TR' : null, p.mng ? 'MNG' : null].filter(Boolean).join('/');

    return `
      <tr>
        <td data-label="Rehire"><input type="checkbox" ${checked ? 'checked' : ''} onchange="window.teamRedraftToggleRehire(${JSON.stringify(p.id)}, this.checked)"></td>
        <td data-label="#">${p.number ?? ''}</td>
        <td data-label="Player">${escapeHtml(p.name || '-')}<div class="small" style="color:#666;">${escapeHtml(p.position || '')}${status ? ` • ${escapeHtml(status)}` : ''}</div></td>
        <td data-label="Value">${formatK(p.cost)}</td>
        <td data-label="Agent Fee">${formatK(feeGp)}<div class="small" style="color:#666;">(${seasonsPlayed} season${seasonsPlayed === 1 ? '' : 's'})</div></td>
        <td data-label="Total">${formatK(totalGp)}</td>
      </tr>
    `;
  }).join('');

  const posOptions = (race.positionals || []).map(p => {
    const costK = Math.floor((Number(p.cost) || 0) / 1000);
    return `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)} (${costK}k)</option>`;
  }).join('');

  const selectedRehireCount = Object.values(draft.rehire || {}).filter(Boolean).length;
  const totalPlayerCount = selectedRehireCount + (draft.newHires?.length || 0);

  const warnings = [];
  if (remainingGp < 0) warnings.push(`Over budget by ${Math.abs(remainingK)}k.`);
  if (totalPlayerCount > 16) warnings.push(`Team Draft List max is 16 players; selected ${totalPlayerCount}.`);
  if (totalPlayerCount && totalPlayerCount < 11) warnings.push(`Selected only ${totalPlayerCount} players; you may rely on Journeymen.`);

  const pickedNumbers = [];
  eligible.forEach(p => { if (draft.rehire?.[p.id]) pickedNumbers.push(Number(p.number)); });
  (draft.newHires || []).forEach(h => pickedNumbers.push(Number(h.number)));
  const dupNums = pickedNumbers.filter(n => Number.isFinite(n)).filter((n, i, arr) => arr.indexOf(n) !== i);
  if (dupNums.length) warnings.push(`Duplicate jersey numbers selected: ${[...new Set(dupNums)].join(', ')}.`);

  const already = Number(team.redraft?.toSeason || 0) === toSeason;

  return header + `
    <div class="panel-styled" style="margin-bottom:0.75rem;">
      <h4 style="margin-top:0;">Budget</h4>
      <div class="season-stats-grid">
        <div><strong>Final Budget:</strong> ${formatK(budget.finalGp)}</div>
        <div><strong>Spent:</strong> ${formatK(spend.totalSpentGp)}</div>
        <div><strong>Remaining:</strong> <span style="color:${remainingGp < 0 ? '#b00020' : '#2e7d32'}; font-weight:900;">${remainingK}k</span></div>
      </div>
      <div class="small" style="color:#666; margin-top:0.35rem;">Staff and Team Re-rolls cost standard amounts during Re-draft (not double).</div>
    </div>

    ${warnings.length ? `
      <div class="panel-styled" style="margin-bottom:0.75rem; border-left:4px solid #b00020;">
        <h4 style="margin-top:0;">Warnings</h4>
        <ul style="margin:0; padding-left:1.2rem;">${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
      </div>
    ` : ''}

    <div class="panel-styled" style="margin-bottom:0.75rem;">
      <h4 style="margin-top:0;">Re-hire players</h4>
      ${rehireRows ? `
        <div class="table-scroll">
          <table class="responsive-table">
            <thead><tr><th></th><th>#</th><th>Player</th><th>Value</th><th>Agent Fee</th><th>Total</th></tr></thead>
            <tbody>${rehireRows}</tbody>
          </table>
        </div>
      ` : `<div class="small" style="color:#666;">No eligible players to re-hire.</div>`}
    </div>

    <div class="panel-styled" style="margin-bottom:0.75rem;">
      <h4 style="margin-top:0;">Hire new players</h4>
      <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
        <div class="form-field">
          <label>Position</label>
          <select id="redraftHirePos">${posOptions}</select>
        </div>
        <div class="form-field">
          <label>Name (optional)</label>
          <input id="redraftHireName" type="text" placeholder="Player name..." />
        </div>
        <div class="form-field">
          <label>Number</label>
          <input id="redraftHireNumber" type="number" min="1" max="99" value="${getNextPlayerNumber(team.players || [])}" />
        </div>
      </div>
      <div style="margin-top:0.6rem; display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:flex-end;">
        <button class="primary-btn" onclick="window.teamRedraftAddNewHire()">Add Player</button>
      </div>

      ${(draft.newHires || []).length ? `
        <div class="table-scroll" style="margin-top:0.75rem;">
          <table class="responsive-table">
            <thead><tr><th>#</th><th>Player</th><th>Cost</th><th></th></tr></thead>
            <tbody>
              ${(draft.newHires || []).map((h, i) => {
                const pos = getPositional(race, h.position);
                return `
                  <tr>
                    <td data-label="#">${h.number ?? ''}</td>
                    <td data-label="Player">${escapeHtml(h.name || h.position)}<div class="small" style="color:#666;">${escapeHtml(h.position || '')}</div></td>
                    <td data-label="Cost">${formatK(pos?.cost || 0)}</td>
                    <td data-label=""><button class="danger-btn" onclick="window.teamRedraftRemoveNewHire(${i})">Remove</button></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div class="small" style="color:#666; margin-top:0.5rem;">No new hires added.</div>`}
    </div>

    <div class="panel-styled">
      <h4 style="margin-top:0;">Staff &amp; Re-rolls</h4>
      <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
        <div class="form-field">
          <label>Team Re-rolls</label>
          <input type="number" min="0" step="1" value="${escapeHtml(draft.staffDraft?.rerolls ?? 0)}" onchange="window.teamRedraftSetStaffField('rerolls', this.value)" />
        </div>
        <div class="form-field">
          <label>Assistant Coaches</label>
          <input type="number" min="0" step="1" value="${escapeHtml(draft.staffDraft?.assistantCoaches ?? 0)}" onchange="window.teamRedraftSetStaffField('assistantCoaches', this.value)" />
        </div>
        <div class="form-field">
          <label>Cheerleaders</label>
          <input type="number" min="0" step="1" value="${escapeHtml(draft.staffDraft?.cheerleaders ?? 0)}" onchange="window.teamRedraftSetStaffField('cheerleaders', this.value)" />
        </div>
        <div class="form-field">
          <label>Apothecary</label>
          <select onchange="window.teamRedraftSetStaffField('apothecary', this.value)">
            <option value="true" ${draft.staffDraft?.apothecary ? 'selected' : ''}>Yes</option>
            <option value="false" ${draft.staffDraft?.apothecary ? '' : 'selected'}>No</option>
          </select>
        </div>
      </div>
    </div>

    <div class="modal-actions" style="margin-top:0.75rem; justify-content:space-between;">
      <button class="secondary-btn" onclick="window.teamRedraftBack()">Back</button>
      <button class="primary-btn" onclick="window.teamRedraftFinalize()" ${already ? 'disabled' : ''}>Finalize Re-draft</button>
    </div>
    ${already ? `<div class="small" style="margin-top:0.5rem; color:#2e7d32; text-align:right;">Already re-drafted for Season ${toSeason}.</div>` : ''}
  `;
}

export function teamRedraftReset() {
  state.teamRedraft = null;
  renderTeamView();
}

export function teamRedraftBack() {
  const draft = state.teamRedraft;
  if (!draft) return;
  draft.step = Math.max(1, Number(draft.step || 1) - 1);
  renderTeamView();
}

export async function teamRedraftNext() {
  const team = state.currentTeam;
  const draft = state.teamRedraft;
  if (!team || !draft) return;

  const step = Number(draft.step || 1);
  if (step === 1) {
    const draftPlayersCopy = JSON.parse(JSON.stringify(Array.isArray(draft.draftPlayers) ? draft.draftPlayers : []));
    const scratch = { ...draft, draftPlayers: draftPlayersCopy };
    const { missing } = applyRedraftRecovery({ draft: scratch, team });
    if (missing.length) {
      const ok = await confirmProceedWithWarnings({
        title: 'Proceed without some recovery rolls?',
        intro: 'Some TR recovery rolls are missing or invalid; those injuries will remain.',
        warnings: missing.map(x => `Missing D6 for ${x}`),
        confirmLabel: 'Proceed Anyway'
      });
      if (!ok) return;
    }
    draft.draftPlayers = draftPlayersCopy;
    draft.recoveryApplied = true;
    draft.step = 2;
    renderTeamView();
    return;
  }

  if (step === 2) {
    draft.step = 3;
    renderTeamView();
    return;
  }
}

export function teamRedraftSetRecoveryRoll(key, value) {
  const draft = state.teamRedraft;
  if (!draft) return;
  draft.recoveryRolls = draft.recoveryRolls || {};
  draft.recoveryRolls[String(key)] = value;
  renderTeamView();
}

export function teamRedraftSetCapEnabled(enabled) {
  const draft = state.teamRedraft;
  if (!draft) return;
  draft.capEnabled = !!enabled;
  renderTeamView();
}

export function teamRedraftToggleRehire(playerId, checked) {
  const draft = state.teamRedraft;
  if (!draft) return;
  draft.rehire = draft.rehire || {};
  draft.rehire[String(playerId)] = !!checked;
  renderTeamView();
}

export function teamRedraftAddNewHire() {
  const draft = state.teamRedraft;
  const team = state.currentTeam;
  if (!draft || !team) return;
  const race = state.gameData?.races?.find(r => r.name === team.race);
  if (!race) return setStatus('Race rules not found.', 'error');

  const posName = document.getElementById('redraftHirePos')?.value;
  const pos = getPositional(race, posName);
  if (!pos) return setStatus('Select a valid position.', 'error');

  const rawName = document.getElementById('redraftHireName')?.value;
  const name = String(rawName || '').trim() || pos.name;

  const rawNumber = document.getElementById('redraftHireNumber')?.value;
  let number = parseInt(rawNumber, 10);
  if (!Number.isFinite(number) || number < 1) number = getNextPlayerNumber(team.players || []);

  draft.newHires = Array.isArray(draft.newHires) ? draft.newHires : [];
  draft.newHires.push({ position: pos.name, name, number });
  renderTeamView();
}

export function teamRedraftRemoveNewHire(index) {
  const draft = state.teamRedraft;
  if (!draft || !Array.isArray(draft.newHires)) return;
  draft.newHires.splice(index, 1);
  renderTeamView();
}

export function teamRedraftSetStaffField(field, value) {
  const draft = state.teamRedraft;
  if (!draft) return;
  draft.staffDraft = draft.staffDraft || {};
  const f = String(field || '');

  if (f === 'apothecary') {
    draft.staffDraft.apothecary = String(value) === 'true';
  } else {
    const num = Number(value);
    draft.staffDraft[f] = Number.isFinite(num) ? num : 0;
  }

  renderTeamView();
}

export async function teamRedraftFinalize() {
  const team = state.currentTeam;
  const league = state.currentLeague;
  const draft = state.teamRedraft;
  if (!team || !league || !draft) return;

  const key = els.inputs.editKey?.value;
  if (!key) return setStatus('Edit key required', 'error');

  const fromSeason = Number(draft.fromSeason || league.season || 1);
  const toSeason = Number(draft.toSeason || (fromSeason + 1));

  if (Number(team.redraft?.toSeason || 0) === toSeason) {
    return setStatus(`Already re-drafted for Season ${toSeason}.`, 'ok');
  }

  const race = state.gameData?.races?.find(r => r.name === team.race);
  if (!race) return setStatus('Race rules not found.', 'error');

  const budget = computeRedraftBudget({
    league,
    team,
    fromSeason,
    capEnabled: draft.capEnabled,
    capGp: draft.capGp
  });

  const spend = computeRedraftSpend({ draft, race, fromSeason });
  const remainingGp = budget.finalGp - spend.totalSpentGp;

  const roster = Array.isArray(draft.draftPlayers) ? draft.draftPlayers : [];
  const selectedRehireIdSet = new Set(
    Object.entries(draft.rehire || {})
      .filter(([, v]) => !!v)
      .map(([id]) => String(id))
  );
  const rehired = roster.filter(p => selectedRehireIdSet.has(String(p?.id)));
  const newHires = Array.isArray(draft.newHires) ? draft.newHires : [];

  const warnings = [];
  if (remainingGp < 0) warnings.push(`Over budget by ${formatK(Math.abs(remainingGp))}.`);

  const totalPlayers = rehired.length + newHires.length;
  if (totalPlayers > 16) warnings.push(`Team Draft List max is 16 players; selected ${totalPlayers}.`);
  if (totalPlayers < 11) warnings.push(`Selected only ${totalPlayers} players; you may rely on Journeymen.`);

  const usedNums = [];
  rehired.forEach(p => usedNums.push(Number(p.number)));
  newHires.forEach(h => usedNums.push(Number(h.number)));
  const dupNums = usedNums.filter(n => Number.isFinite(n)).filter((n, i, arr) => arr.indexOf(n) !== i);
  if (dupNums.length) warnings.push(`Duplicate jersey numbers: ${[...new Set(dupNums)].join(', ')}.`);

  for (const h of newHires) {
    const pos = getPositional(race, h.position);
    if (!pos) warnings.push(`Unknown positional: ${h.position}`);
  }

  const ok = await confirmProceedWithWarnings({
    title: 'Finalize re-draft with warnings?',
    intro: `Finalize re-draft for Season ${toSeason}. Budget ${formatK(budget.finalGp)}, remaining ${formatK(remainingGp)}.`,
    warnings,
    confirmLabel: 'Finalize Anyway'
  });
  if (!ok) return;

  const staff = draft.staffDraft || {};
  const rr = Math.max(0, Number(staff.rerolls || 0));
  const ac = Math.max(0, Number(staff.assistantCoaches || 0));
  const ch = Math.max(0, Number(staff.cheerleaders || 0));
  const apo = !!staff.apothecary;

  const nextPlayers = [];

  rehired.forEach(p => {
    const out = JSON.parse(JSON.stringify(p));
    out.mng = false;
    out.tr = false;
    out.dead = false;
    if (!out.rookieSeason) out.rookieSeason = fromSeason;
    nextPlayers.push(out);
  });

  newHires.forEach(h => {
    const pos = getPositional(race, h.position);
    if (!pos) return;
    nextPlayers.push({
      id: ulid(),
      number: Number(h.number || 0),
      name: String(h.name || pos.name),
      position: pos.name,
      cost: Number(pos.cost) || 0,
      ma: pos.ma,
      st: pos.st,
      ag: pos.ag,
      pa: pos.pa,
      av: pos.av,
      skills: Array.isArray(pos.skills) ? [...pos.skills] : [],
      primary: Array.isArray(pos.primary) ? [...pos.primary] : (pos.primary ? [pos.primary] : []),
      secondary: Array.isArray(pos.secondary) ? [...pos.secondary] : (pos.secondary ? [pos.secondary] : []),
      spp: 0,
      sppSpent: 0,
      advancements: [],
      injuries: '',
      rookieSeason: toSeason
    });
  });

  nextPlayers.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));

  const undoBefore = createUndoSnapshot(team);
  const treasuryBefore = Number(team.treasury || 0);

  team.players = nextPlayers;
  team.rerolls = rr;
  team.assistantCoaches = ac;
  team.cheerleaders = ch;
  team.apothecary = apo;
  team.treasury = Number(budget.finalGp) - Number(spend.totalSpentGp);
  team.teamValue = calculateTeamValue(team);

  team.redraft = {
    fromSeason,
    toSeason,
    at: new Date().toISOString(),
    budgetGp: budget.finalGp,
    spentGp: spend.totalSpentGp,
    capApplied: !!budget.capApplied
  };

  addTeamTransaction(team, {
    type: 'redraft',
    label: `Re-drafted for Season ${toSeason}`,
    undoBefore,
    delta: { treasuryGp: team.treasury - treasuryBefore, tvGp: null }
  });

  try {
    await apiSave(PATHS.team(league.id, team.id), team, `Re-draft for Season ${toSeason}`, key);
    state.teamRedraft = null;
    state.teamTab = 'overview';
    setStatus(`Re-draft complete for Season ${toSeason}.`, 'ok');
    renderTeamView();
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatK(gp) {
  const val = Math.floor((Number(gp) || 0) / 1000);
  return `${val}k`;
}

function formatSignedK(gp) {
  const k = Math.round((Number(gp) || 0) / 1000);
  if (!k) return '0k';
  return `${k > 0 ? '+' : ''}${k}k`;
}

function getNextPlayerNumber(players) {
  const used = new Set((players || []).map(p => Number(p?.number)).filter(n => Number.isFinite(n)));
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

function ensureTransactions(team) {
  team.transactions = Array.isArray(team.transactions) ? team.transactions : [];
  return team.transactions;
}

function cloneJson(data) {
  return JSON.parse(JSON.stringify(data ?? null));
}

function createUndoSnapshot(team) {
  return {
    treasury: Number(team?.treasury) || 0,
    rerolls: Number(team?.rerolls) || 0,
    apothecary: !!team?.apothecary,
    assistantCoaches: Number(team?.assistantCoaches) || 0,
    cheerleaders: Number(team?.cheerleaders) || 0,
    dedicatedFans: Number(team?.dedicatedFans) || 0,
    redraft: cloneJson(team?.redraft ?? null),
    players: cloneJson(Array.isArray(team?.players) ? team.players : [])
  };
}

function applyUndoSnapshot(team, snap) {
  const s = snap || {};
  team.treasury = Number(s.treasury) || 0;
  team.rerolls = Number(s.rerolls) || 0;
  team.apothecary = !!s.apothecary;
  team.assistantCoaches = Number(s.assistantCoaches) || 0;
  team.cheerleaders = Number(s.cheerleaders) || 0;
  team.dedicatedFans = Number(s.dedicatedFans) || 0;
  if (s.redraft == null) delete team.redraft;
  else team.redraft = cloneJson(s.redraft);
  team.players = cloneJson(Array.isArray(s.players) ? s.players : []);
}

function addTeamTransaction(team, tx) {
  const list = ensureTransactions(team);
  for (const existing of list) {
    if (!existing) continue;
    delete existing.undoBefore;
  }
  list.push({
    id: ulid(),
    at: new Date().toISOString(),
    season: state.currentLeague?.season ?? null,
    ...tx
  });
}

function getMostRecentTransaction(team) {
  const txs = ensureTransactions(team);
  let best = null;
  for (const tx of txs) {
    if (!tx) continue;
    if (!best) { best = tx; continue; }
    if (String(tx.at || '').localeCompare(String(best.at || '')) > 0) best = tx;
  }
  return best;
}

export async function revertMostRecentTeamChange(txId) {
  const team = state.currentTeam;
  if (!team) return;

  const tx = getMostRecentTransaction(team);
  if (!tx) return setStatus('No team transactions yet.', 'error');

  if (txId && tx.id !== txId) return setStatus('Only the most recent change can be reverted.', 'error');

  if (tx.cancelledAt) return setStatus('Most recent change is already cancelled.', 'error');
  if (!tx.undoBefore) return setStatus('Most recent change is not revertible.', 'error');

  const label = tx.label || tx.type || 'Change';
  const ok = await confirmModal('Revert changes?', `Revert: ${label}?`, 'Revert', true);
  if (!ok) return;

  applyUndoSnapshot(team, tx.undoBefore);
  tx.cancelledAt = new Date().toISOString();
  delete tx.undoBefore;

  state.teamDevDraft = {};

  try {
    await saveCurrentTeam({ message: `Revert change: ${label}` });
    setStatus(`Reverted: ${label}`, 'ok');
    renderTeamView();
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

async function confirmProceedWithWarnings({ title, intro, warnings, confirmLabel }) {
  if (!Array.isArray(warnings) || warnings.length === 0) return true;
  const html = `
    <div style="margin-bottom:0.75rem;">${escapeHtml(intro || '')}</div>
    <div style="font-weight:800; margin-bottom:0.35rem;">Proceed anyway?</div>
    <ul style="margin-top:0; padding-left:1.25rem;">
      ${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
    </ul>
    <div class="small" style="color:#666;">This is allowed, but may violate BB2025 rules.</div>
  `;
  return confirmModal(title, html, confirmLabel || 'Proceed', true, true);
}

async function saveCurrentTeam({ message }) {
  const key = els.inputs.editKey?.value;
  if (!key) throw new Error('Edit key required');
  const l = state.currentLeague;
  const t = state.currentTeam;
  if (!l || !t) throw new Error('No league/team loaded');
  t.teamValue = calculateTeamValue(t);
  await apiSave(PATHS.team(l.id, t.id), t, message, key);
}

export async function teamHirePlayer() {
  const team = state.currentTeam;
  const league = state.currentLeague;
  if (!team || !league) return;

  const race = state.gameData?.races?.find(r => r.name === team.race);
  if (!race) return setStatus('Race rules not found.', 'error');

  const posName = document.getElementById('teamHirePos')?.value;
  const pos = (race.positionals || []).find(p => p.name === posName);
  if (!pos) return setStatus('Select a position to hire.', 'error');

  const rawName = document.getElementById('teamHireName')?.value;
  const name = String(rawName || '').trim() || pos.name;

  const rawNumber = document.getElementById('teamHireNumber')?.value;
  let number = parseInt(rawNumber, 10);
  if (!Number.isFinite(number) || number < 1) number = getNextPlayerNumber(team.players || []);

  const roster = Array.isArray(team.players) ? team.players : [];
  const warnings = [];

  const costGp = Number(pos.cost) || 0;
  const treasuryBefore = Number(team.treasury) || 0;
  const treasuryAfter = treasuryBefore - costGp;

  if (treasuryAfter < 0) warnings.push(`Treasury (${formatK(treasuryBefore)}) is less than cost (${formatK(costGp)}).`);

  const totalAfter = roster.length + 1;
  if (totalAfter > 16) warnings.push(`Team Draft List max is 16 players; this would make ${totalAfter}.`);

  const posMax = Number(pos.qtyMax ?? 0) || 0;
  const posCount = roster.filter(p => !p?.dead && p?.position === pos.name).length;
  if (posMax && (posCount + 1 > posMax)) warnings.push(`Max ${posMax} of "${pos.name}" allowed; you currently have ${posCount}.`);

  const numberUsed = roster.some(p => Number(p?.number) === number);
  if (numberUsed) warnings.push(`Jersey number ${number} is already used.`);

  const ok = await confirmProceedWithWarnings({
    title: 'Hire player with warnings?',
    intro: `Hire ${name} (${pos.name}) for ${formatK(costGp)}.`,
    warnings,
    confirmLabel: 'Hire Anyway'
  });
  if (!ok) return;

  const undoBefore = createUndoSnapshot(team);

  const nextPlayer = {
    id: ulid(),
    number,
    name,
    position: pos.name,
    rookieSeason: state.currentLeague?.season ?? null,
    cost: Number(pos.cost) || 0,
    ma: pos.ma,
    st: pos.st,
    ag: pos.ag,
    pa: pos.pa,
    av: pos.av,
    skills: Array.isArray(pos.skills) ? [...pos.skills] : [],
    primary: Array.isArray(pos.primary) ? [...pos.primary] : (pos.primary ? [pos.primary] : []),
    secondary: Array.isArray(pos.secondary) ? [...pos.secondary] : (pos.secondary ? [pos.secondary] : []),
    spp: 0,
    sppSpent: 0,
    advancements: []
  };

  const tvBefore = calculateTeamValue(team);
  team.players = [...roster, nextPlayer];
  team.treasury = treasuryAfter;
  const tvAfter = calculateTeamValue(team);

  addTeamTransaction(team, {
    type: 'hire_player',
    label: `Hired ${name} (${pos.name})`,
    playerId: nextPlayer.id,
    undoBefore,
    delta: { treasuryGp: -costGp, tvGp: tvAfter - tvBefore }
  });

  try {
    await saveCurrentTeam({ message: `Hire player: ${name}` });
    setStatus(`Hired ${name}.`, 'ok');
    renderTeamView();
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

export async function fireTeamPlayer(playerId) {
  const team = state.currentTeam;
  const league = state.currentLeague;
  if (!team || !league) return;

  const roster = Array.isArray(team.players) ? team.players : [];
  const idx = roster.findIndex(p => p.id === playerId);
  if (idx === -1) return setStatus('Player not found.', 'error');
  const player = roster[idx];

  const remaining = roster.filter(p => p.id !== playerId);
  const eligibleAfter = remaining.filter(isPlayerAvailableForMatch).length;

  const warnings = [];
  if (eligibleAfter < 11) warnings.push(`Firing this player would leave ${eligibleAfter} eligible players for the next game (minimum 11).`);

  const intro = `Fire ${player.name} (#${player.number || '?'})? No refund.`;
  const ok = warnings.length
    ? await confirmProceedWithWarnings({ title: 'Fire player with warnings?', intro, warnings, confirmLabel: 'Fire' })
    : await confirmModal('Fire player?', `${intro}\n\nThis cannot be undone.`, 'Fire', true);
  if (!ok) return;

  const undoBefore = createUndoSnapshot(team);

  const tvBefore = calculateTeamValue(team);
  team.players = remaining;
  const tvAfter = calculateTeamValue(team);

  addTeamTransaction(team, {
    type: 'fire_player',
    label: `Fired ${player.name} (${player.position || 'Player'})`,
    playerId,
    undoBefore,
    delta: { treasuryGp: 0, tvGp: tvAfter - tvBefore }
  });

  try {
    await saveCurrentTeam({ message: `Fire player: ${player.name}` });
    setStatus(`Fired ${player.name}.`, 'ok');
    renderTeamView();
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

function categoryNameFromCode(code) {
  const c = String(code || '').toUpperCase();
  const map = { A: 'Agility', D: 'Devious', G: 'General', M: 'Mutation', P: 'Passing', S: 'Strength' };
  return map[c] || null;
}

function categoryLabelFromCode(code) {
  const c = String(code || '').toUpperCase();
  const name = categoryNameFromCode(c);
  return name ? `${c} - ${name}` : c;
}

function normalizeCategoryCodes(input) {
  if (Array.isArray(input)) return input.map(x => String(x || '').trim()).filter(Boolean);
  const raw = String(input || '').trim();
  if (!raw) return [];
  if (raw.includes(',')) return raw.split(',').map(s => s.trim()).filter(Boolean);
  if (raw.includes(' ')) return raw.split(' ').map(s => s.trim()).filter(Boolean);
  if (raw.length > 1) return raw.split('').map(s => s.trim()).filter(Boolean);
  return [raw];
}

function getPlayerCategoryGroups(player, race) {
  const primary = normalizeCategoryCodes(player?.primary);
  const secondary = normalizeCategoryCodes(player?.secondary);
  if (primary.length || secondary.length) return { primary, secondary };

  const positional = (race?.positionals || []).find(p => p.name === player?.position) || null;
  return {
    primary: normalizeCategoryCodes(positional?.primary),
    secondary: normalizeCategoryCodes(positional?.secondary)
  };
}

function getSkillDefByName(skillName) {
  const clean = String(skillName || '').trim();
  if (!clean) return null;
  const cats = state.gameData?.skillCategories;
  if (!cats) return null;
  for (const list of Object.values(cats)) {
    const found = (list || []).find(s => (typeof s === 'object' && s?.name === clean));
    if (found) return found;
  }
  return null;
}

function getSkillDefsForCategoryCode(code) {
  const name = categoryNameFromCode(code);
  if (!name) return [];
  const list = state.gameData?.skillCategories?.[name] || [];
  return Array.isArray(list) ? list.filter(s => typeof s === 'object' && s?.name) : [];
}

function characteristicOptionsFromD8(rollD8) {
  const r = Number(rollD8);
  if (!r || r < 1 || r > 8) return [];
  if (r === 1) return ['av'];
  if (r === 2) return ['av', 'pa'];
  if (r === 3 || r === 4) return ['av', 'ma', 'pa'];
  if (r === 5) return ['ma', 'pa'];
  if (r === 6) return ['ag', 'ma'];
  if (r === 7) return ['ag', 'st'];
  if (r === 8) return ['av', 'ma', 'pa', 'ag', 'st'];
  return [];
}

function statLabel(statKey) {
  const k = String(statKey || '').toLowerCase();
  const map = { ma: 'MA', st: 'ST', ag: 'AG', pa: 'PA', av: 'AV' };
  return map[k] || statKey;
}

function getDefaultDevDraft(player, race) {
  const cats = getPlayerCategoryGroups(player, race);
  const defaultPrimary = cats.primary[0] || 'G';
  return {
    kind: 'chosenPrimary',
    categoryCode: defaultPrimary,
    skillName: '',
    rollD8: null,
    statKey: '',
    outcomeType: 'skill',
    skillFrom: 'primary'
  };
}

function getDevDraft(player, race) {
  state.teamDevDraft = state.teamDevDraft || {};
  if (!state.teamDevDraft[player.id]) state.teamDevDraft[player.id] = getDefaultDevDraft(player, race);
  return state.teamDevDraft[player.id];
}

export function teamDevUpdate(playerId, field, value) {
  const team = state.currentTeam;
  if (!team) return;
  const roster = Array.isArray(team.players) ? team.players : [];
  const player = roster.find(p => p.id === playerId);
  if (!player) return;

  const race = state.gameData?.races?.find(r => r.name === team.race) || null;
  const cats = getPlayerCategoryGroups(player, race);

  const draft = getDevDraft(player, race);
  draft[field] = value;

  if (field === 'kind') {
    const kind = String(value || '');
    const defaultPrimary = cats.primary[0] || 'G';
    const defaultSecondary = cats.secondary[0] || defaultPrimary;
    draft.kind = kind;
    draft.skillName = '';
    draft.rollD8 = null;
    draft.statKey = '';
    draft.skillFrom = (kind === 'chosenSecondary') ? 'secondary' : 'primary';
    draft.outcomeType = (kind === 'characteristic') ? 'stat' : 'skill';
    draft.categoryCode = (kind === 'chosenSecondary') ? defaultSecondary : defaultPrimary;
  }

  if (field === 'skillFrom') {
    const which = String(value || '') === 'secondary' ? 'secondary' : 'primary';
    const defaultPrimary = cats.primary[0] || 'G';
    const defaultSecondary = cats.secondary[0] || defaultPrimary;
    draft.skillFrom = which;
    draft.categoryCode = (which === 'secondary') ? defaultSecondary : defaultPrimary;
    draft.skillName = '';
  }

  if (field === 'categoryCode') {
    draft.categoryCode = String(value || '');
    draft.skillName = '';
  }

  if (field === 'rollD8') {
    const roll = value == null || value === '' ? null : Number(value);
    draft.rollD8 = (roll == null || !Number.isFinite(roll)) ? null : roll;
    const options = characteristicOptionsFromD8(draft.rollD8);
    if (draft.outcomeType === 'stat' && options.length && !options.includes(String(draft.statKey || '').toLowerCase())) {
      draft.statKey = options[0];
    }
  }

  if (field === 'outcomeType') {
    const next = String(value || '') === 'skill' ? 'skill' : 'stat';
    draft.outcomeType = next;
    draft.skillName = '';
    if (next === 'skill') {
      draft.skillFrom = draft.skillFrom || 'primary';
    } else {
      const options = characteristicOptionsFromD8(draft.rollD8);
      if (options.length) draft.statKey = options[0];
    }
  }

  if (field === 'statKey') {
    draft.statKey = String(value || '').toLowerCase();
  }

  if (field === 'skillName') {
    draft.skillName = String(value || '');
  }

  if (state.teamTab === 'development') renderTeamView();
}

export function resetTeamDevDraft(playerId) {
  state.teamDevDraft = state.teamDevDraft || {};
  delete state.teamDevDraft[playerId];
  if (state.teamTab === 'development') renderTeamView();
}

function renderDevelopmentCard({ team, player, race }) {
  const cats = getPlayerCategoryGroups(player, race);
  const primaryCodes = cats.primary.length ? cats.primary : ['G'];
  const secondaryCodes = cats.secondary.length ? cats.secondary : primaryCodes;

  const draft = getDevDraft(player, race);
  const kind = draft.kind || 'chosenPrimary';
  const costRandom = getBb2025AdvancementCost(player, 'randomPrimary');
  const costChosenPrimary = getBb2025AdvancementCost(player, 'chosenPrimary');
  const costChosenSecondary = getBb2025AdvancementCost(player, 'chosenSecondary');
  const costCharacteristic = getBb2025AdvancementCost(player, 'characteristic');

  const costForCurrent = getBb2025AdvancementCost(player, kind) ?? 0;
  const sppAvail = Number(player.spp) || 0;
  const advCount = Array.isArray(player.advancements) ? player.advancements.length : 0;

  const skillsHtml = (player.skills || []).map(s => `<span class="skill-tag" onclick="window.showSkill('${s}')">${escapeHtml(s)}</span>`).join(' ');
  const statsLine = `MA ${player.ma ?? '-'} &nbsp; ST ${player.st ?? '-'} &nbsp; AG ${player.ag ?? '-'} &nbsp; PA ${player.pa ?? '-'} &nbsp; AV ${player.av ?? '-'}`;

  const kindOptions = [
    { v: 'randomPrimary', label: `Random Primary (${costRandom ?? '?'} SPP)` },
    { v: 'chosenPrimary', label: `Chosen Primary (${costChosenPrimary ?? '?'} SPP)` },
    { v: 'chosenSecondary', label: `Chosen Secondary (${costChosenSecondary ?? '?'} SPP)` },
    { v: 'characteristic', label: `Characteristic (${costCharacteristic ?? '?'} SPP, roll D8)` }
  ].map(o => `<option value="${o.v}" ${kind === o.v ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');

  const kindHelp = (kind === 'randomPrimary')
    ? `<div class="small" style="color:#666; margin-top:0.25rem;">Random Primary: roll 2D6 twice on the Skill Table for the chosen category, then select one of the two results.</div>`
    : (kind === 'characteristic')
      ? `<div class="small" style="color:#666; margin-top:0.25rem;">Characteristic: spend SPP, roll D8, then choose an allowed characteristic (or choose a skill instead; SPP spent is still the characteristic cost).</div>`
      : '';

  const needsSkill = (kind !== 'characteristic') || (draft.outcomeType === 'skill');
  const isSecondary = (kind === 'chosenSecondary') || (kind === 'characteristic' && draft.outcomeType === 'skill' && draft.skillFrom === 'secondary');
  const categoryCodes = (kind === 'characteristic' && draft.outcomeType === 'skill')
    ? (draft.skillFrom === 'secondary' ? secondaryCodes : primaryCodes)
    : (kind === 'chosenSecondary' ? secondaryCodes : primaryCodes);

  const categoryCode = categoryCodes.includes(String(draft.categoryCode || '')) ? String(draft.categoryCode || '') : categoryCodes[0];
  const catOptions = categoryCodes.map(c => `<option value="${c}" ${c === categoryCode ? 'selected' : ''}>${escapeHtml(categoryLabelFromCode(c))}</option>`).join('');

  const skillDefs = getSkillDefsForCategoryCode(categoryCode);
  const skillOptions = [
    `<option value="">Select skill...</option>`,
    ...skillDefs.map(s => {
      const elite = s?.isElite ? ' (Elite)' : '';
      const selected = (draft.skillName === s.name) ? 'selected' : '';
      return `<option value="${escapeHtml(s.name)}" ${selected}>${escapeHtml(s.name + elite)}</option>`;
    })
  ].join('');

  const roll = draft.rollD8 ?? '';
  const statOptions = characteristicOptionsFromD8(roll).map(k => `<option value="${k}" ${String(draft.statKey || '').toLowerCase() === k ? 'selected' : ''}>${statLabel(k)}</option>`).join('');
  const allowedStats = characteristicOptionsFromD8(roll).map(statLabel).join('/');

  const outcomeControls = (kind === 'characteristic') ? `
    <div class="form-grid" style="margin-top:0.5rem;">
      <div class="form-field">
        <label>D8 Roll</label>
        <input type="number" min="1" max="8" value="${roll}" onchange="window.teamDevUpdate('${player.id}', 'rollD8', (this.value===''?null:parseInt(this.value)))" />
      </div>
      <div class="form-field">
        <label>Outcome</label>
        <select onchange="window.teamDevUpdate('${player.id}', 'outcomeType', this.value)">
          <option value="stat" ${draft.outcomeType === 'stat' ? 'selected' : ''}>Characteristic</option>
          <option value="skill" ${draft.outcomeType === 'skill' ? 'selected' : ''}>Skill Instead</option>
        </select>
      </div>
      ${draft.outcomeType === 'stat' ? `
        <div class="form-field">
          <label>Characteristic (${allowedStats || '&mdash;'})</label>
          <select onchange="window.teamDevUpdate('${player.id}', 'statKey', this.value)">
            ${statOptions || `<option value="">Enter D8 roll</option>`}
          </select>
        </div>
      ` : `
        <div class="form-field">
          <label>Skill From</label>
          <select onchange="window.teamDevUpdate('${player.id}', 'skillFrom', this.value)">
            <option value="primary" ${draft.skillFrom !== 'secondary' ? 'selected' : ''}>Primary</option>
            <option value="secondary" ${draft.skillFrom === 'secondary' ? 'selected' : ''}>Secondary</option>
          </select>
        </div>
      `}
    </div>
  ` : '';

  const skillControls = needsSkill ? `
    <div class="form-grid" style="margin-top:0.5rem;">
      <div class="form-field">
        <label>Category</label>
        <select onchange="window.teamDevUpdate('${player.id}', 'categoryCode', this.value)">
          ${catOptions || `<option value="">No categories</option>`}
        </select>
      </div>
      <div class="form-field" style="grid-column: span 2;">
        <label>Skill ${isSecondary ? '(Secondary)' : '(Primary)'} </label>
        <select onchange="window.teamDevUpdate('${player.id}', 'skillName', this.value)">
          ${skillOptions}
        </select>
      </div>
    </div>
  ` : '';

  const past = (player.advancements || []).map(a => {
    const when = a.at ? new Date(a.at).toLocaleDateString() : '';
    const what = a.outcomeType === 'stat'
      ? `${statLabel(a.statKey)} (${a.rollD8 ? `D8 ${a.rollD8}` : 'D8'})`
      : `${a.skillName}${a.isElite ? ' (Elite)' : ''}`;
    return `<li>${escapeHtml(`${when} ${what}`.trim())}</li>`;
  }).join('');

  return `
    <div class="panel-styled pg-player-card" style="margin-bottom:0.75rem;">
      <div class="pg-player-header">
        <div class="pg-player-left">
          <div class="pg-player-name">#${escapeHtml(player.number || '?')} ${escapeHtml(player.name || 'Player')}</div>
          <div class="small" style="color:#666;">${escapeHtml(player.position || '')}</div>
          <div class="pg-player-tags" style="margin-top:0.35rem;">${skillsHtml || '<span class="small" style="color:#666;">No skills</span>'}</div>
        </div>
        <div class="pg-player-right">
          <div class="pg-player-spp">SPP: ${sppAvail}</div>
          <div class="small" style="color:#666;">Adv: ${advCount} • Spent: ${player.sppSpent || 0}</div>
        </div>
      </div>

      <div class="small" style="color:#333; margin-top:0.35rem;">${statsLine}</div>

      <div style="margin-top:0.75rem; border-top:1px solid #ccc; padding-top:0.75rem;">
        <div class="form-field">
          <label>Advancement Type</label>
          <select onchange="window.teamDevUpdate('${player.id}', 'kind', this.value)">
            ${kindOptions}
          </select>
          ${kindHelp}
        </div>

        ${outcomeControls}
        ${skillControls}

        <div class="small" style="color:#666; margin-top:0.35rem;">Cost: ${costForCurrent} SPP ${sppAvail - costForCurrent < 0 ? `(after: ${sppAvail - costForCurrent})` : ''}</div>

        <div style="margin-top:0.6rem; display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:flex-end;">
          <button class="secondary-btn" onclick="window.resetTeamDevDraft('${player.id}')">Reset</button>
          <button class="primary-btn" onclick="window.applyTeamAdvancement('${player.id}')">Apply</button>
        </div>

        ${past ? `
          <details style="margin-top:0.6rem;">
            <summary class="small" style="color:#666; cursor:pointer;">Past advancements (${advCount})</summary>
            <ul style="margin-top:0.35rem; padding-left:1.25rem;">${past}</ul>
          </details>
        ` : ''}
      </div>
    </div>
  `;
}

export async function applyTeamAdvancement(playerId) {
  const team = state.currentTeam;
  if (!team) return;
  const roster = Array.isArray(team.players) ? team.players : [];
  const idx = roster.findIndex(p => p.id === playerId);
  if (idx === -1) return setStatus('Player not found.', 'error');
  const player = roster[idx];

  const race = state.gameData?.races?.find(r => r.name === team.race) || null;
  const cats = getPlayerCategoryGroups(player, race);
  const primaryCodes = cats.primary.length ? cats.primary : ['G'];
  const secondaryCodes = cats.secondary.length ? cats.secondary : primaryCodes;

  const draft = getDevDraft(player, race);
  const kind = String(draft.kind || 'chosenPrimary');
  const costSpp = getBb2025AdvancementCost(player, kind);

  const warnings = [];
  if (costSpp == null) warnings.push('Could not determine SPP cost for this advancement.');

  const sppBefore = Number(player.spp) || 0;
  const sppAfter = sppBefore - (Number(costSpp) || 0);
  if (sppAfter < 0) warnings.push(`Not enough SPP (${sppBefore}) to buy this advancement (cost ${costSpp}).`);

  const tvBefore = calculateTeamValue(team);

  let updated = { ...player };
  let valueIncreaseGp = 0;
  let advRecord = null;
  let advLabel = '';

  if (kind === 'characteristic') {
    const outcome = (String(draft.outcomeType || 'stat') === 'skill') ? 'skill' : 'stat';

    if (outcome === 'stat') {
      const roll = Number(draft.rollD8);
      if (!roll || roll < 1 || roll > 8) warnings.push('Characteristic improvements require a D8 roll (1-8).');

      const options = characteristicOptionsFromD8(roll);
      const statKey = String(draft.statKey || '').toLowerCase();
      if (!statKey) warnings.push('Select a characteristic to improve.');
      if (options.length && statKey && !options.includes(statKey)) warnings.push(`Chosen characteristic (${statLabel(statKey)}) is not allowed by D8 roll (${roll}).`);

      const statAdvCount = (player.advancements || []).filter(a => a.outcomeType === 'stat' && String(a.statKey || '').toLowerCase() === statKey).length;
      if (statKey && statAdvCount >= 2) warnings.push(`A characteristic cannot be improved more than twice (already improved ${statLabel(statKey)} ${statAdvCount}x).`);

      const out = applyBb2025CharacteristicIncrease(player, statKey);
      updated = out.player;
      valueIncreaseGp = out.valueIncreaseGp;
      advLabel = `+${statLabel(statKey)}`;
      advRecord = { kind, outcomeType: 'stat', statKey, rollD8: roll || null };
    } else {
      const skillFrom = (String(draft.skillFrom || 'primary') === 'secondary') ? 'secondary' : 'primary';
      const isSecondary = (skillFrom === 'secondary');
      const allowed = isSecondary ? secondaryCodes : primaryCodes;

      const categoryCode = String(draft.categoryCode || '').toUpperCase();
      if (!allowed.includes(categoryCode)) warnings.push(`Category ${categoryCode} is not available as a ${skillFrom} skill.`);

      const skillName = String(draft.skillName || '').trim();
      if (!skillName) warnings.push('Select a skill.');
      if ((player.skills || []).includes(skillName)) warnings.push(`Player already has "${skillName}".`);

      const def = getSkillDefByName(skillName);
      const out = applyBb2025SkillAdvancement(player, { skillName, isSecondary, isEliteSkill: !!def?.isElite });
      updated = out.player;
      valueIncreaseGp = out.valueIncreaseGp;
      advLabel = `+${skillName}`;
      advRecord = { kind, outcomeType: 'skill', skillName, categoryCode, skillFrom, isElite: !!def?.isElite };
    }
  } else {
    const isSecondary = (kind === 'chosenSecondary');
    const allowed = isSecondary ? secondaryCodes : primaryCodes;

    const categoryCode = String(draft.categoryCode || '').toUpperCase();
    if (!allowed.includes(categoryCode)) warnings.push(`Category ${categoryCode} is not available for this advancement type.`);

    const skillName = String(draft.skillName || '').trim();
    if (!skillName) warnings.push('Select a skill.');
    if ((player.skills || []).includes(skillName)) warnings.push(`Player already has "${skillName}".`);

    const def = getSkillDefByName(skillName);
    const out = applyBb2025SkillAdvancement(player, { skillName, isSecondary, isEliteSkill: !!def?.isElite });
    updated = out.player;
    valueIncreaseGp = out.valueIncreaseGp;
    advLabel = `+${skillName}`;
    advRecord = { kind, outcomeType: 'skill', skillName, categoryCode, skillFrom: isSecondary ? 'secondary' : 'primary', isElite: !!def?.isElite };
  }

  const ok = await confirmProceedWithWarnings({
    title: 'Apply advancement with warnings?',
    intro: `${player.name}: ${advLabel} (cost ${costSpp ?? '?'} SPP).`,
    warnings,
    confirmLabel: 'Apply Anyway'
  });
  if (!ok) return;

  const undoBefore = createUndoSnapshot(team);

  updated.spp = sppAfter;
  updated.sppSpent = (Number(updated.sppSpent) || 0) + (Number(costSpp) || 0);

  const existingAdv = Array.isArray(updated.advancements) ? [...updated.advancements] : [];
  const record = {
    id: ulid(),
    at: new Date().toISOString(),
    sppCost: Number(costSpp) || 0,
    valueIncreaseGp,
    ...advRecord
  };
  updated.advancements = [...existingAdv, record];

  team.players = roster.map(p => (p.id === playerId ? updated : p));
  const tvAfter = calculateTeamValue(team);

  addTeamTransaction(team, {
    type: 'advancement',
    label: `Advancement: ${player.name} ${advLabel}`,
    playerId,
    undoBefore,
    delta: { tvGp: tvAfter - tvBefore, sppCost: Number(costSpp) || 0 }
  });

  try {
    await saveCurrentTeam({ message: `Advancement: ${player.name} ${advLabel}` });
    resetTeamDevDraft(playerId);
    setStatus(`Advancement applied: ${player.name} ${advLabel}`, 'ok');
    renderTeamView();
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

export async function teamAdjustStaff(field, delta) {
  const team = state.currentTeam;
  if (!team) return;
  const staffCosts = state.gameData?.staffCosts || { assistantCoach: 10000, cheerleader: 10000, apothecary: 50000 };

  const allowed = new Set(['assistantCoaches', 'cheerleaders']);
  if (!allowed.has(field)) return setStatus('Unknown staff field.', 'error');

  const current = Number(team[field]) || 0;
  const next = current + (Number(delta) || 0);
  if (next < 0) return setStatus('Cannot go below 0.', 'error');

  const unitCost = (field === 'assistantCoaches') ? Number(staffCosts.assistantCoach) || 0 : Number(staffCosts.cheerleader) || 0;
  const treasuryBefore = Number(team.treasury) || 0;
  const deltaCount = next - current;
  const deltaTreasury = (deltaCount > 0) ? -(unitCost * deltaCount) : 0;
  const treasuryAfter = treasuryBefore + deltaTreasury;

  const warnings = [];
  if (deltaCount > 0 && treasuryAfter < 0) warnings.push(`Treasury (${formatK(treasuryBefore)}) is less than cost (${formatK(-deltaTreasury)}).`);
  if (deltaCount < 0) warnings.push('Firing sideline staff gives no refund.');

  const label = (field === 'assistantCoaches') ? 'Assistant Coach' : 'Cheerleader';
  const ok = await confirmProceedWithWarnings({
    title: 'Apply staff change with warnings?',
    intro: `${deltaCount > 0 ? 'Hire' : 'Fire'} ${Math.abs(deltaCount)} ${label}${Math.abs(deltaCount) === 1 ? '' : 's'}.`,
    warnings,
    confirmLabel: 'Apply'
  });
  if (!ok) return;

  const undoBefore = createUndoSnapshot(team);

  const tvBefore = calculateTeamValue(team);
  team[field] = next;
  team.treasury = treasuryAfter;
  const tvAfter = calculateTeamValue(team);

  addTeamTransaction(team, {
    type: deltaCount > 0 ? 'hire_staff' : 'fire_staff',
    label: `${deltaCount > 0 ? 'Hired' : 'Fired'} ${Math.abs(deltaCount)} ${label}${Math.abs(deltaCount) === 1 ? '' : 's'}`,
    undoBefore,
    delta: { treasuryGp: deltaTreasury, tvGp: tvAfter - tvBefore }
  });

  try {
    await saveCurrentTeam({ message: `${deltaCount > 0 ? 'Hire' : 'Fire'} staff: ${label}` });
    setStatus(`${label}${Math.abs(deltaCount) === 1 ? '' : 's'} updated.`, 'ok');
    renderTeamView();
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

export async function teamAdjustRerolls(delta) {
  const team = state.currentTeam;
  if (!team) return;
  const race = state.gameData?.races?.find(r => r.name === team.race) || null;
  const rerollCost = Number(race?.rerollCost) || 50000;
  const buyCost = rerollCost * 2;

  const current = Number(team.rerolls) || 0;
  const next = current + (Number(delta) || 0);
  if (next < 0) return setStatus('Cannot go below 0.', 'error');

  const treasuryBefore = Number(team.treasury) || 0;
  const deltaCount = next - current;
  const deltaTreasury = (deltaCount > 0) ? -(buyCost * deltaCount) : 0;
  const treasuryAfter = treasuryBefore + deltaTreasury;

  const warnings = [];
  if (deltaCount > 0 && treasuryAfter < 0) warnings.push(`Treasury (${formatK(treasuryBefore)}) is less than cost (${formatK(-deltaTreasury)}).`);
  if (deltaCount < 0) warnings.push('BB2025 does not allow removing Team Re-rolls once purchased (and there is no refund).');

  const ok = warnings.length
    ? await confirmProceedWithWarnings({
      title: 'Adjust re-rolls with warnings?',
      intro: `${deltaCount > 0 ? 'Buy' : 'Remove'} ${Math.abs(deltaCount)} re-roll${Math.abs(deltaCount) === 1 ? '' : 's'}.`,
      warnings,
      confirmLabel: 'Apply'
    })
    : true;
  if (!ok) return;

  const undoBefore = createUndoSnapshot(team);

  const tvBefore = calculateTeamValue(team);
  team.rerolls = next;
  team.treasury = treasuryAfter;
  const tvAfter = calculateTeamValue(team);

  addTeamTransaction(team, {
    type: 'rerolls',
    label: `${deltaCount > 0 ? 'Bought' : 'Removed'} ${Math.abs(deltaCount)} re-roll${Math.abs(deltaCount) === 1 ? '' : 's'}`,
    undoBefore,
    delta: { treasuryGp: deltaTreasury, tvGp: tvAfter - tvBefore }
  });

  try {
    await saveCurrentTeam({ message: `Adjust re-rolls` });
    setStatus('Re-rolls updated.', 'ok');
    renderTeamView();
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

export async function teamSetApothecary(nextValue) {
  const team = state.currentTeam;
  if (!team) return;

  const race = state.gameData?.races?.find(r => r.name === team.race) || null;
  const allowed = race?.apothecaryAllowed !== false;
  const staffCosts = state.gameData?.staffCosts || { apothecary: 50000 };

  const next = !!nextValue;
  const current = !!team.apothecary;
  if (next === current) return;

  const treasuryBefore = Number(team.treasury) || 0;
  const cost = Number(staffCosts.apothecary) || 0;
  const deltaTreasury = next ? -cost : 0;
  const treasuryAfter = treasuryBefore + deltaTreasury;

  const warnings = [];
  if (next && !allowed) warnings.push('This team roster cannot hire an Apothecary.');
  if (next && treasuryAfter < 0) warnings.push(`Treasury (${formatK(treasuryBefore)}) is less than cost (${formatK(cost)}).`);
  if (!next) warnings.push('Removing an Apothecary gives no refund.');

  const ok = warnings.length
    ? await confirmProceedWithWarnings({
      title: 'Update apothecary with warnings?',
      intro: `${next ? 'Buy' : 'Remove'} Apothecary.`,
      warnings,
      confirmLabel: 'Apply'
    })
    : await confirmModal('Update apothecary?', `${next ? 'Buy' : 'Remove'} Apothecary?`, 'Apply');
  if (!ok) return;

  const undoBefore = createUndoSnapshot(team);

  const tvBefore = calculateTeamValue(team);
  team.apothecary = next;
  team.treasury = treasuryAfter;
  const tvAfter = calculateTeamValue(team);

  addTeamTransaction(team, {
    type: 'apothecary',
    label: `${next ? 'Bought' : 'Removed'} Apothecary`,
    undoBefore,
    delta: { treasuryGp: deltaTreasury, tvGp: tvAfter - tvBefore }
  });

  try {
    await saveCurrentTeam({ message: `${next ? 'Buy' : 'Remove'} apothecary` });
    setStatus('Apothecary updated.', 'ok');
    renderTeamView();
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

export async function teamApplyTreasuryAdjust(direction) {
  const team = state.currentTeam;
  if (!team) return;

  const rawK = document.getElementById('teamTreasuryAdjustK')?.value;
  const amountK = Number(rawK);
  if (!Number.isFinite(amountK) || amountK <= 0) return setStatus('Enter a positive amount (k).', 'error');

  const sign = (Number(direction) || 0) >= 0 ? 1 : -1;
  const deltaGp = Math.round(amountK * 1000) * sign;
  const reason = String(document.getElementById('teamTreasuryAdjustReason')?.value || '').trim();

  const treasuryBefore = Number(team.treasury) || 0;
  const treasuryAfter = treasuryBefore + deltaGp;

  const warnings = [];
  if (!reason) warnings.push('No reason provided (recommended for audit trail).');
  if (treasuryAfter < 0) warnings.push(`Treasury would go negative (${formatK(treasuryAfter)}).`);

  const ok = await confirmProceedWithWarnings({
    title: 'Apply treasury adjustment with warnings?',
    intro: `Treasury adjustment: ${deltaGp >= 0 ? '+' : ''}${formatK(deltaGp)}.`,
    warnings,
    confirmLabel: 'Apply'
  });
  if (!ok) return;

  const undoBefore = createUndoSnapshot(team);

  const tvBefore = calculateTeamValue(team);
  team.treasury = treasuryAfter;
  const tvAfter = calculateTeamValue(team);

  addTeamTransaction(team, {
    type: 'treasury_adjust',
    label: `Treasury ${deltaGp >= 0 ? '+' : ''}${formatK(deltaGp)}${reason ? ` (${reason})` : ''}`,
    undoBefore,
    delta: { treasuryGp: deltaGp, tvGp: tvAfter - tvBefore }
  });

  try {
    await saveCurrentTeam({ message: `Treasury adjust: ${deltaGp >= 0 ? '+' : ''}${formatK(deltaGp)}` });
    const kInput = document.getElementById('teamTreasuryAdjustK');
    const rInput = document.getElementById('teamTreasuryAdjustReason');
    if (kInput) kInput.value = '';
    if (rInput) rInput.value = '';
    setStatus('Treasury updated.', 'ok');
    renderTeamView();
  } catch (e) {
    setStatus(e.message, 'error');
  }
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
    state.dirtyTeam = createEmptyTeam(ulid());
  }
  renderManageForm(); 
}

function createEmptyTeam(id) {
  const defaultRace = state.gameData?.races?.[0]?.name || 'Human';
  return { 
    schemaVersion: 1,
    id,
    slug: '',
    name: 'New Team', 
    race: defaultRace, 
    coachName: '', 
    players: [], 
    history: [],
    transactions: [],
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
  (t.players || []).forEach(p => { if (!p.id) p.id = ulid(); });
  const raceOpts = (state.gameData?.races || []).map(r => `<option value="${r.name}" ${t.race === r.name ? 'selected' : ''}>${r.name}</option>`).join('');
  const race = state.gameData?.races.find(r => r.name === t.race);
  const rrCost = race ? race.rerollCost : 50000;
  
  if (!t.colors) t.colors = { primary: '#222222', secondary: '#c5a059' };

  els.containers.manageTeamEditor.innerHTML = `
    <h3>${state.editTeamId ? 'Edit Team' : 'Add New Team'}</h3>
    
    <div class="form-grid">
      <div class="form-field"><label>Name</label><input type="text" value="${t.name}" id="teamEditNameInput"></div>
      <div class="form-field"><label>Coach</label><input type="text" value="${t.coachName}" onchange="state.dirtyTeam.coachName = this.value"></div>
      <div class="form-field"><label>Race</label><select onchange="window.changeTeamRace(this.value)">${raceOpts}</select></div>
      <div class="form-field"><label>File ID</label><input type="text" value="${t.id}" readonly class="faded" placeholder="Auto-generated"></div>
    </div>
    
    <div class="form-grid" style="margin-top:1rem; padding:1rem; background:#f4f4f4; border-radius:4px;">
      <div class="form-field">
        <label>Primary Color</label>
        <input type="color" id="teamColorPrimary" value="${t.colors.primary}" 
               oninput="state.dirtyTeam.colors.primary = this.value" 
               style="width:100%; height:40px">
      </div>
      <div class="form-field">
        <label>Secondary Color</label>
        <input type="color" id="teamColorSecondary" value="${t.colors.secondary}" 
               oninput="state.dirtyTeam.colors.secondary = this.value" 
               style="width:100%; height:40px">
      </div>
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
    const currentSkills = (p.skills || []).map((skill, sIdx) => `<span class="skill-pill">${skill}<span class="remove-skill" onclick="window.removePlayerSkill(${idx}, ${sIdx})">×</span></span>`).join('');
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
    state.dirtyTeam.slug = normalizeName(this.value);
  };
}

export async function changeTeamRace(newRace) {
  if (state.dirtyTeam.players.length > 0) {
      const confirmed = await confirmModal("Change Race?", "Changing race will potentially break existing player positions. Continue?", "Change Race", true);
      if (!confirmed) {
          renderTeamEditor(); // Re-render to reset select
          return;
      }
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
  t.players.push({
    id: ulid(),
    number: nextNum,
    name: 'Player',
    position: def.name,
    rookieSeason: state.dirtyLeague?.season ?? state.currentLeague?.season ?? 1,
    cost: Number(def.cost) || 0,
    ma: def.ma,
    st: def.st,
    ag: def.ag,
    pa: def.pa,
    av: def.av,
    skills: Array.isArray(def.skills) ? [...def.skills] : [],
    primary: Array.isArray(def.primary) ? [...def.primary] : (def.primary ? [def.primary] : []),
    secondary: Array.isArray(def.secondary) ? [...def.secondary] : (def.secondary ? [def.secondary] : []),
    spp: 0,
    sppSpent: 0,
    advancements: [],
    injuries: ''
  });
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
  const confirmed = await confirmModal("Delete Team?", `Permanently delete team "${teamId}"?`, "Delete", true);
  if(!confirmed) return;
  
  const key = els.inputs.editKey.value;
  if (!key) return setStatus('Edit key required', 'error');
  try {
    await apiDelete(PATHS.team(state.dirtyLeague.id, teamId), `Delete team ${teamId}`, key);
    const idx = state.dirtyLeague.teams.findIndex(t => t.id === teamId);
    if(idx !== -1) state.dirtyLeague.teams.splice(idx, 1);
    await apiSave(PATHS.league(state.dirtyLeague.id), state.dirtyLeague, `Remove team ${teamId}`, key);
    renderManageForm(); 
    setStatus('Team deleted.', 'ok');
  } catch(e) { setStatus(`Delete failed: ${e.message}`, 'error'); }
}

export async function saveTeam(key) {
  const t = state.dirtyTeam;
  const l = state.dirtyLeague;
  
  if (!t.id) return setStatus('Invalid team name.', 'error');

  if (!l.name || !l.id) {
      const modal = document.createElement('div');
      modal.className = 'modal'; 
      modal.style.display = 'flex'; 
      modal.style.zIndex = '10000';
      modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header"><h3>Name Your League</h3></div>
            <p>You must give your league a name before you can save this team.</p>
            <input type="text" id="tempLeagueNameInput" class="large-input" placeholder="League Name..." style="margin-bottom:1rem;">
            <div class="modal-actions">
                <button id="tempLeagueCancelBtn" class="secondary-btn">Cancel</button>
                <button id="tempLeagueSaveBtn" class="primary-btn">Save Name & Team</button>
            </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      modal.querySelector('#tempLeagueCancelBtn').onclick = () => modal.remove();
      modal.querySelector('#tempLeagueSaveBtn').onclick = () => {
          const val = modal.querySelector('#tempLeagueNameInput').value;
          if(val) {
              l.name = val;
              l.slug = normalizeName(val);
              const realInput = document.getElementById('leagueManageNameInput');
              const realId = document.getElementById('leagueManageIdInput');
              if(realInput) realInput.value = l.name;
              if(realId) realId.value = l.id;
              modal.remove();
              saveTeam(key);
          }
      };
      return; 
  }
  
  const cp = document.getElementById('teamColorPrimary');
  const cs = document.getElementById('teamColorSecondary');
  if(cp && cs) {
      t.colors = { primary: cp.value, secondary: cs.value };
  }
  
  t.slug = t.slug || normalizeName(t.name);
  t.teamValue = calculateTeamValue(t); 
  await apiSave(PATHS.team(l.id, t.id), t, `Save team ${t.name}`, key);
  
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
  await apiSave(PATHS.league(l.id), l, `Update team list for ${t.name}`, key);
  
  setStatus('Team saved & League updated!', 'ok');
}
