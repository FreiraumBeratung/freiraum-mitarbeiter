const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function createWindow () {
  const win = new BrowserWindow({
    width: 1280, height: 800,
    backgroundColor: "#000000",
    webPreferences: { preload: path.join(__dirname, "preload.js") }
  });

  const MODE = process.env.FM_ELECTRON_MODE || "dev";
  if (MODE === "dev") {
    win.loadURL("http://127.0.0.1:5173");
  } else {
    win.loadFile(path.join(__dirname, "app", "index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }});
}
app.whenReady().then(()=>{ createWindow(); app.on("activate", ()=>{ if (BrowserWindow.getAllWindows().length === 0) createWindow(); });});
app.on("window-all-closed", ()=>{ if (process.platform !== "darwin") app.quit(); });
