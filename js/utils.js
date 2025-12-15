import { els } from './state.js';

const ULID_ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeUlidTime(timeMs) {
  // 48-bit timestamp -> 10 chars base32
  let time = BigInt(timeMs);
  let out = '';
  for (let i = 0; i < 10; i++) {
    const mod = Number(time & 31n);
    out = ULID_ENCODING[mod] + out;
    time >>= 5n;
  }
  return out;
}

function encodeUlidRandom() {
  // 80 bits randomness -> 16 chars base32
  const bytes = new Uint8Array(10);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);

  let out = '';
  for (let i = 0; i < 16; i++) {
    const mod = Number(value & 31n);
    out = ULID_ENCODING[mod] + out;
    value >>= 5n;
  }
  return out;
}

export function ulid() {
  return encodeUlidTime(Date.now()) + encodeUlidRandom();
}

export function getContrastColor(hex) {
  if(!hex) return '#ffffff';
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#111111' : '#ffffff';
}

export function applyTeamTheme(team) {
  const root = document.documentElement;
  if (team && team.colors) {
    root.style.setProperty('--team-primary', team.colors.primary || '#222');
    root.style.setProperty('--team-secondary', team.colors.secondary || '#c5a059');
    root.style.setProperty('--team-text', getContrastColor(team.colors.primary || '#222'));
  } else {
    root.style.setProperty('--team-primary', '#222222');
    root.style.setProperty('--team-secondary', '#c5a059');
    root.style.setProperty('--team-text', '#ffffff');
  }
}

export function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function setStatus(msg, type = 'info') {
  if(!msg) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  if (els.toastContainer) {
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  } else {
    console.log(`[${type}] ${msg}`);
  }
}
