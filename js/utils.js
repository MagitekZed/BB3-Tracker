import { els } from './state.js';

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
