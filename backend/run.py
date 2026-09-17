"""Start the FastAPI backend on http://127.0.0.1:8000

From the backend folder:

    python run.py

Do not use --reload. A restart is required after code changes; reload can
interrupt a live market scan.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
DATA = BACKEND / "data"


def _warn_if_incomplete() -> None:
    env = BACKEND / ".env"
    db = DATA / "intelligence.db"
    index = DATA / "library.faiss"
    ids = DATA / "library_ids.json"

    if not env.exists():
        print()
        print("WARNING: backend/.env is missing.")
        print("         Create it from backend/.env.example and paste the keys")
        print("         sent by email. Market scan and library Q&A need them.")
        print()

    missing = [str(p.name) for p in (db, index, ids) if not p.exists()]
    if missing:
        print()
        print("ERROR: library files are missing from backend/data/:")
        for name in missing:
            print(f"         - {name}")
        print("         This repo should already include the seeded database")
        print("         and FAISS index. Do not run scripts.seed unless those")
        print("         files were omitted on purpose.")
        print()
        sys.exit(1)


def main() -> None:
    _warn_if_incomplete()
    try:
        import uvicorn
    except ImportError:
        print("uvicorn is not installed. From backend/ run:")
        print("  python -m pip install -r requirements.txt")
        sys.exit(1)

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=False,
    )


if __name__ == "__main__":
    main()
