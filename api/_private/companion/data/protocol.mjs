import protobuf from 'protobufjs/minimal.js';
import generated from '../vendor/wire.cjs';
export const W = generated.blueswallow.vnext.sync.v1;
export const O = generated.blueswallow.vnext.v1;
export const Reader = protobuf.Reader;
export const MAX_LONG = (1n << 63n) - 1n;
export const HASH = /^[0-9a-f]{64}$/;
export const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const SOURCE = /^[a-z][a-z0-9_.-]{0,63}$/;
export function ensure(value) { if (!value) throw new Error('invalid_dataset'); }
export function equalBytes(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
export function integer(value) { const result = BigInt(value.toString()); ensure(result >= 0n && result <= MAX_LONG); return result; }
export function signed(value) { const result = BigInt(value.toString()); ensure(result >= -MAX_LONG - 1n && result <= MAX_LONG); return result; }
export function pick(value, fields) { return Object.fromEntries(fields.map((key) => [key, value[key]])); }
export function canonical(type, wire, fields, bytes) { ensure(equalBytes(type.encode(pick(wire, fields)).finish(), bytes)); }
export function oneOf(value, allowed) { ensure(allowed.includes(value)); }
export function nonnegative(value, names) { for (const name of names) integer(value[name]); }
export function optionalNonnegative(value, names) { for (const name of names) if (Object.hasOwn(value, name)) integer(value[name]); }
export function bootId(value) {
  // Java UUID.fromString also accepts shortened hexadecimal groups for boot IDs.
  ensure(typeof value === 'string' && /^[a-f\d]{1,8}-[a-f\d]{1,4}-[a-f\d]{1,4}-[a-f\d]{1,4}-[a-f\d]{1,12}$/i.test(value));
}
export function frame(value) { ensure(typeof value === 'string' && value.trim().length > 0 && value.length <= 128); }
export function decode(type, bytes, limit) {
  ensure(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= limit);
  try { return type.decode(bytes); } catch { throw new Error('invalid_dataset'); }
}
export async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (x) => x.toString(16).padStart(2, '0')).join('');
}
export function utf8(value) { return new TextEncoder().encode(value); }
export function text(bytes) { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('invalid_dataset'); } }
export function base64url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export function unbase64(value, max) {
  ensure(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) && value.length <= Math.ceil(max * 4 / 3));
  let bytes;
  try { bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (x) => x.charCodeAt(0)); }
  catch { throw new Error('invalid_dataset'); }
  ensure(bytes.length <= max && base64url(bytes) === value); return bytes;
}
