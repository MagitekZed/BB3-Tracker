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

    // New Endpoint: /api/file?path=data/leagues/index.json
    if (url.pathname === '/api/file') {
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        return new Response('Missing "path" query param', { status: 400, headers: corsHeaders() });
      }

      // Security: Prevent accessing files outside of data/ folder
      if (!filePath.startsWith('data/')) {
        return new Response('Forbidden: Access allowed only to data/ folder', { status: 403, headers: corsHeaders() });
      }

      if (request.method === 'GET') {
        return handleGetFile(filePath, env);
      } else if (request.method === 'POST') {
        return handlePostFile(request, filePath, env);
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Edit-Key',
  };
}

function isAuthorized(request, env) {
  const clientKey = request.headers.get('X-Edit-Key');
  const serverKey = env.EDIT_KEY;
  if (!serverKey) return false; 
  return clientKey === serverKey;
}

async function handleGetFile(filePath, env) {
  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, GITHUB_TOKEN } = env;
  const ghUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;

  const res = await fetch(ghUrl, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'BB3-Tracker-Worker',
    },
  });

  if (!res.ok) {
    // If file not found (404), return null so frontend knows to create it
    if (res.status === 404) {
      return new Response(JSON.stringify(null), { status: 404, headers: corsHeaders() });
    }
    const text = await res.text();
    return new Response(`GitHub GET failed: ${res.status} - ${text}`, { status: 500, headers: corsHeaders() });
  }

  const data = await res.json();
  // GitHub API returns content in Base64
  const decoded = decodeURIComponent(escape(atob(data.content))); // safer unicode decoding

  return new Response(decoded, {
    status: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

async function handlePostFile(request, filePath, env) {
  if (!isAuthorized(request, env)) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
  }

  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, GITHUB_TOKEN } = env;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response('Invalid JSON body', { status: 400, headers: corsHeaders() });
  }

  const { content, message } = body; // Expecting raw object in 'content'

  if (!content) {
    return new Response('Missing "content" in body', { status: 400, headers: corsHeaders() });
  }

  const commitMessage = message || `Update ${filePath} via BB3 Tracker`;
  const ghFileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

  // 1. Get current SHA (if file exists) to allow update
  let sha = null;
  const getRes = await fetch(`${ghFileUrl}?ref=${GITHUB_BRANCH}`, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'BB3-Tracker-Worker',
    },
  });

  if (getRes.ok) {
    const fileMeta = await getRes.json();
    sha = fileMeta.sha;
  } else if (getRes.status !== 404) {
    return new Response('Error checking file existence', { status: 500, headers: corsHeaders() });
  }

  // 2. PUT new content
  const jsonString = JSON.stringify(content, null, 2);
  // Encode generic unicode strings to Base64 safe for GitHub
  const base64Content = btoa(unescape(encodeURIComponent(jsonString)));

  const putBody = {
    message: commitMessage,
    content: base64Content,
    branch: GITHUB_BRANCH,
  };

  if (sha) {
    putBody.sha = sha;
  }

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
    return new Response(`GitHub PUT failed: ${putRes.status} - ${text}`, { status: 500, headers: corsHeaders() });
  }

  const result = await putRes.json();
  return new Response(JSON.stringify({ ok: true, commit: result.commit }), {
    status: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}
