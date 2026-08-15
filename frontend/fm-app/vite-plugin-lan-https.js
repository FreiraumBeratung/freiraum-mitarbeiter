import { createRequire } from "node:module";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const selfsigned = require("selfsigned");

const LAN_HTTPS_PORT = 5174;

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const item of list) {
      const family = item.family === "IPv4" || item.family === 4;
      if (family && !item.internal) out.push(item.address);
    }
  }
  return [...new Set(out)];
}

async function loadOrCreateCerts(ips) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), ".lan-certs");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = ["localhost", "127.0.0.1", ...ips].join("_").replace(/[^\w.]+/g, "-");
  const keyPath = path.join(dir, `${stamp}.key`);
  const certPath = path.join(dir, `${stamp}.pem`);
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath, "utf8"),
      cert: fs.readFileSync(certPath, "utf8"),
    };
  }

  const altNames = [
    { type: 2, value: "localhost" },
    { type: 7, ip: "127.0.0.1" },
    ...ips.map((ip) => ({ type: 7, ip })),
  ];
  const pems = await selfsigned.generate(
    [
      { name: "commonName", value: ips[0] || "localhost" },
      { name: "organizationName", value: "Freiraum LAN Dev" },
    ],
    {
      keySize: 2048,
      algorithm: "sha256",
      notAfterDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
        { name: "extKeyUsage", serverAuth: true },
        { name: "subjectAltName", altNames },
      ],
    }
  );

  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  return { key: pems.private, cert: pems.cert };
}

export default function lanHttpsPlugin() {
  return {
    name: "fm-lan-https",
    async configureServer(server) {
      const ips = lanAddresses();
      let credentials;
      try {
        credentials = await loadOrCreateCerts(ips);
      } catch (err) {
        server.config.logger.error(`[fm-lan-https] Zertifikat fehlgeschlagen: ${err?.message || err}`);
        return;
      }

      const httpsServer = https.createServer(
        { key: credentials.key, cert: credentials.cert, minVersion: "TLSv1.2" },
        server.middlewares
      );
      httpsServer.on("upgrade", (req, socket, head) => {
        server.httpServer?.emit("upgrade", req, socket, head);
      });
      httpsServer.on("error", (err) => {
        server.config.logger.error(`[fm-lan-https] ${err?.message || err}`);
      });
      await new Promise((resolve) => {
        httpsServer.listen(LAN_HTTPS_PORT, "0.0.0.0", () => {
          const urls =
            ips.length > 0
              ? ips.map((ip) => `https://${ip}:${LAN_HTTPS_PORT}/`).join("  ")
              : `https://127.0.0.1:${LAN_HTTPS_PORT}/`;
          server.config.logger.info(`\n  Freiraum Handy-HTTPS (Mikrofon): ${urls}\n`);
          resolve();
        });
      });
      server.httpServer?.once("close", () => httpsServer.close());
    },
  };
}
