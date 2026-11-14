import { constraintRecord, type TableDescriptor } from "@query-farm/vgi";
import { LATEST_WITH_UNITS } from "./composed.ts";
import { MEASURES } from "./noaa.ts";
import { type Column, oneShot, outputSchema } from "./table.ts";

const COLUMNS: Column[] = [
  ["column_name", "VARCHAR", "Output measurement column.", false],
  ["source_field", "VARCHAR", "NDBC text header field.", false],
  ["source_unit", "VARCHAR", "Unit in the source NDBC data file.", false],
  ["output_unit", "VARCHAR", "Unit in the worker result.", false],
  [
    "scale",
    "DOUBLE",
    "Dimensionless conversion factor: multiply source values by this ratio to obtain output values.",
    false,
  ],
];
const ROWS = MEASURES.map((m) => ({
  column_name: m.name,
  source_field: m.header,
  source_unit: m.unit,
  output_unit: m.scale ? "m" : m.unit,
  scale: m.scale ?? 1,
}));
const scan = oneShot<Record<string, never>>({
  name: "measurements_scan",
  title: "Measurements Reference",
  description: "Read measurements reference rows",
  columns: COLUMNS,
  args: {},
  argDocs: {},
  load: async () => ROWS,
  keywords: "reference, noaa, units, buoys",
  docs: "A built-in reference for all supported NDBC meteorological measurements. Use column_name to connect a result column to its source_field, source_unit, output_unit and conversion scale. This deterministic table makes no network requests. Missing source measurements stay NULL before conversion. Wind and wave directions retain their source convention: where they come from, relative to true north.",
  examples: [
    {
      sql: "SELECT column_name, source_unit, output_unit, scale FROM buoys.main.measurements WHERE column_name = 'visibility_m'",
      description: "NDBC measurement fields, source units and conversion factors",
    },
    LATEST_WITH_UNITS,
  ],
});
export const referenceTable: TableDescriptor = {
  name: "measurements",
  columns: outputSchema(COLUMNS),
  function: scan,
  comment: "NDBC measurement fields, source units and conversion factors",
  columnComments: Object.fromEntries(COLUMNS.map(([n, _t, d]) => [n, d])),
  constraints: [
    ...COLUMNS.map(([name]) =>
      constraintRecord({
        schemaPath: ["main"],
        table: "measurements",
        id: `${name}_not_null`,
        kind: "NOT_NULL",
        columns: [[name]],
        enforcement: "ENFORCED",
        validation: "ALL_ROWS",
      }),
    ),
    constraintRecord({
      schemaPath: ["main"],
      table: "measurements",
      id: "primary_key",
      kind: "PRIMARY_KEY",
      columns: [["column_name"]],
      enforcement: "ENFORCED",
      validation: "ALL_ROWS",
    }),
  ],
  tags: {
    domain: "marine",
    ...scan.meta.tags,
    "vgi.executable_examples": JSON.stringify([
      {
        sql: "SELECT column_name, source_unit, output_unit, scale FROM buoys.main.measurements WHERE column_name = 'visibility_m'",
        description: "NDBC measurement fields, source units and conversion factors",
        expected_result: [["visibility_m", "nmi", "m", 1852]],
      },
    ]),
    "vgi.example_queries": JSON.stringify([
      {
        sql: "SELECT column_name, source_unit, output_unit, scale FROM buoys.main.measurements WHERE column_name = 'visibility_m'",
        description: "NDBC measurement fields, source units and conversion factors",
      },
      LATEST_WITH_UNITS,
    ]),
  },
};
