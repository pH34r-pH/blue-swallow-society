<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tyler's Personal Site + VM Echo</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <header class="site-header">
      <div class="container row between center wrap gap-md">
        <div>
          <div class="eyebrow">Azure Static Web Apps + VM Echo Starter</div>
          <h1>Public site, managed API, experimental VM backend</h1>
          <p class="subtle">Start with a simple echo chain, then grow into local models and richer services.</p>
        </div>
        <nav class="row gap-sm">
          <a class="btn btn-secondary" href="#echo-lab">Echo Lab</a>
          <button id="loginButton" class="btn btn-primary">Sign in</button>
          <button id="logoutButton" class="btn btn-secondary">Sign out</button>
        </nav>
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="container grid-2 gap-lg">
          <div>
            <span class="pill">Starter chain</span>
            <h2>Browser → Static Web App → Managed API → VM echo service</h2>
            <p>
              This repo proves the full set of moving parts with the smallest possible backend.
              Once the echo path works, you can replace the VM service with local model experiments.
            </p>
          </div>
          <div class="card code">
<pre><code>frontend  ──► /api/echo
                │
                ▼
        VM backend /echo?msg=...
</code></pre>
          </div>
        </div>
      </section>

      <section id="echo-lab" class="section">
        <div class="container">
          <div class="card top-space">
            <div class="row gap-sm wrap center">
              <input id="echoInput" class="input" type="text" value="hello from the static web app" />
              <button id="sendEchoButton" class="btn btn-primary">Send echo request</button>
            </div>
            <pre id="echoOutput" class="top-space">Press “Send echo request”.</pre>
          </div>
        </div>
      </section>

      <section id="account" class="section alt">
        <div class="container">
          <div class="row between center wrap gap-md">
            <div>
              <h2>Protected account area</h2>
            </div>
            <button id="refreshProfileButton" class="btn btn-secondary">Load profile</button>
          </div>
          <div class="grid-2 gap-md top-space">
            <div class="card"><h3>Client principal</h3><pre id="clientPrincipalOutput">Loading…</pre></div>
            <div class="card"><h3>Profile API response</h3><pre id="apiOutput">Press “Load profile”.</pre></div>
          </div>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <div class="container row between center wrap gap-sm">
        <span>Starter scaffold for experiments</span>
        <span class="subtle">Echo first, then local models and richer agents</span>
      </div>
    </footer>

    <script src="/main.js" type="module"></script>
  </body>
</html>
