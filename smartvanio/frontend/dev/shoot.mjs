// Screenshot the mock dev UI so Claude can see its own changes.
// Usage: node dev/shoot.mjs            (shoots every screen)
//        node dev/shoot.mjs resistive  (one screen by name)
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.SV_URL || "http://127.0.0.1:5599";
const OUT = "dev/shots";
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  { name: "device-list", path: "/" },
  { name: "resistive", path: "/device/tank-3c4d" },
  { name: "inclinometer", path: "/device/incl-1a2b" },
  { name: "led", path: "/device/led-5e6f" },
  { name: "unknown", path: "/device/misc-7g8h" },
];

const only = process.argv[2];
const screens = only ? SCREENS.filter((s) => s.name === only) : SCREENS;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});
for (const s of screens) {
  await page.goto(BASE + s.path, { waitUntil: "load" });
  await page.waitForTimeout(700); // let WS frames + Shoelace hydrate
  const file = `${OUT}/${s.name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log("shot", file);
}
await browser.close();
