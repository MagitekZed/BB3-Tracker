// js/api.js

// Configuration
const API_BASE = 'https://bb3-tracker-api.zedt-ninja.workers.dev';

/**
 * Fetches a file from the repository.
 * Uses 'no-store' to prevent caching issues between views.
 */
export async function apiGet(path) {
  const url = `${API_BASE}/api/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

/**
 * Saves content to a file in the repository.
 */
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

/**
 * Deletes a file from the repository.
 */
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
