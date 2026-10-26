# Third-party resources

## Japan map

- Source: [Natural Earth, Admin 0 – Countries, 1:50m](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/).
- Upstream: [natural-earth-vector / ne_50m_admin_0_countries.geojson](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson).
- Retrieved: 2026-10-23. The Japan feature was extracted and nonessential properties removed; geometry is retained in `src/data/japan.json`.
- License: [Public domain](https://www.naturalearthdata.com/about/terms-of-use/).
- Display modifications: projected as SVG; southern islands displayed in a separate location inset. This is a travel-planning illustration, not a navigation or boundary reference.

- Region highlights: [Natural Earth, Admin 1 – States and Provinces, 1:10m](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/), from [ne_10m_admin_1_states_provinces.geojson](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_1_states_provinces.geojson). Retrieved 2026-10-23, public domain. Japan's 47 prefectures were grouped into eight travel regions, nonessential properties removed, and coordinates rounded to four decimal places in `src/data/regions.json`. Mie is included in Kansai; Chugoku and Shikoku are combined for exploration.

## Detailed map and place search

- Map library: [Leaflet 1.9.4](https://leafletjs.com/), BSD-2-Clause. Package license is retained in npm distribution.
- Detailed map tiles and selected search results: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. Attribution stays visible on the map and in place search results. Tiles are requested on demand using the browser cache, following the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/); no bulk download or offline tile archive is provided.
- Place search: [Photon by komoot](https://github.com/komoot/photon), using its public API under the stated fair-use terms. Searches are triggered by an explicit submission or debounced typing in the location picker, limited to Japan, serialized and cached locally in memory. The public service does not guarantee availability. Saved itinerary content is not uploaded to the provider.
- Google Maps links use the official [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) format. No Google map SDK or API key is embedded.

## City and municipality selector

- City/ward/town/village names are derived from [Geolonia Japanese Addresses](https://github.com/geolonia/japanese-addresses), [municipality list](https://geolonia.github.io/japanese-addresses/api/ja.json), retrieved 2026-10-23. The snapshot covers all 1,895 source entries across 47 prefectures; 20 whole-city entries and a Tokyo metropolitan entry are added for convenient selection, yielding 1,916 choices.
- Representative city/prefecture coordinates come from [Geolonia Japanese Addresses v2](https://github.com/geolonia/japanese-addresses-v2), whose upstream source is Japan's Digital Agency Address Base Registry. Coordinates initialize the map view and are not treated as a landmark location.
- Geolonia address data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: simplified Chinese labels, Chinese forms for kana place names, regional grouping, disambiguation of duplicate names, rounding of representative coordinates, and compatibility aliases for the existing planner.
- [OpenCC.js](https://github.com/nk2028/opencc-js), MIT, was used only during local data preparation. It is not an application dependency. Japanese source names are retained internally for matching existing data; the selector displays Chinese labels.
- The 10 reference itinerary coordinates in `src/data/reference-places.ts` are selected from OpenStreetMap/Photon results checked 2026-10-23. The Kamo River walk uses Sanjo Bridge as its reference point; Naramachi uses the vicinity of Koshi-no-Ie. These are editable planning references, not guaranteed entrances or transport routes.

## Noto Sans SC distribution

- Copyright 2014–2021 Adobe; font copyright metadata and upstream authorship retained in the font.
- Upstream: [Google Fonts / Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc).
- Retrieved: 2026-10-23.
- License: SIL Open Font License 1.1. Full upstream text is included in `public/fonts/OFL.txt`.
- The upstream variable TTF was instantiated at weight 400 and encoded as a static WOFF using FontTools for local web and PDF embedding. Glyph coverage was retained; the font is distributed as part of this application.
- PDF export expands that WOFF into an SFNT font once in worker memory, retaining all tables and glyphs to avoid repeated glyph-table decompression. No additional font download or font asset is required.

## Icons and software packages

- The travel Agent uses the official [OpenAI Node SDK](https://github.com/openai/openai-node), Apache-2.0, against the user's explicitly configured OpenAI-compatible endpoint. Text and image inputs are sent only when the user tests a connection or generates a plan.
- Public-page extraction uses [Mozilla Readability](https://github.com/mozilla/readability), Apache-2.0, and [LinkeDOM](https://github.com/WebReflection/linkedom), ISC. Pages are parsed as inert content; login cookies and browser sessions are not used.
- Local XLSX parsing uses [read-excel-file](https://gitlab.com/catamphetamine/read-excel-file), MIT. No cloud spreadsheet service or separate OCR provider is used. PNG compression and bounded XLSX repacking use the existing fflate dependency, MIT.

Lucide icons and npm dependencies retain their respective upstream licenses. See each installed package's license. Exact dependency versions and integrity information are recorded in `package-lock.json`.

The city descriptions, demo itinerary, decorative landscape graphics, and interface were authored for this project. Suggested places are offline planning examples and are not live recommendations or current travel-service data.
