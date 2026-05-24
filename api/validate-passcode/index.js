module.exports = async function (context, req) {
  const body = req.body || {};
  const passcode = String(body.passcode || "").trim();

  // Hard-coded passcode for Blue Swallow Society network console
  // In production, this should validate against a secrets manager or VM backend
  const VALID_PASSCODE = process.env.BLUE_SWALLOW_PASSCODE || "blue-swallow";

  const isValid = passcode === VALID_PASSCODE;

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      ok: isValid,
      message: isValid ? "Access granted" : "Access denied"
    }
  };
};
