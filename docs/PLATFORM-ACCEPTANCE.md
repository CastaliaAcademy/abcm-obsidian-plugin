# Physical platform acceptance

Public beta is blocked until this matrix contains real device evidence. Do not infer a pass from automated tests.

For every run record: date, OS/device version, Obsidian version, plugin commit and asset SHA-256, ABCM version/commit, endpoint type, dataset digest, exact steps, outcome, screenshots/log references without secrets, and reviewer.

## Preconditions

1. Use an isolated ABCM workspace/project and an isolated Obsidian vault folder. Back up any non-disposable data.
2. Disable directory-mirror ownership and every other sync engine for the mapped folder. Run any coexistence observation last.
3. Use an HTTPS endpoint trusted by the device. Local HTTP is permitted only for loopback desktop testing.
4. Build with `npm ci && npm run release:prepare && npm run release:check` and retain `release/SHA256SUMS` with the evidence.
5. Install exactly `release/main.js`, `release/manifest.json`, and `release/styles.css` under `<Vault>/.obsidian/plugins/abcm-sync/`.
6. Create a new one-time, project-scoped server pairing code for each installation. Never record the code or resulting credential.
7. Record immutable run metadata before testing:

```yaml
runId: PA-YYYYMMDD-platform-sequence
dateUtc: YYYY-MM-DDTHH:MM:SSZ
platform: windows-11 | linux-ubuntu-lts | physical-ipados | cross-device
osVersion: ""
deviceModel: ""
obsidianVersion: ""
pluginCommit: ""
pluginVersion: 0.1.0
releaseAssetSha256: {}
abcmCommit: ""
abcmVersion: 0.1.0
endpointType: https-public | https-lan | http-loopback
workspaceId: ""
projectId: ""
vaultFolder: ""
datasetDigest: ""
reviewer: ""
```

## Canonical scenarios

For every step record `pass` or `fail`, requested checksums, timestamp, and a screenshot/log reference. Evidence must not contain pairing codes, bearer credentials, or non-fixture document bodies.

### P01 — install, pair, and preview

1. Install and enable the plugin, enter endpoint and mapping, then redeem a fresh pairing code.
2. Select **Preview initial sync** but decline confirmation.
3. Verify that neither ABCM nor the vault changed.
4. Preview again, confirm, and verify that cursor/base state persists after Obsidian restarts.

Expected: only a scoped device is created; pre-confirmation checksums are unchanged; confirmed bytes match on both sides.

### P02 — local-to-server lifecycle

Create, modify, rename, and delete a text file in the mapped vault folder. After every action run or await foreground synchronization and read the corresponding ABCM state through REST.

Expected: one identity-preserving operation per action, exact bytes, no duplicate after **Sync now**, and deletion produces a tombstone.

### P03 — server-to-local lifecycle

Create, modify, move, and delete a file through ABCM REST while the vault is unchanged. Resume Obsidian and synchronize after every action.

Expected: Vault API applies the operation, exact checksums match, and cursor advances only after the local write succeeds.

### P04 — binary round trip

Use a disposable binary file containing zero and non-UTF-8 bytes. Push it from the vault, compare SHA-256 and size through ABCM, then replace it through REST and compare the resulting vault SHA-256 and size.

Expected: both directions preserve exact bytes and `application/octet-stream`; no text conversion occurs.

### P05 — offline, sleep, restart, and resume

1. Disconnect the device, edit and rename files, invoke synchronization, and confirm status `offline`.
2. Sleep/suspend the device, terminate Obsidian where the platform permits, and reopen it while still offline.
3. Restore network access and bring Obsidian to the foreground.

Expected: durable outbox and cursor survive, retries are bounded, every operation is applied once, and unrelated remote changes are pulled safely.

### P06 — explicit conflicts

From one common base exercise concurrent update, delete/update, and move/move. Verify `_ABCM Conflicts` is visible and excluded. For fresh conflicts exercise **Keep local**, **Keep server**, and **Keep both**.

Expected: only the affected object pauses; unrelated paths converge; every present byte sequence remains recoverable; paths and identities follow the normative resolution semantics.

### P07 — revoke and re-pair

Revoke the device on ABCM, attempt pull and push, then use **Re-pair device** with a fresh code.

Expected: status becomes `auth-required`, cursor/outbox/vault bytes remain intact, revoked access advances nothing, and re-pair resumes without copying the old credential.

### P08 — portable paths and custom config directory

Attempt case-fold, Unicode NFD/NFC, Windows reserved-name, traversal, configured Obsidian config-directory, and `_ABCM Conflicts` paths.

Expected: each invalid or colliding operation is rejected before mutation and the diagnostic identifies the conflicting path. Ordinary Unicode NFC paths synchronize.

### P09 — cross-device convergence

1. Edit the same base concurrently on Windows and iPad; verify an explicit conflict.
2. Edit unrelated paths on Linux and iPad; verify convergence.
3. Compare text and binary checksums across every replica and ABCM.

Expected: no silent loss, no timestamp winner, and every unaffected object converges.

## Windows 11

- [ ] Install and pair
- [ ] Initial preview has no pre-confirmation mutation
- [ ] Create/update/delete/rename both directions
- [ ] Network loss, sleep, restart, and recovery
- [ ] Conflict and revoke/re-pair

## Linux Ubuntu LTS

- [ ] Install AppImage and pair
- [ ] Same lifecycle scenarios as Windows
- [ ] Case-sensitive and Unicode portable-path rejection
- [ ] Conflict and revoke/re-pair

## Physical iPadOS device

- [ ] Install and pair
- [ ] Edit online and offline
- [ ] Suspend, terminate, reopen, and resume without loss or duplicate writes
- [ ] Conflict artifact and all three resolutions
- [ ] Revoke and re-pair
- [ ] Confirm documentation accurately says there is no closed-app background guarantee

## Cross-device

- [ ] Windows + iPad edit the same base and receive an explicit conflict
- [ ] Linux + iPad edit unrelated paths and converge
- [ ] Exact binary bytes and checksums match on every replica

## Evidence result

Append one block per run. Never rewrite a failed run into a pass; retain it and link the corrective commit plus the successful rerun.

```yaml
runId: ""
scenarioResults:
  P01: {status: pending, evidence: [], notes: ""}
  P02: {status: pending, evidence: [], notes: ""}
knownLimitations: []
failures: []
correctiveCommits: []
finalDecision: pending | pass | fail
reviewedAtUtc: ""
```
