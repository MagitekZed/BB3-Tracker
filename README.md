Here is the completely updated `README.md` that reflects the new architecture, data structure, and features we have built.

````markdown
# Blood Bowl 3 League Tracker

A lightweight, serverless web app for tracking **in-person Blood Bowl 2020 / BB3 leagues**, managing teams, and running live match scoreboards.

* **Frontend:** Vanilla HTML/JS/CSS (Single Page App).
* **Backend:** Cloudflare Worker (proxy to GitHub API).
* **Database:** Your GitHub Repository (JSON files).
* **Authentication:** Shared "Edit Key" for write operations.

---

## Features

### 🏆 League Management
* **Multi-League Support:** Run multiple leagues simultaneously.
* **League Settings:** Configure points for Win/Draw/Loss and max team counts.
* **Standings:** Automatic calculation of W/D/L, Points, and TD/CAS differentials based on completed matches.

### 🏈 Team & Roster Management
* **Smart Creation:** Create teams using official **Blood Bowl 2020** templates. Stats (MA, ST, AG, PA, AV) and starting skills are auto-filled based on race and position.
* **Skill Pills:** Add skills using a searchable dropdown (e.g., "Block", "Dodge") which appear as removeable tags.
* **Skill Tooltips:** Click any skill tag to see the full rule description in a popup.
* **File-Based Architecture:** Each team is stored as its own JSON file, preventing data overwrite conflicts.

### ⚔️ The Match Engine
* **Scheduling:** Simple form to pair teams and schedule rounds.
* **Live "Active Match" System:**
    * **Dual-View UI:**
        * **Jumbotron (Spectator):** Read-only, auto-refreshing view showing the score, turn timer, and simple rosters. Ideal for a tablet on the table.
        * **Coach Dashboard (Controller):** Mobile-optimized view for each player to manage *their* team. Track used players, re-rolls, and apothecary.
    * **Stat Tracking:** Track Touchdowns, Casualties, Interceptions, Completions, and MVPs.
    * **Injury Management:** Mark players as Healthy, KO (Knocked Out), Casualty (CAS), or Sent Off.
* **Post-Game:** Ending a match automatically updates the league schedule, saves the final score/casualties, and cleans up the temporary match file.

### 🛠️ Admin & Safety Tools
* **Orphan Scanner:** Scans your GitHub repository for "Ghost Leagues" or "Orphan Teams" (files that exist but aren't linked in the UI) and offers one-click fixes (Attach or Delete).
* **Raw Editor:** Emergency access to edit the raw JSON of any file.

---

## Data Structure

The app uses a folder-based structure in your repository to manage data:

```text
data/
├── gameData.json                # Static database of Races, Positions, and Skill descriptions
├── active_matches/              # Temporary files for live games
│   └── match_171562.json        # Created on "Start Match", deleted on "End Game"
└── leagues/
    ├── index.json               # Master list of all leagues (ID, Name, Status)
    └── {league_id}/
        ├── settings.json        # League config, standings cache, and match schedule
        └── teams/
            ├── team_orc.json    # Individual team rosters
            └── team_human.json
````

-----

## Installation Guide

### Prerequisites

  * A GitHub Account.
  * A Cloudflare Account (Workers are free).
  * Git installed locally (optional, but helpful).

### 1\. GitHub Setup

1.  Fork or Clone this repository.
2.  Enable **GitHub Pages** in your repo settings (deploy from `main` branch, root folder).
3.  Create a **Personal Access Token (PAT)** with `repo` (read/write) permissions.

### 2\. Cloudflare Worker Setup

1.  Navigate to the `cloudflare-worker/` folder.
2.  Install dependencies: `npm install`
3.  Update `wrangler.toml` with your GitHub details:
    ```toml
    [vars]
    GITHUB_OWNER = "YourUsername"
    GITHUB_REPO = "YourRepoName"
    GITHUB_BRANCH = "main"
    # EDIT_KEY is set via secrets, not here!
    ```
4.  Set your secrets (Security Keys):
    ```bash
    npx wrangler secret put GITHUB_TOKEN  # Paste your PAT
    npx wrangler secret put EDIT_KEY      # Set a password for your app
    ```
5.  Deploy: `npx wrangler deploy`

### 3\. Frontend Configuration

1.  Open `app.js` in the root folder.
2.  Update the `API_BASE` constant to match your new Cloudflare Worker URL:
    ```javascript
    const API_BASE = '[https://your-worker-name.your-subdomain.workers.dev](https://your-worker-name.your-subdomain.workers.dev)';
    ```
3.  Commit and Push changes to GitHub.

-----

## Usage

1.  **Login:** Open the site. Enter your **Edit Key** in the top right and click the 💾 icon to save it to your browser.
2.  **Create League:** Click "Create New League". Give it a name (ID is auto-generated).
3.  **Add Teams:** Inside the league, click "Add New Team". Select a Race (e.g., Orc, Black Orc) and add players.
      * *Tip: Changing a player's position (e.g., from Lineman to Blitzer) auto-updates their stats.*
4.  **Schedule:** In the League View, use the "Schedule Match" box to pair two teams.
5.  **Play:** Click **"Start Match"** on a scheduled game.
      * Open the **Jumbotron** on a shared screen.
      * Each player clicks **"Play as Home/Away"** on their phone to open their **Coach Dashboard**.
      * Track stats and turn progress live.
6.  **End Game:** Click "End Game" on the Jumbotron to commit results to the league history.

-----

## Credits

  * Built with Vanilla JS and Cloudflare Workers.
  * Ruleset based on **Blood Bowl 2020 (Season 2)**.

<!-- end list -->

```
```
