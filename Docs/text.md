# Text & Markup

> Part of the [Anim documentation](../README.md#documentation).

Text is created with `_.newText(newProp)` and rendered by `Engine/render.js`. This page covers the text configuration, the symbol-based markup system, and the rendering pipeline.

For default-property helpers (`setProp`, `changeProp`, checkpoints), see [engine-api.md](./engine-api.md).

`_.newText()` returns the group id. Common properties shared by all creators (`id`, `duration`, `posX`/`posY`, `fadeIn`/`fadeOut`) are listed in [visuals.md](./visuals.md#common-properties-all-creators).

## Text configuration properties

Properties passed directly to `_.newText({...})` are merged on top of the persistent defaults set by `_.setProp()`.

| Property | Default | Description |
| - | - | - |
| `text` | `"Hello, world!"` | Text content to render (`\n` forces a line break) |
| `fontSize` | `80` | Font size in pixels (also the line height) |
| `fontColor` | `"#FFFFFF"` | Text color (any CSS color string) |
| `fontFamily` | `"Arial"` | Font family name |
| `fontWeight` | `400` | Font weight (normal text); styled segments override it |
| `alignY` | `0` | Vertical alignment: `-1` (top), `0` (center), `1` (bottom) |
| `maxWidth` | `Infinity` | Line-wrap threshold in pixels |
| `balancedWidth` | `false` | Decrease the maximum width to make the last line longer. Requires `maxWidth` to be finite. |
| `styleSymbol` | `[]` | Enable style markup with selected symbols |
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

With style entries enabled:

- `*bold text*` renders with `fontWeight: 700`
- Omitted fields keep the base style
- One symbol can set both color and weight
- Styles stack and can be nested; each symbol toggles its entry on/off

### Segment splitting (`segmentSymbol`)

Each line is split by the symbol into timed chunks. `onTextSegment` fires after each chunk - typically to play a click sound and wait:

```js
onTextSegment: (textLength) => {
  _.playSound("Sounds/click.wav", 2);
  _.wait(Math.floor(textLength / 12 + 2) / 2);
}
```

### Escaping special characters (`escapeSymbol`)

Prefix a special character (style, segment, or escape symbol itself) with the escape symbol to render it literally: `\\*`, `\\_`, `\\;`, `\\\\`.

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
4. `splitLines()` - measure widths and wrap at `maxWidth` (trailing spaces removed; break markers flush the current line; `balancedWidth` re-wraps with a reduced width)
5. `segTextLine()` - split chunks at `segmentSymbol` into `["wait", {text, color, fontWeight}, ...]`
6. `pushTextLine()` (`textEvents.js`) - measure segments, compute centered x-positions, push visual events; calls `prop.onTextSegment(textLength)` at each `"wait"` marker
7. `newText()` (`textEvents.js`) - calls `prop.onTextSegment(textLength)` once at the end with the remaining accumulated length
8. `render.js` - draws each text event at `(width / 2 + posX, height / 2 + posY)` with `textAlign: center`, `textBaseline: middle`

## Size hierarchy

- **Character** - atomic unit
- **Word** - contiguous non-space characters
- **Line** - wrapped words (trailing space removed)
- **Paragraph** - all lines from one `newText` call
- **Section** - group of paragraphs sharing an id (ended by `clear` or a `duration`)
