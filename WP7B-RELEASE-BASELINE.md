# WP7b Release Baseline Verification

Date: 2026-10-03
Input baseline: `backHW-main-wp123-developed-wp8f.zip`
Input SHA-256: `a2181ec684fa3abf57d51fbfbdaa54d5919fdeea13c7dca44ef957d7f89007e7`
Platform: Linux container, Node v22.16.0, npm 10.9.2, TypeScript 5.8.3 (global)

## Purpose

Freeze the WP8d -> WP8f architecture boundary before release-oriented validation. WP7b makes no functional changes to physics, Pattern, MotorDrive, Case Library, or UI business behavior.

## Dependency installation

`npm ci --no-audit --no-fund --registry=https://registry.npmmirror.com` could not complete because the execution container cannot resolve public npm registries. Direct DNS/HTTPS checks to both `registry.npmjs.org` and `registry.npmmirror.com` failed.

The resulting `node_modules` was partial and invalid; this environment therefore cannot provide a trustworthy full npm install.

## Exact npm commands

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | BLOCKED BY ENVIRONMENT | `tsc` cannot find installed type definitions (`node`, `react`, `react-dom`, etc.) |
| `npm test` | BLOCKED BY ENVIRONMENT AFTER GOVERNANCE PASS | all leading CJS gates passed; execution stops at `tsx: not found` |
| `npm run build` | BLOCKED BY ENVIRONMENT | `vite: not found` |

These are environment/dependency failures, not reported as source-pass results.

## Architecture/governance evidence

- WP8d legacy result boundary: PASS
- WP8e legacy schema isolation: PASS
- WP8f legacy schema isolation: PASS
- AnalysisResult field governance: PASS
- View selector boundary: PASS (35/35)
- Facts/Judgment/Action selector contract: PASS
- AnalysisResult selector migration: PASS
- MotorDrive schema provenance: PASS (32 fields / 7 groups)
- AI prompt contract: PASS
- Three-tail fixes: PASS
- Pattern policy: PASS
- Scenario switch contract: PASS
- WP5 calculator boundary: PASS (7/7)
- WP6 help drawer: PASS (7/7)
- WP4e legacy knowledge boundary: PASS (5/5)
- MotorDrive input governance: PASS (8/8)
- Section14 current-input contract: PASS (5/5)
- Domain prompt schedule contract: PASS (3/3)
- Timeline provenance contract: PASS (6/6)
- Page content ownership: PASS (6/6)
- Case Library boundary: PASS
- Case Library runtime boundary: PASS
- Analysis restore fingerprint: PASS (4/4)
- Wargame current-input binding: PASS
- Theme/contrast script: PASS (97 items)

All 27 CJS/static governance commands invoked from the `test` chain completed with exit code 0.


## WP7b patch: Case Library runtime boundary portability

2026-10-03 修正：`scripts/verify-case-library-runtime-boundary.cjs` 原先通过 `execFileSync('grep', ...)` 调用外部 Unix `grep`，导致 Windows 或没有 `grep` 的 Linux 环境以 `spawnSync grep ENOENT` 直接中断 `npm test`。已改为 Node.js 原生 `fs.readdirSync` + UTF-8 源码扫描，不再依赖外部命令。

验证：
- `node scripts/verify-case-library-runtime-boundary.cjs` -> PASS
- `scripts/*.cjs` 全部 -> PASS
- `npm test` -> 所有 CJS/static governance 全部 PASS，随后仍因当前环境 `tsx: not found` 停止；这是 npm 依赖未完整安装造成的环境阻塞。

## Freeze status

WP8f architecture/governance boundary is internally verified. Full release build is **not frozen as PASS** in this container until the same baseline is validated in a Linux environment with a complete npm dependency install.
