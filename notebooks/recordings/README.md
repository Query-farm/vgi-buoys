# Official NOAA response recordings

The manifest records byte-for-byte public NOAA NDBC response bodies downloaded on
14 November 2026 UTC. `activestations.xml` is the active-station directory;
`44013.txt` is Boston station 44013's recent standard meteorological history.
Exact paths, original URLs, UTC retrieval times, content types and SHA-256 hashes
are in `manifest.json`. These files are not synthetic fixtures. NOAA can revise
observations; this is a capture of responses, not a vintage archive guarantee.

The replay server verifies hashes and serves only these exact paths. The published
worker still performs all parsing, missing-value handling and Arrow conversion.
The notebook filters a fixed 48-hour window within the response. Raw response
files use scoped Git attributes to preserve original bytes and line endings.

Source: NOAA National Data Buoy Center, https://www.ndbc.noaa.gov/ . No endorsement
is implied. See the parent guide for measurement and provenance limitations.
