// app.js

// Replace with your Worker URL:
const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';

const loadBtn = document.getElementById('loadBtn');
const saveBtn = document.getElementById('saveBtn');
const textarea = document.getElementById('leagueTextarea');
const statusEl = document.getElementById('status');

const editKeyInput = document.getElementById('editKeyInput');
const rememberKeyBtn = document.getElementById('rememberKeyBtn');

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? 'red' : 'inherit';
}

// Load any saved key from localStorage on page load
(function initEditKey() {
  const stored = localStorage.getItem('bb3_edit_key');
  if (stored) {
    editKeyInput.value = stored;
  }
})();

rememberKeyBtn.addEventListener('click', () => {
  const key = editKeyInput.value.trim();
  if (!key) {
    setStatus('Edit key is empty; nothing to remember.', true);
    return;
  }
  localStorage.setItem('bb3_edit_key', key);
  setStatus('Edit key saved on this device.');
});

loadBtn.addEventListener('click', async () => {
  try {
    setStatus('Loading league.json...');
    const res = await fetch(`${API_BASE}/api/league`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const data = await res.json();
    textarea.value = JSON.stringify(data, null, 2);
    setStatus('Loaded league.json');
  } catch (err) {
    console.error(err);
    setStatus('Error loading league.json: ' + err.message, true);
  }
});

saveBtn.addEventListener('click', async () => {
  try {
    setStatus('Saving league.json...');

    const key = editKeyInput.value.trim();
    if (!key) {
      throw new Error('Edit key is required to save.');
    }

    let parsed;
    try {
      parsed = JSON.parse(textarea.value);
    } catch (e) {
      throw new Error('Invalid JSON in textarea: ' + e.message);
    }

    const res = await fetch(`${API_BASE}/api/league`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Edit-Key': key,
      },
      body: JSON.stringify({
        league: parsed,
        message: 'Update league from web UI',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const result = await res.json();
    console.log(result);
    setStatus('Saved league.json (new commit created)');
  } catch (err) {
    console.error(err);
    setStatus('Error saving league.json: ' + err.message, true);
  }
});
