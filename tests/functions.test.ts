import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Arguments, VgiClient } from "@query-farm/vgi";
import { subprocessConnect } from "@query-farm/vgi-rpc";

const ROOT = join(import.meta.dir, "..");
describe("NOAA fixtures through the worker transport", () => {
  let client: VgiClient;
  let mock: ReturnType<typeof Bun.spawn>;
  beforeAll(async () => {
    mock = Bun.spawn(["python3", join(ROOT, "test/mock_api/server.py")], {
      stdout: "pipe",
      stderr: "inherit",
      env: { ...process.env, MOCK_API_FLAKY: "1" },
    });
    const reader = (mock.stdout as ReadableStream<Uint8Array>).getReader();
    let text = "";
    while (!text.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    reader.releaseLock();
    const port = text.match(/^PORT:(\d+)/)?.[1];
    if (!port) throw new Error(`mock did not report port: ${text}`);
    const mockUrl = `http://127.0.0.1:${port}`;
    client = new VgiClient(
      subprocessConnect([process.execPath, "run", join(ROOT, "src/worker.ts")], {
        env: { BUOYS_BASE_URL: mockUrl },
        stderr: "inherit",
      }),
    );
  });
  afterAll(() => {
    client?.close();
    mock?.kill();
  });
  async function table(name: string, positional: unknown[] = [], named: Record<string, unknown> = {}) {
    const rows: Record<string, unknown>[] = [];
    for await (const batch of client.tableFunctionRows({
      functionName: name,
      arguments: new Arguments(positional, new Map(Object.entries(named))),
      int64: "bigint",
    }))
      rows.push(...batch);
    return rows;
  }
  test("station capabilities and latest observations survive Arrow", async () => {
    const stations = await table("stations");
    expect(stations).toHaveLength(3);
    expect(stations[0]).toMatchObject({ station_id: "44013", name: "Boston & Harbor", has_met: true });
    const latest = await table("latest_observations", [], { station_id: "TPLM2" });
    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({ station_id: "tplm2", wind_speed_mps: 0, wave_height_m: null });
  });
  test("history filters inclusively and preserves missing/zero measurements", async () => {
    const rows = await table("observations", ["44013"], {
      start_time: "2026-01-01T00:10:00Z",
      end_time: "2026-01-01T00:20:00Z",
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.wave_height_m)).toEqual([0, null]);
  });
  test("5001 observations have no truncation; drifting station positions survive", async () => {
    const rows = await table("observations", ["large"]);
    expect(rows).toHaveLength(5001);
    expect(new Set(rows.map((r) => String(r.time))).size).toBe(5001);
    expect((await table("observations", ["drift"]))[0]).toMatchObject({
      latitude: 25.99,
      longitude: -89.66,
      dominant_period_s: 8,
    });
  });
  test("empty data is empty, unavailable files are errors and NULL IDs fail", async () => {
    expect(await table("observations", ["empty"])).toHaveLength(0);
    expect(await table("latest_observations", [], { station_id: "absent" })).toHaveLength(0);
    await expect(table("observations", ["absent"])).rejects.toThrow("HTTP 404");
    await expect(table("observations", [null])).rejects.toThrow();
    await expect(table("latest_observations", [], { station_id: null })).rejects.toThrow();
  });
});
