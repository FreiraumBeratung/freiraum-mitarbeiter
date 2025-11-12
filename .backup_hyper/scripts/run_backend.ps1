
Set-Location "C:\Users\denis\Desktop\freiraum-mitarbeiter"

& .\.venv\Scripts\Activate.ps1

$env:FREIRAUM_DATA_DIR = "C:\Users\denis\Desktop\freiraum-mitarbeiter\data"

$env:FM_BASE_URL = "http://localhost:30521/api"

python backend/run.py

