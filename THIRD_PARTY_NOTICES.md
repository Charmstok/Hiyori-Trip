# Third-party resources

## Japan map

- Source: [Natural Earth, Admin 0 – Countries, 1:50m](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/).
- Upstream: [natural-earth-vector / ne_50m_admin_0_countries.geojson](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson).
- Retrieved: 2026-10-23. The Japan feature was extracted and nonessential properties removed; geometry is retained in `src/data/japan.json`.
- License: [Public domain](https://www.naturalearthdata.com/about/terms-of-use/).
- Display modifications: projected as SVG; southern islands displayed in a separate location inset. This is a travel-planning illustration, not a navigation or boundary reference.

- Region highlights: [Natural Earth, Admin 1 – States and Provinces, 1:10m](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/), from [ne_10m_admin_1_states_provinces.geojson](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_1_states_provinces.geojson). Retrieved 2026-10-23, public domain. Japan's 47 prefectures were grouped into eight travel regions, nonessential properties removed, and coordinates rounded to four decimal places in `src/data/regions.json`. Mie is included in Kansai; Chugoku and Shikoku are combined for exploration.

## Noto Sans SC

- Copyright 2014–2021 Adobe; font copyright metadata and upstream authorship retained in the font.
- Upstream: [Google Fonts / Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc).
- Retrieved: 2026-10-23.
- License: SIL Open Font License 1.1. Full upstream text is included in `public/fonts/OFL.txt`.
- The upstream variable TTF was instantiated at weight 400 and encoded as a static WOFF using FontTools for local web and PDF embedding. Glyph coverage was retained; the font is distributed as part of this application.

## Icons and software packages

Lucide icons and npm dependencies retain their respective upstream licenses. See each installed package's license. Exact dependency versions and integrity information are recorded in `package-lock.json`.

The city descriptions, demo itinerary, decorative landscape graphics, and interface were authored for this project. Suggested places are offline planning examples and are not live recommendations or current travel-service data.
