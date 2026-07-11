const fs = require('node:fs');
const path = require('node:path');
const { requireOperatorToken } = require('../_lib/operator-auth');

const DOWNLOAD_DIR = path.join(__dirname, '..', '_private', 'downloads');
const METADATA_FILE = 'blue-swallow-wardriver.json';

module.exports = async function (context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) {
    return;
  }

  const artifact = normalizeArtifact(req.params?.artifact);
  if (artifact === 'metadata') {
    context.res = metadataResponse(req);
    return;
  }

  if (artifact === 'apk') {
    context.res = apkResponse(req);
    return;
  }

  context.res = jsonResponse(404, {
    ok: false,
    error: 'Unknown operator download artifact.',
  });
};

function normalizeArtifact(value) {
  return String(value || '').trim().toLowerCase();
}

function metadataResponse(req) {
  const metadata = readMetadata();
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: req.method === 'HEAD' ? undefined : {
      ok: true,
      artifact: metadata,
    },
  };
}

function apkResponse(req) {
  const metadata = readMetadata();
  const apkPath = path.join(DOWNLOAD_DIR, metadata.fileName);
  const stat = fs.statSync(apkPath);
  const headers = {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': `attachment; filename="${metadata.fileName}"`,
    'Content-Length': String(stat.size),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Blue-Swallow-Artifact-SHA256': metadata.sha256,
  };

  if (req.method === 'HEAD') {
    return {
      status: 200,
      headers,
    };
  }

  return {
    status: 200,
    headers,
    isRaw: true,
    body: fs.readFileSync(apkPath),
  };
}

function readMetadata() {
  const metadataPath = path.join(DOWNLOAD_DIR, METADATA_FILE);
  const raw = fs.readFileSync(metadataPath, 'utf8');
  return JSON.parse(raw);
}

function jsonResponse(status, body) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body,
  };
}

module.exports._internals = { readMetadata, normalizeArtifact };
