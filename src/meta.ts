/**
 * Discovery metadata: the one file to edit when you rename or extend the worker.
 *
 * DuckDB, coding agents and the `vgi-lint` metadata checker all read these
 * tags. Keep every object documented and `make lint-explain` stays at 100.
 *
 * - Catalog-level tags (title, license, author, links, long description) live in
 *   `CATALOG_TAGS` below.
 * - Every function carries `objectTags(...)`: a title, a category from
 *   `SCHEMA_CATEGORIES`, search keywords, and LLM- and human-facing docs.
 */

import { field, type VgiDataType, type VgiField } from "@query-farm/vgi";

export const CATALOG_NAME = "buoys";
export const VERSION = "0.1.0";

export const SOURCE_URL = "https://github.com/Query-farm/vgi-buoys";

/**
 * Categories group functions in docs and agent tools. Every object's
 * `vgi.category` must name one of these.
 */
export const SCHEMA_CATEGORIES = [
  { name: "api", title: "REST APIs", description: "Table functions that read from HTTP APIs." },
] as const;

export type Category = (typeof SCHEMA_CATEGORIES)[number]["name"];

/** Turn `"a, b, c"` into the JSON array string `vgi.keywords` requires. */
export function keywordsArray(keywords: string): string {
  return JSON.stringify(
    keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  );
}

/** Build the standard per-object discovery tags. */
export function objectTags(opts: {
  title: string;
  category: Category;
  keywords: string;
  docLlm: string;
  docMd: string;
}): Record<string, string> {
  return {
    "vgi.title": opts.title,
    "vgi.category": opts.category,
    "vgi.keywords": keywordsArray(opts.keywords),
    "vgi.doc_llm": opts.docLlm,
    "vgi.doc_md": opts.docMd,
  };
}

/** Build an Arrow field whose `comment` shows up in DuckDB's `DESCRIBE` and agent tools. */
export function column(name: string, type: VgiDataType, comment: string, nullable = true): VgiField {
  return field(name, type, nullable, new Map([["comment", comment]]));
}

export const CATALOG_DOC_LLM =
  "NOAA NDBC buoy stations, latest observations and recent station histories in SQL. Table functions return typed Arrow columns with UTC timestamps, source URLs and retrieval times. No API key is needed. Missing measurements become NULL; invalid arguments and unexpected upstream responses fail explicitly. Data is retrieved when a query executes. Use SQL to filter, aggregate and join stations to measurements. Wind speeds are m/s, waves are metres, periods seconds, temperatures Celsius and pressure hPa. Visibility is converted to metres and water level to metres relative to MLLW. The recent station file covers approximately 45 days; this worker does not read annual archives. Observation timestamps, not retrieval times, determine freshness.";
export const CATALOG_DOC_MD =
  "# NOAA Buoys\n\n" +
  CATALOG_DOC_LLM +
  "\n\n## Data access\n\nUse the main schema to discover stations and retrieve observations. Each response preserves its source URL and UTC retrieval time. Missing sensor values remain NULL.";
export const SCHEMA_DOC_LLM = `The main schema exposes buoys station discovery, measurements and reference information. ${CATALOG_DOC_LLM}`;
export const SCHEMA_DOC_MD =
  "## Marine functions\n\n" +
  SCHEMA_DOC_LLM +
  "\n\n### Query patterns\n\nDiscover station IDs first, retrieve measurements, then join or aggregate the resulting rows. Use the reference table for measurement units and supported products.";
export const AGENT_TEST_TASKS = [
  {
    name: "reference_units",
    prompt:
      "List column_name, source_unit, output_unit and scale for visibility_m in the measurements reference table.",
  },
  {
    name: "stations_query",
    prompt: "Using buoys.main.stations, list the first five station IDs and names ordered by station ID.",
  },
  {
    name: "latest_observations_query",
    prompt:
      "Using buoys.main.latest_observations, list the five stations with highest nonmissing wind_speed_mps, ordered by wind_speed_mps descending then station_id.",
  },
  {
    name: "observations_query",
    prompt:
      "Using buoys.main.observations, list the five most recent nonmissing wave heights for station 44013, showing time and wave_height_m.",
  },
  {
    name: "composed_boston_peak_wave",
    prompt:
      "What is the highest significant wave height in buoy 44013's whole recent history (buoys.main.observations), and what is that station's name in the station directory? " +
      "Save the answer with CREATE TEMP TABLE boston_peak AS SELECT ... with exactly one row and columns name (VARCHAR) and max_wave_height_m (DOUBLE).",
  },
  {
    name: "composed_max_visibility_nmi",
    prompt:
      "What is the greatest visibility currently reported in buoys.main.latest_observations, expressed back in the NDBC source unit? Use the measurements reference table's scale for visibility_m to convert. " +
      "Save the answer with CREATE TEMP TABLE max_visibility AS SELECT ... with exactly one row and one column visibility_nmi (DOUBLE).",
  },
];
export const CATALOG_TAGS: Record<string, string> = {
  ...{
    "vgi.title": "NOAA Buoys",
    "vgi.subtitle": "NOAA NDBC buoy stations, latest observations and recent station histories for marine analysis.",
    "vgi.source_url": "https://github.com/Query-farm/vgi-buoys",
    "vgi.icon_url": "https://query.farm/media-kit/products/vgi/vgi-logo.png",
    "vgi.license": "0BSD",
    "vgi.author": "Query.Farm",
    "vgi.copyright": "Copyright 2026 Query.Farm LLC",
    "vgi.support_contact": "https://github.com/Query-farm/vgi-buoys/issues",
    "vgi.support_policy_url": "https://github.com/Query-farm/vgi-buoys#support",
    "vgi.keywords": '["noaa", "buoys", "marine", "sql", "observations", "stations"]',
  },
  "vgi.doc_llm": CATALOG_DOC_LLM,
  "vgi.doc_md": CATALOG_DOC_MD,
  "vgi.agent_test_tasks": JSON.stringify(AGENT_TEST_TASKS),
};
export const SCHEMA_TAGS: Record<string, string> = {
  "vgi.title": "Marine Data",
  domain: "marine",
  "vgi.keywords": keywordsArray("noaa, buoys, marine, observations"),
  "vgi.doc_llm": SCHEMA_DOC_LLM,
  "vgi.doc_md": SCHEMA_DOC_MD,
  "vgi.categories": JSON.stringify(SCHEMA_CATEGORIES),
};
