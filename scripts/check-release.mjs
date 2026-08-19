import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const versions = JSON.parse(await readFile('versions.json', 'utf8'));
if (packageJson.version !== manifest.version) throw new Error('package.json and manifest.json versions differ.');
if (versions[manifest.version] !== manifest.minAppVersion) throw new Error('versions.json does not map the release to minAppVersion.');
if (manifest.isDesktopOnly !== false) throw new Error('Release must remain mobile-compatible.');

const output = resolve(process.argv[2] ?? 'release');
const assets = ['main.js', 'manifest.json', 'styles.css'];
const expected = [];
for (const asset of assets) {
	const content = await readFile(resolve(output, asset));
	expected.push(`${createHash('sha256').update(content).digest('hex')}  ${asset}`);
}
const sums = await readFile(resolve(output, 'SHA256SUMS'), 'utf8');
if (sums !== `${expected.sort().join('\n')}\n`) throw new Error('Release checksums are stale.');
const bundle = await readFile(resolve(output, 'main.js'), 'utf8');
for (const forbidden of ['node:fs', 'node:path', 'electron', 'FileSystemAdapter', 'process.platform', 'globalThis.fetch', 'window.fetch']) {
	if (bundle.includes(forbidden)) throw new Error(`Release bundle contains forbidden mobile token '${forbidden}'.`);
}
console.log(JSON.stringify({ version: manifest.version, minAppVersion: manifest.minAppVersion, assets: [...assets, 'SHA256SUMS'] }));
