// Dev entry point. Installs the mock backend (fake devices, no HA/VM), then
// boots the real app unchanged. Built by rollup.dev.config.js into
// dev/dev-bundle.js — never shipped in the production bundle.
import "./sv-mock.js";
import "./sv-app.js";
