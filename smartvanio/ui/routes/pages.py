"""HTML page routes — SPA shell only.

The Lit frontend handles all rendering. `/device/<id>` is served as
the same shell so a refresh on a deep link still works; the SPA reads
the URL on mount and routes itself.
"""

from __future__ import annotations

from flask import Blueprint, render_template

bp = Blueprint("pages", __name__)


@bp.get("/")
def index():
    return render_template("index.html")


@bp.get("/device/<device_id>")
def device_shell(device_id: str):  # noqa: ARG001 — id consumed client-side
    return render_template("index.html")
