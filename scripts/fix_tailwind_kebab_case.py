import os, re, sys, json, subprocess, pathlib

root = pathlib.Path.cwd()
if root.name != "fm-app":
    # Falls Prompt im Projektwurzel aufgerufen wurde:
    cand = root / "frontend" / "fm-app"
    if cand.exists():
        os.chdir(cand)
        root = cand

print("[i] Working dir:", root)

# 1) tailwind.config.js -> Farben in kebab-case umstellen
cfg_path = root / "tailwind.config.js"
cfg = cfg_path.read_text(encoding="utf-8")

# Map alter -> neuer Key
key_map = {
  "fr_black": "fr-black",
  "fr_panel": "fr-panel",
  "fr_border": "fr-border",
  "fr_text": "fr-text",
  "fr_muted": "fr-muted",
  "fr_orange": "fr-orange",
  "fr_orange_dim": "fr-orange-dim",
}

for old, new in key_map.items():
    cfg = cfg.replace(f"'{old}':", f"'{new}':").replace(f"{old}:", f"{new}:")

# Falls deine letzte Version bereits kebab-case hatte, lassen wir es so
cfg_path.write_text(cfg, encoding="utf-8")
print("[OK] tailwind.config.js updated")

# 2) CSS & JSX Klassen ersetzen
def replace_classes(text:str)->str:
    # ersetze Utilities in Klassen & @apply
    repls = {
        "bg-fr_black": "bg-fr-black",
        "text-fr_text": "text-fr-text",
        "text-fr_muted": "text-fr-muted",
        "border-fr_border": "border-fr-border",
        "bg-fr_panel": "bg-fr-panel",
        "text-fr_orange": "text-fr-orange",
        "bg-fr_orange": "bg-fr-orange",
        "hover:bg-fr_orange_dim": "hover:bg-fr-orange-dim",
        "bg-fr_orange_dim": "bg-fr-orange-dim",
        "border-fr_orange": "border-fr-orange",
        # Falls irgendwo nur die Farbnamen alleine genutzt wurden:
        "fr_black": "fr-black",
        "fr_panel": "fr-panel",
        "fr_border": "fr-border",
        "fr_text": "fr-text",
        "fr_muted": "fr-muted",
        "fr_orange": "fr-orange",
        "fr_orange_dim": "fr-orange-dim",
    }
    for a, b in repls.items():
        text = text.replace(a, b)
    return text

# Dateien durchgehen (ignoriere node_modules, .git, dist, etc.)
ignore_dirs = {"node_modules", ".git", "dist", "build", ".next", ".venv", "__pycache__"}
targets = []
for p in root.rglob("*"):
    if p.suffix.lower() in {".jsx", ".tsx", ".css", ".js"}:
        # Prüfe, ob Pfad in einem ignore-Verzeichnis liegt
        parts = p.parts
        if not any(ignore in parts for ignore in ignore_dirs):
            targets.append(p)

for p in targets:
    txt = p.read_text(encoding="utf-8")
    new = replace_classes(txt)
    if new != txt:
        p.write_text(new, encoding="utf-8")
        print("[OK] patched", p.relative_to(root))

# 3) Sicherstellen, dass PostCSS-Plugin korrekt ist
postcss_path = root / "postcss.config.cjs"
if postcss_path.exists():
    post = postcss_path.read_text(encoding="utf-8")
    if "@tailwindcss/postcss" not in post:
        post = "module.exports = { plugins: { '@tailwindcss/postcss': {}, autoprefixer: {} } };\n"
        postcss_path.write_text(post, encoding="utf-8")
        print("[OK] postcss.config.cjs normalized")

# 4) Dev-Neustart empfehlen / ausführen
try:
    # killt alten vite (best effort, Windows)
    subprocess.run(["taskkill", "/F", "/IM", "node.exe"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
except Exception:
    pass

print("\n[->] Starte Vite Dev neu ...")
subprocess.Popen(["npm", "run", "dev"], shell=True)

print("\n[SUCCESS] Tailwind-Fix abgeschlossen. Reload im Browser (http://localhost:5173).")
print("   Falls Overlay noch meckert: STRG+C im Dev-Terminal und `npm run dev` neu starten.")

