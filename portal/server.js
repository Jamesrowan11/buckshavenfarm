/**
 * Startup file for Plesk's Node.js manager (Phusion Passenger).
 * Point "Application Startup File" at this — no terminal needed.
 * It boots the production Next.js server for the portal (basePath /portal).
 */
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.chdir(__dirname);

const http = require("http");
const next = require("next");

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const port = parseInt(process.env.PORT || "3000", 10);
  http
    .createServer((req, res) => handle(req, res))
    .listen(port, () => {
      console.log(`Bucks Haven portal ready on port ${port}`);
    });
});
