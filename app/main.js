async function sendEcho() {
  const msg = document.getElementById("msg").value;

  const res = await fetch(`/api/echo?msg=${encodeURIComponent(msg)}`);
  const data = await res.text();

  document.getElementById("output").innerText = data;
}
