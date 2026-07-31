// Baked-asset loader.
//
// Assets are authored by art/bakers.js and baked to PNG by tools/bake.mjs. The game
// only ever blits them — no runtime procedural shading, because per-pixel work in
// the frame loop is exactly what the iPhone 16 thermal budget (§9) cannot afford.

let manifest = null;
const images = new Map();

// The single-file offline build (tools/bundle.mjs) predefines
// globalThis.__ASCENDANT_ASSETS as { manifest, images: { name -> data URI } }.
// Data URIs are same-origin, so unlike file:// image loads they never taint a
// canvas — which matters because the bloom pass reads back from one.
export async function loadAssets(basePath = '') {
  const inline = globalThis.__ASCENDANT_ASSETS;
  manifest = inline ? inline.manifest : await fetch(`${basePath}assets/manifest.json`).then((r) => r.json());
  const names = Object.keys(manifest.assets);

  await Promise.all(
    names.map(
      (name) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            images.set(name, img);
            resolve();
          };
          img.onerror = () => reject(new Error(`asset failed to load: ${name}`));
          img.src = inline ? inline.images[name] : `${basePath}${manifest.assets[name].file}`;
        }),
    ),
  );

  return { manifest, count: names.length };
}

export const asset = (name) => images.get(name) || null;
export const assetMeta = (name) => (manifest ? manifest.assets[name] : null);
export const totalBytes = () =>
  manifest ? Object.values(manifest.assets).reduce((n, a) => n + a.bytes, 0) : 0;

const CHAPTER_KEYS = [
  'boiler-deck',
  'clockworks',
  'pneumatic-exchange',
  'aether-observatory',
  'airship-yards',
  'spire-foundry',
];

export const backdropFor = (chapter) => asset(`backdrop-${CHAPTER_KEYS[(chapter - 1) % CHAPTER_KEYS.length]}`);
export const ballFor = (glyph) => asset(`ball-${glyph}`);
export const powerupFor = (kind) => asset(`powerup-${kind}`);
