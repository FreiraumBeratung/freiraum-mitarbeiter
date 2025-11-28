param(
  [int]$Port = 30521,
  [string]$ModelsDir = "C:\Freiraum\data\models"
)

Set-Location -Path $PSScriptRoot

if (!(Test-Path ".venv")) { python -m venv .venv }

. ".\.venv\Scripts\Activate.ps1"

pip install -r requirements.txt

$env:MODELS_DIR = $ModelsDir
$env:PORT = $Port

uvicorn app.main:app --host 0.0.0.0 --port $Port --reload
