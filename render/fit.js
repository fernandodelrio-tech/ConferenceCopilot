// Aspect fit — plan §3.5.
//
// One content set, three very different screens:
//   iPad Pro M4    ~4:3     box fits by width,  surplus height is backdrop
//   iPhone 16      ~19.5:9  box fits by height, surplus width is backdrop
//   Steam Deck OLED 16:10   exact fit
//
// The 16:10 reference box is fitted with `contain`, never `cover`. That is the
// whole rule: no gameplay geometry may ever leave the box, so the visible playfield
// is identical on all three and difficulty cannot drift between devices. Everything
// outside the box is chrome, and chrome is where the steampunk detail budget goes
// (§3.4 restraint rule).

export function computeFit(viewW, viewH, box, safe = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const availW = Math.max(1, viewW - safe.left - safe.right);
  const availH = Math.max(1, viewH - safe.top - safe.bottom);

  const scale = Math.min(availW / box[0], availH / box[1]);
  const w = box[0] * scale;
  const h = box[1] * scale;

  return {
    scale,
    x: safe.left + (availW - w) / 2,
    y: safe.top + (availH - h) / 2,
    w,
    h,
    viewW,
    viewH,
    // Surplus on each axis — the chrome budget.
    slackX: availW - w,
    slackY: availH - h,
    aspect: viewW / viewH,
  };
}

export const toScreen = (fit, x, y) => ({ x: fit.x + x * fit.scale, y: fit.y + y * fit.scale });

export const toBox = (fit, sx, sy) => ({ x: (sx - fit.x) / fit.scale, y: (sy - fit.y) / fit.scale });
