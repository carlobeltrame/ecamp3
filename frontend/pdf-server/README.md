# pdf-server (proof of concept)

Runs the client-side PDF rendering (`frontend/src/pdf`, Vue components rendered through react-pdf)
as a Node.js HTTP service. The PDF code stays written once, in Vue, and the same source renders in
the browser worker and on the server.

## How it works

```
browser                          pdf-server (Node.js)
───────                          ────────────────────
preload data into the store
serialize { config, storeData,   POST /render ──▶ worker pool (worker_threads)
            translationData } ─▶                   └─ dist/entry.js
                                                      ├─ renderPdf.js (same as the browser worker)
                                                      ├─ CampPrint.vue + all pdf components
                                                      └─ @react-pdf/* + pdfkit (Node.js builds)
            ◀── application/pdf ◀──
```

- `entry.js` is the only new code which runs inside the bundle. It reuses
  `createPdfRenderer` from the browser's `renderPdf.js`, registers the fonts and points the emoji
  source to `public/twemoji` on disk.
- `vite.config.js` builds `entry.js` into `dist/entry.js` with Vite's library mode. It uses the same
  Vue plugins as the frontend (`<style lang="react-pdf">` blocks, react-pdf custom elements). Font
  imports become absolute file paths, since `@react-pdf/font` reads files from disk in Node.js.
  `vue`, `@react-pdf/*` and `pdfkit` are left external so Node.js picks their Node.js builds; all
  other dependencies are bundled like in the browser.
- `server.js` is a plain `node:http` server with `POST /render` and `GET /health`. Rendering happens
  in a pool of `worker_threads` (`workerPool.js`, `worker.js`), which mirrors the browser's web worker:
  one render at a time per worker, global state such as the dayjs locale and the font store stays
  isolated, and a crash only takes down one worker. Each render logs a JSON line with per-phase
  timings, similar to the nuxt print service.
- `__tests__/entry.spec.js` renders a fixture camp through `entry.js` in plain Node.js. It needs the
  custom `vitestEnvironment.js`: Vitest's builtin `node` environment transforms modules with Vite's
  `ssr` environment, where the Vue SFC compiler emits `ssrRender` functions which the custom
  react-pdf renderer cannot use, so the environment keeps Node.js globals but uses Vite's `client`
  environment, like the bundle.
- The frontend uses the server when `PDF_SERVER_URL` is set (`VITE_PDF_SERVER_URL`, see
  `.env.development`). Only `generatePdf.js` changed: instead of posting the serialized data to a
  web worker, it posts it to the server. Nothing else in the frontend needs to know.

## Running

In the dev environment the `pdf-server` docker compose service starts automatically and is
reachable through the reverse proxy at `http://localhost:3000/pdf-server/`. It builds the bundle in
watch mode and restarts the worker pool whenever the PDF code changes.

```bash
docker compose logs -f pdf-server
docker compose exec frontend npm run pdf-server:build   # production bundle
docker compose exec frontend npm run pdf-server:start   # serve dist/entry.js, NODE_ENV=production
docker compose exec frontend npm run pdf-server:dev     # build in watch mode and serve
docker compose exec frontend npm run test:pdf-server    # renders a fixture camp in Node.js
```

To render in the browser again, set `VITE_PDF_SERVER_URL=` (empty) in `frontend/.env.local`.

Configuration: `PDF_SERVER_PORT` (default 3006), `PDF_SERVER_WORKERS` (default 2).

A production image can be built with `.docker-hub/pdf-server/Dockerfile`.

## Known limitations of the POC

- The browser still preloads all camp data and uploads the serialized store with every request.
  A full implementation could let the server fetch the data from the API itself using the user's
  cookies, like the nuxt print service does, by running `prepareInMainThread` on the server.
- The progress indicator in the browser only shows a single "rendering on the server" step.
- The patched `@react-pdf/layout` reports layout progress through a global DOM event, which the
  server polyfills with an `EventTarget`. Concurrent renders inside one worker would mix their
  progress events up, which is why each worker renders one PDF at a time.
- No Sentry reporting on the server yet, and no request size limit or timeout.
