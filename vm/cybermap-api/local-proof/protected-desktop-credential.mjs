import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const MAX_DESKTOP_P12_BYTES = 256 * 1024;
const MAX_DESKTOP_PUBLIC_CERTIFICATE_BYTES = 64 * 1024;
const WINDOWS_REPARSE_QUERY = fileURLToPath(new URL('./windows-reparse-point.py', import.meta.url));
const PEM_CERTIFICATE_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/gu;
const PEM_PRIVATE_KEY_BLOCK = /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/gu;

export function protectedDesktopCredentialPaths(localAppData) {
  requireValue(process.platform === 'win32', 'The protected desktop credential boundary is supported only on Windows');
  requireValue(typeof localAppData === 'string' && localAppData.length > 0, 'LOCALAPPDATA is required');
  const credentialRoot = path.join(localAppData, 'BlueSwallow', 'credentials');
  return Object.freeze({
    credentialRoot,
    desktopP12: path.join(credentialRoot, 'wardriver-mtls-desktop-dev-2026.pfx'),
    desktopPublicCertificate: path.join(credentialRoot, 'wardriver-mtls-desktop-dev-2026-public.pem'),
  });
}

export async function readPasswordlessProtectedDesktopP12({ localAppData, configuredPath }) {
  const paths = protectedDesktopCredentialPaths(localAppData);
  requireValue(exactWindowsPath(configuredPath, paths.desktopP12),
    'Desktop PKCS#12 path is not the approved protected path');
  await assertProtectedRegularFile({
    file: paths.desktopP12,
    expected: paths.desktopP12,
    root: paths.credentialRoot,
    maxBytes: MAX_DESKTOP_P12_BYTES,
    label: 'Desktop PKCS#12',
    requireDirectAcl: true,
  });
  await assertDesktopP12MatchesPublicCertificate({
    p12Path: paths.desktopP12,
    publicCertificatePath: paths.desktopPublicCertificate,
    credentialRoot: paths.credentialRoot,
  });
  return readFile(paths.desktopP12);
}

export async function assertDesktopP12MatchesPublicCertificate({
  p12Path,
  publicCertificatePath,
  credentialRoot,
}) {
  await assertProtectedRegularFile({
    file: publicCertificatePath,
    expected: publicCertificatePath,
    root: credentialRoot,
    maxBytes: MAX_DESKTOP_PUBLIC_CERTIFICATE_BYTES,
    label: 'Desktop public certificate',
    requireDirectAcl: false,
  });
  const [p12Certificate, publicCertificate] = await Promise.all([
    readExactlyOnePasswordlessClientCertificate(p12Path),
    readExactlyOnePemCertificate(await readFile(publicCertificatePath), 'Desktop public certificate'),
  ]);
  requireValue(
    normalizedFingerprint(p12Certificate.fingerprint256) === normalizedFingerprint(publicCertificate.fingerprint256),
    'Desktop PKCS#12 public leaf does not match the approved desktop public certificate',
  );
}

async function readExactlyOnePasswordlessClientCertificate(p12Path) {
  let certificateOutput;
  let privateKeyOutput;
  try {
    [certificateOutput, privateKeyOutput] = await Promise.all([
      execFileAsync('openssl', [
        'pkcs12', '-in', p12Path, '-passin', 'pass:', '-clcerts', '-nokeys',
      ], { encoding: 'utf8', windowsHide: true, maxBuffer: MAX_DESKTOP_PUBLIC_CERTIFICATE_BYTES }),
      execFileAsync('openssl', [
        'pkcs12', '-in', p12Path, '-passin', 'pass:', '-nocerts', '-nodes',
      ], { encoding: 'utf8', windowsHide: true, maxBuffer: MAX_DESKTOP_P12_BYTES * 2 }),
    ]);
  } catch {
    throw new Error('Desktop PKCS#12 must be passwordless and contain exactly one readable client certificate and exactly one private key');
  }
  const privateKeys = privateKeyOutput.stdout.match(PEM_PRIVATE_KEY_BLOCK) ?? [];
  requireValue(privateKeys.length === 1,
    'Desktop PKCS#12 must contain exactly one private key');
  return readExactlyOnePemCertificate(certificateOutput.stdout, 'Desktop PKCS#12 client certificate');
}

function readExactlyOnePemCertificate(value, label) {
  const certificates = String(value).match(PEM_CERTIFICATE_BLOCK) ?? [];
  requireValue(certificates.length === 1, `${label} must contain exactly one client certificate`);
  try {
    return new X509Certificate(certificates[0]);
  } catch {
    throw new Error(`${label} must contain exactly one readable client certificate`);
  }
}

export async function readProtectedRegularFile(options) {
  await assertProtectedRegularFile(options);
  return readFile(options.expected);
}

export async function assertProtectedRegularFile({ file, expected, root, maxBytes, label, requireDirectAcl }) {
  requireValue(exactWindowsPath(file, expected), `${label} path is not the approved protected path`);
  await assertNoReparseComponents(expected, root, label);
  const info = await lstat(expected);
  requireValue(info.isFile() && !info.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  requireValue(info.size > 0 && info.size <= maxBytes, `${label} has an invalid size`);
  const [realFile, realRoot] = await Promise.all([realpath(expected), realpath(root)]);
  requireValue(exactWindowsPath(realFile, expected) && isWithin(realFile, realRoot),
    `${label} escaped the protected directory`);
  await assertRestrictedWindowsAcl(expected, false, requireDirectAcl);
}

export async function assertProtectedDirectory(directory, root, label) {
  requireValue(isWithin(directory, root), `${label} escaped the credential root`);
  await assertNoReparseComponents(directory, root, label);
  const info = await lstat(directory);
  requireValue(info.isDirectory() && !info.isSymbolicLink(), `${label} must be a non-symlink directory`);
  const [realDirectory, realRoot] = await Promise.all([realpath(directory), realpath(root)]);
  requireValue(exactWindowsPath(realDirectory, directory) && isWithin(realDirectory, realRoot),
    `${label} escaped the credential root`);
  await assertRestrictedWindowsAcl(directory, true, true);
}

export async function assertRestrictedWindowsAcl(target, directory, requireDirectAcl) {
  const { stdout } = await execFileAsync('icacls', [target], { encoding: 'utf8', windowsHide: true });
  const expectedRights = directory ? '(OI)(CI)(F)' : '(F)';
  const owner = requiredEnvironment('USERNAME').toLocaleLowerCase();
  let first = true;
  let ownerSeen = false;
  for (const rawLine of stdout.split(/\r?\n/u)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('Successfully processed')) continue;
    if (first) {
      requireValue(line.toLocaleLowerCase().startsWith(target.toLocaleLowerCase()),
        'icacls did not report the requested protected path');
      line = line.slice(target.length).trim();
      first = false;
    }
    const match = /^(?<principal>.+?):(?<rights>(?:\(I\))?(?:\(OI\))?(?:\(CI\))?\(F\))$/u.exec(line);
    requireValue(match, `Could not parse a restrictive ACL entry for ${target}`);
    const principal = match.groups.principal.toLocaleLowerCase();
    const rights = match.groups.rights;
    if (requireDirectAcl) {
      requireValue(rights === expectedRights, `${target} ACL must contain direct full-control entries only`);
    } else {
      requireValue(rights === expectedRights || rights === `(I)${expectedRights}`,
        `${target} ACL has unexpected rights`);
    }
    if (principal === owner || principal.endsWith(`\\${owner}`)) ownerSeen = true;
    else throw new Error(`${target} ACL grants an unapproved principal`);
  }
  requireValue(!first && ownerSeen,
    `${target} ACL is missing current-user full control`);
}

export function exactWindowsPath(value, expected) {
  return typeof value === 'string'
    && path.resolve(value).toLocaleLowerCase() === path.resolve(expected).toLocaleLowerCase();
}

function isWithin(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function assertNoReparseComponents(target, root, label) {
  requireValue(isWithin(target, root), `${label} is outside its approved root`);
  await assertNoWindowsReparsePoint(root, label);
  const rootInfo = await lstat(root);
  requireValue(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), `${label} root must be a non-reparse directory`);
  const relative = path.relative(root, target);
  let current = root;
  for (const component of relative ? relative.split(path.sep) : []) {
    current = path.join(current, component);
    await assertNoWindowsReparsePoint(current, label);
    const info = await lstat(current);
    requireValue(!info.isSymbolicLink(), `${label} traverses a Windows reparse point`);
  }
}

async function assertNoWindowsReparsePoint(target, label) {
  if (process.platform !== 'win32') return;
  let state;
  try {
    ({ stdout: state } = await execFileAsync('python', [WINDOWS_REPARSE_QUERY, target], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 64,
    }));
  } catch {
    throw new Error(`${label} could not inspect Windows reparse point attributes`);
  }
  const normalized = state.trim();
  requireValue(normalized === '0' || normalized === '1',
    `${label} returned an invalid Windows reparse point result`);
  requireValue(normalized === '0', `${label} traverses a Windows reparse point`);
}

function normalizedFingerprint(value) {
  return value.replaceAll(':', '').toLocaleLowerCase();
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
}
