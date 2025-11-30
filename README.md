````markdown
# Blood Bowl 3 League Tracker

A lightweight web app for tracking **in-person Blood Bowl 3 / BB2020 leagues**, standings, teams, and matches – with data stored in a GitHub repo via a Cloudflare Worker.

- Frontend: Static site (HTML/JS/CSS) on GitHub Pages  
- Backend: Cloudflare Worker that reads/writes `data/league.json` in this repo  
- Auth: Simple shared **edit key** for commissioners (no user accounts)

> The goal: be “good enough for league night” rather than a full-on league management SaaS.

---

## Features

### Implemented (v1)

**Leagues**

- League list + selector
- League detail view:
  - Name, season, status
  - Team count and match counts
  - Standings table (computed from completed matches)
  - Match list (completed / scheduled / in progress)

**Teams**

- Team detail view:
  - Coach, race, TV, treasury, rerolls, fan factor
  - Calculated record (W/D/L, TD diff, Cas diff)
  - Full roster table (basic read-only)

**Matches & Scoreboard**

- Match detail view:
  - Home vs away teams, score, status, date
  - Casualties inflicted summary
  - SPP log table (per player, per event)
- Scoreboard view (read-only skeleton):
  - Current score
  - Basic live-state info (half, turns) if present
  - Home/away roster lists

**Admin & Commissioner Tools**

- Admin / Raw JSON view:
  - Load and edit full `league.json`
  - Save changes via Cloudflare Worker → GitHub commit
- League Management view:
  - Create a new league
  - Edit league info:
    - ID, name, season, status
    - Points for win/draw/loss
    - Max teams, lockTeams flag
  - Manage teams within a league:
    - Add/remove teams
    - Edit team meta:
      - ID, name, race, coach name
      - TV, treasury, rerolls, dedicated fans

> NOTE: Player editing, match creation, and live in-browser scoreboard editing are **planned**, not fully implemented yet.

---

## Tech Stack

- **Frontend**
  - Vanilla HTML/JS/CSS
  - Hosted on GitHub Pages
- **Backend**
  - Cloudflare Worker (`cloudflare-worker/src/worker.js`)
  - Uses GitHub API to read/write `data/league.json`
- **Data Storage**
  - `data/league.json` in this repo as the single source of truth

---

## Data Model (High-Level)

`data/league.json` is expected to look roughly like:

```json
{
  "leagues": [
    {
      "id": "league_1",
      "name": "Demo League",
      "season": 1,
      "status": "active",
      "settings": {
        "pointsWin": 3,
        "pointsDraw": 1,
        "pointsLoss": 0,
        "tiebreakers": ["points", "tdDiff", "casDiff"],
        "maxTeams": 16,
        "lockTeams": false
      },
      "teams": [
        {
          "id": "team_1",
          "name": "The Example Squad",
          "race": "Humans",
          "coachName": "Coach Name",
          "teamValue": 1000000,
          "treasury": 0,
          "rerolls": 2,
          "dedicatedFans": 3,
          "players": [
            {
              "id": "player_1",
              "number": 1,
              "name": "Blitzer Guy",
              "position": "Blitzer",
              "ma": 7,
              "st": 3,
              "ag": 3,
              "pa": 4,
              "av": 9,
              "skills": ["Block"],
              "injuries": [],
              "spp": 6,
              "level": 2,
              "status": {
                "mng": false,
                "dead": false,
                "retired": false
              }
            }
          ]
        }
      ],
      "matches": [
        {
          "id": "match_1",
          "round": 1,
          "homeTeamId": "team_1",
          "awayTeamId": "team_2",
          "status": "completed",
          "date": "2025-01-01",
          "score": {
            "home": 2,
            "away": 1
          },
          "casualties": {
            "homeInflicted": 2,
            "awayInflicted": 1
          },
          "sppLog": [
            {
              "teamId": "team_1",
              "playerId": "player_1",
              "type": "TD",
              "amount": 3
            }
          ],
          "liveState": {
            "half": 2,
            "turn": {
              "home": 7,
              "away": 7
            }
          }
        }
      ]
    }
  ]
}
````

The UI is fairly resilient to missing optional fields; most things will default to sensible values.

---

## Getting Started

### Prerequisites

* Node.js + npm (for local dev / tooling)
* Cloudflare account
* GitHub account
* A Personal Access Token (PAT) with permission to read/write this repo’s contents

### 1. Clone the repo

```bash
git clone https://github.com/MagitekZed/BB3-Tracker.git
cd BB3-Tracker
```

### 2. Cloudflare Worker Setup

The Worker code lives under:

```text
cloudflare-worker/
  wrangler.toml
  src/
    worker.js
```

You’ll use [Wrangler](https://developers.cloudflare.com/workers/wrangler/) to deploy it.

#### Install Wrangler

```bash
npm install -g wrangler
```

Log in:

```bash
wrangler login
```

#### Configure `wrangler.toml`

Make sure `cloudflare-worker/wrangler.toml` has something like:

```toml
name = "bb3-tracker-api"
main = "src/worker.js"
compatibility_date = "2024-01-01"

[vars]
GITHUB_OWNER = "MagitekZed"
GITHUB_REPO = "BB3-Tracker"
GITHUB_FILE_PATH = "data/league.json"

# This should be a strong secret that you share only with commissioners
EDIT_KEY = "your-edit-key-here"
```

Set your GitHub PAT as a secret so it’s not in the file:

```bash
cd cloudflare-worker
wrangler secret put GITHUB_TOKEN
# paste PAT when prompted
```

Then deploy:

```bash
wrangler deploy
```

You should get a URL like:

```text
https://bb3-tracker-api.your-subdomain.workers.dev
```

In the frontend, this URL is referenced as:

```js
const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';
```

Change this in `app.js` if your Worker URL differs.

---

### 3. GitHub Pages Setup

This repo is structured as a static site:

```text
BB3-Tracker/
  index.html
  app.js
  styles.css
  data/
    league.json
  cloudflare-worker/
    ...
```

In GitHub:

1. Go to **Settings → Pages**
2. Choose source: `Deploy from a branch`
3. Select branch (e.g. `main`) and folder `/` (root)
4. Save

GitHub will give you a Pages URL, like:

```text
https://magitekzed.github.io/BB3-Tracker/
```

Open that in a browser – if your Worker URL is correct and `league.json` exists, the app should load.

---

## How the Worker API Works

The frontend uses two endpoints:

### `GET /api/league`

Returns the current `data/league.json` contents.

Used for:

* League list
* League views
* Team/match/scoreboard views
* Admin “Load league.json”

### `POST /api/league`

Updates `data/league.json` and creates a commit.

**Headers:**

* `Content-Type: application/json`
* `X-Edit-Key: <your edit key>`

**Body format:**

```json
{
  "league": { "leagues": [ /* ... */ ] },
  "message": "Update league from web UI"
}
```

The Worker:

* Validates the `X-Edit-Key` against its `EDIT_KEY` env var
* Uses the GitHub API with `GITHUB_TOKEN` to update `data/league.json`
* Commits with the given message

---

## Using the App

### Leagues Tab

* **Leagues list**

  * Shows all leagues from `league.json`
  * Each has `Open` and `Manage` links

* **Open**

  * Takes you to the League detail:

    * Standings
    * Matches
    * Links to team pages and match detail pages

* **Manage**

  * Opens the League Management view:

    * Edit league info (ID, name, season, status, points, maxTeams, lockTeams)
    * Manage teams:

      * Add new teams
      * Remove existing teams
      * Edit basic team meta fields

### League Management View

* **League Info**

  * ID must be unique across leagues
  * `pointsWin/Draw/Loss` are used to compute standings
  * `maxTeams` and `lockTeams` are for future scheduling / enforcement logic

* **Teams in League**

  * “+ Add New Team” creates a placeholder team
  * Each team has:

    * **Edit** → opens inline team editor (ID, name, race, coach, TV, etc.)
    * **Remove** → removes from the league (not saved until you click “Save League Changes”)

* **Save League Changes**

  * Requires the edit key (set in the Admin section / localStorage)
  * Persists everything back to GitHub

### Team Detail View

* Click a team name in the **Standings** table
* See:

  * Team meta (coach, race, TV, treasury, rerolls, fans)
  * Record + TD and casualty diffs
  * Full roster table

> Player editing is not wired into this view yet; it’s read-only for now.

### Match Detail & Scoreboard

* From League → Matches table → **View**

  * Shows match summary, scores, casualties, SPP log
  * “Open Scoreboard View” shows:

    * Current score
    * Live-state info (if present in `liveState`)
    * Home/away roster lists

> Scoreboard is currently **read-only**; actual in-game editing is planned.

### Admin / Raw JSON

* Enter your **edit key**
* **Load league.json**

  * Pulls the full JSON from the Worker
* **Save league.json**

  * Pushes the JSON back via the Worker and creates a commit

This is your “escape hatch” for bulk edits, weird fixes, or custom migration scripts.

---

## Security & Limitations

* **Edit key** is a shared secret for commissioner actions.

  * Anyone with the key can modify `league.json`.
  * Treat it like a password; rotate if needed.
* No per-user accounts or granular permissions (by design, for simplicity).
* No hard rate limiting / abuse protection built in; this is meant for small groups who trust each other.

---

## Roadmap / Ideas

Planned / nice-to-haves:

* Editable **team rosters** (players, skills, injuries, SPP)
* Full **game session** flow:

  * Start game → in-progress scoreboard
  * Track turns, rerolls, reserves/KOs/CAS per player
  * End game → step through post-game sequence, update SPP & injuries
* Scheduling helpers:

  * Round-robin schedule generator
  * Playoff brackets
* Multi-season support:

  * Redraft tools
  * Season history per team

---
