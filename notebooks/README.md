# NOAA Buoys notebooks

Two executed SQL stories use the public [v0.1.0 worker release](https://github.com/Query-farm/vgi-buoys/releases/tag/v0.1.0), original NOAA recordings and readable SVG charts. Each has an **Open in Colab** button and a standalone bootstrap that fetches verified companions. The full [standard and runner](https://github.com/Query-farm/vgi-example-notebooks) are shared.

| Notebook | Question | Experiment |
|---|---|---|
| [Count measured waves before counting exceedances](01_measure_wave_exceedance.ipynb) | How does including missing wave measurements change the denominator? A fixed 48-hour Boston 44013 window. | Wave threshold 2→3 metres |
| [Latest is not a fresh wave measurement](02_latest_is_not_a_fresh_wave_measurement.ipynb) | Which latest-file station reports satisfy both an age policy and wave availability? | Maximum age 30→120 minutes |

### Run

Install uv, then run from this directory. Colab uses the shared base package; the runner extra belongs only in this local publication environment.

```sh
uv sync --locked
uv run --locked vgi-notebooks --timeout 300
uv run --locked vgi-notebooks 01_measure_wave_exceedance.ipynb --parameters '{"WAVE_THRESHOLD_M":3.0}' --output-dir artifacts/threshold-3m
uv run --locked vgi-notebooks 02_latest_is_not_a_fresh_wave_measurement.ipynb --parameters '{"MAX_AGE_MIN":120}' --output-dir artifacts/age-120
```

The visible ATTACH uses `github-auto://Query-farm/vgi-buoys@v0.1.0`, a native release with macOS arm64, Linux x64/arm64 and Windows x64 assets. Tag source is `6d34f79eeb80d31bdb188666f60d116204625bb8`. No Bun installation or source checkout is needed. GitHub release downloads and the community VGI extension require network access; anonymous API rate limits can affect an uncached download.

### Source, clocks and units

Both stories use unchanged official NOAA NDBC XML/text served over a strict loopback replay. SHA-256 verification happens before startup. The actual released worker parses the responses and emits typed rows. [Original recordings](recordings/manifest.json) preserve the earlier directory/Boston history capture; [latest-file recordings](latest-recordings/manifest.json) preserve a separately acquired directory/network file. Original files are not overwritten. Independent requests do not form an atomic snapshot; the two notebooks' captures must not be joined as though acquired simultaneously.

The wave story retains its half-open 48-hour UTC window, ending at the original capture hour. The worker's inclusive source bounds are followed by an explicit local end-exclusive filter. Missing MM values stay NULL, measured zero stays zero, and no absent timestamp is fabricated. Significant wave height is an average of the highest third of waves in a sampling period, not the largest individual wave. Source units and conversion scales come from the worker's measurement reference. The thresholds are analytical choices, not navigation or weather-safety boundaries. See [NOAA measurement definitions](https://www.ndbc.noaa.gov/measdes.shtml).

The latest-report story holds its acquisition clock fixed across reruns and classifies every returned report. Observation timestamps determine age; fetched_at is replay time, and source_url is loopback. Directory absence, capability flags, timestamp eligibility and missing measurements remain distinct. A larger age limit cannot add observations or change their measured values.

### Optional live mode

The first notebook also supports explicit `DATA_MODE="live"`. It removes an inherited endpoint override and requests official NOAA directly, using the 48 hours before the current UTC minute. There is no fallback or automatic window shift; empty windows or no usable waves stop clearly. This moving window is separate from the controlled threshold experiment.

```sh
uv run --locked vgi-notebooks 01_measure_wave_exceedance.ipynb --parameters '{"DATA_MODE":"live"}' --output-dir artifacts/live --timeout 300
```

### Evidence and limits

[Coverage evidence](coverage.json) retains the complete released catalog and reviewed current source separately: four logical surfaces, including the stations function/table alias. All four have visible SQL, meaningful outputs and interpretations. Current source adds composed examples/tasks only; analytical runtime evidence is from the public release. Existing green source CI is reused for notebook-only changes. Defaults, detached experiments, setup with preloaded libraries, guards, charts and actual GitHub SVG rendering are checked. Local compatibility testing is distinct from manually running hosted Colab.

Rows count returned station reports or weather observations. Fractions are not time-weighted storm probabilities, ocean-area coverage or forecasts; reporting patterns and missingness may be systematic. Source: NOAA National Data Buoy Center. Attribution does not imply endorsement. Worker and branding licensing remain separate from public-source attribution.
