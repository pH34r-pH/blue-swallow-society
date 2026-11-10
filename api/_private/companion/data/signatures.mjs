import { ensure, unbase64, base64url, sha256, utf8, text, equalBytes } from './protocol.mjs';
const identities = new WeakMap();

export async function publisherKey(spki, deviceId) {
  const bytes = unbase64(spki, 1024); ensure(await sha256(bytes) === deviceId);
  try {
    const key = await crypto.subtle.importKey('spki', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']);
    ensure(key.algorithm.modulusLength >= 2048 && key.algorithm.modulusLength <= 4096);
    ensure(equalBytes(key.algorithm.publicExponent, new Uint8Array([1, 0, 1])));
    ensure(equalBytes(new Uint8Array(await crypto.subtle.exportKey('spki', key)), bytes)); identities.set(key, deviceId); return key;
  } catch { throw new Error('invalid_dataset'); }
}
export async function signedPayload(type, key, bytes, deviceId) {
  ensure(identities.get(key) === deviceId);
  ensure(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= 16384);
  ensure(bytes.every((byte) => byte >= 0x21 && byte <= 0x7e));
  const parts = text(bytes).split('.'); ensure(parts.length === 3);
  ensure(parts[0] === base64url(utf8(JSON.stringify({ alg: 'RS256', typ: type }))));
  const payload = unbase64(parts[1], 16384); const signature = unbase64(parts[2], 512);
  ensure(signature.length === Math.ceil(key.algorithm.modulusLength / 8));
  ensure(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, utf8(`${parts[0]}.${parts[1]}`)));
  return payload;
}
