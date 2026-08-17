# ABCM Sync for Obsidian

ABCM Sync is a conflict-safe, bidirectional connector between one folder in an Obsidian vault and one explicitly paired ABCM workspace/project.

## Private beta status

The protocol, server endpoints, exact-byte create/update/delete/move operations, durable outbox, conflict recovery, offline retry, and foreground synchronization are implemented. Automated server and plugin gates pass. Public beta still requires recorded acceptance on physical Windows, Linux, and iPadOS devices.

Do not publish a GitHub release or submit the plugin to `obsidian-releases` until the platform matrix is complete and publication is separately approved.

## Supported behavior

- Windows, Linux, and iPadOS use the same mobile-compatible sync core.
- The plugin uses Obsidian `requestUrl`, Vault, FileManager, SecretStorage, and localStorage APIs.
- Initial synchronization shows a non-mutating preview and requires explicit confirmation.
- Text and binary files preserve exact bytes within ABCM limits.
- Local create, modify, delete, and rename events are debounced after `Workspace.onLayoutReady`.
- Synchronization runs manually, periodically, and when Obsidian returns to the foreground.
- Conflicts preserve all present versions and require **Keep local**, **Keep server**, or **Keep both**.
- A revoked credential pauses synchronization and requires re-pairing.

ABCM Sync does not promise background networking while Obsidian is suspended or closed on iPadOS. Durable cursor/outbox state resumes when the app becomes active again.

## Installation for private testing

1. Run `npm ci` and `npm run release:prepare`.
2. Verify `release/SHA256SUMS`.
3. Copy `release/main.js`, `release/manifest.json`, and `release/styles.css` into `<Vault>/.obsidian/plugins/abcm-sync/`.
4. Reload Obsidian, enable **ABCM Sync**, and open its settings.
5. Enter the HTTPS ABCM endpoint and a one-time project-scoped pairing code.
6. Choose the vault folder and run **Preview initial sync**.

## Operating limits

- One ABCM project mapping per plugin installation.
- Maximum inventory: 10,000 files; changes page: 1,000; apply batch: 100.
- Chunked upload, CRDT/real-time collaboration, automatic merge, guaranteed background iPadOS sync, `.obsidian` synchronization, and simultaneous directory-mirror ownership are outside version 0.1.
- `_ABCM Conflicts` is service-owned, visible, and excluded from synchronization.

## Privacy and security

The plugin contacts only the configured ABCM endpoint. Selected filenames, metadata, and file bytes are sent because they are required for synchronization. It has no telemetry, advertising, analytics, or remote-code execution.

The device credential is scoped and revocable and is stored only in Obsidian SecretStorage. Markdown, ordinary plugin data, logs, conflict artifacts, and ABCM documents must never contain it. See [Privacy](docs/PRIVACY.md), [Recovery](docs/RECOVERY.md), and [Platform acceptance](docs/PLATFORM-ACCEPTANCE.md).

## Development

```bash
npm ci
npm run check
npm run release:prepare
npm run release:check
```

Release assets are generated under ignored `release/`; `main.js` and generated assets are not committed.

## License

0BSD
