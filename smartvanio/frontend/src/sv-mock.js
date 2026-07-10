// Dev-only mock backend.
//
// Intercepts window.fetch and window.WebSocket so the Lit UI runs with
// realistic fake devices — no Flask, no HA, no VM. Imported ONLY by
// sv-dev.js (the dev entry); never part of the production bundle.

const DEVICES = [
  { device_id: "incl-1a2b", name: "Front Inclinometer", model: "inclinometer", sw_version: "1.1.0" },
  { device_id: "tank-3c4d", name: "Fresh + Grey Tanks", model: "resistive_sensor", sw_version: "1.1.3" },
  { device_id: "led-5e6f", name: "Ceiling LEDs", model: "led_controller", sw_version: "1.5.0" },
  { device_id: "misc-7g8h", name: "Mystery Board", model: "relay_8ch", sw_version: "2.0.0" },
];

const PAYLOADS = {
  "incl-1a2b": {
    model_kind: "inclinometer",
    device: DEVICES[0],
    inclinometer: {
      pitch_value: 1.4,
      roll_value: -0.8,
      orientation_value: "z-up",
      orientation_options: ["z-up", "z-down", "x-up", "x-down", "y-up", "y-down"],
      pitch_compensation: 0.5,
      roll_compensation: -0.2,
    },
  },
  "tank-3c4d": {
    model_kind: "resistive",
    device: DEVICES[1],
    resistive: {
      sensors: [
        {
          n: 1, raw_value: 1.82, interpolated_value: 64, input_open: false,
          points: [[0.5, 0], [1.6, 50], [2.9, 100]],
          kind_value: "linear",
          kind_options: ["linear", "cubic", "quadratic", "smooth"],
          min_r: 10, max_r: 180, threshold: 3.2,
        },
        {
          n: 2, raw_value: 0.4, interpolated_value: 8, input_open: true,
          points: [[0.3, 0], [3.0, 100]],
          kind_value: "linear",
          kind_options: ["linear", "cubic", "quadratic", "smooth"],
          min_r: 10, max_r: 180, threshold: 3.2,
        },
      ],
    },
  },
  "led-5e6f": {
    model_kind: "led",
    device: DEVICES[2],
    led: {
      strips: [
        { n: 1, name: "Kitchen", entity_id: "light.led_strip_1" },
        { n: 2, name: "Lounge", entity_id: "light.led_strip_2" },
      ],
    },
  },
  "misc-7g8h": { model_kind: "unknown", device: DEVICES[3] },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jsonResponse = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// --- fetch mock ---
const realFetch = window.fetch ? window.fetch.bind(window) : null;
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  const m = path.match(/\/api\/device\/([^/?]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    return jsonResponse(PAYLOADS[id] || { model_kind: "unknown", device: {} });
  }
  if (init && init.method === "POST") {
    await sleep(350);
    let body = {};
    try {
      body = JSON.parse(init.body || "{}");
    } catch {}
    return jsonResponse({ ok: true, message: "Saved (mock).", points: body.points });
  }
  if (realFetch) return realFetch(input, init);
  return jsonResponse({ ok: false, message: "no mock route" }, 404);
};

// --- WebSocket mock ---
class MockWebSocket {
  constructor(url) {
    this.url = String(url);
    this.readyState = 0;
    this._listeners = {};
    this._timers = [];
    setTimeout(() => {
      this.readyState = 1;
      this._emit("open", {});
      this._start();
    }, 40);
  }
  addEventListener(type, fn) {
    (this._listeners[type] || (this._listeners[type] = [])).push(fn);
  }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  }
  send() {}
  close() {
    this.readyState = 3;
    this._timers.forEach(clearInterval);
    this._emit("close", {});
  }
  _emit(type, ev) {
    (this._listeners[type] || []).forEach((fn) => fn(ev));
  }
  _msg(obj) {
    this._emit("message", { data: JSON.stringify(obj) });
  }
  _start() {
    if (this.url.includes("/ws/devices")) {
      this._msg({ devices: DEVICES, ha_ready: true });
      return;
    }
    const m = this.url.match(/\/ws\/device\/([^/?]+)/);
    if (!m) return;
    const kind = PAYLOADS[decodeURIComponent(m[1])] && PAYLOADS[decodeURIComponent(m[1])].model_kind;
    let t = 0;
    if (kind === "inclinometer") {
      this._timers.push(setInterval(() => {
        t += 0.4;
        this._msg({ channel: "adjusted_pitch_angle", value: +(1.4 + Math.sin(t) * 0.6).toFixed(2) });
        this._msg({ channel: "adjusted_roll_angle", value: +(-0.8 + Math.cos(t) * 0.5).toFixed(2) });
      }, 700));
    } else if (kind === "resistive") {
      this._timers.push(setInterval(() => {
        t += 0.5;
        this._msg({ channel: "sensor_1_raw", value: +(1.82 + Math.sin(t) * 0.05).toFixed(3) });
        this._msg({ channel: "sensor_1_interpolated_value", value: Math.round(64 + Math.sin(t) * 3) });
      }, 800));
    }
  }
}
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;
window.WebSocket = MockWebSocket;

// eslint-disable-next-line no-console
console.info(`[sv-mock] mock backend installed — ${DEVICES.length} devices`);
