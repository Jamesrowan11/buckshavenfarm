// Production entry point for Plesk (Node.js extension / Phusion Passenger)
// and for any plain `node server.js` host.
//
// Why this file exists: Plesk starts Node apps by running a single
// "Application Startup File" and cannot pass command-line arguments. Pointing
// it at the `next` binary would start `next dev` (its default command). This
// file starts the standard Next.js production server instead, using the
// output of `npm run build`.
//
// Port: Passenger supplies the socket itself (it intercepts listen()), so the
// port below only matters when run outside Passenger. Then PORT (default
// 3000) and HOST (default 127.0.0.1 — keep the app behind the web server's
// reverse proxy) apply. HOSTNAME is deliberately ignored: shells set it to the
// machine name.
process.env.NODE_ENV = "production";

const { createServer } = require("node:http");
const path = require("node:path");
const next = require("next");

const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "127.0.0.1";

const app = next({ dev: false, dir: path.join(__dirname), hostname: host, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = createServer((req, res) => {
      handle(req, res).catch((err) => {
        console.error("Unhandled request error", err?.name ?? err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });
    });

    server.listen(port, host, () => {
      console.log(`Bucks Haven Farm ready on http://${host}:${port} (production)`);
    });

    const shutdown = (signal) => {
      console.log(`${signal} received, shutting down`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10_000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    console.error("Failed to start the Next.js server. Did you run `npm run build`?");
    console.error(err);
    process.exit(1);
  });
