'use strict';

const { DEVICE_ID, exactKeys, readConfig, signJson, verifyJson } = require('./wardriver-sync-auth');
const TYPE = 'wardriver.update.read.v1';
const LIFETIME = 300;

async function issueDeviceUpdate(config, deviceId, now) {
  const update = config.update;
  if (!update || !update.allowed.includes(deviceId)) return undefined;
  const payload = { version: 1, groupId: config.groupId, deviceId, audience: update.endpoint,
    blobHost: update.blobHost, container: update.container, issuedAt: now, expiresAt: now + LIFETIME };
  return { grant: await signJson(payload, TYPE, config) };
}

async function verifyDeviceUpdate(req, env = process.env, now = Math.floor(Date.now() / 1000)) {
  try {
    if (env.BSS_WARDRIVER_DEVICE_UPDATE_ENABLED !== 'true') return false;
    const headers = req?.headers;
    let authorization;
    if (typeof headers?.get === 'function') authorization = headers.get('authorization');
    else {
      const entries = Object.entries(headers || {}).filter(([name]) => name.toLowerCase() === 'authorization');
      if (entries.length !== 1) return false;
      authorization = entries[0][1];
    }
    if (typeof authorization !== 'string') return false;
    const token = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization)?.[1];
    if (!token || token.length > 4096) return false;
    const config = readConfig(env); const update = config.update;
    if (!update) return false;
    const value = await verifyJson(token, config.signer.key, TYPE, config.signer.deviceId, 4096);
    return exactKeys(value, ['version','groupId','deviceId','audience','blobHost','container','issuedAt','expiresAt'])
      && value.version === 1 && value.groupId === config.groupId && DEVICE_ID.test(value.deviceId || '')
      && update.allowed.includes(value.deviceId) && value.audience === update.endpoint
      && value.blobHost === update.blobHost && value.container === update.container
      && Number.isSafeInteger(value.issuedAt) && Number.isSafeInteger(value.expiresAt)
      && value.expiresAt - value.issuedAt === LIFETIME && value.issuedAt <= now + 5 && value.expiresAt > now;
  } catch { return false; }
}
module.exports = { TYPE, LIFETIME, issueDeviceUpdate, verifyDeviceUpdate };
