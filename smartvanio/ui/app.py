"""Flask app factory for the SmartVan.io add-on UI.

Spike scope: one HTTP page that proves Ingress + SCRIPT_NAME shim +
SUPERVISOR_TOKEN round-trip to HA. One flask-sock WebSocket echo route
that proves Ingress upgrades WS through the supervisor proxy.
"""

from __future__ import annotations

import os

import requests
from flask import Flask, jsonify, render_template, request
from flask_sock import Sock

SUPERVISOR_TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")
SUPERVISOR_CORE_API = "http://supervisor/core/api"


class IngressPrefixMiddleware:
    """Apply X-Ingress-Path as the WSGI SCRIPT_NAME.

    Must run as WSGI middleware (not Flask before_request) because
    Flask caches `request.script_root` during URL routing, which
    happens before any before_request hook can mutate the environ.
    Setting SCRIPT_NAME here means url_for() and the request's
    script_root see the Ingress prefix from the very start.
    """

    def __init__(self, wsgi_app):
        self._wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        prefix = environ.get("HTTP_X_INGRESS_PATH", "")
        if prefix:
            environ["SCRIPT_NAME"] = prefix
            # Supervisor already strips the prefix from PATH_INFO before
            # forwarding, so we leave it alone.
        return self._wsgi_app(environ, start_response)


def create_app() -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.wsgi_app = IngressPrefixMiddleware(app.wsgi_app)
    sock = Sock(app)

    @app.get("/")
    def index():
        ha_status = _probe_ha()
        return render_template("index.html", ha_status=ha_status)

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True})

    @app.get("/api/ha-ping")
    def ha_ping():
        return jsonify(_probe_ha())

    @sock.route("/ws/echo")
    def ws_echo(ws):
        # Trivial echo so we can prove Ingress upgrades the WS and that
        # waitress + flask-sock + simple-websocket play together.
        while True:
            msg = ws.receive()
            if msg is None:
                break
            ws.send(f"echo: {msg}")

    return app


def _probe_ha() -> dict:
    """Hit GET /api/ on HA core via the Supervisor proxy.

    Returns a structured result so the index page can show whether the
    SUPERVISOR_TOKEN round-trip works without dumping internals to the
    user. Used during spike to confirm auth + reachability.
    """
    if not SUPERVISOR_TOKEN:
        return {"ok": False, "reason": "SUPERVISOR_TOKEN not set"}
    try:
        r = requests.get(
            f"{SUPERVISOR_CORE_API}/",
            headers={"Authorization": f"Bearer {SUPERVISOR_TOKEN}"},
            timeout=4,
        )
    except requests.RequestException as exc:
        return {"ok": False, "reason": f"request failed: {exc.__class__.__name__}"}
    if r.status_code != 200:
        return {"ok": False, "reason": f"HTTP {r.status_code}"}
    return {"ok": True, "message": r.json().get("message", "API running")}
