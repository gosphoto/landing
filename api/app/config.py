import os
from pathlib import Path

MODEL_PATH = Path(
    os.getenv(
        "GATE_MODEL_PATH",
        str(Path(__file__).resolve().parent.parent / "models" / "face_landmarker.task"),
    )
)

MAX_UPLOAD_BYTES = int(os.getenv("GATE_MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))
MAX_IMAGE_SIDE = int(os.getenv("GATE_MAX_IMAGE_SIDE", "1600"))

# Reject if |angle| exceeds these (degrees)
MAX_YAW_DEG = float(os.getenv("GATE_MAX_YAW_DEG", "25"))
MAX_PITCH_DEG = float(os.getenv("GATE_MAX_PITCH_DEG", "25"))
MAX_ROLL_DEG = float(os.getenv("GATE_MAX_ROLL_DEG", "20"))

# Laplacian variance below this → blur
MIN_BLUR_VARIANCE = float(os.getenv("GATE_MIN_BLUR_VARIANCE", "50"))

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "GATE_CORS_ORIGINS",
        "https://gosphoto.ru,https://www.gosphoto.ru,http://localhost:5173",
    ).split(",")
    if o.strip()
]
