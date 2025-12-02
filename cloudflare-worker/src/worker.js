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

    // Endpoint: /api/file?path=...
    if (url.pathname === '/api/file') {
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        return new Response('Missing "path" query param', { status: 400, headers: corsHeaders() });
      }

      if (!filePath.startsWith('data/')) {
        return new Response('Forbidden: Access allowed only to data/ folder', { status: 403, headers: corsHeaders() });
      }

      if (request.method === 'GET') {
        return handleGetFile(filePath, env);
      } else if (request.method === 'POST') {
        return handlePostFile(request, filePath, env);
      } else if (request.method === 'DELETE') {
        return handleDeleteFile(request, filePath, env);
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
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
    if (res.status === 404) {
      return new Response(JSON.stringify(null), { status: 404, headers: corsHeaders() });
    }
    const text = await res.text();
    return new Response(`GitHub GET failed: ${res.status} - ${text}`, { status: 500, headers: corsHeaders() });
  }

  const data = await res.json();
  const decoded = decodeURIComponent(escape(atob(data.content)));

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
  try { body = await request.json(); } catch (e) { return new Response('Invalid JSON', { status: 400 }); }

  const { content, message } = body;
  const ghFileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

  // 1. Get SHA
  let sha = null;
  const getRes = await fetch(`${ghFileUrl}?ref=${GITHUB_BRANCH}`, {
    headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'BB3-Tracker-Worker' }
  });

  if (getRes.ok) {
    const fileMeta = await getRes.json();
    sha = fileMeta.sha;
  }

  // 2. PUT
  const jsonString = JSON.stringify(content, null, 2);
  const base64Content = btoa(unescape(encodeURIComponent(jsonString)));

  const putBody = {
    message: message || `Update ${filePath}`,
    content: base64Content,
    branch: GITHUB_BRANCH,
  };
  if (sha) putBody.sha = sha;

  const putRes = await fetch(ghFileUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'BB3-Tracker-Worker'
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

async function handleDeleteFile(request, filePath, env) {
  if (!isAuthorized(request, env)) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
  }

  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, GITHUB_TOKEN } = env;
  let body;
  try { body = await request.json(); } catch (e) { return new Response('Invalid JSON', { status: 400 }); }

  const { message } = body;
  const ghFileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

  // 1. Get SHA (Required for delete)
  const getRes = await fetch(`${ghFileUrl}?ref=${GITHUB_BRANCH}`, {
    headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'BB3-Tracker-Worker' }
  });

  if (!getRes.ok) {
    return new Response('File not found, cannot delete', { status: 404, headers: corsHeaders() });
  }

  const fileMeta = await getRes.json();
  const sha = fileMeta.sha;

  // 2. DELETE
  const deleteBody = {
    message: message || `Delete ${filePath}`,
    sha: sha,
    branch: GITHUB_BRANCH
  };

  const delRes = await fetch(ghFileUrl, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'BB3-Tracker-Worker'
    },
    body: JSON.stringify(deleteBody),
  });

  if (!delRes.ok) {
    const text = await delRes.text();
    return new Response(`GitHub DELETE failed: ${delRes.status} - ${text}`, { status: 500, headers: corsHeaders() });
  }

  const result = await delRes.json();
  return new Response(JSON.stringify({ ok: true, commit: result.commit }), {
    status: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}
