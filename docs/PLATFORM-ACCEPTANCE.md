# Physical platform acceptance

Public beta is blocked until this matrix contains real device evidence. Do not infer a pass from automated tests.

For every run record: date, OS/device version, Obsidian version, plugin commit and asset SHA-256, ABCM version/commit, endpoint type, dataset digest, exact steps, outcome, screenshots/log references without secrets, and reviewer.

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
