import { createServer } from "http";
import { parse } from "url";
import next from "next";
import WebSocket, { WebSocketServer } from "ws";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const HASS_WS_URL = process.env.IS_HA
  ? "ws://supervisor/core/api/websocket"
  : `ws://${process.env.HA_HOST}/core/api/websocket`;

const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN;

console.log("SUPERVISOR TOKEN", SUPERVISOR_TOKEN);

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    console.log(req.url);
    if (req.url.includes("/api/websocket")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (clientSocket) => {
    const haSocket = new WebSocket(HASS_WS_URL);

    let isAuthed = false;

    haSocket.on("open", () => {
      haSocket.send(
        JSON.stringify({ type: "auth", access_token: SUPERVISOR_TOKEN })
      );
    });

    haSocket.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === "auth_ok") {
        isAuthed = true;
      }

      if (msg.type === "auth_invalid") {
        clientSocket.send(JSON.stringify({ error: "auth_invalid" }));
        clientSocket.close();
        haSocket.close();
        return;
      }

      if (isAuthed) {
        clientSocket.send(JSON.stringify(msg));
      }
    });

    clientSocket.on("message", (data) => {
      if (isAuthed && haSocket.readyState === WebSocket.OPEN) {
        haSocket.send(data.toString());
      }
    });

    clientSocket.on("close", () => {
      haSocket.close();
    });

    haSocket.on("close", () => {
      clientSocket.close();
    });

    haSocket.on("error", (err) => {
      console.error("HA WS error:", err);
      clientSocket.close();
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
