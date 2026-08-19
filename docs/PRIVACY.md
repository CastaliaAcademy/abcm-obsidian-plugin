# Privacy disclosure

ABCM Sync connects only to the endpoint configured by the user. Synchronization necessarily transmits selected relative paths, checksums, sizes, content types, and exact file bytes for the configured vault folder and ABCM project.

The plugin does not collect telemetry, analytics, advertising identifiers, contacts, location, unrelated vault content, or files outside the active vault. It does not download or execute remote code.

The one-time pairing code is kept only in memory during redemption. The resulting scoped device credential is stored through Obsidian SecretStorage. Ordinary plugin data stores endpoint, project mapping, device identity, filters, cursor, checksums, outbox metadata, pause state, and conflict metadata, but no document bodies or bearer credentials.

Conflict artifacts contain document bytes and are written visibly below `_ABCM Conflicts` inside the selected vault folder. That directory is excluded from synchronization; users control its later deletion.

Server-side retention, access logs, backups, and administrator access are properties of the configured ABCM deployment and must be disclosed by its operator.
