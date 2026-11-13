import { constraintRecord, type TableDescriptor, utf8, type VgiFunction } from "@query-farm/vgi";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { endpoint, getText } from "./http.ts";
import {
  type Column,
  numberOrNull,
  object,
  oneShot,
  outputSchema,
  type Row,
  requiredText,
  textOrNull,
  utcMicros,
} from "./table.ts";

const BASE = "https://www.ndbc.noaa.gov";
const SOURCE: Column[] = [
  ["source_url", "VARCHAR", "Exact NOAA NDBC source URL.", false],
  ["fetched_at", "TIMESTAMPTZ", "UTC retrieval time; use time to assess measurement freshness.", false],
];

export function stationId(value: unknown): string {
  const id = requiredText(value, "station_id");
  if (!/^[A-Za-z0-9]{3,8}$/.test(id)) throw new Error("station_id must contain 3–8 letters or digits");
  return id.toLowerCase();
}

function withSource(rows: Row[], url: URL): Row[] {
  const fetched = BigInt(Date.now()) * 1000n;
  return rows.map((row) => ({ ...row, source_url: url.toString(), fetched_at: fetched }));
}

function flag(value: unknown): boolean | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === "y") return true;
  if (value === "n") return false;
  throw new Error(`Unexpected NOAA capability flag: ${String(value)}`);
}

export function parseStations(xml: string): Row[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error("Invalid NDBC station XML");
  const parsed: unknown = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    isArray: (_name, path) => path === "stations.station",
  }).parse(xml);
  const root = object(object(parsed).stations, "NDBC stations root");
  const raw = root.station ?? [];
  if (!Array.isArray(raw)) throw new Error("Invalid NDBC station list");
  if (numberOrNull(root.count) !== raw.length) throw new Error("NDBC station count does not match the station list");
  const seen = new Set<string>();
  return raw.map((value) => {
    const s = object(value, "NDBC station");
    const id = stationId(s.id);
    if (seen.has(id)) throw new Error(`Duplicate NDBC station ID: ${id}`);
    seen.add(id);
    return {
      station_id: id,
      name: textOrNull(s.name),
      latitude: numberOrNull(s.lat),
      longitude: numberOrNull(s.lon),
      elevation_m: numberOrNull(s.elev),
      owner: textOrNull(s.owner),
      program: textOrNull(s.pgm),
      station_type: textOrNull(s.type),
      has_met: flag(s.met),
      has_currents: flag(s.currents),
      has_water_quality: flag(s.waterquality),
      has_dart: flag(s.dart),
    };
  });
}

interface Measure {
  name: string;
  header: string;
  unit: string;
  description: string;
  scale?: number;
}
export const MEASURES: Measure[] = [
  {
    name: "wind_direction_deg",
    header: "WDIR",
    unit: "degT",
    description: "Direction wind comes from, clockwise degrees from true north.",
  },
  {
    name: "wind_speed_mps",
    header: "WSPD",
    unit: "m/s",
    description: "Measured wind speed in metres per second, at the station's anemometer height.",
  },
  { name: "wind_gust_mps", header: "GST", unit: "m/s", description: "Wind gust speed in metres per second." },
  {
    name: "wave_height_m",
    header: "WVHT",
    unit: "m",
    description: "Significant wave height in metres; mean of the highest third of sampled waves.",
  },
  {
    name: "dominant_period_s",
    header: "DPD",
    unit: "sec",
    description: "Dominant wave period in seconds, at maximum wave energy.",
  },
  { name: "average_period_s", header: "APD", unit: "sec", description: "Average wave period in seconds." },
  {
    name: "wave_direction_deg",
    header: "MWD",
    unit: "degT",
    description: "Direction waves at the dominant period come from, degrees from true north.",
  },
  { name: "pressure_hpa", header: "PRES", unit: "hPa", description: "Sea-level atmospheric pressure in hectopascals." },
  {
    name: "pressure_tendency_hpa",
    header: "PTDY",
    unit: "hPa",
    description: "Signed pressure change over the preceding three hours, in hectopascals.",
  },
  { name: "air_temperature_c", header: "ATMP", unit: "degC", description: "Air temperature in degrees Celsius." },
  { name: "water_temperature_c", header: "WTMP", unit: "degC", description: "Water temperature in degrees Celsius." },
  { name: "dew_point_c", header: "DEWP", unit: "degC", description: "Dew point in degrees Celsius." },
  {
    name: "visibility_m",
    header: "VIS",
    unit: "nmi",
    scale: 1852,
    description: "Visibility in metres, converted from source nautical miles.",
  },
  {
    name: "water_level_m",
    header: "TIDE",
    unit: "ft",
    scale: 0.3048,
    description: "Water level in metres relative to MLLW, converted from source feet.",
  },
];

export const OBSERVATION_COLUMNS: Column[] = [
  ["station_id", "VARCHAR", "NDBC station ID in lowercase; retain as text, including leading zeroes.", false],
  ["time", "TIMESTAMPTZ", "UTC observation timestamp supplied by NDBC; measurements may be stale.", false],
  ["latitude", "DOUBLE", "Observation latitude in decimal degrees; NULL when absent from a station history file."],
  ["longitude", "DOUBLE", "Observation longitude in decimal degrees; NULL when absent from a station history file."],
  ...MEASURES.map((m): Column => [m.name, "DOUBLE", `${m.description} Missing MM becomes NULL.`]),
  ...SOURCE,
];

/** Parse by header name: latest, moored/land, and drifting/USV layouts differ. */
export function parseObservations(text: string, requestedStation?: string): Row[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headerLine = lines.findIndex((line) => /^#(?:STN|YY|YYYY)\s/.test(line));
  if (headerLine < 0) throw new Error("NDBC observation header is missing");
  const header = lines[headerLine]?.replace(/^#/, "").trim().split(/\s+/) ?? [];
  const unitLine = lines[headerLine + 1];
  if (!unitLine?.startsWith("#")) throw new Error("NDBC measurement units header is missing");
  const units = unitLine.replace(/^#/, "").trim().split(/\s+/);
  if (units.length !== header.length || new Set(header).size !== header.length)
    throw new Error("Malformed NDBC column headers");
  for (const required of ["MM", "DD"])
    if (!header.includes(required)) throw new Error(`Missing NDBC ${required} column`);
  if (!header.includes("YY") && !header.includes("YYYY")) throw new Error("Missing NDBC year column");
  if (!header.includes("hhmm") && !(header.includes("hh") && header.includes("mm")))
    throw new Error("Missing NDBC time columns");
  if (!header.includes("STN") && !requestedStation)
    throw new Error("A station ID is required for station history files");
  for (const m of MEASURES) {
    const index = header.indexOf(m.header);
    if (index >= 0 && units[index] !== m.unit)
      throw new Error(`Unexpected NDBC units for ${m.header}: ${units[index]}`);
  }
  for (const coord of ["LAT", "LON"]) {
    const index = header.indexOf(coord);
    if (index >= 0 && units[index] !== "deg") throw new Error(`Unexpected NDBC units for ${coord}`);
  }
  const rows: Row[] = [];
  for (const line of lines.slice(headerLine + 2)) {
    if (line.trim().startsWith("#")) continue;
    const values = line.trim().split(/\s+/);
    if (values.length !== header.length) throw new Error("Malformed NDBC observation row: column count mismatch");
    const r = Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""]));
    const year = r.YYYY ?? r.YY;
    const hhmm = r.hhmm;
    const hour = hhmm ? hhmm.padStart(4, "0").slice(0, 2) : r.hh;
    const minute = hhmm ? hhmm.padStart(4, "0").slice(2) : r.mm;
    if (!year || !/^\d{4}$/.test(year) || !hour || !minute || !r.MM || !r.DD)
      throw new Error("Invalid NDBC observation date");
    const time = utcMicros(
      `${year}-${r.MM.padStart(2, "0")}-${r.DD.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00Z`,
    );
    const row: Row = {
      station_id: stationId(r.STN ?? requestedStation),
      time,
      latitude: numberOrNull(r.LAT),
      longitude: numberOrNull(r.LON),
    };
    for (const m of MEASURES) {
      const value = numberOrNull(r[m.header]);
      row[m.name] = value === null ? null : value * (m.scale ?? 1);
    }
    rows.push(row);
    if (rows.length > 50_000) throw new Error("NDBC response exceeds 50,000 rows");
  }
  return rows;
}

const STATION_COLUMNS: Column[] = [
  ["station_id", "VARCHAR", "NDBC station identifier in lowercase.", false],
  ["name", "VARCHAR", "Station name."],
  ["latitude", "DOUBLE", "Station latitude in decimal degrees."],
  ["longitude", "DOUBLE", "Station longitude in decimal degrees."],
  ["elevation_m", "DOUBLE", "Site elevation in metres above mean sea level when supplied."],
  ["owner", "VARCHAR", "Organization responsible for the station."],
  ["program", "VARCHAR", "NDBC or partner program."],
  ["station_type", "VARCHAR", "NOAA station type, such as buoy, fixed or oilrig."],
  ["has_met", "BOOLEAN", "Whether NDBC lists meteorological observations for this station."],
  [
    "has_currents",
    "BOOLEAN",
    "Whether NDBC lists current observations; this worker reads standard meteorological data only.",
  ],
  ["has_water_quality", "BOOLEAN", "Whether NDBC lists water-quality observations."],
  ["has_dart", "BOOLEAN", "Whether this is a DART tsunami station."],
  ...SOURCE,
];

const stations = oneShot<Record<string, never>>({
  name: "stations",
  title: "NDBC Active Stations",
  description: "Discover active NDBC stations, coordinates, ownership and instrument capabilities",
  args: {},
  argDocs: {},
  columns: STATION_COLUMNS,
  load: async () => {
    const url = endpoint("BUOYS_BASE_URL", BASE, "activestations.xml");
    return withSource(parseStations(await getText(url)), url);
  },
  keywords: "buoy, station, ndbc, noaa, marine, sensors, location",
  docs:
    "Read the NDBC active-station XML catalog, including partner and land stations. No arguments or API key. Returns station_id, name, " +
    "coordinates, elevation_m, owner, program, station_type and capability booleans, plus source_url and fetched_at. " +
    "IDs are lowercase strings. Missing attributes are NULL. Active station metadata does not guarantee fresh measurements or a standard meteorological file. " +
    "Filter for has_met and join station_id with observations() or latest_observations(). Coordinates here describe the catalog location, not a moving buoy's observation position.",
  examples: [
    {
      sql: "SELECT station_id, name, latitude, longitude FROM buoys.main.stations() WHERE has_met ORDER BY station_id LIMIT 20",
      description: "Discover stations with meteorological data",
    },
  ],
});

const latest = oneShot<{ station_id: string }>({
  name: "latest_observations",
  title: "Latest NDBC Observations",
  description: "Read the latest available standard meteorological observations across NDBC stations",
  columns: OBSERVATION_COLUMNS,
  args: { station_id: utf8() },
  argDefaults: { station_id: "" },
  argDocs: {
    station_id:
      "Optional station ID; empty string (default) returns all stations. Filtering happens after one network-wide file download.",
  },
  validate: (a) => {
    if (a.station_id !== "") stationId(a.station_id);
  },
  load: async (a) => {
    const url = endpoint("BUOYS_BASE_URL", BASE, "data/latest_obs/latest_obs.txt");
    const rows = parseObservations(await getText(url));
    return withSource(a.station_id === "" ? rows : rows.filter((r) => r.station_id === stationId(a.station_id)), url);
  },
  keywords: "latest, wind, waves, temperature, ndbc, buoy, observation",
  docs:
    "Fetch NDBC's network-wide latest-observations text file once. Optional named station_id defaults to an empty string (all stations). " +
    "Returns observation time in UTC, location, wind speed and gusts in m/s, wave_height_m, dominant_period_s, average_period_s, " +
    "directions in degrees from true north, temperatures in Celsius and pressure_hpa. visibility_m is converted from nautical miles; water_level_m from feet relative to MLLW. " +
    "Missing MM values become NULL; zero remains zero. Latest does not guarantee freshness: inspect time separately from fetched_at. " +
    "NULL station_id is rejected; an unknown but valid ID produces no rows. No API key needed.",
  examples: [
    {
      sql: "SELECT station_id, time, wave_height_m, dominant_period_s FROM buoys.main.latest_observations() WHERE wave_height_m IS NOT NULL ORDER BY wave_height_m DESC, station_id LIMIT 10",
      description: "Find the largest reported seas and their wave periods",
    },
  ],
});

export function timeWindow(start: unknown, end: unknown): { start: bigint | null; end: bigint | null } {
  const parse = (value: unknown) => {
    if (value === "") return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z$/.test(value))
      throw new Error("Time bounds must be UTC ISO timestamps ending in Z, or empty strings");
    return utcMicros(value);
  };
  const result = { start: parse(start), end: parse(end) };
  if (result.start !== null && result.end !== null && result.start > result.end)
    throw new Error("end_time must be on or after start_time");
  return result;
}

const observations = oneShot<{ station_id: string; start_time: string; end_time: string }>({
  name: "observations",
  title: "Recent NDBC Station History",
  description: "Read the recent standard meteorological history for a buoy or land station",
  columns: OBSERVATION_COLUMNS,
  args: { station_id: utf8(), start_time: utf8(), end_time: utf8() },
  argDefaults: { start_time: "", end_time: "" },
  argDocs: {
    station_id: "Required NDBC station ID, case-insensitive; e.g. 44013 or tplm2.",
    start_time:
      "Optional inclusive UTC ISO lower bound, e.g. 2026-01-01T00:00:00Z; empty string means unbounded within the source file.",
    end_time:
      "Optional inclusive UTC ISO upper bound; empty string means unbounded within the source file. Does not fetch archived data.",
  },
  argConstraints: { station_id: { pattern: "^[A-Za-z0-9]{3,8}$" } },
  validate: (a) => {
    stationId(a.station_id);
    timeWindow(a.start_time, a.end_time);
  },
  load: async (a) => {
    const id = stationId(a.station_id);
    const url = endpoint("BUOYS_BASE_URL", BASE, `data/realtime2/${id}.txt`);
    const range = timeWindow(a.start_time, a.end_time);
    return withSource(
      parseObservations(await getText(url), id).filter(
        (r) =>
          (range.start === null || (r.time as bigint) >= range.start) &&
          (range.end === null || (r.time as bigint) <= range.end),
      ),
      url,
    );
  },
  keywords: "buoy, ndbc, recent, history, wind, waves, period, observations",
  docs:
    "Read one station's recent standard meteorological file (approximately 45 days, coverage varies). Required station_id is case-insensitive. " +
    "Named start_time/end_time are optional inclusive UTC ISO bounds ending in Z; defaults are empty strings. These filter the downloaded file and do not retrieve archives. " +
    "Uses the same measurement units and columns as latest_observations(): UTC time, m/s winds, metre waves, second wave periods, Celsius temperatures, hPa pressure, " +
    "visibility_m and water_level_m (MLLW). Handles separate hour/minute and drifting-station hhmm layouts by header name. " +
    "Fixed-station files omit coordinates; join stations() by station_id if needed. Missing measurements are NULL, not zero. " +
    "NULL arguments, malformed rows and unexpected units fail explicitly. HTTP 404 means no file is available. No API key required.",
  examples: [
    {
      sql: "SELECT time, wind_speed_mps, wave_height_m, dominant_period_s FROM buoys.main.observations('44013') WHERE wave_height_m IS NOT NULL ORDER BY time DESC LIMIT 24",
      description: "Inspect the latest measured waves and winds off Boston",
    },
  ],
});

export const FUNCTIONS: VgiFunction[] = [stations, latest, observations];

export const stationsTable: TableDescriptor = {
  name: "stations",
  columns: outputSchema(STATION_COLUMNS),
  function: stations,
  exposeScan: true,
  constraints: [
    constraintRecord({
      schemaPath: ["main"],
      table: "stations",
      id: "station_pk",
      kind: "PRIMARY_KEY",
      columns: [["station_id"]],
      enforcement: "ENFORCED",
      validation: "ALL_ROWS",
    }),
    constraintRecord({
      schemaPath: ["main"],
      table: "stations",
      id: "station_id_not_null",
      kind: "NOT_NULL",
      columns: [["station_id"]],
      enforcement: "ENFORCED",
      validation: "ALL_ROWS",
    }),
  ],
  comment: "Active NDBC station directory with locations, owners and instrument capability flags",
  columnComments: Object.fromEntries(STATION_COLUMNS.map(([n, _t, d]) => [n, d])),
  tags: {
    domain: "marine",
    ...stations.meta.tags,
    "vgi.example_queries": JSON.stringify([
      {
        sql: "SELECT station_id, name FROM buoys.main.stations WHERE has_met ORDER BY station_id",
        description: "Discover stations with meteorological data",
      },
    ]),
  },
};
