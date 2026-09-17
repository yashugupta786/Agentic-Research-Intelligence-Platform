"""Start the FastAPI backend from the repository root.

    python run.py

Uses backend/venv if it exists, otherwise the current Python.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"


def _venv_python() -> Path:
    if os.name == "nt":
        return BACKEND / "venv" / "Scripts" / "python.exe"
    return BACKEND / "venv" / "bin" / "python"


def main() -> int:
    if not BACKEND.exists():
        print("Could not find the backend/ folder. Run this from the project root.")
        return 1

    python = _venv_python()
    exe = str(python) if python.exists() else sys.executable
    if not python.exists():
        print("No backend/venv found — using this Python. Prefer creating the venv first.")
        print()

    return subprocess.call([exe, str(BACKEND / "run.py")], cwd=str(BACKEND))


if __name__ == "__main__":
    raise SystemExit(main())
