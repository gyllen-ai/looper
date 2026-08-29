export const NAMED_COLOURS: readonly string[] = [
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque",
  "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood",
  "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk",
  "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray",
  "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen",
  "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
  "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
  "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue",
  "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro",
  "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey",
  "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
  "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
  "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
  "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
  "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen",
  "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue",
  "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
  "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue",
  "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace",
  "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
  "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff",
  "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple", "red",
  "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen",
  "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray",
  "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle",
  "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
  "yellowgreen",
];

const KNOWN_COLOURS = new Set(NAMED_COLOURS);

export function isNamedColour(word: string): boolean {
  return KNOWN_COLOURS.has(word.toLowerCase());
}

export const COLOUR_BEARING: readonly string[] = [
  "color",
  "background",
  "background-color",
  "background-image",
  "border",
  "border-color",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-block",
  "border-block-color",
  "border-block-start",
  "border-block-end",
  "border-block-start-color",
  "border-block-end-color",
  "border-inline",
  "border-inline-color",
  "border-inline-start",
  "border-inline-end",
  "border-inline-start-color",
  "border-inline-end-color",
  "outline",
  "outline-color",
  "box-shadow",
  "text-shadow",
  "text-decoration",
  "text-decoration-color",
  "text-emphasis",
  "text-emphasis-color",
  "caret-color",
  "accent-color",
  "column-rule",
  "column-rule-color",
  "scrollbar-color",
  "fill",
  "stroke",
  "stop-color",
  "flood-color",
  "lighting-color",
  "-webkit-text-fill-color",
  "-webkit-text-stroke",
  "-webkit-text-stroke-color",
  "-webkit-tap-highlight-color",
];

const BEARS_A_COLOUR = new Set(COLOUR_BEARING);

const A_CUSTOM_PROPERTY = "--";

const A_SASS_VARIABLE = "$";

export function bearsAColour(property: string): boolean {
  if (property.startsWith(A_CUSTOM_PROPERTY)) return true;
  if (property.startsWith(A_SASS_VARIABLE)) return true;
  return BEARS_A_COLOUR.has(property.toLowerCase());
}
