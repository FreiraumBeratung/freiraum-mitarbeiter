from __future__ import annotations

from pathlib import Path

from PIL import Image


def _resolve_paths() -> tuple[Path, list[Path], Path]:
    root = Path(__file__).resolve().parents[1]
    assets_dir = root / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    candidates = [
        assets_dir / "logo.png",
        root / "frontend" / "fm-app" / "public" / "branding" / "freiraum-logo.png",
    ]
    target = assets_dir / "logo.ico"
    return target, candidates, assets_dir


def _pick_source(candidates: list[Path]) -> Path:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    joined = "\n- ".join(str(path) for path in candidates)
    raise RuntimeError(f"Keine Logo-Quelle gefunden. Erwarte eine dieser Dateien:\n- {joined}")


def _convert_to_ico(source: Path, target: Path) -> None:
    with Image.open(source) as img:
        image = img.convert("RGBA")
        canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        image.thumbnail((240, 240), Image.Resampling.LANCZOS)

        x = (256 - image.width) // 2
        y = (256 - image.height) // 2
        canvas.paste(image, (x, y), image)

        canvas.save(
            target,
            format="ICO",
            sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
        )


def main() -> None:
    target, candidates, _assets_dir = _resolve_paths()
    source = _pick_source(candidates)
    _convert_to_ico(source, target)
    print(f"[logo] ICO erstellt: {target} (Quelle: {source})")


if __name__ == "__main__":
    main()

