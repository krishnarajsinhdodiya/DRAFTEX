// DRAFTEX's HTTP server (D36). Reads config.json once, listens where the
// network mode says, and checks every request before Next.js sees it:
// Host allow-list, same-origin mutations, HTTPS through a trusted proxy in
// server mode, and the real client address for the sign-in limits.
// Usage: node server.ts [--dev]   (normally started by `npm start`, scripts/start.ts)
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { type AppConfig, ConfigError, readConfig } from "./src/lib/config.ts";
import { allowedHosts, guardRequest, lanAddresses } from "./src/lib/net/guard.ts";
import { securityHeaders } from "./src/lib/net/headers.ts";
import { ENV } from "./src/lib/net/runtime.ts";
import { DataDirError, dataPaths, getDataDir } from "./src/lib/paths.ts";

const dev = process.argv.includes("--dev");
const dir = path.dirname(fileURLToPath(import.meta.url));

function stop(message: string): never {
  console.error(`\nDRAFTEX cannot start.\n${message}\n`);
  process.exit(1);
}

let config: AppConfig;
try {
  config = readConfig(dataPaths(getDataDir()).config);
} catch (e) {
  if (e instanceof ConfigError || e instanceof DataDirError) stop(e.message);
  throw e;
}

// App code reads the running settings from here, not from config.json (D36).
process.env[ENV.mode] = config.mode;
process.env[ENV.port] = String(config.port);
// Next.js expects NODE_ENV to say which build it serves; the type marks it read-only.
(process.env as Record<string, string>).NODE_ENV = dev ? "development" : "production";

const bind =
  config.mode === "local" ? "127.0.0.1" : config.mode === "lan" ? "0.0.0.0" : config.bindAddress;

// Network addresses change (Wi-Fi, DHCP), so the allowed Host values are re-read every few seconds.
let hosts = new Set<string>();
let hostsAt = 0;
function currentHosts(): Set<string> {
  if (Date.now() - hostsAt > 5_000) {
    hosts = allowedHosts(config, {
      lanAddresses: lanAddresses(os.networkInterfaces()),
      hostname: os.hostname(),
    });
    hostsAt = Date.now();
  }
  return hosts;
}

const fixedHeaders = securityHeaders(config.mode);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const server = http.createServer();
const app = next({ dev, dir, hostname: bind, port: config.port, httpServer: server });
const handle = app.getRequestHandler();

server.on("request", (req, res) => {
  for (const [name, value] of Object.entries(fixedHeaders)) res.setHeader(name, value);
  const verdict = guardRequest(
    {
      method: req.method ?? "GET",
      host: one(req.headers.host),
      origin: one(req.headers.origin),
      socketAddress: req.socket.remoteAddress ?? "",
      forwardedFor: one(req.headers["x-forwarded-for"]),
      forwardedProto: one(req.headers["x-forwarded-proto"]),
    },
    config,
    currentHosts(),
  );
  if (!verdict.ok) {
    res.writeHead(verdict.status, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(verdict.message);
    return;
  }
  // Only this server says who the client is and how it connected; client-sent values are dropped.
  req.headers["x-forwarded-for"] = verdict.clientAddress;
  req.headers["x-forwarded-proto"] = config.mode === "server" ? "https" : "http";
  delete req.headers["x-forwarded-host"];
  delete req.headers["x-forwarded-port"];
  delete req.headers["x-real-ip"];
  delete req.headers["forwarded"];
  void handle(req, res);
});

// Only the development server uses WebSockets (live reload), and only from an allowed Host.
server.prependListener("upgrade", (req: http.IncomingMessage, socket) => {
  const host = one(req.headers.host)?.toLowerCase();
  if (!dev || !host || !currentHosts().has(host)) socket.destroy();
});

app
  .prepare()
  .then(() => {
    server.once("error", (e: NodeJS.ErrnoException) => {
      stop(
        e.code === "EADDRINUSE"
          ? `Port ${config.port} is already in use. Another copy of DRAFTEX may be running; close it, or choose another port.`
          : `DRAFTEX could not listen on ${bind}:${config.port} (${e.code ?? e.message}).`,
      );
    });
    server.listen(config.port, bind, () => {
      const where = config.mode === "server" ? `https://${config.hostNames[0]}` : null;
      console.log(
        `DRAFTEX is running in ${config.mode} mode at http://${bind === "0.0.0.0" ? "127.0.0.1" : bind}:${config.port}` +
          (where ? ` (public address ${where})` : "") +
          (dev ? " [development]" : ""),
      );
    });
  })
  .catch((e: unknown) => stop((e as Error).message));

const shutdown = () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
