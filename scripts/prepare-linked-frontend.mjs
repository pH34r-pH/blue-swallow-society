import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('..', import.meta.url));
async function files(root, prefix = '') {
  const result = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    const info = await lstat(join(root, path));
    if (info.isDirectory()) result.push(...await files(root, path));
    else if (info.isFile()) result.push(path);
    else throw new Error('Frontend archive contains a non-regular file: ' + path);
  }
  return result;
}

export async function prepareFrontend(commit, output) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full lowercase commit SHA is required.');
  const actual = execFileSync('git', ['rev-parse', '--verify', `${commit}^{commit}`], { cwd: repository, encoding: 'utf8' }).trim();
  if (actual !== commit) throw new Error('Commit identity mismatch.');
  const destination = resolve(output); const site = join(destination, 'site');
  await mkdir(destination); // Never overwrite an existing artifact.
  try {
    await mkdir(site);
    const archive = execFileSync('git', ['archive', '--format=tar', `${commit}:app`], { cwd: repository, maxBuffer: 32 * 1024 * 1024 });
    execFileSync('tar', ['-xf', '-', '-C', site], { input: archive });
    await files(site); // Reject symlinks before modifying the extracted tree.
    await rm(join(site, 'AGENTS.md'), { force: true });
    const configPath = join(site, 'staticwebapp.config.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    if (config.platform?.apiRuntime !== 'node:24' || Object.keys(config.platform).length !== 1) throw new Error('Unexpected managed API configuration.');
    delete config.platform;
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
    const manifest = { schema: 1, sourceCommit: commit, transformation: 'linked-backend-frontend-v1', files: {} };
    for (const path of await files(site)) manifest.files[path] = createHash('sha256').update(await readFile(join(site, path))).digest('hex');
    await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
  } catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , commit, output] = process.argv;
  if (!commit || !output) throw new Error('Usage: node scripts/prepare-linked-frontend.mjs <full-commit-sha> <new-output-directory>');
  const manifest = await prepareFrontend(commit, output);
  process.stdout.write(`Prepared ${Object.keys(manifest.files).length} frontend files for ${manifest.sourceCommit}.\n`);
}
