// Standard OSM tiles need no API key. Honor browser caching and show attribution.
export const OPENSTREETMAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OPENSTREETMAP_OPTIONS = {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  referrerPolicy: "strict-origin-when-cross-origin",
};
