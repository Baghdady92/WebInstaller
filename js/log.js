// Activity log — timestamped lines rendered into #log, with copy/clear.
// Other modules use window.DMLog.log(msg, cls); classes: "" | "err" | "ok".
(() => {
  const MAX_LINES = 500;
  const lines = [];

  function render() {
    const el = document.getElementById("log");
    if (!el) return;
    el.textContent = lines.join("\n") + "\n";
    el.scrollTop = el.scrollHeight;
  }

  function stamp() {
    return new Date().toTimeString().slice(0, 8);
  }

  const api = {
    log(msg, cls = "") {
      lines.push(`[${stamp()}]${cls === "err" ? " !!" : cls === "ok" ? " ✓ " : "   "} ${msg}`);
      if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
      render();
    },
    clear() { lines.length = 0; render(); },
    text() { return lines.join("\n"); },
  };

  window.DMLog = api;

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("logClear")?.addEventListener("click", () => api.clear());
    document.getElementById("logCopy")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(api.text());
        api.log("Log copied to clipboard", "ok");
      } catch {
        api.log("Clipboard copy failed — select the log text manually", "err");
      }
    });
  });
})();
