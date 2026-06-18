/* Landing/status page: pull live status from /api/health and render it. */
(function () {
  function fmtUptime(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    var d = Math.floor(seconds / 86400);
    var h = Math.floor((seconds % 86400) / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    var parts = [];
    if (d) parts.push(d + 'd');
    if (h) parts.push(h + 'h');
    if (m) parts.push(m + 'm');
    parts.push(s + 's');
    return parts.join(' ');
  }

  // Map a dependency state to a color class.
  function depClass(state) {
    if (state === 'connected' || state === 'configured') return 'dep dep--ok';
    if (state === 'fallback' || state === 'connecting') return 'dep dep--warn';
    return 'dep dep--bad'; // disconnected / unknown
  }

  function setDep(id, state) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = state || 'unknown';
    el.className = depClass(state);
  }

  function setPill(kind, text) {
    var pill = document.getElementById('statusPill');
    pill.className = 'pill pill--' + kind;
    document.getElementById('statusText').textContent = text;
  }

  function load() {
    fetch('/api/health', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        setPill('online', 'API is running');
        document.getElementById('env').textContent = d.env || '—';
        document.getElementById('uptime').textContent = fmtUptime(d.uptime);
        setDep('dep-db', d.dependencies && d.dependencies.db);
        setDep('dep-ai', d.dependencies && d.dependencies.ai);
        setDep('dep-plaid', d.dependencies && d.dependencies.plaid);
        document.getElementById('mem').textContent =
          d.memory && d.memory.rssMb != null ? d.memory.rssMb + ' MB' : '—';
        document.getElementById('service').textContent = d.service || 'SpendPilot API';
        document.getElementById('ts').textContent =
          d.timestamp ? new Date(d.timestamp).toLocaleString() : '';
      })
      .catch(function () {
        setPill('offline', 'API unreachable');
      });
  }

  load();
  setInterval(load, 10000); // refresh every 10s
})();
