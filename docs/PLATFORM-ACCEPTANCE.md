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
- [x] Initial preview has no pre-confirmation mutation
- [x] Create/update/delete/rename both directions
- [x] Network loss, sleep, restart, and recovery
- [x] Conflict and revoke/re-pair
- [x] Portable-path and service-directory rejection

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
pluginCommit: 9ced6213174e7928e73cadeeb6bac9cf36a649fb
pluginVersion: 0.1.0
releaseAssetSha256:
  main.js: edede174653d2cf18b2066a26ed9251d134a2ae42a3f45640ff0c23eb868a7c1
  manifest.json: d8e6a989bf720c6104e41d076dc4255c3d7557cdadebb1aabcc811469e128d7e
  styles.css: 8764243cae0351ebdbb76e770c4feffcb1956ff42420d4ec159212dc7a8535ed
abcmCommit: 67c98a7c866a4a68e9b490a7eeedf832b41a923c
abcmVersion: 0.1.0
endpointType: http-loopback
workspaceId: abcm-acceptance-windows
projectId: fixture
vaultFolder: ABCM Replicas/windows-acceptance
datasetDigest: sha256:9b5e39f324e6fc2887ef9ac22d16af95db8043bdca565560a3bf24d6623a6936
reviewer: egor (operator) + Codex (checksums and server journal)
scenarioResults:
  P01:
    status: pass
    evidence:
      - pairing redeemed into the server-owned abcm-acceptance-windows/fixture scope
      - first successful preview planned two create-local actions
      - scope.yaml sha256:c835112b343fb16778368fdb8ff04eca578c53412b0e842e549c425490b13b5f
      - seed.md sha256:fd3e7013ab267acfeb0c338c11767beb6b9471fb385cd60cad374635fe6d047e
      - subsequent server previews planned two noop actions
      - zero server apply receipts, tombstones, and open conflicts after initial pull
      - operator reported successful synchronization in the active Windows Obsidian vault
      - after a full Obsidian restart, scope.yaml and seed.md retained the same checksums and the persisted cursor/object state resumed
      - an isolated rerun displayed a real modal with create-local: 1 and the Cancel/Synchronize choices
      - Cancel left local cursor null with zero objects, outbox, conflicts, pendingMoves, and no mapped vault folder
      - server p01-seed.md remained sha256:3d374a9cc17bdc415c3eb6cb5f5b0efcb11cefe9427d6ae7b3118fbf58f4492b; journal contained zero events, receipts, and tombstones
      - one deterministic sync_objects identity snapshot is derived preview metadata, not a workspace byte or ordered change-event mutation
    notes: Explicit decline/no-mutation, confirmed initial pull, exact bytes, and restart persistence all pass under the normative workspace/journal-event mutation boundary.
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
  P04:
    status: pass
    datasetDigest: sha256:274983475693e250e3fbdd5491913c2f7ad649e5bf23db519e37b33b0cf84850
    evidence:
      - vault create contained zero and non-UTF-8 bytes; event sequence 9 stored exact 64-byte sha256:1bfcaa5f31e7e59fee98e41e666bcd6f52d0e8daa252eb1565ad61c461451990
      - REST read returned the same bytes, size, ETag, and application/octet-stream
      - checksum-guarded upload plus atomic REST batch replaced the object with exact 79-byte sha256:83ff70dc11ecc7c1f99d8bd5c82b5fcc143a344b3227a82cd4ca1ee69029f976
      - server replacement produced event sequence 10 with application/octet-stream and preserved obj_3ce04282d2fb1aed1d35f8e3418556e2
      - foreground synchronization wrote bytes identical to the REST upload into the vault
      - object version advanced from 1 to 2 and the journal contains exactly the create and external update, with one receipt each and no echo event
    notes: Binary round trip passed in both directions without UTF-8 decoding, newline normalization, or content-type drift.
  P05:
    status: pass
    evidence:
      - an offline local edit plus rename survived Obsidian termination and restart while an unrelated remote file was added
      - reconnect produced one identity-preserving move at event sequence 18 for objectId prefix obj_a0f7e4fe with no delete/create echo
      - p05-v2-renamed.md converged at sha256:1ff1d47339deca035deb1581d49fb13ff8e792de23d031290938fc8f416e161f and p05-v2-remote.md at sha256:3657b3b79236dc6955c0f3f4b40fd615bd22da2445ac83d209800b3bb2bb35bd
      - final cursor and base state persisted with empty outbox, conflicts, and pendingMoves
    notes: Foreground resume recovered both directions exactly once after the offline restart.
  P06:
    status: pass
    evidence:
      - concurrent update created conflict_3398994cb5724454b12591442fb0ed9b and preserved local sha256:ed323346e1abc8fc342c8d95ec0adc37e3238fddcd472e907c6297f814b93e0c plus server artifact sha256:fbecb38fee20e36e45a88deacce58329544b9397315694040f470e70ff1cabc2 while an unrelated object converged
      - Keep local was selected in the real conflict modal and converged both replicas to sha256:ed323346e1abc8fc342c8d95ec0adc37e3238fddcd472e907c6297f814b93e0c
      - delete/update created conflict_57949792b7474999a0cf362d86723cf8; Keep server restored p06-delete-update.md at sha256:fcba1bdb272c871ae1ef143fbaaf28b2a1c8ef8bf033a81029afcdf067c8ee83
      - move/move created conflict_2d23545ef02c4ed3a2fd6002945c187f; Keep both preserved the server object identity at p06-move-server.md and created Recovered p06-move-local.md, both sha256:a0479e9b62a5b92b95dc6f7e041713e07fe4df13f9646933c4b028a5d4840ce0
      - _ABCM Conflicts remained visible in the vault but absent from synchronized objects
      - final cursor has empty outbox, conflicts, and pendingMoves
    notes: All three UI resolutions passed. Two defects found during the run were retained below and corrected by 71bb612 and 9ced621.
  P07:
    status: pass
    evidence:
      - device_473bd50e1621d52e12ca52394487b7eb was revoked through the administrative API
      - rejected pull/push returned HTTP 401 and status auth-required without changing cursor cur_1_v_08d38d95bb1128d1cba3193e or the persisted state digest
      - local pending bytes remained sha256:b26ffb48dae910fb7aeb3b075ac0ae93aaec81db2fdf4536922079bfbcfbf469 and the remote-after-revoke object was not pulled before authorization
      - Clear authorization and Pair device were exercised through the real settings UI with a fresh one-time code
      - the old credential remained invalid and the same stable deviceId received a different credential after corrective ABCM commit 67c98a7
      - p07-revoke.md converged at sha256:b26ffb48dae910fb7aeb3b075ac0ae93aaec81db2fdf4536922079bfbcfbf469 and p07-remote-after-revoke.md at sha256:494c2c9dac91e012dfb81425e76e8c99e1fa2e581652bb568e3d861075bbcd4e
      - final cursor cur_1_w_e7a3677787630285c92c6e31 has empty outbox, conflicts, and pendingMoves
    notes: Revocation is fail-closed; successful re-pair resumes the retained base state without copying or exposing either credential.
  P08:
    status: pass
    evidence:
      - ordinary p08-café.md synchronized through the Windows Vault API with exact sha256:821dfb121cdd6ce82dd6c42669f76d9d64e74b05449103edac231809e490c4cf
      - an NFD spelling colliding with the NFC file was rejected by the Windows Vault API as File already exists; cursor and object count were unchanged
      - P08-CASE.md colliding with p08-case.md was rejected as File already exists; the server retained only the lowercase object
      - CON.md was rejected by Obsidian as File name is forbidden: CON before any local or server mutation
      - traversal vaultFolder ../escape and the actual configDir .obsidian both set plugin status error with unchanged cursor and object count; the valid mapping was restored and resynchronized
      - a sentinel under _ABCM Conflicts was excluded from inventory, advanced no cursor, and was removed after verification
      - server fixture contains only the two permitted p08-case.md and NFC p08-café.md objects; outbox and conflicts are empty
    notes: Windows physical rejection and the portable-path automated contract jointly cover case-fold, NFC/NFD, reserved names, traversal, configDir, and service-owned paths.
knownLimitations:
  - This Windows run does not substitute for the still-required physical Linux Ubuntu LTS and iPadOS runs.
  - Cross-device Windows/iPad and Linux/iPad P09 evidence remains pending.
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
  - status: corrected
    symptom: A pull-time concurrent local update surfaced as a generic sync error instead of a recoverable explicit conflict.
    mutationObserved: false
    correctiveCommit: 71bb612f
    verification: The rerun created conflict_339899, preserved both byte sequences, and allowed Keep local through the UI.
  - status: corrected
    symptom: Keep both resolved the server conflict but retained a stale pendingMoves hint for the original object.
    mutationObserved: false
    correctiveCommit: 9ced6213174e7928e73cadeeb6bac9cf36a649fb
    verification: Regression test asserts an empty pendingMoves set; installed release passed all 60 tests.
  - status: corrected
    symptom: Re-pair after revoke returned HTTP 403 because the server rejected the plugin's stable deviceId even after its old grant was revoked.
    mutationObserved: false
    correctiveCommit: 67c98a7c866a4a68e9b490a7eeedf832b41a923c
    verification: Active duplicate ids remain forbidden, while a fresh one-time code reissues only a revoked id and the physical P07 rerun converged.
correctiveCommits:
  - 16e9f43c980cf669ced4488e7ed26704b1d0b22f
  - c02ea12ba9c7ea599396a87a13e3a87b8757cf2f
  - 71bb612f
  - 9ced6213174e7928e73cadeeb6bac9cf36a649fb
  - 67c98a7c866a4a68e9b490a7eeedf832b41a923c
finalDecision: pending
reviewedAtUtc: 2026-08-18T13:32:48Z
```
