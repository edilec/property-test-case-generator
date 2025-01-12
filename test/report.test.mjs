import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateCases, LIMITS, parseStrictJson } from '../src/index.mjs';

const doc = (invariants = [{ kind: 'atLeast', value: 0 }, { kind: 'atMost', value: 10 }], domain = { min: 0, max: 10 }, caseCount = 10) => ({ schemaVersion: '1', complete: true, seed: 7, domain, caseCount, invariants });
const run = (root, input) => spawnSync(process.execPath, ['bin/property-test-case-generator.mjs', '--root', root, '--input', input], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--import=/Users/km/Desktop/web/open-source/migration-plan-template/support/deny-network.mjs' } });

test('good bounded seeded numeric invariants pass reproducibly', () => {
  const x = doc(); const a = generateCases(x), b = generateCases(x);
  assert.equal(a.status, 'pass'); assert.equal(a.seed, 7); assert.equal(a.cases.length, 10); assert.equal(JSON.stringify(a), JSON.stringify(b));
});
test('known violated invariant is found and shrunk toward zero with source ordinal', () => {
  const r = generateCases(doc([{ kind: 'multipleOf', value: 4 }]));
  assert.equal(r.status, 'fail'); assert.equal(r.counterexample.original, 6); assert.equal(r.counterexample.shrunk, 1); assert.equal(r.counterexample.invariantOrdinal, 0);
  assert.equal(r.findings[0].ruleId, 'property-violated'); assert.equal(r.findings[0].location.pointer, '/invariants/0');
});
test('shrunk counterexample stays inside the declared domain', () => {
  const r = generateCases(doc([{ kind: 'multipleOf', value: 4 }], { min: 5, max: 10 }));
  assert.equal(r.status, 'fail'); assert.equal(r.counterexample.original, 5); assert.equal(r.counterexample.shrunk, 5);
});
test('contradictory constraints are incomplete, not an evaluated counterexample', () => {
  assert.equal(generateCases(doc([{ kind: 'atLeast', value: 5 }, { kind: 'atMost', value: 3 }])).findings[0].ruleId, 'invariant-contradictory');
  assert.equal(generateCases(doc([{ kind: 'multipleOf', value: 5 }], { min: 1, max: 4 })).status, 'incomplete');
});
test('unsupported arbitrary code is never executed or silently accepted', () => {
  globalThis.__propertyCanary = 0;
  const r = generateCases({ ...doc(), code: 'globalThis.__propertyCanary=1' });
  assert.equal(r.status, 'incomplete'); assert.equal(globalThis.__propertyCanary, 0); delete globalThis.__propertyCanary;
});
test('partial, empty and malformed invariants cannot pass', () => {
  assert.equal(generateCases({ ...doc(), complete: false }).status, 'incomplete');
  assert.equal(generateCases(doc([])).status, 'incomplete');
  assert.equal(generateCases(doc([{ kind: 'eval', value: 0 }])).status, 'incomplete');
});
test('case, invariant, domain, seed, byte, depth and time limits enforce N and N+1', () => {
  assert.equal(generateCases(doc(undefined, undefined, LIMITS.cases)).status, 'pass'); assert.equal(generateCases(doc(undefined, undefined, LIMITS.cases + 1)).findings[0].ruleId, 'case-limit');
  const many = Array.from({ length: LIMITS.invariants }, () => ({ kind: 'atLeast', value: 0 })); assert.equal(generateCases(doc(many)).status, 'pass'); assert.equal(generateCases(doc(many.concat({ kind: 'atMost', value: 10 }))).findings[0].ruleId, 'record-limit');
  assert.equal(generateCases(doc([{ kind: 'atLeast', value: 0 }], { min: 0, max: LIMITS.domainSpan })).status, 'pass'); assert.equal(generateCases(doc([{ kind: 'atLeast', value: 0 }], { min: 0, max: LIMITS.domainSpan + 1 })).findings[0].ruleId, 'domain-limit');
  assert.equal(generateCases({ ...doc(), seed: 4294967295 }).status, 'pass'); assert.equal(generateCases({ ...doc(), seed: 4294967296 }).status, 'incomplete');
  const x = doc(); x.note = ''; const overhead = Buffer.byteLength(JSON.stringify(x)); x.note = 'x'.repeat(LIMITS.bytes - overhead); assert.equal(generateCases(x).status, 'pass'); x.note += 'x'; assert.equal(generateCases(x).findings[0].ruleId, 'byte-limit');
  const deep = doc(); assert.equal(generateCases(deep).status, 'pass'); deep.invariants[0].value = { nested: 'x' }; assert.equal(generateCases(deep).findings[0].ruleId, 'depth-limit');
  assert.equal(generateCases(doc(), { now: (() => { let n=0; return () => n++ ? LIMITS.milliseconds : 0; })() }).status, 'pass'); assert.equal(generateCases(doc(), { now: (() => { let n=0; return () => n++ ? LIMITS.milliseconds + 1 : 0; })() }).findings[0].ruleId, 'time-limit');
});
test('duplicate JSON keys including escaped spelling refused', () => assert.throws(() => parseStrictJson('{"complete":false,"complet\\u0065":true}'), /duplicate-key/));
test('CLI strict UTF-8, read confinement, invalid root and usage shapes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'property-')); await writeFile(join(root, 'good.json'), JSON.stringify(doc())); assert.equal(run(root, 'good.json').status, 0);
  await writeFile(join(root, 'bad.json'), Buffer.from([0xff])); assert.equal(JSON.parse(run(root, 'bad.json').stdout).status, 'incomplete');
  await symlink(tmpdir(), join(root, 'escape')); assert.equal(JSON.parse(run(root, 'escape/no.json').stdout).status, 'incomplete');
  assert.equal(run(join(root, 'missing-root'), 'good.json').stdout, '');
  const usage = spawnSync(process.execPath, ['bin/property-test-case-generator.mjs', '--root', root, '--input', 'good.json', '--bad'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }); assert.equal(usage.status, 2); assert.equal(usage.stdout, '');
});
