# NOAA buoy notebooks

[01 · Count measured waves before counting exceedances](01_measure_wave_exceedance.ipynb)
asks how missing wave measurements affect a threshold summary at Boston station
**44013**. Visible SQL retrieves station metadata and observations through the real
worker, audits coverage, and compares two explicitly different denominators.
Two figures show the observations and the resulting proportions.

## Run independently

Install [uv](https://docs.astral.sh/uv/). Copy this directory anywhere, then run:

```sh
uv sync --locked
uv run --locked python execute.py --timeout 300
```

No parent checkout, Bun installation or local worker build is required. The visible
SQL launches the pinned native release with the literal location
`github-auto://Query-farm/vgi-buoys@v0.1.0`. The tag resolves to
`6d34f79eeb80d31bdb188666f60d116204625bb8`. Its release contains native macOS arm64,
Linux x64/arm64 and Windows x64 assets; this notebook was executed on macOS arm64.
First execution downloads the VGI extension and appropriate release asset.

The separate lock pins Haybarn **2.0.0rc11**, JupySQL and plotting dependencies.
The runner creates a temporary kernel with its interpreter, runs with this
directory as cwd and atomically replaces the saved notebook only after success.
For a Jupyter frontend, optionally register the environment:

```sh
uv run --locked python -m ipykernel install --user \
  --name vgi-buoys-notebooks --display-name "Python (vgi-buoys notebooks)"
```

Restart and run all after parameter edits. The runner itself registers no global
kernel. Overrides require a separate output directory and copy the guide, assets,
recordings and helpers beside the result. Logs and experiments are ignored.

## Source and clocks

Default `DATA_MODE = "recorded"` serves unchanged official NOAA NDBC responses
captured **14 November 2026 UTC** over the worker's supported `BUOYS_BASE_URL`.
The server checks each SHA-256 and serves only the two documented paths; it does
not parse observations or calculate results. The actual published worker parses
NOAA XML/text, handles missing values and emits Arrow. These are source recordings,
not synthetic measurements. See [the manifest](recordings/manifest.json) for exact
URLs, UTC capture times, content types and hashes. No account or API key is used.

The recorded window is **2026-11-12 06:00 UTC inclusive to 2026-11-14 06:00 UTC
exclusive**. The end is the capture hour rounded down, not the newest returned
observation. The worker's time arguments are inclusive; a visible local SQL filter
establishes the half-open analysis window. A station history request downloads the
recent file (usually about 45 days) and filters it; it cannot retrieve archives.

The worker sets `fetched_at` when it parses each response. In recorded mode this is
the replay time, and `source_url` is the loopback URL. The manifest separately
records original official URLs and capture times. Independent directory/history
responses are not an atomic snapshot. The station location is directory metadata.

```sh
uv run --locked python execute.py --timeout 300 \
  --parameters '{"DATA_MODE": "live"}' --output-dir artifacts/live
```

Live mode removes inherited `BUOYS_BASE_URL`, requests official NOAA, and uses the
48 hours before the current UTC minute. It never falls back to recordings or moves
the window to fit stale data. Empty windows and windows with no usable waves stop
clearly. Missing rows, unmeasured fields and source freshness appear separately.

## Focused experiment

```sh
uv run --locked python execute.py --timeout 300 \
  --parameters '{"WAVE_THRESHOLD_M": 3.0}' --output-dir artifacts/threshold-3m
```

Change only **WAVE_THRESHOLD_M**, from **2.0 to 3.0 metres**. Predict that exceedance
counts cannot increase while the measured and all-row denominators stay fixed.
Compare both proportion labels and the time plot. Reset to **2.0**. Thresholds
must be finite, greater than zero and at most 20 metres. Both modes fix station
44013 and the 48-hour duration; a different station or recording is a new example.

## Meaning and limits

`wave_height_m` is significant wave height: the average of the highest one-third
of waves in the sampling period, not the largest individual wave. Missing `MM`
becomes NULL; measured zero remains zero. The threshold is an analytical choice,
not a safety boundary. See NOAA's [measurement definitions](https://www.ndbc.noaa.gov/measdes.shtml)
and [station page](https://www.ndbc.noaa.gov/station_page.php?station=44013).

The measured-wave fraction divides threshold exceedances by rows with a measured
wave height. The all-row fraction divides the same count by all returned weather
rows, including those with no wave measurement. Neither is a time-weighted storm
probability or a fraction of the 48-hour duration. Reporting cadence, missingness,
source quality and the chosen station/window constrain interpretation. No absent
rows are fabricated; no values are interpolated. Gaps between returned timestamps
are diagnostics, not proof of instrument failure.

Source data: NOAA National Data Buoy Center, including observations identified by
NOAA as station 44013. Attribution does not imply NOAA endorsement. The worker
license and notebook branding remain separate from source data attribution.

## Validation and upgrades

The repository's `make check` passes Biome, strict TypeScript, 13 Bun tests/57
expectations, 94 stdio/94 launch/57 HTTP SQL assertions, and metadata 100/100 L2
with zero errors/warnings and one existing VGI808 informational finding about the
station key. Stock DuckDB checks pass 12 result/6 expected-error cases; three live
NOAA checks pass. Notebook validation additionally executes default, detached
experiment and live mode, inspects figures, checks SQL identities and runner guards.

To upgrade, change the literal release pin and rerun default, experiment and live
mode before replacing outputs. The community VGI extension is installed separately
from the Python lock. New recordings require explicit provenance and checksums.
