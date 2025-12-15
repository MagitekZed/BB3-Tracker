import { state, els } from './state.js';
import { init, goHome, goAdmin, handleMobileMatchNav, showSkill, closeSkillModal, showSection } from './ui-core.js';
import { handleOpenLeague, handleManageLeague, handleDeleteLeague, saveLeague, handleDeleteMatch, renderManageForm, handleViewMatchReport } from './ui-league.js';
import { handleOpenTeam, handleManageTeamDirect, handleEditTeam, changeTeamRace, updatePlayer, updatePlayerPos, addSmartPlayer, removePlayer, addPlayerSkill, removePlayerSkill, handleDeleteTeam, saveTeam, updateLiveTV } from './ui-team.js';
import { handleStartMatch, handleOpenScoreboard, enterCoachMode, exitCoachMode, openPlayerActionSheet, closeActionSheet, handleSheetAction, toggleReroll, openScheduleModal, closeScheduleModal, handleScheduleMatch, handleCoachEndTurn, handleCancelGame, handleEndGame, closePreMatchModal, changeInducement, setCustomInducement, confirmMatchStart, toggleStar, randomMvp, closePostGameModal, manualAdjustStat, openInGameShop, handleUseInducement, setJourneymanType, handlePreMatchPrimary, handlePreMatchBack } from './ui-match.js';
import { handleScanRepo, attachTeam, restoreLeague, deleteOrphanFile, deleteLeagueFolder } from './ui-admin.js';
import { setStatus } from './utils.js';

// ============================================
// 1. EXPOSE FUNCTIONS TO WINDOW (For HTML onclicks)
// ============================================

window.state = state;
window.showSection = showSection;

window.handleOpenLeague = handleOpenLeague;
window.handleManageLeague = handleManageLeague;
window.handleDeleteLeague = handleDeleteLeague;
window.handleDeleteMatch = handleDeleteMatch;
window.handleViewMatchReport = handleViewMatchReport;

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

// Chunk 2 & 4 Exports
window.closePreMatchModal = closePreMatchModal;
window.closePostGameModal = closePostGameModal;
window.changeInducement = changeInducement;
window.setCustomInducement = setCustomInducement;
window.confirmMatchStart = confirmMatchStart;
window.toggleStar = toggleStar;
window.randomMvp = randomMvp;
window.manualAdjustStat = manualAdjustStat;
window.setJourneymanType = setJourneymanType;

// In-Match Inducement Manager
window.openInGameShop = openInGameShop;
window.handleUseInducement = handleUseInducement;

window.restoreLeague = restoreLeague;
window.attachTeam = attachTeam;
window.deleteOrphanFile = deleteOrphanFile;
window.deleteLeagueFolder = deleteLeagueFolder;


// ============================================
// 2. ATTACH EVENT LISTENERS (Static DOM Elements)
// ============================================

// Navigation
if(els.nav.deskLeagues) els.nav.deskLeagues.addEventListener('click', () => goHome());
if(els.nav.mobLeagues) els.nav.mobLeagues.addEventListener('click', () => goHome());
if(els.nav.deskAdmin) els.nav.deskAdmin.addEventListener('click', () => goAdmin());
if(els.nav.mobAdmin) els.nav.mobAdmin.addEventListener('click', () => goAdmin());
if(els.nav.mobMatch) els.nav.mobMatch.addEventListener('click', () => handleMobileMatchNav());

// Key Management
if(els.mobileKey.btn) els.mobileKey.btn.addEventListener('click', () => els.mobileKey.modal.classList.remove('hidden'));
if(els.mobileKey.save) els.mobileKey.save.addEventListener('click', () => {
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
  document.getElementById('scoreboardSection').classList.add('hidden');
  document.getElementById('leagueViewSection').classList.remove('hidden');
  if (state.viewLeagueId) handleOpenLeague(state.viewLeagueId);
});

// Pre-Match Start Button
if(els.preMatch.startBtn) els.preMatch.startBtn.addEventListener('click', handlePreMatchPrimary);
if(els.preMatch.backBtn) els.preMatch.backBtn.addEventListener('click', handlePreMatchBack);


// Admin / Management Buttons
if(els.buttons.scanBtn) els.buttons.scanBtn.addEventListener('click', handleScanRepo);
if(els.buttons.createLeague) els.buttons.createLeague.addEventListener('click', () => handleManageLeague(null));
if(els.buttons.manageAddTeam) els.buttons.manageAddTeam.addEventListener('click', () => handleEditTeam(null));

// Management Save Button (Route to League or Team save)
if(els.buttons.manageSave) els.buttons.manageSave.addEventListener('click', () => {
    const key = els.inputs.editKey.value;
    if (!key) return setStatus('Edit key required', 'error');
    
    if (state.editMode === 'team') {
        saveTeam(key);
    } else {
        saveLeague(key);
    }
});

// Back Buttons
if(els.buttons.manageBack) els.buttons.manageBack.addEventListener('click', () => {
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
