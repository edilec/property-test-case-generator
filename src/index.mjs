export const TOOL_ID = 'property-test-case-generator';
export const LIMITS = Object.freeze({ bytes: 1_048_576, cases: 200, invariants: 100, domainSpan: 10_000, absolute: 1_000_000, depth: 3, milliseconds: 5000 });
export const RULE_SEVERITY = Object.freeze({
  'input-unreadable': 'error', 'input-invalid': 'error', 'duplicate-key': 'error', 'byte-limit': 'error', 'case-limit': 'error', 'record-limit': 'error', 'domain-limit': 'error', 'depth-limit': 'error', 'time-limit': 'error', 'export-incomplete': 'error', 'invariant-invalid': 'error', 'invariant-contradictory': 'error', 'no-invariants': 'error',
  'property-violated': 'error'
});
const UNKNOWN = new Set(['input-unreadable', 'input-invalid', 'duplicate-key', 'byte-limit', 'case-limit', 'record-limit', 'domain-limit', 'depth-limit', 'time-limit', 'export-incomplete', 'invariant-invalid', 'invariant-contradictory', 'no-invariants']);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function finding(ruleId, pointer = '') {
  if (!Object.hasOwn(RULE_SEVERITY, ruleId)) throw new Error('Unknown rule');
  return { ruleId, severity: RULE_SEVERITY[ruleId], message: {
    'property-violated': 'A seeded case violates a declared numeric invariant.',
    'invariant-contradictory': 'No integer in the declared domain can satisfy all invariants.'
  }[ruleId] ?? 'Declarative property evidence cannot be evaluated safely.', location: { file: '@export', pointer } };
}
function report(findings, seed = null, cases = [], counterexample = null) {
  findings.sort((a, b) => order(a.location.file, b.location.file) || order(a.location.pointer, b.location.pointer) || order(a.ruleId, b.ruleId));
  return { schemaVersion: '1', tool: TOOL_ID, status: findings.some(f => UNKNOWN.has(f.ruleId)) ? 'incomplete' : findings.length ? 'fail' : 'pass', summary: { checked: cases.length, errors: findings.length, warnings: 0 }, seed, cases, counterexample, findings };
}
export const incomplete = ruleId => report([finding(ruleId)]);
export function parseStrictJson(raw) {
  const value = JSON.parse(raw); let i = 0;
  const space = () => { while (/\s/u.test(raw[i] ?? '')) i++; };
  const token = () => { const start = i++; while (i < raw.length) { if (raw[i] === '\\') { i += 2; continue; } if (raw[i++] === '"') return JSON.parse(raw.slice(start, i)); } throw new Error('input-invalid'); };
  const walk = depth => { if (depth > LIMITS.depth) throw new Error('depth-limit'); space(); if (raw[i] === '{') { i++; space(); const keys = new Set(); while (raw[i] !== '}') { const key = token(); if (keys.has(key)) throw new Error('duplicate-key'); keys.add(key); space(); i++; walk(depth + 1); space(); if (raw[i] !== ',') break; i++; space(); } i++; return; } if (raw[i] === '[') { i++; space(); while (raw[i] !== ']') { walk(depth + 1); space(); if (raw[i] !== ',') break; i++; space(); } i++; return; } if (raw[i] === '"') { token(); return; } while (i < raw.length && !/[\s,}\]]/u.test(raw[i])) i++; };
  walk(0); return value;
}
function tooDeep(v, depth = 0) { return depth > LIMITS.depth || (v !== null && typeof v === 'object' && Object.values(v).some(child => tooDeep(child, depth + 1))); }
function validInvariant(item) {
  return object(item) && ['atLeast', 'atMost', 'multipleOf'].includes(item.kind) && Number.isSafeInteger(item.value) && (item.kind === 'multipleOf' ? item.value >= 1 && item.value <= 1000 : Math.abs(item.value) <= LIMITS.absolute) && Object.keys(item).every(k => ['kind', 'value'].includes(k));
}
function violation(value, invariants) {
  return invariants.findIndex(item => item.kind === 'atLeast' ? value < item.value : item.kind === 'atMost' ? value > item.value : value % item.value !== 0);
}
function shrink(original, invariant, min, max) {
  for (let magnitude = 0; magnitude <= Math.abs(original); magnitude++) {
    const candidate = Math.sign(original) * magnitude;
    if (candidate >= min && candidate <= max && violation(candidate, [invariant]) !== -1) return candidate;
  }
  return original;
}
export function generateCases(document, { now = Date.now } = {}) {
  const start = now(), expired = () => now() - start > LIMITS.milliseconds;
  if (!object(document)) return incomplete('input-invalid');
  let bytes; try { bytes = Buffer.byteLength(JSON.stringify(document)); } catch { return incomplete('input-invalid'); }
  if (bytes > LIMITS.bytes) return incomplete('byte-limit');
  if (tooDeep(document)) return incomplete('depth-limit');
  if (expired()) return incomplete('time-limit');
  if (document.schemaVersion !== '1' || !object(document.domain) || !Array.isArray(document.invariants) || !Number.isSafeInteger(document.seed) || document.seed < 0 || document.seed > 4294967295 || Object.keys(document).some(k => !['schemaVersion', 'complete', 'seed', 'domain', 'caseCount', 'invariants', 'note'].includes(k)) || (document.note !== undefined && typeof document.note !== 'string')) return incomplete('input-invalid');
  if (document.complete !== true) return incomplete('export-incomplete');
  if (!Number.isSafeInteger(document.caseCount) || document.caseCount < 1) return incomplete('input-invalid');
  if (document.caseCount > LIMITS.cases) return incomplete('case-limit');
  if (document.invariants.length > LIMITS.invariants) return incomplete('record-limit');
  if (!document.invariants.length) return incomplete('no-invariants');
  const { min, max } = document.domain;
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max || Object.keys(document.domain).some(k => !['min', 'max'].includes(k))) return incomplete('input-invalid');
  if (Math.abs(min) > LIMITS.absolute || Math.abs(max) > LIMITS.absolute || max - min > LIMITS.domainSpan) return incomplete('domain-limit');
  for (const [i, item] of document.invariants.entries()) {
    if (expired()) return incomplete('time-limit');
    if (!validInvariant(item)) return report([finding('invariant-invalid', `/invariants/${i}`)]);
  }
  let satisfiable = false;
  for (let value = min; value <= max; value++) {
    if (expired()) return incomplete('time-limit');
    if (violation(value, document.invariants) === -1) { satisfiable = true; break; }
  }
  if (!satisfiable) return incomplete('invariant-contradictory');
  const cases = []; let state = document.seed >>> 0;
  for (let i = 0; i < document.caseCount; i++) {
    if (expired()) return incomplete('time-limit');
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const value = min + state % (max - min + 1); cases.push(value);
    const invariantOrdinal = violation(value, document.invariants);
    if (invariantOrdinal !== -1) {
      const counterexample = { original: value, shrunk: shrink(value, document.invariants[invariantOrdinal], min, max), invariantOrdinal };
      if (expired()) return incomplete('time-limit');
      return report([finding('property-violated', `/invariants/${invariantOrdinal}`)], document.seed, cases, counterexample);
    }
  }
  if (expired()) return incomplete('time-limit');
  return report([], document.seed, cases);
}
