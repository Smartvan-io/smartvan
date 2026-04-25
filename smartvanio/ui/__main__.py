"""Add-on UI entrypoint.

Monkey-patches gevent FIRST. Order matters: simple-websocket spawns
worker threads to read frames, and if `threading` was imported before
the patch, those threads use real OS threads and cannot switch into
gevent's hub — which surfaces as
`greenlet.error: Cannot switch to a different thread` on first WS recv.
"""

# isort: off  -- patch must precede any other import that touches sockets
from gevent import monkey  # noqa: I001

monkey.patch_all()
# isort: on

from gevent.pywsgi import WSGIServer  # noqa: E402

from .app import create_app  # noqa: E402


def main() -> None:
    app = create_app()
    # gevent.pywsgi exposes the raw socket through `environ`, which
    # flask-sock + simple-websocket need to upgrade HTTP -> WS.
    # waitress cannot do this — it owns its own buffered I/O — so it
    # is not an option here, and we deliberately avoid it.
    WSGIServer(("0.0.0.0", 8099), app).serve_forever()


if __name__ == "__main__":
    main()
