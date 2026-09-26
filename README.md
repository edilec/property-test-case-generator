# Property Test Case Generator

`property-test-case-generator` evaluates a bounded, seeded sequence of integers against a tiny declarative invariant language. It reports the first violated invariant and a deterministic reduced counterexample. It never imports, evaluates, or executes supplied source code. Node.js 22+; zero dependencies.

## Quick start

```sh
node bin/property-test-case-generator.mjs --root examples --input passing.json
node bin/property-test-case-generator.mjs --root examples --input failing.json
npm run check
```

The passing example exits `0`; the failing example exits `1` with a `property-violated` finding and reproducible seed. Invalid CLI configuration exits `2` with empty stdout. Unreadable, invalid, partial, or contradictory exports exit `2` with an `incomplete` JSON report. Stdout otherwise contains exactly one report. Input realpaths must stay within the real `--root`.

## Export format

```json
{
  "schemaVersion": "1",
  "complete": true,
  "seed": 7,
  "domain": { "min": 0, "max": 10 },
  "caseCount": 10,
  "invariants": [
    { "kind": "atLeast", "value": 0 },
    { "kind": "atMost", "value": 10 },
    { "kind": "multipleOf", "value": 1 }
  ]
}
```

The only supported invariant kinds are `atLeast`, `atMost`, and `multipleOf` (positive divisor). All are applied to every generated integer. Before generation, the tool exhaustively checks the bounded domain for at least one satisfying integer; impossible or contradictory constraints are incomplete, not a sampled failure. Cases come from a documented deterministic 32-bit LCG (`state = 1664525 × state + 1013904223 mod 2^32`; `min + state mod domain-size`). The first generated violation is reported. Shrinking examines values toward zero and retains the closest-to-zero value **within the domain** that violates the same invariant. An optional top-level string `note` is ignored.

## Rules and output

| Rule | Severity | Status / exit |
| --- | --- | --- |
| `property-violated` | error | fail / `1` |
| `input-unreadable`, `input-invalid`, `duplicate-key`, `byte-limit`, `case-limit`, `record-limit`, `domain-limit`, `depth-limit`, `time-limit`, `export-incomplete`, `invariant-invalid`, `invariant-contradictory`, `no-invariants` | error | incomplete / `2` |

The v1 report records the seed, generated numeric `cases` up to the first failure, `counterexample` (`original`, `shrunk`, zero-based `invariantOrdinal`), and sorted findings. Findings use logical source role `@export` and a JSON pointer to the invariant in the exact file named at invocation. Findings sort by UTF-16 code-unit `(location.file, location.pointer, ruleId)`. No arbitrary source text or executable content appears in the report.

## Bounds and non-goals

Strict UTF-8; maximum 1,048,576 bytes, 200 cases, 100 invariants, integer domain endpoints within ±1,000,000, domain span at most 10,000, seed 0–4,294,967,295, JSON depth 3 (root 0), and 5,000 ms injected processing time. `multipleOf` divisors are 1–1,000. Exact N and N+1 tests cover the primary upper bounds. Unknown fields and duplicate JSON keys, including escaped spellings, are refused.

A passing sample does **not** prove every value in the domain satisfies all invariants; it only says the generated cases did. The exhaustive precheck establishes satisfiability, not universal correctness. This is not a JavaScript property-testing engine, a test runner, or a source-code analyzer. It writes no artifacts and makes no network calls.
