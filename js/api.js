// js/api.js
const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';

export async function apiGet(path) {
  const url = `${API_BASE}/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiSave(path, content, message, key) {
  if (!key) throw new Error("Missing Edit Key");
  const url = `${API_BASE}/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Edit-Key': key },
    body: JSON.stringify({ content, message })
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${await res.text()}`);
  return res.json();
}

export async function apiDelete(path, message, key) {
  if (!key) throw new Error("Missing Edit Key");
  const url = `${API_BASE}/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'X-Edit-Key': key },
    body: JSON.stringify({ message })
  });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${await res.text()}`);
  return res.json();
}
