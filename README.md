# Blood Bowl Tracker (BB2025)

A lightweight web app for tracking **in-person Blood Bowl leagues** using the **Blood Bowl 2025** league rules (BB2025).

- **Frontend:** Vanilla HTML/CSS/JS (single-page app), designed for both desktop and mobile
- **Storage:** JSON files in this repository
- **API:** Cloudflare Worker that proxies reads/writes to GitHub
- **Auth:** shared **Edit Key** required for write operations

## Features

- **Leagues & seasons**
  - Multiple leagues
  - Standings + leaders + team stats + player stats
  - Schedule management + season schedule generator
  - Play-offs, off-season flow, and start next season
- **Teams**
  - Team creation from roster templates (positions/stats/starting skills)
  - Staff & treasury management (rerolls, apothecary, assistants, cheerleaders, dedicated fans)
  - Development: spend SPP for skills/characteristics (BB2025), with helper-only random rolls where applicable
  - Rule compliance: warn-and-allow validations + “tap to view violations”
  - History: team transactions + undo most recent change
- **Matches**
  - Pre-match setup + inducements workflow (step-by-step per coach)
  - Random coin toss
  - Live match tracking (coach view + spectator/jumbotron view)
  - Post-game sequence (SPP allocation, injuries, winnings, updates to league/teams)
  - Dice helpers: optional buttons to fill roll inputs (no automated match resolution)
- **Glossary**
  - Full-screen glossary modal with search + filters
  - Skills/inducements/star players are clickable throughout the UI to open their cards

## Data layout (file “database”)

```text
data/
  gameData.json
  active_matches/
    {matchId}.json
  leagues/
    index.json
    {leagueId}/
      league.json
      teams/
        {teamId}.json
      matches/
        {matchId}.json
```

- IDs are **ULIDs** internally (league/team/player/match), but the UI displays names (not IDs).

## Deployment

### 1) GitHub Pages (frontend)

1. Fork or clone this repo.
2. Enable **GitHub Pages** for the repo (deploy from `main`, root folder).

### 2) Cloudflare Worker (API)

1. Open `cloudflare-worker/`
2. Install deps: `npm install`
3. Configure `wrangler.toml` with your repo details.
4. Set secrets:
   - `GITHUB_TOKEN` (GitHub PAT with repo read/write)
   - `EDIT_KEY` (shared password used by the app for write operations)
5. Deploy: `npx wrangler deploy`

### 3) Point the frontend at your Worker

Update `js/config.js` to set `API_BASE` to your Worker URL.

## Notes

- This app is built to help track league administration accurately, but it intentionally follows a **warn-and-allow** philosophy: it will warn when something looks out of bounds, and allow you to proceed with explicit confirmation.
