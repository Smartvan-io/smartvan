"""Flask app factory for the SmartVan.io add-on UI."""

from __future__ import annotations

import logging
import os

import requests
from flask import Flask, jsonify, request
from flask_sock import Sock
from werkzeug.exceptions import HTTPException

from .ha_client import get_client
from .routes import api, pages, ws

SUPERVISOR_TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")
SUPERVISOR_CORE_API = "http://supervisor/core/api"

logger = logging.getLogger(__name__)


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
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.wsgi_app = IngressPrefixMiddleware(app.wsgi_app)
    sock = Sock(app)

    app.register_blueprint(pages.bp)
    app.register_blueprint(api.bp)
    ws.register(sock)

    # Touch the singleton so the persistent HA WS greenlet starts as
    # part of app construction, not lazily on first request.
    get_client()

    @app.errorhandler(HTTPException)
    def _json_errors(exc: HTTPException):
        """Return API errors as JSON.

        Flask's default error pages are HTML, which the frontend's
        postJson() can't parse — it falls back to a bare "HTTP 400" and
        the actual reason (e.g. "unknown channel ...") never reaches the
        user. Only /api paths are converted; page routes keep the
        standard HTML pages.
        """
        if not request.path.startswith("/api/"):
            return exc
        return (
            jsonify({"ok": False, "message": exc.description or exc.name}),
            exc.code or 500,
        )

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True, "ha_ready": get_client().is_ready()})

    @app.get("/api/ha-ping")
    def ha_ping():
        return jsonify(_probe_ha())

    @sock.route("/ws/echo")
    def ws_echo(_ws):
        # Spike-era echo, kept as a smoke-test endpoint. Safe to remove
        # once /ws/devices and /ws/device/<id> are exercised in real use.
        while True:
            msg = _ws.receive()
            if msg is None:
                break
            _ws.send(f"echo: {msg}")

    return app


def _probe_ha() -> dict:
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
