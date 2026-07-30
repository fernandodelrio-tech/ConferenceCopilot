// Engraved glyphs — plan §3.4 / §10.
//
// Always on, never a toggle. Colour is never the only channel that distinguishes a
// ball, which is simultaneously the colourblind accommodation and the reason six
// colours stay readable at ~24 physical pixels on a 6.1" phone.
//
// Drawn in local space on a unit circle of radius 1, scaled by the caller.

export function drawGlyph(ctx, kind, r) {
  ctx.lineWidth = Math.max(1.4, r * 0.16);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  switch (kind) {
    case 'spiral': {
      const turns = 1.6;
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const a = t * turns * Math.PI * 2;
        const rr = r * 0.18 + t * r * 0.42;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      break;
    }
    case 'cross':
      ctx.moveTo(-r * 0.52, 0);
      ctx.lineTo(r * 0.52, 0);
      ctx.moveTo(0, -r * 0.52);
      ctx.lineTo(0, r * 0.52);
      break;

    case 'dot-triad': {
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        const x = Math.cos(a) * r * 0.36;
        const y = Math.sin(a) * r * 0.36;
        ctx.moveTo(x + r * 0.15, y);
        ctx.arc(x, y, r * 0.15, 0, Math.PI * 2);
      }
      break;
    }

    case 'chevron':
      ctx.moveTo(-r * 0.45, r * 0.2);
      ctx.lineTo(0, -r * 0.34);
      ctx.lineTo(r * 0.45, r * 0.2);
      break;

    case 'ring':
      ctx.moveTo(r * 0.44, 0);
      ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2);
      break;

    case 'bar':
      ctx.moveTo(-r * 0.5, 0);
      ctx.lineTo(r * 0.5, 0);
      break;

    default:
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  }

  ctx.stroke();
}
