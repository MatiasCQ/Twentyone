const express = require("express");
const { ExpressPeerServer } = require("peer");
const http = require("http");

const PORT = Number(process.env.PORT || 9000);
const PEER_PATH = process.env.PEER_PATH || "/twentyone";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const app = express();
const server = http.createServer(app);

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  return ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Twenty One PeerServer is online.",
    peerPath: PEER_PATH,
    discovery: true,
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const peerServer = ExpressPeerServer(server, {
  path: "/",
  allow_discovery: true,
  proxied: true,
  debug: true,
  corsOptions: {
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  },
});

app.use(PEER_PATH, peerServer);

peerServer.on("connection", (client) => {
  console.log("[peer] connected:", client.getId());
});

peerServer.on("disconnect", (client) => {
  console.log("[peer] disconnected:", client.getId());
});

server.listen(PORT, () => {
  console.log(
    `PeerServer listening on http://0.0.0.0:${PORT}${PEER_PATH}`
  );
});
