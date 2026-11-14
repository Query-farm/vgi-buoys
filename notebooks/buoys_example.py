"""Recorded/live setup and presentation; wave calculations stay in visible SQL."""

from __future__ import annotations

import math
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

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


def configure_latest(max_age: int):
    """Select separately recorded directory/latest bytes and their fixed acquisition clock."""
    if type(max_age) is not int or max_age not in (30, 120):
        raise ValueError("MAX_AGE_MIN must be 30 or 120")
    previous = os.environ.pop("BUOYS_BASE_URL", None)
    replay = RecordedApi(Path(__file__).resolve().parent / "latest-recordings").start()
    os.environ["BUOYS_BASE_URL"] = replay.url
    captured = replay.records["/data/latest_obs/latest_obs.txt"]["retrieved_at_utc"]
    return replay, previous, captured
