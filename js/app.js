import { state, els } from './state.js';
import { init, goHome, goAdmin, handleMobileMatchNav, showSkill, closeSkillModal } from './ui-core.js';
import { handleOpenLeague, handleManageLeague, handleDeleteLeague, saveLeague, handleDeleteMatch, handleEditTeam, renderManageForm } from './ui-league.js';
import { handleOpenTeam, handleManageTeamDirect, changeTeamRace, updatePlayer, updatePlayerPos, addSmartPlayer, removePlayer, addPlayerSkill, removePlayerSkill, handleDeleteTeam, saveTeam, updateLiveTV } from './ui-team.js';
import { handleStartMatch, handleOpenScoreboard, enterCoachMode, exitCoachMode, openPlayerActionSheet, closeActionSheet, handleSheetAction, toggleReroll, openScheduleModal, closeScheduleModal, handleScheduleMatch, handleCoachEndTurn, handleCancelGame, handleEndGame } from './ui-match.js';
import { handleScanRepo, attachTeam, restoreLeague, deleteOrphanFile, deleteLeagueFolder } from './ui-admin.js';
import { setStatus } from './utils.js';

// ============================================
// 1. EXPOSE FUNCTIONS TO WINDOW (For HTML onclicks)
// ============================================

window.handleOpenLeague = handleOpenLeague;
window.handleManageLeague = handleManageLeague;
window.handleDeleteLeague = handleDeleteLeague;
window.handleDeleteMatch = handleDeleteMatch;

window.handleOpenTeam = handleOpenTeam;
window.handleManageTeamDirect = handleManageTeamDirect;
window.handleEditTeam = handleEditTeam;
window.handleDeleteTeam = handleDeleteTeam;

window.changeTeamRace = changeTeamRace;
window.updatePlayer = updatePlayer;
window.updatePlayerPos = updatePlayerPos;
window.addSmartPlayer = addSmartPlayer;
window.removePlayer = removePlayer;
window.addPlayerSkill = addPlayerSkill;
window.removePlayerSkill = removePlayerSkill;
window.updateLiveTV = updateLiveTV;

window.showSkill = showSkill;
window.closeSkillModal = closeSkillModal;

window.closeScheduleModal = closeScheduleModal;
window.handleStartMatch = handleStartMatch;
window.handleOpenScoreboard = handleOpenScoreboard;
window.enterCoachMode = enterCoachMode;
window.exitCoachMode = exitCoachMode;
window.openPlayerActionSheet = openPlayerActionSheet;
window.closeActionSheet = closeActionSheet;
window.handleSheetAction = handleSheetAction;
window.toggleReroll = toggleReroll;

window.restoreLeague = restoreLeague;
window.attachTeam = attachTeam;
window.deleteOrphanFile = deleteOrphanFile;
window.deleteLeagueFolder = deleteLeagueFolder;


// ============================================
// 2. ATTACH EVENT LISTENERS (Static DOM Elements)
// ============================================

// Navigation
els.nav.deskLeagues.addEventListener('click', () => goHome());
els.nav.mobLeagues.addEventListener('click', () => goHome());
els.nav.deskAdmin.addEventListener('click', () => goAdmin());
els.nav.mobAdmin.addEventListener('click', () => goAdmin());
els.nav.mobMatch.addEventListener('click', () => handleMobileMatchNav());

// Key Management
els.mobileKey.btn.addEventListener('click', () => els.mobileKey.modal.classList.remove('hidden'));
els.mobileKey.save.addEventListener('click', () => {
  const k = els.mobileKey.input.value;
  if(k) { localStorage.setItem('bb3_edit_key', k); if(els.inputs.editKey) els.inputs.editKey.value = k; els.mobileKey.modal.classList.add('hidden'); setStatus("Key Saved", 'ok'); }
});
if(els.buttons.rememberKey) {
  els.buttons.rememberKey.addEventListener('click', () => {
    const k = els.inputs.editKey.value;
    if(k) { localStorage.setItem('bb3_edit_key', k); setStatus('Key saved.', 'ok'); }
  });
}

// Scheduling
if(els.buttons.deskSchedBtn) els.buttons.deskSchedBtn.addEventListener('click', openScheduleModal);
if(els.buttons.mobSchedBtn) els.buttons.mobSchedBtn.addEventListener('click', openScheduleModal);
if(els.scheduleModal.addBtn) els.scheduleModal.addBtn.addEventListener('click', handleScheduleMatch);

// Scoreboard / Match Buttons
if(els.buttons.coachEndTurn) els.buttons.coachEndTurn.addEventListener('click', handleCoachEndTurn);
if(els.buttons.cancelGame) els.buttons.cancelGame.addEventListener('click', handleCancelGame);
if(els.buttons.endGame) els.buttons.endGame.addEventListener('click', handleEndGame);
if(els.buttons.sbRefresh) els.buttons.sbRefresh.addEventListener('click', () => handleOpenScoreboard(state.activeMatchData.matchId));
if(els.buttons.sbBack) els.buttons.sbBack.addEventListener('click', () => {
  if (state.activeMatchPollInterval) clearInterval(state.activeMatchPollInterval);
  // Import from UI core to avoid circ dependency or just manual logic:
  document.getElementById('scoreboardSection').classList.add('hidden');
  document.getElementById('leagueViewSection').classList.remove('hidden');
  if (state.viewLeagueId) handleOpenLeague(state.viewLeagueId);
});


// Admin / Management Buttons
if(els.buttons.scanBtn) els.buttons.scanBtn.addEventListener('click', handleScanRepo);
els.buttons.createLeague.addEventListener('click', () => handleManageLeague(null));
els.buttons.manageAddTeam.addEventListener('click', () => handleEditTeam(null));

// Management Save Button (Route to League or Team save)
els.buttons.manageSave.addEventListener('click', () => {
    const key = els.inputs.editKey.value;
    if (!key) return setStatus('Edit key required', 'error');
    
    if (state.editMode === 'team') {
        saveTeam(key);
    } else {
        saveLeague(key);
    }
});

// Back Buttons
els.buttons.manageBack.addEventListener('click', () => {
  if (state.editMode === 'team') {
      if (state.editorReturnPath === 'teamView' && state.currentTeam) {
          handleOpenTeam(state.currentLeague.id, state.currentTeam.id);
      } else {
          state.editMode = 'league'; 
          renderManageForm();
      }
  } else {
      goHome();
  }
});
if(els.buttons.teamBack) els.buttons.teamBack.addEventListener('click', () => {
  if (state.currentLeague) handleOpenLeague(state.currentLeague.id);
  else goHome();
});


// ============================================
// 3. START APP
// ============================================
init();
