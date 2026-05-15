module.exports = async function (context, req) {
  const prompt = (req.query && req.query.prompt) || (req.body && req.body.prompt) || "";

  // Placeholder. Replace this with a call to Azure OpenAI or the VM-hosted local
  // model. Inputs are kept short and never echoed back into shells or HTML.
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      ok: true,
      message: "Agent placeholder",
      prompt: String(prompt).slice(0, 500)
    }
  };
};
