/**
 * Example queries that combine two or more of this worker's objects.
 *
 * Each SQL is defined once here and referenced from the object that drives the
 * query (so agents see it on that object) and from the schema-level list.
 */

export interface Example {
  description: string;
  sql: string;
}

/** latest_observations() joined to the station directory for names and owners. */
export const LARGEST_SEAS_NAMED: Example = {
  description:
    "Name the 10 stations reporting the largest significant wave heights in the latest file, with owner, station type and dominant period",
  sql:
    "SELECT o.station_id, s.name, s.owner, s.station_type, o.time, o.wave_height_m, o.dominant_period_s " +
    "FROM buoys.main.latest_observations() AS o JOIN buoys.main.stations AS s USING (station_id) " +
    "WHERE o.wave_height_m IS NOT NULL ORDER BY o.wave_height_m DESC, o.station_id LIMIT 10",
};

/** Directory stations with a meteorological flag but no row in the latest file. */
export const SILENT_MET_STATIONS: Example = {
  description:
    "List directory stations flagged has_met that have no row in the latest observations file, with owner and station type",
  sql:
    "SELECT s.station_id, s.name, s.owner, s.station_type " +
    "FROM buoys.main.stations AS s ANTI JOIN buoys.main.latest_observations() AS o USING (station_id) " +
    "WHERE s.has_met ORDER BY s.station_id",
};

/** observations() rolled up per day, with the station directory's name and coordinates. */
export const DAILY_HISTORY_WITH_STATION: Example = {
  description:
    "Summarise the 7 most recent days (session time zone) at buoy 44013 (daily peak wave height, mean wind speed, report count) with the directory name and coordinates that recent files omit",
  sql:
    "SELECT s.station_id, s.name, s.latitude, s.longitude, date_trunc('day', o.time) AS obs_day, " +
    "max(o.wave_height_m) AS max_wave_height_m, avg(o.wind_speed_mps) AS mean_wind_speed_mps, count(*) AS reports " +
    "FROM buoys.main.observations('44013') AS o JOIN buoys.main.stations AS s USING (station_id) " +
    "GROUP BY ALL ORDER BY obs_day DESC LIMIT 7",
};

/** One station's latest reading, unpivoted to one row per reported measurement, with units. */
export const LATEST_WITH_UNITS: Example = {
  description:
    "Show each non-missing measurement in station 46026's latest report as one row, with its output unit, NDBC source field, source unit and conversion scale",
  sql:
    "SELECT v.column_name, v.value, m.output_unit, m.source_field, m.source_unit, m.scale " +
    "FROM (UNPIVOT buoys.main.latest_observations(station_id := '46026') " +
    "ON COLUMNS(* EXCLUDE (station_id, time, latitude, longitude, source_url, fetched_at)) " +
    "INTO NAME column_name VALUE value) AS v JOIN buoys.main.measurements AS m USING (column_name) " +
    "ORDER BY v.column_name",
};
