// Minimal WebSocket server (no external deps) for tilt controller demo
// Usage: `PORT=3010 node scripts/tilt-ws-server.js`
// Protocol: JSON text frames with {type:'join'|'orient'|'shoot', room, ...}

import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";

const PORT = Number(process.env.PORT || 3010);

// In-memory clients
/** @type {Set<{socket: import('node:net').Socket, buffer: Buffer, role: 'viewer'|'controller'|'unknown', room: string}>} */
const clients = new Set();

// HTTP server (health endpoint only)
const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("tilt-ws-server: ok");
    return;
  }
  res.writeHead(404);
  res.end("Not Found");
});

server.on("upgrade", (req, socket, head) => {
  if (!/websocket/i.test(String(req.headers["upgrade"]))) {
    socket.destroy();
    return;
  }
  const key = req.headers["sec-websocket-key"];
  if (!key || Array.isArray(key)) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
  const headers = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
  ];
  socket.write(headers.join("\r\n") + "\r\n\r\n");
  if (head && head.length) socket.unshift(head);

  const client = {
    socket,
    buffer: Buffer.alloc(0),
    role: "unknown",
    room: "default",
  };
  clients.add(client);

  socket.on("data", (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    parseFrames(client);
  });
  socket.on("end", () => {
    clients.delete(client);
  });
  socket.on("close", () => {
    clients.delete(client);
  });
  socket.on("error", () => {
    clients.delete(client);
  });
});

/** @param {{ socket: import('node:net').Socket, buffer: Buffer, role: string, room: string }} client */
function parseFrames(client) {
  const buf = client.buffer;
  let offset = 0;
  while (offset + 2 <= buf.length) {
    const b0 = buf[offset];
    const fin = (b0 & 0x80) !== 0; // not used (we ignore continuation)
    const opcode = b0 & 0x0f;
    const b1 = buf[offset + 1];
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let pos = offset + 2;
    if (len === 126) {
      if (pos + 2 > buf.length) break;
      len = buf.readUInt16BE(pos);
      pos += 2;
    } else if (len === 127) {
      if (pos + 8 > buf.length) break;
      const high = buf.readUInt32BE(pos);
      const low = buf.readUInt32BE(pos + 4);
      pos += 8;
      if (high !== 0) {
        close(client, 1009);
        return;
      }
      len = low >>> 0;
    }
    if (!masked) {
      close(client, 1002);
      return;
    }
    if (pos + 4 > buf.length) break;
    const mask = buf.slice(pos, pos + 4);
    pos += 4;
    if (pos + len > buf.length) break;
    const payload = buf.slice(pos, pos + len);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    offset = pos + len;
    if (!fin) continue;
    if (opcode === 0x8) {
      close(client, 1000);
      return;
    } else if (opcode === 0x9) {
      sendFrame(client.socket, payload, 0xa);
    } else if (opcode === 0x1) {
      handleText(client, payload.toString("utf8"));
    }
  }
  client.buffer = buf.slice(offset);
}

/** @param {{ socket: import('node:net').Socket }} client */
function close(client, _code = 1000) {
  try {
    sendFrame(client.socket, Buffer.from([]), 0x8);
  } catch {}
  try {
    client.socket.end();
  } catch {}
  clients.delete(client);
}

/** @param {import('node:net').Socket} sock */
function sendFrame(sock, data, opcode = 0x1) {
  if (!Buffer.isBuffer(data)) data = Buffer.from(String(data));
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 0x10000) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  sock.write(Buffer.concat([header, data]));
}

/** @param {{ socket: import('node:net').Socket, role: string, room: string }} client */
function handleText(client, text) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }
  if (msg && msg.type === "join") {
    client.role = msg.role === "controller" ? "controller" : "viewer";
    client.room = (msg.room && String(msg.room)) || "default";
    return;
  }
  if (msg && msg.type === "orient") {
    const room = (msg.room && String(msg.room)) || "default";
    const out = JSON.stringify({
      type: "orient",
      room,
      beta: msg.beta,
      gamma: msg.gamma,
      alpha: msg.alpha,
      t: Date.now(),
    });
    for (const c of clients) {
      if (c === client) continue;
      if (c.role !== "viewer") continue;
      if (c.room !== room) continue;
      try {
        sendFrame(c.socket, out);
      } catch {}
    }
    return;
  }
  if (msg && msg.type === "shoot") {
    const room = (msg.room && String(msg.room)) || "default";
    const out = JSON.stringify({ type: "shoot", room, t: Date.now() });
    for (const c of clients) {
      if (c === client) continue;
      if (c.role !== "viewer") continue;
      if (c.room !== room) continue;
      try {
        sendFrame(c.socket, out);
      } catch {}
    }
    return;
  }
}

server.listen(PORT, "0.0.0.0", () => {
  const nets = os.networkInterfaces();
  const addrs = Object.values(nets)
    .flat()
    .filter(Boolean)
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n.address);
  console.log(`Tilt WS server on ws://localhost:${PORT}`);
  for (const a of addrs) console.log(`                  ws://${a}:${PORT}`);
});
