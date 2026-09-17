# page-mascot (vanilla)

A framework-free port of [`nilbuild/page-mascot`](https://github.com/nilbuild/page-mascot).

An interactive character that watches the cursor and blinks when you poke it.
The original is a React component; this port keeps the **same sprite-sheet
contract, the same nine directions, the same nine reactions, the same
hysteresis, dead-zone, squash, dizzy and reduced-motion behaviour** — but
runs as a single ~7 KB JavaScript file with **no React, no build step, no
dependencies**.

## What it does

- Each character is two 3×3 sprite sheets: nine head **directions** and nine
  **reactions**.
- The pointer's angle picks a cell on the directions sheet, with a dead zone
  so the head settles when the cursor is close. Hysteresis holds the current
  sector until the pointer is well past its edge, so the head doesn't flicker
  at sector borders.
- A click (a "boop") shows a cell from the reactions sheet for half a second.
- Four quick boops inside 1.6 s → the character goes **dizzy** for 1.1 s.
- Click triggers a per-keyframe **squash** animation (linear easing on the
  effect itself so the offsets aren't front-loaded).
- Tracking switches off without a fine pointer (`(hover: hover) and
  (pointer: fine)`), so touch users still get a blink but no head-tracking.
- The click squash honours `prefers-reduced-motion`.

## Files

| File | What it is |
| --- | --- |
| `page-mascot.js` | The library — UMD, works as a `<script>`, an ES module, an AMD module, or a CommonJS require. |
| `page-mascot.css` | Optional site theme for the demo. **Not required** by the library itself: every mascot style is inline. |
| `mascots/*.webp` | The 52 characters' sprite sheets, copied from the original repo so you can try any of them locally. |
| `index.html` | The demo — a faithful HTML rebuild of the original site (hero, six styles, cast of 52, guide drawer). |
| `examples/basic.html` | Smallest possible usage: one element + one call. |
| `examples/declarative.html` | Data-attribute usage: tag shells, call `autoInit()`. |

## Quick start

Drop the library and the two fox sheets onto a page:

```html
<div id="mascot"></div>
<script src="page-mascot.js"></script>
<script>
  PageMascot.createMascot(document.getElementById('mascot'), {
    directions: 'mascots/fox-directions.webp',
    reactions:  'mascots/fox-reactions.webp',
    size: 140,
    label: 'fox'
  });
</script>
```

That's it. Move your mouse, the fox looks at it; click, the fox blinks; click
four times quickly, the fox gets dizzy.

## Declarative usage

Tag shells with `data-mascot*` attributes, then call `autoInit()` once. Useful
when mascots are scattered across a static page and you don't want to manage
IDs.

```html
<span
  data-mascot
  data-mascot-directions="mascots/fox-directions.webp"
  data-mascot-reactions="mascots/fox-reactions.webp"
  data-mascot-size="140"
  data-mascot-label="fox"
></span>

<script src="page-mascot.js"></script>
<script>PageMascot.autoInit();</script>
```

## API

### `PageMascot.createMascot(host, options) → Mascot`

Mounts a mascot into `host` (a DOM element). Returns an instance you can later
`.destroy()`.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `directions` | `string` | — required | Path/URL to the 3×3 directions sheet. |
| `reactions`  | `string` | — required | Path/URL to the 3×3 reactions sheet. |
| `size`       | `number` | `140` | Square size in px. |
| `label`      | `string` | `'mascot'` | What a screen reader calls it. The button's aria-label becomes `Boop the {label}`. |
| `className`  | `string` | `''` | Optional class on the root `<button>`. |

### `PageMascot.autoInit({ root }) → Mascot[]`

Scans `root` (defaults to `document`) for `[data-mascot]` elements and turns
each into a mascot. Each element's instance is stored on
`element._pageMascot` so a repeat scan is a no-op.

Supported data-attributes: `data-mascot-directions`,
`data-mascot-reactions`, `data-mascot-size`, `data-mascot-label`,
`data-mascot-class`.

### `Mascot#destroy()`

Unbinds listeners, cancels timers, removes the DOM. Call this in SPA teardown
or before re-mounting into the same host.

### Exports

`PageMascot.DIRECTIONS`, `PageMascot.REACTIONS`, `PageMascot.CLOCKWISE` — the
cell orders, in case you want to draw your own sheets or write a verifier.

## Sprite-sheet contract

Two 3×3 PNG/WebP/anything-the-browser-renders sheets, transparent
background, all nine cells drawn on one canvas with consistent shoulder
lines so the body does not jump between sheets.

### Directions sheet (3×3, by row)

| | col 0 | col 1 | col 2 |
| --- | --- | --- | --- |
| row 0 | up-left | up | up-right |
| row 1 | left | center | right |
| row 2 | down-left | down | down-right |

### Reactions sheet (3×3, by row)

| | col 0 | col 1 | col 2 |
| --- | --- | --- | --- |
| row 0 | blink | heart | sparkle |
| row 1 | surprised | wink | bashful |
| row 2 | sleepy | dizzy | delighted |

The library maps a cell index to `background-position` using
`background-size: 300% 300%`, so each step is a clean `0%`/`50%`/`100%` on
both axes. No fixed cell width is assumed — change `size` freely.

## Drawing your own

The original repo ships a [skill](https://github.com/nilbuild/page-mascot/tree/main/skills/page-mascot)
that draws nine directions and nine expressions, builds them into two
aligned sheets, checks the character does not jump between them, and writes
the two files. The vanilla library is sheet-format compatible: any pair of
sheets drawn by the skill will work here unchanged.

If you draw sheets by hand, the short version of the same rules:

- The body is one drawing. The head moves on top of it. Don't redraw the
  body in profile when the head turns.
- Shoulders at ~⅔ the head width. The head must dominate.
- Nothing may touch a cell edge — hearts, sparkles, big ears, wide hats, all
  need clear space inside the cell.
- Tie back long hair. Loose hair is the single most common failure.
- Transparent PNG/WebP with a real alpha channel. Painted checkerboards
  cannot be keyed out afterwards.

See the original repo's [`reference/design-rules.md`](https://github.com/nilbuild/page-mascot/blob/main/skills/page-mascot/reference/design-rules.md)
for the full, hard-won rationale.

## Differences from the React original

- React `useState` → plain fields, repainted through `applyStyles`.
- React `useEffect` cleanup → `destroy()` and an internal listener registry.
- React inline `style={{…}}` objects → `applyStyles(el, obj)` helper that
  writes `el.style[k] = v`.
- The squash keyframes are the same array of objects passed to
  `Element.prototype.animate` (Web Animations API).
- An extra `autoInit()` and `[data-mascot]` declarative bootstrap, since the
  vanilla world has no JSX.
- One extra `resize` listener (cheap, passive) so a moving button — e.g.
  inside a layout that reflows — re-aims correctly.

The behaviour, the timings, the dead-zone radius (70 px), the hysteresis
(0.12 rad), the squash keyframes, the dizzy threshold (4 within 1.6 s), the
reaction timings (120 ms payoff, 560 ms end, 1100 ms dizzy end) — all
identical to `src/mascot.tsx`.

## License

MIT. The library code in this folder is a port; the original component and
the sprite sheets are © Kamran Ahmed and released under the same MIT
license — see `LICENSE` for the full text.
