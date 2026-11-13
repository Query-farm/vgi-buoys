import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseObservations, parseStations, stationId, timeWindow } from "../src/noaa.ts";

const fixture = (file: string) => readFileSync(join(import.meta.dir, "../test/mock_api/fixtures", file), "utf8");

test("XML stations retain identifiers, decode entities and distinguish missing capability flags", () => {
  const rows = parseStations(fixture("stations.xml"));
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({ station_id: "44013", name: "Boston & Harbor", has_met: true, has_currents: false });
  expect(rows[2]).toMatchObject({ station_id: "tplm2", has_currents: null });
  expect(parseStations('<stations count="0"/>')).toEqual([]);
  expect(() => parseStations('<stations count="2"/>')).toThrow();
  expect(() => parseStations('<!DOCTYPE stations [<!ENTITY test "value">]><stations count="0"/>')).toThrow();
});

test("history converts feet and nautical miles; MM stays NULL and zero stays zero", () => {
  const rows = parseObservations(fixture("history.txt"), "44013");
  expect(rows).toHaveLength(4);
  expect(rows[0]).toMatchObject({ visibility_m: 3704, wind_speed_mps: 5, dominant_period_s: 8, latitude: null });
  expect(rows[0]?.water_level_m).toBeCloseTo(0.9144);
  expect(rows[1]).toMatchObject({ wind_speed_mps: 0, wave_height_m: 0, air_temperature_c: -2 });
  expect(rows[2]).toMatchObject({ wind_speed_mps: null, wave_height_m: null, water_level_m: null });
  expect(rows[3]?.water_level_m).toBeCloseTo(-0.3048);
});

test("latest and drifting layouts are parsed by name, including hhmm and position", () => {
  const latest = parseObservations(fixture("latest.txt"));
  expect(latest[1]).toMatchObject({ station_id: "tplm2", latitude: 38.899, pressure_tendency_hpa: -1 });
  const drift = parseObservations(fixture("drifting.txt"), "drift");
  expect(drift[0]).toMatchObject({
    time: 1767227400000000n,
    latitude: 25.99,
    longitude: -89.66,
    wave_height_m: 1.2,
    average_period_s: null,
  });
});

test("empty files retain a valid schema; malformed rows, units and dates fail explicitly", () => {
  expect(parseObservations(fixture("empty.txt"), "empty")).toEqual([]);
  expect(() => parseObservations("<html>error</html>", "44013")).toThrow("header");
  expect(() => parseObservations(fixture("history.txt").replace("m/s", "knots"), "44013")).toThrow("units");
  expect(() => parseObservations(`${fixture("empty.txt")}2026 01 01\n`, "44013")).toThrow("column count");
  expect(() => parseObservations(fixture("history.txt").replace("2026 01 02", "2026 02 30"), "44013")).toThrow(
    "timestamp",
  );
});

test("time filters require UTC; station names cannot escape a data path", () => {
  expect(stationId("TPLM2")).toBe("tplm2");
  for (const value of [null, "../abc", "abc?x=1"]) expect(() => stationId(value)).toThrow();
  expect(timeWindow("", "")).toEqual({ start: null, end: null });
  expect(() => timeWindow("2026-01-01T00:00:00", "")).toThrow();
  expect(() => timeWindow(null, "")).toThrow();
  expect(() => timeWindow("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z")).toThrow();
});
