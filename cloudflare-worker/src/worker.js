// src/worker.js

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === '/api/file') {
      const filePath = url.searchParams.get('path');
      if (!filePath || !filePath.startsWith('data/')) {
        return new Response('Invalid path', { status: 400, headers: corsHeaders() });
      }

      if (request.method === 'GET') return handleGet(filePath, env);
      if (request.method === 'POST') return handlePost(request, filePath, env);
      if (request.method === 'DELETE') return handleDelete(request, filePath, env);
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
  return request.headers.get('X-Edit-Key') === env.EDIT_KEY;
}

async function handleGet(filePath, env) {
  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, GITHUB_TOKEN } = env;
  const ghUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;

  const res = await fetch(ghUrl, {
    headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'BB3-Tracker' }
  });

  if (!res.ok) {
    if (res.status === 404) return new Response(JSON.stringify(null), { status: 404, headers: corsHeaders() });
    return new Response(await res.text(), { status: 500, headers: corsHeaders() });
  }

  const data = await res.json();

  // DIRTY FIX: GitHub returns an Array for directories, Object for files
  if (Array.isArray(data)) {
    // It's a directory listing! Return the list of files directly.
    // We only care about names and types.
    const listing = data.map(f => ({ name: f.name, type: f.type, path: f.path }));
    return new Response(JSON.stringify(listing), { 
      status: 200, 
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' } 
    });
  }

  // It's a file
  const decoded = decodeURIComponent(escape(atob(data.content)));
  return new Response(decoded, {
    status: 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

// ... handlePost and handleDelete remain the same as your previous version ...
// (Include them here so the file is complete, or just keep your existing ones)
async function handlePost(request, filePath, env) {
  if (!isAuthorized(request, env)) return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
  const { content, message } = await request.json();
  const ghFileUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
  
  // Get SHA
  let sha = null;
  const getRes = await fetch(`${ghFileUrl}?ref=${env.GITHUB_BRANCH}`, {
    headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'BB3-Tracker' }
  });
  if (getRes.ok) sha = (await getRes.json()).sha;

  // Put
  const putRes = await fetch(ghFileUrl, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'BB3-Tracker' },
    body: JSON.stringify({
      message: message || `Update ${filePath}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
      sha,
      branch: env.GITHUB_BRANCH
    })
  });
  
  if(!putRes.ok) return new Response(await putRes.text(), {status: 500, headers: corsHeaders()});
  return new Response(JSON.stringify(await putRes.json()), {status:200, headers: corsHeaders()});
}

async function handleDelete(request, filePath, env) {
  if (!isAuthorized(request, env)) return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
  const { message } = await request.json();
  const ghFileUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
  
  const getRes = await fetch(`${ghFileUrl}?ref=${env.GITHUB_BRANCH}`, {
    headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'BB3-Tracker' }
  });
  if (!getRes.ok) return new Response('File not found', { status: 404, headers: corsHeaders() });
  
  const delRes = await fetch(ghFileUrl, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'BB3-Tracker' },
    body: JSON.stringify({
      message: message || `Delete ${filePath}`,
      sha: (await getRes.json()).sha,
      branch: env.GITHUB_BRANCH
    })
  });
  
  if(!delRes.ok) return new Response(await delRes.text(), {status: 500, headers: corsHeaders()});
  return new Response(JSON.stringify(await delRes.json()), {status:200, headers: corsHeaders()});
}
