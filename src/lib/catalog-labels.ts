// Display names for the two variant options. The data model calls them
// `size` and `color`; for a sweets & snacks store they are the pack size
// (250 g, 500 g, 1 kg…) and the flavour (Classic, Kesar, Spicy…).
export const OPTION_LABELS = {
  size: "Pack size",
  sizes: "Pack sizes",
  color: "Flavour",
  colors: "Flavours",
  /** Example values shown as placeholders in the admin. */
  sizeExample: "250 g",
  sizeListExample: "250 g, 500 g, 1 kg",
  colorExample: "Classic",
  colorListExample: "Classic, Kesar",
} as const;
