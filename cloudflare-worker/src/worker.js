// src/worker.js

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (url.pathname === '/api/league') {
      if (request.method === 'GET') {
        // Anyone can read
        return handleGetLeague(env);
      } else if (request.method === 'POST') {
        // Only allowed with correct edit key
        return handlePostLeague(request, env);
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*', // later you can restrict to your GitHub Pages origin
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Edit-Key',
  };
}

function isAuthorized(request, env) {
  const clientKey = request.headers.get('X-Edit-Key');
  const serverKey = env.EDIT_KEY;

  // No key configured or mismatch
  if (!serverKey) {
    // If EDIT_KEY is not set, we can choose to deny everything to be safe
    return false;
  }

  if (!clientKey) return false;

  return clientKey === serverKey;
}

async function handleGetLeague(env) {
  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_FILE_PATH, GITHUB_BRANCH, GITHUB_TOKEN } = env;

  const ghUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}?ref=${GITHUB_BRANCH}`;

  const res = await fetch(ghUrl, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'BB3-Tracker-Worker',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(`GitHub GET failed: ${res.status} - ${text}`, {
      status: 500,
      headers: corsHeaders(),
    });
  }

  const data = await res.json();
  const decoded = JSON.parse(atob(data.content));

  return new Response(JSON.stringify(decoded), {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json',
    },
  });
}

async function handlePostLeague(request, env) {
  // 🔒 Check edit key
  if (!isAuthorized(request, env)) {
    return new Response('Unauthorized: invalid edit key', {
      status: 401,
      headers: corsHeaders(),
    });
  }

  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_FILE_PATH, GITHUB_BRANCH, GITHUB_TOKEN } = env;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response('Invalid JSON body', { status: 400, headers: corsHeaders() });
  }

  const { league, message } = body;

  if (!league) {
    return new Response('Missing "league" in body', { status: 400, headers: corsHeaders() });
  }

  const commitMessage = message || 'Update league from BB3 tracker';

  const ghFileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;

  // 1) Get current file to obtain SHA
  const getRes = await fetch(`${ghFileUrl}?ref=${GITHUB_BRANCH}`, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'BB3-Tracker-Worker',
    },
  });

  if (!getRes.ok) {
    const text = await getRes.text();
    return new Response(`GitHub GET for SHA failed: ${getRes.status} - ${text}`, {
      status: 500,
      headers: corsHeaders(),
    });
  }

  const fileMeta = await getRes.json();
  const sha = fileMeta.sha;

  // 2) Encode new content
  const newContent = JSON.stringify(league, null, 2);
  const base64Content = btoa(newContent);

  const putBody = {
    message: commitMessage,
    content: base64Content,
    sha,
    branch: GITHUB_BRANCH,
  };

  const putRes = await fetch(ghFileUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'BB3-Tracker-Worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(putBody),
  });

  if (!putRes.ok) {
    const text = await putRes.text();
    return new Response(`GitHub PUT failed: ${putRes.status} - ${text}`, {
      status: 500,
      headers: corsHeaders(),
    });
  }

  const result = await putRes.json();

  return new Response(JSON.stringify({ ok: true, commit: result.commit }), {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json',
    },
  });
}
