import fs from 'node:fs';
import crypto from 'node:crypto';

const GAME_DATA_PATH = 'data/gameData.json';
const INDUCEMENT_DEFS_PATH = 'Temp Agent Context Files/BB2025 Inducement Definitions.txt';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(timeMs, length = 10) {
  let time = BigInt(timeMs);
  let out = '';
  for (let i = 0; i < length; i++) {
    out = ENCODING[Number(time % 32n)] + out;
    time = time / 32n;
  }
  return out;
}

function encodeRandom(length = 16) {
  const bytes = crypto.randomBytes(10);
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  let out = '';
  for (let i = 0; i < length; i++) {
    out = ENCODING[Number(value % 32n)] + out;
    value = value / 32n;
  }
  return out;
}

function ulid() {
  return encodeTime(Date.now(), 10) + encodeRandom(16);
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, '');
}

function normalizeQuotes(text) {
  return String(text ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

function titleCaseFromUpper(input) {
  const lowerWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'over', 'per', 'the', 'to', 'with']);
  const parts = String(input ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts
    .map((raw, idx) => {
      const w = raw.toLowerCase();
      if (idx > 0 && lowerWords.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ')
    .replace(/'\w/g, (m) => m.toLowerCase()); // keep "Blitzer's" not "Blitzer'S"
}

function parseInducementDefinitions(text) {
  const lines = stripBom(text).replace(/\r/g, '').split('\n');
  const blocks = [];
  let current = null;

  const headingRe = /^\d+-\d+\s+[A-Z0-9].*$/;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (headingRe.test(line.trim())) {
      if (current) blocks.push(current);
      current = { heading: line.trim(), lines: [] };
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
  }
  if (current) blocks.push(current);

  const map = new Map();
  for (const b of blocks) {
    const heading = b.heading;
    const afterRange = heading.replace(/^\d+-\d+\s+/, '');
    const namePart = afterRange.split('(')[0].trim();
    const normalizedName = titleCaseFromUpper(namePart);
    const body = b.lines.join('\n').trim();
    map.set(normalizedName.toLowerCase(), { heading, rulesText: normalizeQuotes(body) });
  }
  return map;
}

function normalizeSkillParts(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s === '–' || s === '-' || s === '—') return [];
  const parts = s.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
  return parts;
}

function rebuild() {
  const raw = fs.readFileSync(GAME_DATA_PATH, 'utf8');
  const data = JSON.parse(stripBom(raw));

  const inducementDefsText = fs.existsSync(INDUCEMENT_DEFS_PATH)
    ? fs.readFileSync(INDUCEMENT_DEFS_PATH, 'utf8')
    : '';
  const inducementDefs = inducementDefsText ? parseInducementDefinitions(inducementDefsText) : new Map();

  // --- Fix known star-player CSV artifacts ---
  for (const star of data.starPlayers || []) {
    if (star?.name === 'Currently Missing from Season 3') {
      const proper = normalizeQuotes(star.profile || '').trim();
      if (proper) {
        star.availabilityNote = 'Currently missing from Season 3';
        star.name = proper;
      }
      star.profile = null;
    }
  }

  // --- Fix skill definitions (names + missing descriptions) ---
  for (const [catName, list] of Object.entries(data.skillCategories || {})) {
    if (!Array.isArray(list)) continue;
    for (const sk of list) {
      if (!sk || typeof sk !== 'object') continue;
      const tag = String(sk.tags || '').trim();
      if (/^activ/i.test(tag)) sk.tags = 'ACTIVE';
      else if (/^passiv/i.test(tag)) sk.tags = 'PASSIVE';

      if (sk.name === 'BloodLust') sk.name = 'Bloodlust';
      if (sk.name === 'Quick Fool') sk.name = 'Quick Foul';
      if (sk.name === 'Fury') sk.name = 'Frenzy';

      if (sk.name === 'Fend' && !String(sk.description || '').trim()) {
        sk.description = 'When this player is Pushed Back for any reason, the opposition player may not Follow-up.';
        sk.tags = 'ACTIVE';
      }
      if (sk.name === 'Frenzy' && !String(sk.description || '').trim()) {
        sk.description =
          'When this player performs a Block Action, if the target is Pushed Back and this player can Follow-up, they must Follow-up. If after Following-up the target is still adjacent and still Standing, this player must immediately make a second Block Action against the same target (even if this would normally be optional).';
        sk.tags = 'ACTIVE';
      }
    }

    // De-dupe any accidental duplicates by name (keep first non-empty description).
    const seen = new Map();
    const next = [];
    for (const sk of list) {
      if (!sk || typeof sk !== 'object') { next.push(sk); continue; }
      const key = String(sk.name || '').trim();
      if (!key) { next.push(sk); continue; }
      const prev = seen.get(key);
      if (!prev) {
        seen.set(key, sk);
        next.push(sk);
        continue;
      }
      const prevDesc = String(prev.description || '').trim();
      const curDesc = String(sk.description || '').trim();
      if (!prevDesc && curDesc) {
        Object.assign(prev, sk);
      }
    }
    data.skillCategories[catName] = next;
  }

  // Ensure placeholder-only skills exist for glossary completeness.
  const ensureSkill = (categoryName, name, description, tags = 'PASSIVE') => {
    data.skillCategories = data.skillCategories || {};
    data.skillCategories[categoryName] = Array.isArray(data.skillCategories[categoryName]) ? data.skillCategories[categoryName] : [];
    const list = data.skillCategories[categoryName];
    if (list.some(s => s && typeof s === 'object' && s.name === name)) return;
    list.push({ name, description, tags });
  };

  ensureSkill('Traits', 'Plague Ridden', 'Missing glossary entry: add the official BB2025 rules text for Plague Ridden.', 'PASSIVE');
  ensureSkill('Traits', 'Ghostly Flames', 'Missing glossary entry: star-player unique rule (details not in provided rules sources).', 'PASSIVE');
  ensureSkill('Traits', 'Brutal Block', 'Missing glossary entry: star-player unique rule (details not in provided rules sources).', 'PASSIVE');

  // Build definition-name set after fixing definitions.
  const defNames = new Set();
  for (const list of Object.values(data.skillCategories || {})) {
    if (!Array.isArray(list)) continue;
    for (const sk of list) {
      if (sk && typeof sk === 'object' && sk.name) defNames.add(sk.name);
    }
  }

  const mapSkill = (skill) => {
    let s = normalizeQuotes(skill).trim();
    if (!s || s === '–' || s === '-' || s === '—') return null;

    // Clean suffix markers.
    s = s.replace(/\*+$/g, '').trim();

    // Known typo/alias normalization.
    s = s.replace(/^Side Step\b/, 'Sidestep');
    s = s.replace(/^Kick Team Mate\b/, 'Kick Team-mate');
    s = s.replace(/^Pogo Stick\b/, 'Pogo');
    s = s.replace(/^Timmm-ber!$/, 'Timm-ber!');
    s = s.replace(/^Might Blow\b/, 'Mighty Blow');
    s = s.replace(/^Mighty Blow\s*\(\+?1\+?\)$/, 'Mighty Blow');
    s = s.replace(/^Thick Skull!$/, 'Thick Skull');
    s = s.replace(/^Tunat$/, 'Taunt');

    // Split known accidental merges (2 skills in one string).
    const trySplit = (candidate) => {
      const all = [...defNames].sort((a, b) => b.length - a.length);
      for (const name of all) {
        if (!candidate.startsWith(name + ' ')) continue;
        const rest = candidate.slice(name.length).trim();
        if (defNames.has(rest)) return [name, rest];
      }
      return [candidate];
    };

    const split = trySplit(s);
    return split.map(x => x.trim()).filter(Boolean);
  };

  const normalizeSkillsArray = (arr) => {
    const out = [];
    for (const rawSkill of Array.isArray(arr) ? arr : []) {
      for (const part of normalizeSkillParts(rawSkill)) {
        const mapped = mapSkill(part);
        if (!mapped) continue;
        out.push(...mapped);
      }
    }
    // Remove placeholders and de-dupe while preserving order.
    const seen = new Set();
    const uniq = [];
    for (const sk of out) {
      const k = String(sk).trim();
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(k);
    }
    return uniq;
  };

  // Normalize roster positional skills
  for (const race of data.races || []) {
    for (const pos of race.positionals || []) {
      pos.skills = normalizeSkillsArray(pos.skills);
    }
  }
  // Normalize star player skills
  for (const star of data.starPlayers || []) {
    star.skills = normalizeSkillsArray(star.skills);
  }

  // --- Inducements: rename + attach rules text + include glossary-only entries ---
  const inducements = Array.isArray(data.inducements) ? data.inducements : [];
  for (const item of inducements) {
    if (!item || typeof item !== 'object') continue;
    if (item.name === 'Bloodweiser Keg') item.name = "Blitzer's Best Kegs";

    const def = inducementDefs.get(String(item.name || '').toLowerCase());
    if (def) item.rulesText = def.rulesText;
    if (!('purchaseEnabled' in item)) item.purchaseEnabled = true;
  }

  const ensureInducement = ({ name, max = null, cost = null, priceText = 'Price varies', purchaseEnabled = false } = {}) => {
    if (!name) return;
    if (inducements.some(i => i && typeof i === 'object' && i.name === name)) return;
    const def = inducementDefs.get(String(name).toLowerCase());
    inducements.push({
      name,
      max,
      cost,
      priceText,
      purchaseEnabled,
      ...(def ? { rulesText: def.rulesText } : {})
    });
  };

  ensureInducement({ name: 'Biased Referee', max: 1 });
  ensureInducement({ name: 'Infamous Coaching Staff', max: 1 });
  ensureInducement({ name: 'Mercenary Players', max: 3 });
  ensureInducement({ name: 'Star Players', max: 2 });
  ensureInducement({ name: 'Wizard', max: 1 });

  data.inducements = inducements;

  // --- IDs (ULIDs) ---
  const ensureId = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (!obj.id) obj.id = ulid();
  };

  ensureId(data);
  for (const race of data.races || []) {
    ensureId(race);
    for (const pos of race.positionals || []) ensureId(pos);
  }
  for (const item of data.inducements || []) ensureId(item);
  for (const star of data.starPlayers || []) ensureId(star);
  for (const list of Object.values(data.skillCategories || {})) {
    if (!Array.isArray(list)) continue;
    for (const sk of list) ensureId(sk);
  }

  // Write normalized JSON without BOM
  fs.writeFileSync(GAME_DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');

  // Summary
  const counts = {
    races: (data.races || []).length,
    inducements: (data.inducements || []).length,
    starPlayers: (data.starPlayers || []).length,
    skills: Object.values(data.skillCategories || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0)
  };
  console.log('Rebuilt gameData:', counts);
}

rebuild();
