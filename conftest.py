import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent                  # 481-IR-Project/
BACKEND = ROOT / "backend"

sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(BACKEND))             # ← เพิ่มบรรทัดนี้

os.environ.setdefault("JWT_SECRET", "test-secret")