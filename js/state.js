export const state = {
  // Global Data
  leaguesIndex: [],
  gameData: null,
  
  // Current View Data
  currentLeague: null,
  currentTeam: null,
  activeMatchData: null,
  activeMatchPollInterval: null,
  coachSide: null, 
  
  // Navigation State
  viewLeagueId: null,
  viewTeamId: null,
  
  // Action Sheet State
  selectedPlayerIdx: null,
  
  // Editing State
  editLeagueId: null,
  editTeamId: null,
  editMode: 'league',
  dirtyLeague: null,
  dirtyTeam: null,
  
  // Smart Back Button State
  editorReturnPath: 'leagueManage' // 'leagueManage' or 'teamView'
};

export const els = {
  globalStatus: document.getElementById('globalStatus'),
  toastContainer: document.getElementById('toastContainer'),
  
  nav: {
    deskLeagues: document.getElementById('navDeskLeagues'),
    deskAdmin: document.getElementById('navDeskAdmin'),
    mobLeagues: document.getElementById('navMobLeagues'),
    mobMatch: document.getElementById('navMobMatch'),
    mobAdmin: document.getElementById('navMobAdmin'),
    breadcrumbs: document.getElementById('breadcrumbs')
  },
  mobileKey: {
    btn: document.getElementById('mobileKeyToggle'),
    modal: document.getElementById('mobileKeyModal'),
    input: document.getElementById('mobileKeyInput'),
    save: document.getElementById('mobileKeySaveBtn')
  },
  scheduleModal: {
    el: document.getElementById('scheduleModal'),
    round: document.getElementById('schedModalRound'),
    home: document.getElementById('schedModalHome'),
    away: document.getElementById('schedModalAway'),
    addBtn: document.getElementById('schedModalAddBtn')
  },
  actionSheet: {
    el: document.getElementById('playerActionSheet'),
    title: document.getElementById('actionSheetTitle')
  },
  sections: {
    list: document.getElementById('leagueListSection'),
    view: document.getElementById('leagueViewSection'),
    manage: document.getElementById('leagueManageSection'),
    team: document.getElementById('teamViewSection'),
    scoreboard: document.getElementById('scoreboardSection'),
    coach: document.getElementById('coachSection'),
    admin: document.getElementById('adminSection')
  },
  containers: {
    leagueList: document.getElementById('leagueListContainer'),
    standings: document.getElementById('standingsContainer'),
    matches: document.getElementById('matchesContainer'),
    inProgress: document.getElementById('inProgressContainer'),
    rosterQuick: document.getElementById('rosterQuickViewContainer'),
    manageTeams: document.getElementById('leagueManageTeamsList'),
    manageTeamEditor: document.getElementById('leagueManageTeamEditor'),
    teamSummary: document.getElementById('teamSummary'),
    teamRoster: document.getElementById('teamRosterContainer'),
    sbHomeName: document.getElementById('sbHomeName'),
    sbAwayName: document.getElementById('sbAwayName'),
    sbHomeScore: document.getElementById('sbHomeScore'),
    sbAwayScore: document.getElementById('sbAwayScore'),
    sbHomeTurn: document.getElementById('sbHomeTurn'),
    sbAwayTurn: document.getElementById('sbAwayTurn'),
    sbHomeRoster: document.getElementById('scoreboardHomeRoster'),
    sbAwayRoster: document.getElementById('scoreboardAwayRoster'),
    coachTeamName: document.getElementById('coachTeamName'),
    coachScore: document.getElementById('coachScoreDisplay'),
    coachRerolls: document.getElementById('coachRerolls'),
    coachTurn: document.getElementById('coachTurnDisplay'),
    coachRoster: document.getElementById('coachRosterList'),
    delLeagueBtn: document.getElementById('deleteLeagueContainer'),
    scanResults: document.getElementById('scanResults'),
    teamViewHeader: document.getElementById('teamViewHeaderContainer')
  },
  buttons: {
    createLeague: document.getElementById('leagueCreateBtn'),
    manageSave: document.getElementById('leagueManageSaveBtn'),
    manageAddTeam: document.getElementById('leagueManageAddNewTeamBtn'),
    manageBack: document.getElementById('leagueManageBackBtn'),
    teamManage: document.getElementById('teamManageBtn'),
    teamBack: document.getElementById('teamBackBtn'),
    leagueBack: document.getElementById('leagueBackBtn'), // Added safely in case it exists in future HTML
    sbBack: document.getElementById('scoreboardBackToMatchBtn'),
    sbRefresh: document.getElementById('scoreboardRefreshBtn'),
    endGame: document.getElementById('endGameBtn'),
    rememberKey: document.getElementById('rememberKeyBtn'),
    coachEndTurn: document.getElementById('coachEndTurnBtn'),
    scanBtn: document.getElementById('scanBtn'),
    loadBtn: document.getElementById('loadBtn'),
    saveBtn: document.getElementById('saveBtn'),
    deskSchedBtn: document.getElementById('desktopSchedBtn'),
    mobSchedBtn: document.getElementById('mobileAddMatchBtn'),
    cancelGame: document.getElementById('cancelGameBtn')
  },
  inputs: {
    editKey: document.getElementById('editKeyInput'),
    leagueId: document.getElementById('leagueManageIdInput'),
    leagueName: document.getElementById('leagueManageNameInput'),
    leagueSeason: document.getElementById('leagueManageSeasonInput'),
    leagueStatus: document.getElementById('leagueManageStatusSelect'),
    ptsWin: document.getElementById('leagueManagePointsWinInput'),
    ptsDraw: document.getElementById('leagueManagePointsDrawInput'),
    ptsLoss: document.getElementById('leagueManagePointsLossInput'),
    maxTeams: document.getElementById('leagueManageMaxTeamsInput'),
    lockTeams: document.getElementById('leagueManageLockTeamsInput'),
    adminText: document.getElementById('leagueTextarea')
  },
  cards: {
    leagueInfo: document.getElementById('leagueInfoCard'),
    leagueTeams: document.getElementById('leagueTeamsCard'),
    teamEditor: document.getElementById('teamEditorCard')
  },
  modal: {
    el: document.getElementById('skillModal'),
    title: document.getElementById('skillModalTitle'),
    body: document.getElementById('skillModalBody')
  },
  datalist: document.getElementById('skillList')
};
