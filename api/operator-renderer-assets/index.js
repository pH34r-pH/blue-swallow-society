const fs = require('node:fs');
const path = require('node:path');
const { verifyOperatorRequest } = require('../_lib/operator-auth');
const root = path.resolve(__dirname,'../_private/operator/assets/cesium');
const manifest = require('../_private/operator/assets/cesium/manifest.json');
const headers = { 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin' };
function createRendererAssetHandler({ readFile = fs.readFileSync, authorize = verifyOperatorRequest } = {}) {
  return async (context,req) => {
    const name = req.params?.asset;
    if (!['GET','HEAD'].includes(req.method) || !authorize(req).ok || Object.keys(req.query || {}).length
      || typeof name !== 'string' || !Object.hasOwn(manifest,name) || name.includes('..') || name.includes('\\')) {
      context.res={ status:403,headers,body:{ ok:false,error:'renderer_asset_unavailable' } }; return;
    }
    try {
      const file = path.resolve(root,name);
      if (!file.startsWith(root+path.sep)) throw new Error();
      const contentType = name.endsWith('.png') ? 'image/png' : name.endsWith('.json') ? 'application/json' : 'application/javascript';
      context.res={ status:200,headers:{ ...headers,'Content-Type':contentType+'; charset=utf-8' },body:req.method==='HEAD' ? '' : readFile(file) };
    } catch { context.res={ status:404,headers,body:{ ok:false,error:'renderer_asset_unavailable' } }; }
  };
}
module.exports = createRendererAssetHandler(); module.exports.createRendererAssetHandler = createRendererAssetHandler;
