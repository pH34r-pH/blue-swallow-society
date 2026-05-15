module.exports = async function (context, req) {
  const prompt = req.query.prompt || "empty";

  context.res = {
    body: {
      message: "Agent placeholder",
      prompt
    }
  };
};
