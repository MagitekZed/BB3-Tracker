import { rollDiceTotal } from './rng.js';

function findDiceTargetInput(fromEl) {
  if (!fromEl) return null;
  const wrap = fromEl.closest?.('.dice-input') || null;
  if (wrap) {
    const input = wrap.querySelector('input, select, textarea');
    if (input) return input;
  }

  const prev = fromEl.previousElementSibling;
  if (prev && (prev.matches?.('input, select, textarea'))) return prev;

  const label = fromEl.closest?.('label') || null;
  if (label) {
    const input = label.querySelector('input, select, textarea');
    if (input) return input;
  }

  return null;
}

export function rollDiceIntoInput(triggerEl, sides, count = 1) {
  const input = findDiceTargetInput(triggerEl);
  if (!input) return;
  if (input.disabled) return;

  let value = rollDiceTotal(sides, count);

  const minAttr = input.getAttribute('min');
  const maxAttr = input.getAttribute('max');
  const min = (minAttr == null || minAttr === '') ? null : Number(minAttr);
  const max = (maxAttr == null || maxAttr === '') ? null : Number(maxAttr);
  if (Number.isFinite(min)) value = Math.max(min, value);
  if (Number.isFinite(max)) value = Math.min(max, value);

  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.focus?.({ preventScroll: true });
}

