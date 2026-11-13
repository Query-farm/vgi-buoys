-- Run from the project directory after make build.
SET allow_extension_repositories = 'allowed';
CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm
  WITH PREFIX 'https://duckdb-extensions.query.farm';
INSTALL vgi FROM query_farm;
LOAD vgi FROM query_farm;
INSTALL icu FROM core;
LOAD icu;
SET TimeZone = 'UTC';
ATTACH 'buoys' (TYPE vgi, LOCATION './bin/vgi-buoys-worker');

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
