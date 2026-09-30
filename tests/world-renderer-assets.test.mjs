import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {createRendererAssetHandler}=require('../api/operator-renderer-assets/index.js');
test('nested renderer assets fail closed: exact auth, fixed manifest, no traversal/query; raw bytes',async()=>{
  let reads=0;const handler=createRendererAssetHandler({authorize:req=>({ok:req.headers?.test==='synthetic-owner'}),readFile:()=>{reads++;return Buffer.from('synthetic asset');}});
  const ctx={},req={method:'GET',headers:{test:'synthetic-owner'},params:{asset:'Workers/createGeometry.js'},query:{}};
  for(const change of [{headers:{}},{params:{asset:'../index.js'}},{params:{asset:'Assets/Images/ion-credit.png'}},{query:{lat:47}},{method:'POST'}]){await handler(ctx,{...req,...change});assert.equal(ctx.res.status,403);}
  assert.equal(reads,0);await handler(ctx,req);assert.equal(ctx.res.status,200);assert.ok(Buffer.isBuffer(ctx.res.body));assert.match(ctx.res.headers['Cache-Control'],/no-store/);
});
test('pinned Cesium manifest hashes and byte counts match every owner-served file',async()=>{
  const root=new URL('../api/_private/operator/assets/cesium/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
  for(const [name,record] of Object.entries(manifest)){const bytes=await readFile(new URL(name,root));assert.equal(bytes.length,record.bytes,name);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256,name);}
});
