import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('release');
const assets = ['main.js', 'manifest.json', 'styles.css'];
await mkdir(output, { recursive: true });
const sums = [];
for (const asset of assets) {
	const content = await readFile(asset);
	await copyFile(asset, resolve(output, asset));
	sums.push(`${createHash('sha256').update(content).digest('hex')}  ${asset}`);
}
await writeFile(resolve(output, 'SHA256SUMS'), `${sums.sort().join('\n')}\n`);
console.log(JSON.stringify({ output, assets: [...assets, 'SHA256SUMS'] }));
