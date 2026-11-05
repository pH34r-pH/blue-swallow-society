import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fixture, device, signRequest, invoke, fakeStorage, invite, enroll } from './fixtures/wardriver-sync.mjs';
import { releaseFixture, signerSha256 } from './fixtures/wardriver-development.mjs';

const require = createRequire(import.meta.url);
const auth = require('../api/_lib/wardriver-sync-auth');
const { TYPE, issueDeviceUpdate, verifyDeviceUpdate } = require('../api/_lib/wardriver-device-update');
const { handle } = require('../api/wardriver-development')._internals;
function configured() {
  const f=fixture();
  Object.assign(f.env,{ BSS_WARDRIVER_DEVICE_UPDATE_ENABLED:'true',
    BSS_WARDRIVER_DEVICE_UPDATE_ENDPOINT:'https://fixture.invalid/api/wardriver-development/',
    BSS_WARDRIVER_DEVICE_UPDATE_BLOB_HOST:'fixtureaccount.blob.core.windows.net',
    BSS_WARDRIVER_DEVELOPMENT_CONTAINER:'development-fixture',
    BSS_WARDRIVER_DEVICE_UPDATE_ALLOWED_IDS:JSON.stringify([f.owner.deviceId]),
    BSS_WARDRIVER_DEVELOPMENT_SIGNER_SHA256:signerSha256 });
  f.config=auth.readConfig(f.env);return f;
}
const request=(token)=>({headers:{authorization:`Bearer ${token}`}});

test('only an active allowlisted device receives the optional update grant', async () => {
  const f=configured();const storage=fakeStorage();
  const owner=await invoke(f,'grants',await signRequest(f,f.owner,'grants'),{storage});
  assert.equal(owner.status,200);assert.ok(owner.body.update.grant);
  const payload=await auth.verifyJson(owner.body.update.grant,f.signer.publicKey,TYPE,f.signer.deviceId,4096);
  assert.equal(payload.deviceId,f.owner.deviceId);assert.equal(payload.expiresAt-payload.issuedAt,300);
  assert.equal(await verifyDeviceUpdate(request(owner.body.update.grant),f.env,f.now()),true);
  const other=device();const denied=await invoke(f,'grants',await signRequest(f,other,'grants'),{storage});
  assert.equal(denied.status,403);assert.equal(denied.body.update,undefined);
  f.env.BSS_WARDRIVER_DEVICE_UPDATE_ALLOWED_IDS=JSON.stringify([other.deviceId]);
  assert.equal(await verifyDeviceUpdate(request(owner.body.update.grant),f.env,f.now()),false);
  const noGrant=await invoke(f,'grants',await signRequest(f,f.owner,'grants'),{storage});
  assert.equal(noGrant.status,200);assert.equal(noGrant.body.update,undefined);
});

test('membership revocation prevents renewal and issued read grants expire', async () => {
  const f=configured();const friend=device();const storage=fakeStorage();
  f.env.BSS_WARDRIVER_DEVICE_UPDATE_ALLOWED_IDS=JSON.stringify([friend.deviceId]);f.config=auth.readConfig(f.env);
  const invitation=(await invite(f,storage)).body.invitation;
  const joined=await enroll(f,storage,friend,invitation);
  assert.equal(joined.status,200);const grant=joined.body.update.grant;
  const revoked=await invoke(f,'revoke',await signRequest(f,f.owner,'revoke',{
    targetDeviceId:friend.deviceId,acceptedThrough:{sequence:0,commitHash:null},
  }),{storage});
  assert.equal(revoked.status,200);
  assert.equal((await invoke(f,'grants',await signRequest(f,friend,'grants'),{storage})).status,403);
  assert.equal(await verifyDeviceUpdate(request(grant),f.env,f.now()),true);
  assert.equal(await verifyDeviceUpdate(request(grant),f.env,f.now()+300),false);
});

test('grant validation rejects tampering, expired, scope, type, and optional-config mistakes', async () => {
  const f=configured();const now=f.now();const grant=(await issueDeviceUpdate(f.config,f.owner.deviceId,now)).grant;
  assert.equal(await verifyDeviceUpdate(request(grant),f.env,now+299),true);
  assert.equal(await verifyDeviceUpdate(request(grant),f.env,now+300),false);
  assert.equal(await verifyDeviceUpdate(request(grant),f.env,now-6),false);
  assert.equal(await verifyDeviceUpdate(request(`${grant.slice(0,-1)}!`),f.env,now),false);
  const payload=await auth.verifyJson(grant,f.signer.publicKey,TYPE,f.signer.deviceId,4096);
  for (const replacement of [{audience:'https://other.invalid/api/wardriver-development/'},
    {blobHost:'other.blob.core.windows.net'},{container:'another-container'},
    {expiresAt:payload.expiresAt+1},{deviceId:device().deviceId},{unexpected:true}]) {
    const bad=await auth.signJson({...payload,...replacement},TYPE,f.config);
    assert.equal(await verifyDeviceUpdate(request(bad),f.env,now),false);
  }
  const wrongType=await auth.signJson(payload,auth.ROSTER_TYPE,f.config);
  assert.equal(await verifyDeviceUpdate(request(wrongType),f.env,now),false);
  const attacker=device();const { CompactSign }=await import('../api/node_modules/jose/dist/webapi/index.js');
  const forged=await new CompactSign(Buffer.from(JSON.stringify(payload)))
    .setProtectedHeader({alg:'RS256',typ:TYPE,kid:f.config.signer.deviceId}).sign(attacker.privateKey);
  assert.equal(await verifyDeviceUpdate(request(forged),f.env,now),false);
  for (const [key,value] of [['BSS_WARDRIVER_DEVICE_UPDATE_ENABLED','false'],
    ['BSS_WARDRIVER_DEVICE_UPDATE_ALLOWED_IDS','[]'],
    ['BSS_WARDRIVER_DEVICE_UPDATE_ENDPOINT','https://other.invalid/api/wardriver-development/']]) {
    assert.equal(await verifyDeviceUpdate(request(grant),{...f.env,[key]:value},now),false);
    assert.equal(auth.readConfig({...f.env,[key]:value}).update,null);
  }
});

test('a valid device grant reaches current receipt, invalid grants fail before storage', async () => {
  const f=configured();const now=Math.floor(Date.now()/1000);
  const grant=(await issueDeviceUpdate(f.config,f.owner.deviceId,now)).grant;
  let constructions=0;const release=releaseFixture();
  const createStore=()=>{ constructions++;return {async getRelease(){return release;}}; };
  const invokeFeed=async(token)=>{
    const context={log:{error(){}}};
    await handle(context,{method:'GET',params:{artifact:'current.json'},...request(token)},
      {env:f.env,createStore});return context.res;
  };
  assert.equal((await invokeFeed('invalid')).status,503);assert.equal(constructions,0);
  const ok=await invokeFeed(grant);assert.equal(ok.status,200);assert.deepEqual(ok.body,release);assert.equal(constructions,1);
});
