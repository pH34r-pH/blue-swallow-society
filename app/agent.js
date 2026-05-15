async function runAgent() {
  const promptEl = document.getElementById("prompt");
  const outEl = document.getElementById("out");
  const prompt = promptEl ? promptEl.value : "";
  outEl.textContent = "Running...";
  try {
    const res = await fetch(`/api/agent?prompt=${encodeURIComponent(prompt)}`);
    const text = await res.text();
    try {
      outEl.textContent = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      outEl.textContent = text;
    }
  } catch (err) {
    outEl.textContent = `Agent call failed: ${err.message}`;
  }
}

const runBtn = document.getElementById("runButton");
if (runBtn) runBtn.addEventListener("click", runAgent);
