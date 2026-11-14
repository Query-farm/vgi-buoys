# vgi-buoys

Read NOAA NDBC buoy and coastal-station observations from SQL. **TypeScript / Bun**, using VGI and Arrow batches. No API key required.

Discover stations, inspect the latest network observations, and query recent station histories. The `measurements` reference table documents source fields, units and conversions. Fixed, moored and drifting standard-meteorological layouts are supported.

## Run

Requires Bun 1.3+; development checks also use `make`, Python 3 and `uv`.

```sh
cd vgi-buoys
make build
```

Attach from stock DuckDB **2.0.0** with the signed Query Farm extension (use your actual absolute project path):

```sql
SET allow_extension_repositories = 'allowed';
CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm
  WITH PREFIX 'https://duckdb-extensions.query.farm';
INSTALL vgi FROM query_farm;
LOAD vgi FROM query_farm;
INSTALL icu FROM core;
LOAD icu;
SET TimeZone = 'UTC';
ATTACH 'buoys' (TYPE vgi,
  LOCATION '/absolute/path/vgi-buoys/bin/vgi-buoys-worker');
```

```sql
-- Latest measured seas and wave periods off Boston.
SELECT station_id, time, wave_height_m, dominant_period_s, wind_speed_mps
FROM buoys.main.latest_observations(station_id := '44013');

-- Recent measured waves; missing values are left as NULL.
SELECT time, wave_height_m, dominant_period_s, wind_gust_mps
FROM buoys.main.observations('44013')
WHERE wave_height_m IS NOT NULL
ORDER BY time DESC LIMIT 24;

-- Join station names and measurements.
SELECT s.name, o.time, o.wind_speed_mps, o.wave_height_m
FROM buoys.main.stations s
JOIN buoys.main.latest_observations() o USING (station_id)
WHERE s.latitude BETWEEN 40 AND 44 AND s.longitude BETWEEN -74 AND -68
ORDER BY s.name;

-- One row per reported measurement in a station's latest report, with units
-- and source fields from the measurements reference table.
SELECT v.column_name, v.value, m.output_unit, m.source_field, m.source_unit, m.scale
FROM (UNPIVOT buoys.main.latest_observations(station_id := '46026')
      ON COLUMNS(* EXCLUDE (station_id, time, latitude, longitude, source_url, fetched_at))
      INTO NAME column_name VALUE value) AS v
JOIN buoys.main.measurements AS m USING (column_name)
ORDER BY v.column_name;
```

Run [demo.sql](demo.sql) from the project directory after `make build`; it uses the local `bin/` launcher.

## Release binaries

[Release v0.1.0](https://github.com/Query-farm/vgi-buoys/releases/tag/v0.1.0) provides self-contained executables for Linux x86-64/ARM64, macOS ARM64, and Windows x86-64. Extract the archive for your platform and point `ATTACH` at the executable; Bun and node_modules are not required for these binaries.

```sql
ATTACH 'buoys' (TYPE vgi,
  LOCATION '/absolute/path/vgi-buoys-worker');
```

Archives include SHA-256 checksums, keyless signatures and GitHub build-provenance attestations.

## SQL interface

All functions are in `buoys.main`. Required arguments are positional; optional arguments use `name := value`. Explicit NULL arguments are rejected; omit optional arguments to use defaults.

| Function / table | Parameters and behavior |
| --- | --- |
| `stations()` or `stations` | Active NDBC/partner stations, coordinates, owner, program, type and instrument capability flags. |
| `latest_observations(station_id := '')` | One network-wide file; an empty ID selects all stations. An optional ID filters after download. |
| `observations(station_id, start_time := '', end_time := '')` | Recent standard meteorological file, typically about 45 days. Optional inclusive UTC bounds end in `Z`, e.g. `2026-11-13T00:00:00Z`. Empty bounds select the entire available file. |
| `measurements` | Local reference table: output column, source field, source unit, output unit, conversion scale. No network access. |

Station IDs are case-insensitive and returned in lowercase, preserving leading zeroes. The station directory can include stations without a standard meteorological file. An unavailable station file raises an HTTP error; an unknown ID filtered from the latest file returns no rows.

The source's `MM` means missing and becomes **SQL NULL**. Zero remains zero, and valid negative temperatures and water levels are preserved. This version reads recent and latest files, **not annual archives** (whose missing-value conventions differ).

| Output | Units / meaning |
| --- | --- |
| `wind_speed_mps`, `wind_gust_mps` | Metres per second, as measured; no height correction. |
| `wave_height_m` | Significant wave height in metres, not the maximum individual wave. |
| `dominant_period_s`, `average_period_s` | Dominant and average wave periods in seconds. |
| `wind_direction_deg`, `wave_direction_deg` | Direction the wind/waves come **from**, degrees clockwise from true north. |
| `pressure_hpa`, `pressure_tendency_hpa` | Pressure and signed three-hour pressure change in hectopascals. |
| `air_temperature_c`, `water_temperature_c`, `dew_point_c` | Degrees Celsius. |
| `visibility_m` | Metres, converted from nautical miles using 1852. |
| `water_level_m` | Metres relative to MLLW, converted from feet using 0.3048. |

Recent fixed-station files omit coordinates, so `latitude` / `longitude` are NULL; join the station directory when needed. Drifting-station files carry observation positions. `latest` means the latest available report, which can be stale: inspect `time`, not `fetched_at`. Time filters operate on the downloaded recent file and do not retrieve archived data. The reader does not fabricate missing wave periods or backfill readings from other observation times.

Every fetched row includes `source_url` and `fetched_at`. Measurement timestamps are `TIMESTAMPTZ` in UTC. Set DuckDB's display time zone to UTC when comparing textual output; timestamps retain the same instant in other session time zones.

## Requests and limits

Requests have 20-second timeouts, at most four attempts, and exponential backoff for network failures, HTTP 429 and HTTP 5xx. `Retry-After` seconds and HTTP dates are honored; waits beyond 30 seconds fail with a retry message rather than retrying too early. Other HTTP errors fail immediately. Each response is capped at 8 MiB and each emitted batch at 50,000 rows.

Upstream data is fetched at execution time; there is no persistent cache. Query results can change as NOAA updates its data. Unexpected response formats, unit changes, malformed numeric values and invalid timestamps fail explicitly.

For mirrors or fixture servers, set these environment variables **before launching the worker**:

- `BUOYS_BASE_URL`: NDBC root; defaults to `https://www.ndbc.noaa.gov`.

## Tests

```sh
make check          # Biome, strict TypeScript, unit tests, Haybarn SQL on all transports, metadata
make verify-stock   # Offline NOAA fixtures through stock DuckDB 2.0.0
make test-live      # Separate live NOAA requests through stock DuckDB 2.0.0
```

`make check` retains the starter's stdio, Unix-socket (`launch:`), HTTP and recipe checks, using Haybarn **2.0.0rc11**. SQL fixture tests validate values, empty responses, argument errors, joins and row counts beyond a single DuckDB batch. Live availability is deliberately separate.

`vgi-worker.json` records the positive SQL assertions; `test/error-checks.json` records expected failures. `make verify-stock` and `make test-live` produce `verification-stock.json` and `verification-live.json`. [VERIFICATION.md](VERIFICATION.md) records tested versions and results.

## HTTP and Unix sockets

```sh
make run-http  # loopback HTTP on port 8000
```

```sql
ATTACH 'buoys' (TYPE vgi, LOCATION 'http://127.0.0.1:8000');
-- Or let DuckDB manage the Unix-socket process:
ATTACH 'buoys' (TYPE vgi, LOCATION 'launch:/absolute/path/vgi-buoys/bin/vgi-buoys-worker');
```

The worker also retains the starter's Dockerfile and release workflows. These files do not publish or deploy anything by themselves. Diagnostics go to stderr; stdout is reserved for the Arrow protocol in stdio mode.

## Sources

- [NDBC real-time file access](https://www.ndbc.noaa.gov/faq/rt_data_access.shtml)
- [Measurement definitions and units](https://www.ndbc.noaa.gov/faq/measdes.shtml)
- [Active station directory](https://www.ndbc.noaa.gov/activestations.xml)

## Starter and dependencies

Based on [Query-farm/vgi-starter-typescript](https://github.com/Query-farm/vgi-starter-typescript), template 1.3.0, commit `145aedcb87ed8fadde6dfb8a26197d0d68112369`. Resolved SDK: `@query-farm/vgi` **0.50.0**, RPC **0.29.7**, Arrow **21.1.1**. Pins and lockfiles are preserved; `buoys` adds only its domain-specific implementation; buoy XML parsing uses fast-xml-parser 5.12.1.

`make template-diff` reviews upstream starter changes. This project is independent of sibling workers and does not require their source trees.

## Support

Report issues with the query, worker version and NOAA source URL. Do not include credentials or unrelated private data. This implementation has no API credentials.

## License

[BSD Zero Clause](LICENSE), inherited from the Query Farm starter.

## Executable notebooks

[Count measured waves before counting exceedances](notebooks/README.md) uses the published worker, recorded NOAA responses, visible SQL and a threshold experiment.
