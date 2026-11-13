/**
 * The worker entry point.
 *
 *   bin/vgi-buoys-worker                      # stdio: what DuckDB launches by default
 *   bin/vgi-buoys-worker --http --port 8000   # HTTP: for Docker / hosted deploys
 *   bin/vgi-buoys-worker --help
 *
 * Attach it from DuckDB:
 *
 *   ATTACH 'buoys' (TYPE vgi, LOCATION '/abs/path/to/bin/vgi-buoys-worker');
 */

import { CATALOG } from "./catalog.ts";
import { serve } from "./cli.ts";
import { CATALOG_DOC_LLM, SOURCE_URL, VERSION } from "./meta.ts";

if (import.meta.main) {
  serve(CATALOG, { version: VERSION, doc: CATALOG_DOC_LLM, repositoryUrl: SOURCE_URL });
}
