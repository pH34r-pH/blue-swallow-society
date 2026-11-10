'use strict';
const { createViewerSessionStore } = require('../_lib/viewer-session-store');
module.exports = async function cleanup(context) {
  if (process.env.BLUE_SWALLOW_AUTH_MODE !== 'password') return;
  try { await createViewerSessionStore().sweep(); }
  catch { context.log?.error?.('Viewer session cleanup unavailable.'); throw new Error('viewer_cleanup_unavailable'); }
};
