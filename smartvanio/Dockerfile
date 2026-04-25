ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base:3.21

# ── Frontend build stage ─────────────────────────────────────────────
# Compiles the Lit frontend (src/sv-app.js) into a single ES module
# bundle. Output is mounted into ui/static/ in the runtime stage so
# Flask serves it as /static/bundle.js.
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package.json
RUN cd frontend && npm install --silent --no-audit --no-fund --no-progress
COPY frontend frontend
# Pin the rollup output path inside the build container; the runtime
# stage only copies bundle.js so the rest of /build is throwaway.
RUN cd frontend && DESTINATION=/build/bundle.js npm run build

# ── Runtime stage ────────────────────────────────────────────────────
FROM ${BUILD_FROM}

# Runtime dependencies:
#   - git, jq, curl: provisioning (clone integration, hit Supervisor API)
#   - python3, py3-yaml: configure_yaml.py merges into configuration.yaml
#   - py3-flask, py3-jinja2, py3-requests: web UI base
#   - py3-gevent: WSGI server with raw-socket access (required for
#       flask-sock WS upgrades — waitress can't expose the socket).
#   - flask-sock, simple-websocket: browser-facing WebSockets.
#   - websocket-client: persistent WS from addon to HA core via Supervisor.
RUN apk add --no-cache \
        git jq curl \
        python3 py3-yaml py3-flask py3-jinja2 py3-requests py3-gevent py3-pip \
    && pip install --no-cache-dir --break-system-packages \
        flask-sock simple-websocket websocket-client

# App layout:
#   /run.sh                       — entrypoint (provision-or-serve dispatch)
#   /opt/smartvanio/provision.sh  — one-shot provisioner (extracted from run.sh)
#   /opt/smartvanio/configure_yaml.py — lovelace YAML merger
#   /opt/smartvanio/dashboards/   — installed dashboard yaml
#   /opt/smartvanio/ui/           — Flask + Jinja templates + static assets
COPY run.sh /
COPY provision.sh /opt/smartvanio/provision.sh
COPY cleanup.sh /opt/smartvanio/cleanup.sh
COPY configure_yaml.py /opt/smartvanio/configure_yaml.py
COPY unconfigure_yaml.py /opt/smartvanio/unconfigure_yaml.py
COPY dashboards/ /opt/smartvanio/dashboards/
COPY ui/ /opt/smartvanio/ui/

# Copy the rolled-up Lit bundle from the frontend build stage. Goes
# into ui/static/ so Flask's url_for('static', filename='bundle.js')
# resolves to /static/bundle.js (with Ingress prefix applied).
COPY --from=frontend /build/bundle.js /opt/smartvanio/ui/static/bundle.js

RUN chmod a+x /run.sh /opt/smartvanio/provision.sh /opt/smartvanio/cleanup.sh

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/opt/smartvanio

CMD [ "/run.sh" ]
