# Bible Strong Logo Avatar

An open-source, procedural SVG mascot by [GCGittiwilo](https://github.com/GCGittiwilo), built from the Bible Strong logo for use in AI chat and voice interfaces. The logo transitions between its intact brand mark and a forward-facing expressive character while the surrounding frame animates independently in 3D-inspired motion.

## Open it without commands

Download [`DOUBLE-CLICK TO OPEN - LOGO AVATAR.html`](./standalone/DOUBLE-CLICK%20TO%20OPEN%20-%20LOGO%20AVATAR.html), then double-click the downloaded file. It is a self-contained build with the interface, avatar, expressions, and animations bundled into one HTML file.

## Chatbot animation set

The animation library is organized around a real-time chat pipeline:

1. **Ready** — calm neutral availability.
2. **Listening** — attentive eyes with a compact ear indicator.
3. **Transcribing** — focused movement with a captions indicator.
4. **Thinking** — an animated thought bubble attached above the moving frame.
5. **Searching** — scanning expressions with a magnifying-glass indicator.
6. **Working** — concentrated expressions with a wrench indicator.
7. **Speaking** — lively response motion with an audio-waveform indicator.
8. **Complete** — positive confirmation with a green checkmark.
9. **Error** — a clear red warning indicator.

**Loading** is kept in its own category. It uses the intact Bible Strong logo instead of the face and rotates the logo frame through a smooth 360-degree loading loop.

## Highlights

- One dedicated Bible Strong mascot with no unrelated avatars.
- Logo-to-face morphing with the original outer mark retraced as procedural geometry.
- Forward-locked face while the surrounding frame tilts and rotates.
- Centered expressive eyes that remain continuous between animation steps.
- Mouthless design suitable for subtle voice playback without lip synchronization.
- Status indicators that follow the animated frame instead of staying screen-fixed.
- Correct face and logo thumbnails for expressions and animations.
- English, French, and Simplified Chinese interface copy.
- Local SVG/PNG snapshots and reusable React or JavaScript exports.
- Browser-local persistence with no account or backend.

## Development

### Requirements

- Node.js 22.12 or newer
- pnpm 10.34

### Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

### Validate and build

```bash
pnpm check
```

This regenerates the standalone rendering engine, checks formatting and TypeScript, runs the test suite, creates the production build in `dist/`, and refreshes the ready-to-open file in `standalone/`.

| Command          | Purpose                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `pnpm dev`       | Regenerate the engine and start the Vite development server.         |
| `pnpm typecheck` | Run TypeScript in strict no-emit mode.                               |
| `pnpm test`      | Run the Vitest suite once.                                           |
| `pnpm engine`    | Regenerate the committed standalone engine.                          |
| `pnpm build`     | Build the production application.                                    |
| `pnpm check`     | Run engine, formatting, type, test, and production-build validation. |

## Architecture

- **React 19** coordinates the editor UI and durable state.
- **TypeScript** provides the domain and rendering model.
- **Motion** owns high-frequency animation values.
- **SVG** renders the procedural geometry.
- **Vite** builds the browser application.
- **Vitest** covers geometry, playback, persistence, rendering, and export behavior.

The geometry and playback engines remain independent from React. Durable document state is stored separately from high-frequency render values, and generated export packages do not depend on the Studio interface.

## Repository map

| Path                                     | Responsibility                                                    |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `standalone/`                            | Ready-to-open self-contained HTML build.                          |
| `src/features/avatar/`                   | Mascot identity, geometry, expressions, and status indicators.    |
| `src/features/animation/`                | Chat-pipeline animations and framework-independent playback.      |
| `src/features/rendering/`                | SVG scene and high-frequency rendering.                           |
| `src/features/export/`                   | React, JavaScript, snapshot, and standalone export logic.         |
| `src/features/studio/`                   | Studio controller, UI composition, persistence, and bundled data. |
| `src/i18n/`                              | English, French, and Simplified Chinese copy.                     |
| `scripts/generate-standalone-engine.mjs` | Standalone-engine generator.                                      |

## Project ownership

This logo-avatar edition is created and maintained by [GCGittiwilo](https://github.com/GCGittiwilo). It contains substantial mascot-specific work including the Bible Strong logo geometry, face-locking behavior, chatbot state library, logo-only loading mode, attached status indicators, mouthless presentation, and standalone double-click distribution. Minimal provenance required by the inherited open-source license is recorded in [`NOTICE`](./NOTICE).

## License

Copyright © 2026 GCGittiwilo. Licensed under the [GNU Affero General Public License v3.0](./LICENSE). If you modify or distribute this project—or provide a modified version over a network—you must make the corresponding source available under the same license and preserve the required notices. See `LICENSE` for the authoritative terms.
