// Chart colors. Series slots come from the dataviz reference palette and were
// validated for this white surface (validate_palette.js, light mode, all pairs):
// lightness/chroma/CVD/normal-vision checks pass; slot 3 (aqua) is below 3:1
// contrast, so every chart that uses it ships visible value labels + a table view.
// The admin UI is light-only (root `color-scheme: light`), so no dark steps.
export const VIZ = {
  series1: "#2a78d6", // blue
  series2: "#eb6834", // orange
  series3: "#1baf7a", // aqua
  /** Hairline gridlines, one step off the white surface. */
  grid: "#e4e4e7",
  /** Baseline / axis rule. */
  axis: "#d4d4d8",
  /** Crosshair. */
  crosshair: "#a1a1aa",
  surface: "#ffffff",
} as const;

/** Fixed entity -> color mapping for payment gateways (never by rank). */
export const GATEWAY_COLORS = {
  razorpay: VIZ.series1,
  stripe: VIZ.series2,
  mock: VIZ.series3,
  // Orders paid entirely by gift card: neutral, labelled in the legend and table.
  gift_card: "#a1a1aa",
} as const;
