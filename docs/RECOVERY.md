# Recovery guide

## Offline or unreachable service

Leave the plugin enabled. It preserves the cursor and durable outbox and retries with bounded exponential backoff while Obsidian is active. Use **Sync now** after connectivity returns.

## Revoked or expired authorization

The status becomes `auth-required` and synchronization pauses without deleting vault files, cursor, or outbox. Create a new server-side pairing code, select **Re-pair device**, and pair again. The plugin retains the assigned scope while authorization is cleared: pairing the same scope resumes the durable state, while a grant for another workspace, project, or prefix resets that state before the new credential is stored. Do not paste an administrative ABCM token into plugin settings.

## Expired cursor

The plugin requests a new checksum-bound preview. The old outbox remains persisted until the replacement preview accounts for current local bytes. No unconditional overwrite or timestamp-based winner is used.

## Conflict

Open **Show conflicts**. Compare text diff or binary checksum/size and the server artifact under `_ABCM Conflicts`. Choose exactly one resolution:

- **Keep local** makes the server and other replicas adopt the local state.
- **Keep server** makes this vault adopt the server state.
- **Keep both** keeps the server object on its server path and creates the local version as a new object at a portable free path.

Back up the vault before resolving a conflict if the content is business-critical.

## Reinstall or device loss

Revoke the old device credential on the ABCM server. A fresh installation receives a new device identity and must complete initial preview before mutation. Do not copy SecretStorage credentials between devices.
