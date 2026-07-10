module.exports = async function (context, req) {
  const input = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
  const trimmed = input.trim().slice(0, 500);

  // Placeholder. Replace this with a call to Azure OpenAI or the VM-hosted local
  // model. The request body is not echoed back to avoid leaking prompts through
  // logs, browser caches, or rendered output.
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: {
      ok: true,
      message: 'Agent placeholder',
      received: trimmed.length > 0,
      inputBytes: Buffer.byteLength(trimmed, 'utf8')
    }
  };
};
