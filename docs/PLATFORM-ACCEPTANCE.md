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

- [x] Install and pair
- [ ] Initial preview has no pre-confirmation mutation
- [x] Create/update/delete/rename both directions
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

```yaml
runId: PA-20260818-windows-01
dateUtc: 2026-08-17T23:11:27Z
platform: windows-11
osVersion: "10.0.26200.9168"
deviceModel: DESKTOP-JBDGE1E
obsidianVersion: 1.13.7
pluginCommit: 16e9f43c980cf669ced4488e7ed26704b1d0b22f
pluginVersion: 0.1.0
releaseAssetSha256:
  main.js: d467de2aec8a62b8355308e0c06cde23dfd29774c3cc3162d510b052cc033630
  manifest.json: d8e6a989bf720c6104e41d076dc4255c3d7557cdadebb1aabcc811469e128d7e
  styles.css: 8764243cae0351ebdbb76e770c4feffcb1956ff42420d4ec159212dc7a8535ed
abcmCommit: 9937dcde49f2c40396f650701fe98ab89820e91c
abcmVersion: 0.1.0
endpointType: http-loopback
workspaceId: abcm-acceptance-windows
projectId: fixture
vaultFolder: ABCM Replicas/windows-acceptance
datasetDigest: sha256:9b5e39f324e6fc2887ef9ac22d16af95db8043bdca565560a3bf24d6623a6936
reviewer: egor (operator) + Codex (checksums and server journal)
scenarioResults:
  P01:
    status: partial
    evidence:
      - pairing redeemed into the server-owned abcm-acceptance-windows/fixture scope
      - first successful preview planned two create-local actions
      - scope.yaml sha256:c835112b343fb16778368fdb8ff04eca578c53412b0e842e549c425490b13b5f
      - seed.md sha256:fd3e7013ab267acfeb0c338c11767beb6b9471fb385cd60cad374635fe6d047e
      - subsequent server previews planned two noop actions
      - zero server apply receipts, tombstones, and open conflicts after initial pull
      - operator reported successful synchronization in the active Windows Obsidian vault
      - after a full Obsidian restart, scope.yaml and seed.md retained the same checksums and the persisted cursor/object state resumed
    notes: Confirmed initial pull, exact bytes, and restart persistence pass. Explicit decline/no-mutation remains pending.
  P02:
    status: pass
    evidence:
      - local create produced event sequence 5 and exact 65-byte sha256:b3283752af4b8fe6f2a2ee9645442d44edff8e08bff52baab93bc160e2b58210
      - current plugin c02ea12 assets matched release SHA-256: main.js 462a2bd672c3f3e4d907b8761f94bf0fca74ae23b49bc66c0eca7173e4702753, manifest.json d8e6a989bf720c6104e41d076dc4255c3d7557cdadebb1aabcc811469e128d7e, styles.css 8764243cae0351ebdbb76e770c4feffcb1956ff42420d4ec159212dc7a8535ed
      - rename p02-local.md to p02-rerun.md produced event sequence 6 with the same obj_dbd9af14f23c970f036960a39114b00d and text/markdown content type
      - local update produced event sequence 7 and exact 63-byte sha256:365f4bd21bfbc9b66b17be3060b7b8a0d0f390d58c4bb1c5b9dad1a257ab9b90
      - local delete produced event sequence 8 and a tombstone for the same object and checksum
      - deleted path is absent from the vault and ABCM REST returns HTTP 404
      - each local action has exactly one durable sync event, journal receipt, and apply receipt
      - final cursor cur_1_8_90afdc8ace96e9a9413990c4 has zero open conflicts
      - lifecycle completion was verified against ABCM commit 6bf599e749eb27f285ff1fad1bb881c91d02d3cd
    notes: Local-to-server create, identity-preserving rename, update, and delete passed with exact bytes and no duplicate operation.
  P03:
    status: pass
    evidence:
      - REST create converged to local sha256:dc0dbbb405834e65908a68bafffa0735ae566d64b744d133e59e58e26ce28855
      - checksum-guarded REST update converged to local sha256:069191f1110746a3ec473af878db7ac174b876ff9d31c780db00a4670cab488d
      - REST move removed p03-server.md and created p03-renamed.md with exact bytes
      - objectId obj_48d9ef3f2674447189fd34a484367096 remained stable through create, update, move, and delete
      - REST delete produced tombstone event sequence 4 and removed both old and new local paths
      - final cursor cur_1_4_38905417cd61c47e2d971916 preview contained only the two baseline noop items
      - zero open conflicts after convergence
    notes: Server-to-local text lifecycle passed through the active foreground plugin without manual file copying.
knownLimitations: []
failures:
  - status: corrected
    symptom: Non-JSON scope.yaml content was eagerly parsed as JSON and reported as an unreachable service.
    mutationObserved: false
    correctiveCommit: 16e9f43c980cf669ced4488e7ed26704b1d0b22f
  - status: corrected
    symptom: The first Markdown create was classified as application/octet-stream although its bytes and checksum were exact.
    mutationObserved: true
    correctiveCommit: c02ea12ba9c7ea599396a87a13e3a87b8757cf2f
    verification: Subsequent move and update events used text/markdown; charset=utf-8 with the same stable object identity.
correctiveCommits:
  - 16e9f43c980cf669ced4488e7ed26704b1d0b22f
  - c02ea12ba9c7ea599396a87a13e3a87b8757cf2f
finalDecision: pending
reviewedAtUtc: 2026-08-18T07:46:30Z
```
