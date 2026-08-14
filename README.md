# ABCM Sync for Obsidian

ABCM Sync is a cross-platform Obsidian plugin for bidirectional synchronization
with one explicitly paired ABCM workspace and project.

## Current status

WU-04 provides the public plugin repository, mobile-compatible plugin shell,
portable-path rules, deterministic three-way synchronization decisions,
echo suppression, and validated restart state. Pairing and settings UI arrive in
WU-05; end-to-end synchronization arrives in WU-06.

The plugin is not ready for ordinary installation yet.

## Platform boundary

- `manifest.json` declares `isDesktopOnly: false`.
- Runtime synchronization modules use browser-compatible TypeScript only.
- Node.js is used by the development and test toolchain, never by plugin runtime
  code.
- Windows, Linux, and iPadOS share the same synchronization core.

## Privacy and security

ABCM Sync will contact only the ABCM endpoint explicitly configured by the user.
It will send only files selected by the configured project mapping and
include/exclude rules. The plugin does not include telemetry, advertising,
remote-code execution, or access outside the active vault.

Device credentials must be scoped to one ABCM workspace/project and must not be
stored in Markdown, logs, or ordinary plugin data. Secure credential storage is
part of WU-05.

## Development

Use the npm and esbuild workflow inherited from the official
[`obsidianmd/obsidian-sample-plugin`](https://github.com/obsidianmd/obsidian-sample-plugin):

```bash
npm install
npm run check
```

The production build emits `main.js`. Do not commit generated build artifacts.

## License

0BSD
