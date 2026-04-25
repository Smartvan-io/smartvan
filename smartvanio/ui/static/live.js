// Generic WebSocket fragment-replacer.
//
// For every element with `data-ws="/ws/path"`, opens a WS to that
// path (relative to current document location, so the Ingress prefix
// is preserved automatically) and replaces named DOM regions when
// envelopes arrive of the form:
//   { "target": "#some-id", "html": "<...>" }
//
// Auto-reconnects with exponential backoff. The browser closes the WS
// when the page is navigated away, which is fine.

(function () {
    "use strict";

    function wsUrl(path) {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        const base = location.pathname.replace(/\/$/, "");
        return `${proto}//${location.host}${base}${path}`;
    }

    function applyEnvelope(env) {
        if (!env || !env.target) return;
        const el = document.querySelector(env.target);
        if (!el) return;
        // Replace inner HTML, not outerHTML, so the host element's id
        // and data attributes (including data-ws) survive the swap.
        el.innerHTML = env.html;
    }

    function attach(host) {
        const path = host.getAttribute("data-ws");
        if (!path) return;
        let ws = null;
        let backoff = 1000;
        let stopped = false;

        function open() {
            if (stopped) return;
            ws = new WebSocket(wsUrl(path));
            ws.addEventListener("open", () => {
                backoff = 1000;
                host.dataset.wsState = "open";
            });
            ws.addEventListener("message", (ev) => {
                let env;
                try {
                    env = JSON.parse(ev.data);
                } catch (e) {
                    return;
                }
                applyEnvelope(env);
            });
            ws.addEventListener("close", () => {
                host.dataset.wsState = "closed";
                if (stopped) return;
                setTimeout(open, backoff);
                backoff = Math.min(backoff * 2, 15000);
            });
            ws.addEventListener("error", () => {
                try { ws.close(); } catch (e) {}
            });
        }

        open();

        // If the host element is removed from the DOM (e.g. by a
        // future page-level fragment swap), tear down the WS.
        const observer = new MutationObserver(() => {
            if (!document.contains(host)) {
                stopped = true;
                if (ws) try { ws.close(); } catch (e) {}
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        document.querySelectorAll("[data-ws]").forEach(attach);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
