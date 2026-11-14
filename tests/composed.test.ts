import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG } from "../src/catalog.ts";
import {
  DAILY_HISTORY_WITH_STATION,
  type Example,
  LARGEST_SEAS_NAMED,
  LATEST_WITH_UNITS,
  SILENT_MET_STATIONS,
} from "../src/composed.ts";

const SQL_TEST = readFileSync(join(import.meta.dir, "..", "test/sql/buoys.test"), "utf8");
const schema = CATALOG.schemas[0];

function examples(tags: Record<string, string> | undefined): Example[] {
  return JSON.parse(tags?.["vgi.example_queries"] ?? "[]") as Example[];
}

function functionExamples(name: string): Example[] {
  const fn = schema?.functions?.find((f) => f.meta.name === name);
  return examples(fn?.meta.tags);
}

function tableExamples(name: string): Example[] {
  return examples(schema?.tables?.find((t) => t.name === name)?.tags);
}

describe("composed examples", () => {
  const placements: [Example, Example[]][] = [
    [LARGEST_SEAS_NAMED, functionExamples("latest_observations")],
    [SILENT_MET_STATIONS, functionExamples("stations")],
    [SILENT_MET_STATIONS, tableExamples("stations")],
    [DAILY_HISTORY_WITH_STATION, functionExamples("observations")],
    [LATEST_WITH_UNITS, tableExamples("measurements")],
  ];

  test("each sits within its driving object's first five examples", () => {
    for (const [example, list] of placements) {
      const index = list.findIndex((e) => e.sql === example.sql);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(5);
    }
  });

  test("each is in the schema-level list exactly once", () => {
    const all = examples(schema?.tags);
    for (const example of [LARGEST_SEAS_NAMED, SILENT_MET_STATIONS, DAILY_HISTORY_WITH_STATION, LATEST_WITH_UNITS]) {
      expect(all.filter((e) => e.sql === example.sql)).toHaveLength(1);
    }
  });

  test("each SQL runs verbatim in the fixture SQL tests", () => {
    for (const example of [LARGEST_SEAS_NAMED, SILENT_MET_STATIONS, DAILY_HISTORY_WITH_STATION, LATEST_WITH_UNITS]) {
      expect(SQL_TEST).toContain(example.sql);
      expect(example.sql).not.toContain(";");
    }
  });
});
