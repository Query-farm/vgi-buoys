"""Recorded/live setup and presentation; wave calculations stay in visible SQL."""

from __future__ import annotations

import math
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import matplotlib.pyplot as plt
import seaborn as sns
from IPython.display import Markdown, display

from recorded_api import RecordedApi


def configure(threshold: float, mode: str):
    if isinstance(threshold, bool) or not isinstance(threshold, (int, float)):
        raise ValueError("WAVE_THRESHOLD_M must be numeric metres")
    if not math.isfinite(threshold) or not 0 < threshold <= 20:
        raise ValueError("WAVE_THRESHOLD_M must be finite, greater than 0 and at most 20 metres")
    if mode not in ("recorded", "live"):
        raise ValueError("DATA_MODE must be 'recorded' or 'live'")
    previous = os.environ.pop("BUOYS_BASE_URL", None)
    replay = None
    run_at = datetime.now(UTC)
    if mode == "recorded":
        replay = RecordedApi(Path(__file__).resolve().parent / "recordings").start()
        os.environ["BUOYS_BASE_URL"] = replay.url
        captured = datetime.fromisoformat(replay.records["/data/realtime2/44013.txt"]["retrieved_at_utc"])
        end = captured.replace(minute=0, second=0, microsecond=0)
        provenance = f"Recorded NOAA responses · captured {captured:%Y-%m-%d %H:%M} UTC"
    else:
        end = run_at.replace(second=0, microsecond=0)
        provenance = f"Live NOAA responses · requested {run_at:%Y-%m-%d %H:%M} UTC"
    start = end - timedelta(hours=48)
    return replay, previous, run_at.isoformat(), provenance, start.isoformat(), end.isoformat()


def cleanup(replay, previous):
    if replay:
        replay.stop()
    if previous is None:
        os.environ.pop("BUOYS_BASE_URL", None)
    else:
        os.environ["BUOYS_BASE_URL"] = previous


def prose(text: str) -> None:
    display(Markdown(text))


def theme() -> None:
    sns.set_theme(
        style="whitegrid",
        rc={
            "figure.dpi": 145,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "grid.color": "#E8EDE9",
            "text.color": "#243B2F",
            "axes.labelcolor": "#405047",
            "text.parse_math": False,
            "legend.frameon": False,
        },
    )


def chart(fig, title: str, subtitle: str, source: str) -> None:
    fig.text(0.08, 0.98, title, ha="left", va="top", fontsize=17, fontweight="semibold")
    fig.text(0.08, 0.91, subtitle, ha="left", va="top", fontsize=10, color="#58685F")
    fig.tight_layout(rect=(0.02, 0.10, 1, 0.83))
    fig.text(0.08, 0.03, source, fontsize=8, color="#6C7D73")
    plt.show()
