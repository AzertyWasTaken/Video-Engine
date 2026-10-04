# Text & Markup

> Part of the [Anim documentation](../README.md#documentation).

Text is created with `_.newText(newProp)` and rendered by `Engine/render.js`. This page covers the text configuration, the symbol-based markup system, and the rendering pipeline.

For default-property helpers (`setProp`, `changeProp`, checkpoints), see [engine-api.md](./engine-api.md).

`_.newText()` returns the group's ids (array). Common properties shared by all creators (`id`, `duration`, `posX`/`posY`, `rotation`, `fadeIn`/`fadeOut`, `opacity`) are listed in [visuals.md](./visuals.md#common-properties-object-creators).

## Text configuration properties

Properties passed directly to `_.newText({...})` are merged on top of the persistent defaults set by `_.setProp()`; `id`, `posX`, `posY`, `alignX`, `alignY`, `fadeIn`, `fadeOut`, `opacity`, and `duration` fall back to the shared `global` defaults while undefined.

| Property | Default | Description |
| - | - | - |
| `text` | `"Hello, world!"` | Text content to render (`\n` forces a line break) |
| `fontSize` | `80` | Font size in pixels (also the line height) |
| `fontColor` | `"#FFFFFF"` | Text color (any CSS color string) |
| `fontFamily` | `"Arial"` | Font family name |
| `fontWeight` | `400` | Font weight (normal text); styled segments override it |
| `alignX` | `0` | Horizontal alignment: `-1` (left), `0` (center), `1` (right); each line shifts to that side of `posX` |
| `alignY` | `0` | Vertical alignment: `-1` (top), `0` (center), `1` (bottom); the block shifts to that side of `posY` |
| `lineGap` | `0` | Extra vertical space between lines in pixels (negative tightens) |
| `maxWidth` | `Infinity` | Line-wrap threshold in pixels |
| `balancedWidth` | `false` | Decrease the maximum width to make the last line longer. Requires `maxWidth` to be finite. |
| `autoSize` | `false` | Fit text on one line within `maxWidth`; hard line breaks are ignored. Requires a finite positive `maxWidth`. |
| `fontSizeStep` | `1` | Positive font-size rounding step used by `autoSize` (`20` means the fitted size is a multiple of `20`). |
| `styleSymbol` | `[]` | Enable style markup with the selected opening and closing symbols |
| `segmentSymbol` | `null` | Enable segment splitting with the selected symbol (e.g. `";"`) |
| `escapeSymbol` | `null` | Enable escaping special characters with the selected symbol (e.g. `"\\"`) |
| `flashDuration` | `0` | Flash duration on newly spawned text (disabled if 0) |
| `flashColor` | `"#FFFF60"` | Flash color on newly spawned text |
| `autoSetPosX` | `false` | Auto-increment `posX` for chained `newText` calls |
| `autoSetPosY` | `false` | Auto-increment `posY` for chained `newText` calls |
| `onTextSegment` | `() => {}` | Callback `(textLength) => void`. Fires when a `"wait"` marker is encountered, and once more at the end of `newText()` with the remaining accumulated length. |

Common segment-delay helper:

```js
function textDelay(length) {
    return Math.floor(length / 12 + 2) / 2;
}
```

## Text markup

Each markup type is enabled by setting its symbol property - globally via `_.setProp()` or per-call in `_.newText()`. Symbol characters are consumed and never rendered.

### Style markup (`styleSymbol`)

`styleSymbol` is a list of entries `{openSymbol, closeSymbol?, color?, fontWeight?}`. Each entry chooses the symbols that open and close its styled region; `closeSymbol` defaults to `openSymbol`, which makes the entry a toggle.

```js
_.setProp({
    styleSymbol: [
        {openSymbol: "*", fontWeight: 700},                      // *bold*
        {openSymbol: "{y ", closeSymbol: "}", color: "#FFE040"},  // {y yellow}
    ],
});
```

- `*bold text*` renders with `fontWeight: 700`
- Omitted fields keep the base style
- One entry can set both color and weight
- Styles stack and can be nested
- An entry whose `openSymbol` and `closeSymbol` differ is an open/close pair; the closing symbol ends the innermost styled region, and one with no region open stays literal text

Symbols are matched as whole strings, so an entry can require **several symbols in a row**:

```js
_.newText({text: "Value <<x>> is {$ y} here.", styleSymbol: [
    {openSymbol: "<<", closeSymbol: ">>", color: "#60FF60"},
    {openSymbol: "{$ ", closeSymbol: "}", color: "#60FF60"},
]});
```

When two entries could match at the same position, the longest symbol wins (`**` takes precedence over `*`). Declaring the same symbol in two entries throws.

### Segment splitting (`segmentSymbol`)

Each line is split by the symbol into timed chunks. `onTextSegment` fires after each chunk - typically to play a click sound and wait:

```js
onTextSegment: (textLength) => {
  _.playSound("click", 2);
  _.wait(Math.floor(textLength / 12 + 2) / 2);
}
```

### Escaping special characters (`escapeSymbol`)

Prefix a special character (style open or close, segment, or escape symbol itself) with the escape symbol to render it literally: `\\*`, `\\_`, `\\;`, `\\\\`, and `\\{` for an entry opening on `{`. Escaping the first character of a multi-symbol opening prevents the whole symbol from matching.

> The escape character itself is consumed during parsing and does not appear in the rendered output.

```js
_.newText({text: "Use \\\\ to *escape*; special characters (like \\* or \\;)."});
```

### Line breaks (`\n`)

A literal newline character in the text forces a hard line break, independent of `maxWidth` wrapping:

```js
_.newText({text: "First line.\nSecond line."});
```

- Newlines are not markup symbols - they work with every configuration and cannot be disabled.
- Consecutive newlines collapse: blank lines create no vertical gap.
- Style state (`color`/`fontWeight`) carries across breaks.
- `lineGap` adds extra space between lines, for both hard breaks and `maxWidth` wrapping.

### Automatic sizing

Set `autoSize: true` to choose the largest font size that keeps the complete text within `maxWidth` on one line. The fitted size is rounded down to a positive multiple of `fontSizeStep`:

```js
_.newText({
    text: "A title that fits one line",
    maxWidth: 960,
    autoSize: true,
    fontSizeStep: 20
});
```

Hard line breaks are ignored in this mode, so `"First\nSecond"` is fitted and rendered as `"FirstSecond"`. `maxWidth` must be finite and greater than zero. The option is disabled by default; when disabled, the normal `maxWidth` wrapping and hard line-break behavior are unchanged.

### Resizing

`_.moveTo(id, {fontSize: 40}, 1)` and `_.animate(id, {fontSize: -40}, 1)` scale the whole text layout about the text's `posX`/`posY` anchor: segment spacing, line spacing (including `lineGap`) and glyph size all resize together, so multi-segment and multi-line text never spreads out or overlaps. Because the anchor is the same point `alignX`/`alignY` align to, an aligned line keeps its alignment while it resizes.

Wrapping does not re-flow: line breaks from `maxWidth` stay as they were at build time, so growing text past `maxWidth` overflows instead of re-wrapping.

### Disabling markup per-call

Set a symbol to `null` in the `_.newText()` call to override a globally-enabled markup:

```js
// Disable segment splitting for this text only
_.newText({text: "This has a ; that should not split.", segmentSymbol: null});
```

## Rendering pipeline

1. Input text string
2. `tokenizeText()` (`textParser.js`) - parse style and escape markers into tokens `[{text, color, fontWeight}, ...]`
3. `chunkTokens()` - split tokens into word/space chunks, emitting `{break: true}` markers at `\n` characters
4. Auto-sizing (when enabled) - remove hard-break markers, measure visible segments, and binary-search the largest positive `fontSizeStep` multiple that fits `maxWidth`
5. `splitLines()` - measure widths and wrap at `maxWidth` (trailing spaces removed; break markers flush the current line; `balancedWidth` re-wraps with a reduced width)
6. `segTextLine()` - split chunks at `segmentSymbol` into `["wait", {text, color, fontWeight}, ...]`
7. `pushTextLine()` (`textEvents.js`) - measure segments, compute x-positions (centered, then shifted by `alignX`), push visual events; calls `prop.onTextSegment(textLength)` at each `"wait"` marker
8. `newText()` (`textEvents.js`) - calls `prop.onTextSegment(textLength)` once at the end with the remaining accumulated length
9. `render.js` - draws each text event at `(width / 2 + posX, height / 2 + posY)` with `textAlign: center`, `textBaseline: middle`; a tweened `fontSize` rescales those positions about the text's `posX`/`posY` anchor (`anchorX`/`anchorY`), so segments and line spacing resize together (see [Resizing](#resizing))

## Size hierarchy

- **Character** - atomic unit
- **Word** - contiguous non-space characters
- **Line** - wrapped words (trailing space removed)
- **Paragraph** - all lines from one `newText` call
- **Section** - group of paragraphs sharing an id (ended by `clear` or a `duration`)
