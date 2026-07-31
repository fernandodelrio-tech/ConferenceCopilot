// Content loading, indirected so the same source works both served over HTTP and
// baked into the single-file offline build (tools/bundle.mjs).
//
// The offline build defines globalThis.__ASCENDANT_CONTENT as a path -> parsed-JSON
// map before the game starts; everything else is identical.

export function getJson(path) {
  const inline = globalThis.__ASCENDANT_CONTENT;
  if (inline && Object.prototype.hasOwnProperty.call(inline, path)) {
    return Promise.resolve(inline[path]);
  }
  return fetch(path).then((r) => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  });
}
