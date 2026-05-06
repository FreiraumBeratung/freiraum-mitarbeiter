const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFile } = require("child_process");
const http = require("http");

const BACKEND_PORT = Number(process.env.BACKEND_PORT || "30521");
const BACKEND_HOST = process.env.BACKEND_HOST || "127.0.0.1";
const MODE = String(process.env.FM_ELECTRON_MODE || (app.isPackaged ? "prod" : "dev")).toLowerCase();

let mainWindow = null;
let splashWindow = null;
let backendProcess = null;

function getLogFilePath() {
  const logDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, "electron-main.log");
}

function logMain(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(getLogFilePath(), line, "utf8");
  } catch {
    // ignore logging failures
  }
  console.log(message);
}

function toFileUrl(localPath) {
  return `file:///${localPath.replace(/\\/g, "/")}`;
}

function getSplashLogoDataUri() {
  const candidates = [
    path.join(__dirname, "app", "branding", "freiraum-logo.png"),
    path.join(__dirname, "app", "logo.png"),
    path.join(__dirname, "..", "assets", "logo.png"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate);
        const ext = path.extname(candidate).toLowerCase();
        const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
        return `data:${mime};base64,${raw.toString("base64")}`;
      } catch (err) {
        logMain(`[splash] failed to embed logo from ${candidate}: ${String(err)}`);
      }
    }
  }
  return "";
}

function setupRuntimeResourceAndMediaGuards() {
  const session = mainWindow?.webContents?.session;
  if (!session) return;

  // Allow mic access for push-to-talk in packaged Electron runtime.
  session.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === "media" || permission === "microphone") {
      logMain(`[permissions] granted request: ${permission}`);
      callback(true);
      return;
    }
    callback(false);
  });
  session.setPermissionCheckHandler((_wc, permission) => {
    if (permission === "media" || permission === "microphone") return true;
    return false;
  });

  // Rewrite absolute /branding/* file lookups to packaged app assets.
  session.webRequest.onBeforeRequest({ urls: ["file:///*"] }, (details, callback) => {
    try {
      const url = details.url || "";
      const lowerUrl = url.toLowerCase();
      // Already in packaged branding path -> do not rewrite (avoid redirect loop).
      if (lowerUrl.includes("/resources/app.asar/app/branding/")) {
        callback({});
        return;
      }
      const pathLike = decodeURIComponent(url.replace(/^file:\/\//i, ""));
      const marker = "/branding/";
      const idx = pathLike.toLowerCase().indexOf(marker);
      if (idx >= 0) {
        const rel = pathLike.slice(idx + 1).replace(/\//g, path.sep); // branding\...
        const candidate = path.join(__dirname, "app", rel);
        if (fs.existsSync(candidate)) {
          const redirectURL = toFileUrl(candidate);
          if (redirectURL.toLowerCase() !== lowerUrl) {
            logMain(`[assets] branding rewrite: ${url} -> ${redirectURL}`);
            callback({ redirectURL });
            return;
          }
        }
      }
    } catch (err) {
      logMain(`[assets] rewrite handler error: ${String(err)}`);
    }
    callback({});
  });
}

function getIconPath() {
  // Prefer ICO for Windows installer/shortcut quality.
  return path.join(__dirname, "..", "assets", "logo.ico");
}

function createSplashWindow() {
  const splashLogoDataUri = getSplashLogoDataUri();
  const splashLogoTag = splashLogoDataUri
    ? `<img src="${splashLogoDataUri}" alt="Freiraum" style="width:92px;height:92px;object-fit:contain;display:block;margin:0 auto 16px auto;" />`
    : "";
  splashWindow = new BrowserWindow({
    width: 760,
    height: 420,
    frame: false,
    resizable: false,
    movable: true,
    show: false,
    backgroundColor: "#000000",
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const splashHtml = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Freiraum Mitarbeiter</title>
        <style>
          body {
            margin: 0;
            background: #000;
            color: #fff;
            font-family: Segoe UI, Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
          }
          .wrap { text-align: center; }
          .title { font-size: 38px; letter-spacing: 1px; font-weight: 700; }
          .subtitle { margin-top: 12px; opacity: .78; font-size: 16px; }
          .dot {
            width: 10px;
            height: 10px;
            border-radius: 999px;
            margin: 26px auto 0;
            background: #ff7a00;
            box-shadow: 0 0 20px rgba(255,122,0,.8);
            animation: pulse 1.1s infinite ease-in-out;
          }
          @keyframes pulse {
            0%, 100% { transform: scale(0.8); opacity: 0.55; }
            50% { transform: scale(1.25); opacity: 1; }
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          ${splashLogoTag}
          <div class="title">FREIRAUM MITARBEITER</div>
          <div class="subtitle">Freiraum Mitarbeiter startet ...</div>
          <div class="dot"></div>
        </div>
      </body>
    </html>
  `;
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
  splashWindow.once("ready-to-show", () => splashWindow && splashWindow.show());
}

function installRendererDiagnostics() {
  if (!mainWindow) return;
  mainWindow.webContents.on("did-finish-load", () => {
    const runtimeDiagScript = `
      (async () => {
        if (window.__fm_electron_diag_installed) return;
        window.__fm_electron_diag_installed = true;
        const log = (...args) => console.log("[fm-electron-diag]", ...args);
        try {
          // Electron file:// runtime:
          // Prefer local backend STT when healthy.
          // Keep WebSpeech only as fallback when backend STT is not ready.
          if (window.location && window.location.protocol === "file:") {
            try {
              const sttHealth = await fetch("http://127.0.0.1:30521/api/stt/health")
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null);
              const localSttReady =
                !!sttHealth &&
                sttHealth.provider === "local" &&
                sttHealth.ok === true;
              if (localSttReady) {
                window.__fm_backend_stt_ready = true;
                log("speech-recognition-kept", "reason=backend-stt-active-fallback-enabled");
              } else {
                window.__fm_backend_stt_ready = false;
                log(
                  "speech-recognition-kept",
                  "reason=backend-stt-not-ready",
                  sttHealth && typeof sttHealth === "object" ? JSON.stringify(sttHealth) : "health-unavailable"
                );
              }
            } catch (err) {
              log("speech-recognition-decision-failed", err && err.message ? err.message : String(err));
            }
          }
          log("context", {
            href: window.location.href,
            origin: window.location.origin,
            secure: window.isSecureContext,
            hasSpeechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
            hasMediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
          });
          document.addEventListener("voice-state", (e) => {
            log("voice-state", e && e.detail ? e.detail.state : undefined);
          });
          document.addEventListener("voice:final", (e) => {
            const text = e && e.detail && e.detail.text ? String(e.detail.text) : "";
            log("voice-final", text.slice(0, 120));
          });
          if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
            const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async (constraints) => {
              log("getUserMedia call", constraints);
              try {
                const stream = await originalGetUserMedia(constraints);
                log("getUserMedia ok", stream && stream.getTracks ? stream.getTracks().map((t) => t.kind + ":" + t.readyState) : []);
                return stream;
              } catch (err) {
                log("getUserMedia error", err && err.name, err && err.message);
                throw err;
              }
            };
          }
          if (typeof window.fetch === "function") {
            const originalFetch = window.fetch.bind(window);
            window.fetch = async (...args) => {
              const input = args[0];
              const url = typeof input === "string" ? input : input && input.url ? String(input.url) : "";
              const response = await originalFetch(...args);
              if (url.includes("/api/stt/transcribe") && !response.ok) {
                try {
                  const body = await response.clone().text();
                  log("stt-transcribe-error", response.status, body.slice(0, 600));
                } catch (err) {
                  log("stt-transcribe-error-read-failed", response.status, err && err.message ? err.message : String(err));
                }
              }
              return response;
            };
          }
        } catch (err) {
          log("diag-install-error", err && err.message ? err.message : String(err));
        }
      })();
    `;
    mainWindow.webContents.executeJavaScript(runtimeDiagScript).catch((err) => {
      logMain(`[renderer] diag injection failed: ${String(err)}`);
    });
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    backgroundColor: "#000000",
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const localEntry = path.join(__dirname, "app", "index.html");
  const devUrl = "http://127.0.0.1:5173";
  let didFallbackToLocal = false;

  setupRuntimeResourceAndMediaGuards();
  installRendererDiagnostics();

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      logMain(
        `[renderer] did-fail-load code=${errorCode} description="${errorDescription}" url="${validatedURL}" mode=${MODE}`
      );
      if (MODE === "dev" && !didFallbackToLocal) {
        didFallbackToLocal = true;
        logMain(`[renderer] fallback to local file: ${localEntry}`);
        mainWindow.loadFile(localEntry).catch((err) => {
          logMain(`[renderer] local fallback failed: ${String(err)}`);
        });
      }
    }
  );

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logMain(`[renderer-console] level=${level} source=${sourceId}:${line} msg=${message}`);
  });

  if (MODE === "dev") {
    logMain(`[renderer] loadURL dev target: ${devUrl}`);
    mainWindow.loadURL(devUrl).catch((err) => {
      logMain(`[renderer] loadURL failed, fallback to local file: ${String(err)}`);
      if (!didFallbackToLocal) {
        didFallbackToLocal = true;
        mainWindow.loadFile(localEntry).catch((innerErr) => {
          logMain(`[renderer] local fallback failed after loadURL catch: ${String(innerErr)}`);
        });
      }
    });
  } else {
    logMain(`[renderer] loadFile prod target: ${localEntry}`);
    mainWindow.loadFile(localEntry).catch((err) => {
      logMain(`[renderer] loadFile prod failed: ${String(err)}`);
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    mainWindow && mainWindow.show();
  });
}

function getBackendPaths() {
  if (app.isPackaged) {
    const exePath = path.join(process.resourcesPath, "backend", "backend_server", "backend_server.exe");
    return { command: exePath, args: [] };
  }
  // Dev mode: use local venv backend startup.
  const repoRoot = path.join(__dirname, "..");
  const pyExe = path.join(repoRoot, "backend", ".venv", "Scripts", "python.exe");
  const args = ["-m", "uvicorn", "app.main:app", "--host", BACKEND_HOST, "--port", String(BACKEND_PORT)];
  return { command: pyExe, args, cwd: path.join(repoRoot, "backend") };
}

function startBackend() {
  if (MODE === "dev" && process.env.FM_START_BACKEND_DEV !== "1") {
    return;
  }
  const dataRoot = path.join(app.getPath("userData"), "runtime-data");
  const cacheDir = path.join(dataRoot, "cache");
  const exportDir = path.join(dataRoot, "exports");
  const { command, args, cwd } = getBackendPaths();
  const env = {
    ...process.env,
    BACKEND_HOST: BACKEND_HOST,
    BACKEND_PORT: String(BACKEND_PORT),
    FREIRAUM_DATA_DIR: dataRoot,
    EXPORT_DIR: exportDir,
    FM_MAIL_SETUP_FILE: path.join(cacheDir, "mail_setup_state.json"),
    MS_OAUTH_SESSION_FILE: path.join(cacheDir, "ms_oauth_session.json"),
    MS_OAUTH_REDIRECT_URI: `http://localhost:${BACKEND_PORT}/api/auth/microsoft/callback`,
    MS_OAUTH_FRONTEND_REDIRECT:
      MODE === "dev" ? "http://localhost:5173/mail/compose" : "http://localhost/mail/compose",
    FM_LOCALHOST_ONLY: "1",
  };

  backendProcess = spawn(command, args, {
    cwd: cwd || undefined,
    env,
    windowsHide: true,
    stdio: "pipe",
  });

  backendProcess.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(`[backend] ${text}`);
    logMain(`[backend-stdout] ${text}`.trimEnd());
  });
  backendProcess.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    process.stderr.write(`[backend] ${text}`);
    logMain(`[backend-stderr] ${text}`.trimEnd());
  });
  backendProcess.on("exit", (code) => {
    console.log(`[backend] exited with code ${code}`);
    backendProcess = null;
  });
  backendProcess.on("error", (err) => {
    console.error("[backend] failed to start", err);
  });
}

function stopBackend() {
  if (!backendProcess || backendProcess.killed) return;
  const pid = backendProcess.pid;
  try {
    backendProcess.kill("SIGTERM");
  } catch {
    // ignore
  }
  if (process.platform === "win32" && pid) {
    execFile("taskkill", ["/pid", String(pid), "/t", "/f"], () => {
      // best effort: ensure child tree exits on Windows
    });
  }
}

function checkBackendReady() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: BACKEND_HOST,
        port: BACKEND_PORT,
        path: "/api/system/status",
        method: "GET",
        timeout: 1200,
      },
      (res) => {
        resolve(res.statusCode && res.statusCode < 500);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function prewarmLocalStt() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: BACKEND_HOST,
        port: BACKEND_PORT,
        path: "/api/stt/prewarm",
        method: "POST",
        timeout: 25000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          logMain(`[stt-prewarm] status=${res.statusCode} body=${body.slice(0, 240)}`);
          resolve(Boolean(res.statusCode && res.statusCode < 500));
        });
      }
    );
    req.on("error", (err) => {
      logMain(`[stt-prewarm] request-error: ${String(err)}`);
      resolve(false);
    });
    req.on("timeout", () => {
      req.destroy();
      logMain("[stt-prewarm] timeout");
      resolve(false);
    });
    req.end();
  });
}

async function waitForBackend(maxMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await checkBackendReady();
    if (ok) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

async function bootstrap() {
  createSplashWindow();
  startBackend();
  if (MODE !== "dev" || process.env.FM_START_BACKEND_DEV === "1") {
    await waitForBackend();
  }
  createMainWindow();
  if (MODE !== "dev" || process.env.FM_START_BACKEND_DEV === "1") {
    prewarmLocalStt().catch(() => undefined);
  }
}

app.whenReady().then(() => {
  bootstrap().catch((err) => {
    console.error("[electron] bootstrap failed", err);
    createMainWindow();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("before-quit", () => {
  stopBackend();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
