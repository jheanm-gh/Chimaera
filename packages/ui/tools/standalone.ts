/**
 * Fold the built app into one self-contained HTML file.
 *
 * Vite emits four files that fetch each other by name. Some places you would
 * want to put a game accept exactly one: a page pasted into a sandboxed host, a
 * file on a USB stick, an email attachment. This produces that file — no
 * network, no sibling assets, no server.
 *
 * The one thing that could not simply be inlined is the expedition worker,
 * because a worker is fetched by URL rather than imported. It is built as a
 * closed IIFE with no imports, which means it can be handed to a classic
 * `Worker` as a blob and needs no module support at the far end.
 *
 * Run with `npm run build:standalone`, which builds first.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "../dist");
const OUT = resolve(HERE, "../../../out/verdance.html");

/**
 * A host that will not let an anchor download, doing it for us.
 *
 * `src/download.ts` looks for `window.__verdanceSaveFile` before falling back
 * to the anchor, so this stays out of the game entirely: the bridge is the
 * host's business, and the game only knows there might be one.
 *
 * Claude's artifact viewer is the host this build targets, and it mediates
 * saves through a `downloads` capability the page has to ask for. Anywhere
 * else — a local file, a static server — `window.claude` is absent, the bridge
 * is never installed, and the anchor does the job as usual.
 */
const DOWNLOAD_BRIDGE = `
(function () {
  if (!window.claude || typeof window.claude.use !== "function") return;

  function notify(message) {
    var el = document.createElement("div");
    el.textContent = message;
    el.setAttribute("role", "status");
    el.style.cssText =
      "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;" +
      "background:#2d3129;color:#dcded4;border:1px solid rgba(220,222,212,0.18);" +
      "padding:10px 16px;border-radius:3px;font:14px Spectral,Georgia,serif;" +
      "box-shadow:0 6px 24px rgba(0,0,0,0.35);max-width:min(90vw,44ch);text-align:center";
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 6000);
  }

  window.__verdanceSaveFile = function (filename, blob) {
    return window.claude
      .use("downloads")
      .then(function (downloads) {
        if (!downloads) throw { code: "unavailable" };
        return downloads.save({ filename: filename, data: blob });
      })
      .catch(function (error) {
        var code = (error && error.code) || "unavailable";
        // A viewer declining is an answer, not a fault, and asking again would
        // be nagging. Everything else is worth saying out loud, because a
        // button that silently does nothing is the thing this exists to avoid.
        if (code === "declined" || code === "rate_limited") return;
        notify("This copy of Verdance cannot save files. Your ranch is still stored in this browser.");
      });
  };
})();
`;

function assetNamed(assets: readonly string[], describe: string, match: (file: string) => boolean): string {
  const found = assets.filter(match);
  if (found.length !== 1) {
    throw new Error(`expected exactly one ${describe} in dist/assets, found ${found.length}: ${found.join(", ")}`);
  }
  return found[0] as string;
}

/**
 * Every worker chunk, keyed by the filename the app refers to it by.
 *
 * There is more than one now — the evaluator and the sprite renderer — and the
 * first version of this tool assumed a single worker and failed loudly the day
 * a second arrived. That is the failure working: an inlined bundle missing a
 * worker would have been a page whose creatures never appeared.
 */
function workerChunks(assets: readonly string[]): readonly string[] {
  return assets.filter((f) => f.endsWith(".js") && f.includes("worker"));
}

/**
 * The extent of a `new Worker(...)` call that mentions `needle`.
 *
 * Walks from the opening parenthesis counting depth, so however many `new URL`
 * layers the bundler wrapped the reference in, the whole expression comes back.
 */
function balancedCall(source: string, opener: string, needle: string): { start: number; end: number } | undefined {
  let from = 0;
  for (;;) {
    const start = source.indexOf(opener, from);
    if (start < 0) return undefined;
    let depth = 0;
    for (let i = start + opener.length - 1; i < source.length; i++) {
      const char = source[i];
      if (char === "(") depth++;
      else if (char === ")") {
        depth--;
        if (depth === 0) {
          const end = i + 1;
          if (source.slice(start, end).includes(needle)) return { start, end };
          break;
        }
      }
    }
    from = start + opener.length;
  }
}

/** `</` would close the script element early; it is invisible inside a string. */
function jsLiteral(source: string): string {
  return JSON.stringify(source).replace(/<\//g, "<\\/");
}

function build(): void {
  const assets = readdirSync(join(DIST, "assets"));
  const cssFile = assetNamed(assets, "stylesheet", (f) => f.endsWith(".css"));
  const workerFiles = workerChunks(assets);
  const appFile = assetNamed(assets, "app bundle", (f) => f.endsWith(".js") && !f.includes("worker"));
  if (workerFiles.length === 0) throw new Error("no worker chunk in dist/assets — the build shape changed");

  const css = readFileSync(join(DIST, "assets", cssFile), "utf8");
  const workers = workerFiles.map((file) => ({ file, source: readFileSync(join(DIST, "assets", file), "utf8") }));
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  let app = readFileSync(join(DIST, "assets", appFile), "utf8");

  // Vite compiles `new Worker(new URL(...), {type:"module"})` into a reference
  // to a sibling file, nested a few levels deep. Point each at a blob of the
  // source we are about to inline. Scanned rather than matched: balancing
  // parentheses is not a job for a regular expression.
  for (const { file } of workers) {
    const call = balancedCall(app, "new Worker(", file);
    if (!call) {
      throw new Error(`could not find the construction for ${file} — the bundle shape changed, so this tool needs revisiting`);
    }
    app = app.slice(0, call.start) + `new Worker(window.__verdanceWorkerUrl(${JSON.stringify(file)}))` + app.slice(call.end);
  }
  if (/import\.meta\.url/.test(app)) {
    throw new Error("an import.meta.url survived inlining — something still wants a sibling file");
  }

  // Google Fonts is the one thing left on the network, and the stack falls back
  // to system serifs without it, so an offline copy still reads correctly.
  const fontLinks = html.match(/<link[^>]*fonts\.(?:googleapis|gstatic)[^>]*>/g) ?? [];

  const page = [
    "<title>Verdance</title>",
    ...fontLinks,
    `<style>\n${css}\n</style>`,
    '<div id="root"></div>',
    `<script>${DOWNLOAD_BRIDGE}<\/script>`,
    "<script>",
    "// The workers, inlined. Each is a standalone IIFE, so they run as classic",
    "// workers and ask nothing of the viewer's module support.",
    "window.__verdanceWorkerSource = {",
    ...workers.map(({ file, source }) => `  ${JSON.stringify(file)}: ${jsLiteral(source)},`),
    "};",
    "window.__verdanceWorkerUrl = function (name) {",
    "  var source = window.__verdanceWorkerSource[name];",
    "  if (!source) throw new Error('no inlined worker named ' + name);",
    "  return URL.createObjectURL(new Blob([source], { type: \"text/javascript\" }));",
    "};",
    "<\/script>",
    `<script type="module">\n${app}\n<\/script>`,
    "",
  ].join("\n");

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, page);
  const kb = (value: string): string => `${Math.round(value.length / 1024)} KB`;
  console.log(`Wrote ${OUT} (${kb(page)})`);
  console.log(
    `  app ${kb(app)} · styles ${kb(css)} · ${fontLinks.length} font link(s) · ` +
      `${workers.length} worker(s): ${workers.map(({ file, source }) => `${file.split("-")[0]} ${kb(source)}`).join(", ")}`,
  );
}

build();
