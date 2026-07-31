// Pre-composited static level layer.
//
// The backdrop, the track bed, its sleepers, rivets, ambient occlusion and the
// gate/intake housings never change during a level, so they are composited ONCE
// into an offscreen canvas and blitted each frame.
//
// This is both a quality and a performance decision. Quality, because compositing
// offline allows expensive multi-pass work — occlusion under the rails, a textured
// plate clipped to the track, per-sleeper rotation — that would be far too slow per
// frame. Performance, because it replaces a dozen full-path strokes per frame with
// one drawImage, which is what buys the headroom §9 demands on the Deck and the
// thermal margin on the iPhone.

import { pointAt, tangentAt } from '../sim/lane.js';
import { asset, backdropFor } from './assets.js';

const SLEEPER_SPACING = 62;
const RIVET_SPACING = 108;

export function buildStaticLayer(game, pixelScale = 1.5) {
  const box = game.level.box;
  const W = Math.round(box[0] * pixelScale);
  const H = Math.round(box[1] * pixelScale);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.scale(pixelScale, pixelScale);

  drawBackdrop(ctx, game, box);
  drawTrack(ctx, game);
  drawFurniture(ctx, game);

  return { canvas, pixelScale, w: box[0], h: box[1] };
}

function drawBackdrop(ctx, game, box) {
  const bd = backdropFor(game.level.chapter);
  ctx.fillStyle = '#0b0d0f';
  ctx.fillRect(0, 0, box[0], box[1]);
  if (bd) {
    // Baked with 10% overscan; centre it so parallax never exposes an edge.
    const over = 0.05;
    ctx.drawImage(bd, -box[0] * over, -box[1] * over, box[0] * (1 + over * 2), box[1] * (1 + over * 2));
  }
}

function lanePath(lane) {
  const p = new Path2D();
  p.moveTo(lane.points[0][0], lane.points[0][1]);
  for (let i = 1; i < lane.points.length; i++) p.lineTo(lane.points[i][0], lane.points[i][1]);
  return p;
}

function drawTrack(ctx, game) {
  const R = game.T.ballRadius;
  const plate = asset('plate');

  for (let ci = 0; ci < game.level.lanes.length; ci++) {
    const path = lanePath(game.level.lanes[ci]);
    const geom = game.geom[ci];

    // 1. Ambient occlusion: the track is recessed into the floor, so it casts a
    //    soft dark halo. Drawn as progressively tighter dark strokes.
    ctx.save();
    for (const [w, a] of [[R * 4.2, 0.30], [R * 3.6, 0.34], [R * 3.15, 0.40]]) {
      ctx.strokeStyle = `rgba(0,0,0,${a})`;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(path);
    }
    ctx.restore();

    // 2. The bed itself, textured. Clipping a pattern to a stroke needs an
    //    intermediate: stroke the mask, then keep only the pattern inside it.
    if (plate) {
      const bed = document.createElement('canvas');
      bed.width = Math.ceil(game.level.box[0]);
      bed.height = Math.ceil(game.level.box[1]);
      const bctx = bed.getContext('2d');
      bctx.fillStyle = bctx.createPattern(plate, 'repeat');
      bctx.fillRect(0, 0, bed.width, bed.height);
      bctx.globalCompositeOperation = 'destination-in';
      bctx.strokeStyle = '#fff';
      bctx.lineWidth = R * 2.5;
      bctx.lineCap = 'round';
      bctx.lineJoin = 'round';
      bctx.stroke(path);
      ctx.drawImage(bed, 0, 0);
    } else {
      ctx.strokeStyle = '#2b3238';
      ctx.lineWidth = R * 2.5;
      ctx.stroke(path);
    }

    // 3. Inner shadow along the rails so balls feel seated in a channel rather
    //    than pasted on a line.
    //
    //    This MUST be built on its own canvas. Doing the wide-stroke /
    //    destination-out trick directly on the layer erases the backdrop and the
    //    plate along with it, which turned the entire track black.
    const ring = document.createElement('canvas');
    ring.width = Math.ceil(game.level.box[0]);
    ring.height = Math.ceil(game.level.box[1]);
    const rctx = ring.getContext('2d');
    rctx.strokeStyle = 'rgba(0,0,0,0.62)';
    rctx.lineWidth = R * 2.5;
    rctx.lineCap = 'round';
    rctx.lineJoin = 'round';
    rctx.stroke(path);
    rctx.globalCompositeOperation = 'destination-out';
    rctx.strokeStyle = '#000';
    rctx.lineWidth = R * 1.95;
    rctx.stroke(path);
    ctx.drawImage(ring, 0, 0);

    // 4. Sleepers, rotated to the local tangent — but only at the rails.
    //
    //    Art gate G2 caught these: periodic dark bars running directly under the
    //    ball path pushed lane-band luminance variance over the §3.4 ceiling. The
    //    fix is the restraint rule applied at a finer scale — draw the sleepers,
    //    then punch a clean corridor through the middle where balls actually
    //    travel. Detail survives at the edges, the ball path stays quiet.
    const sleeper = asset('sleeper');
    if (sleeper) {
      const ties = document.createElement('canvas');
      ties.width = Math.ceil(game.level.box[0]);
      ties.height = Math.ceil(game.level.box[1]);
      const tctx = ties.getContext('2d');
      for (let s = SLEEPER_SPACING * 0.5; s < geom.length; s += SLEEPER_SPACING) {
        const p = pointAt(geom, s, { x: 0, y: 0 });
        const t = tangentAt(geom, s);
        tctx.save();
        tctx.translate(p.x, p.y);
        tctx.rotate(Math.atan2(t.y, t.x));
        tctx.drawImage(sleeper, -R * 0.30, -R * 1.28, R * 0.60, R * 2.56);
        tctx.restore();
      }
      tctx.globalCompositeOperation = 'destination-out';
      tctx.strokeStyle = '#000';
      // At least one ball diameter plus margin: a narrower corridor left the
      // sleepers running under the outer edge of every ball.
      tctx.lineWidth = R * 2.35;
      tctx.lineCap = 'round';
      tctx.lineJoin = 'round';
      tctx.stroke(path);

      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.drawImage(ties, 0, 0);
      ctx.restore();
    }

    // 5. Brass rail edges with a lit upper lip.
    ctx.strokeStyle = 'rgba(185,138,60,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke(path);
    ctx.save();
    ctx.translate(0, -1.5);
    ctx.strokeStyle = 'rgba(232,200,135,0.30)';
    ctx.lineWidth = 1.5;
    ctx.stroke(path);
    ctx.restore();

    // 6. Rivets along the rails.
    ctx.fillStyle = 'rgba(240,214,158,0.55)';
    for (let s = RIVET_SPACING * 0.5; s < geom.length; s += RIVET_SPACING) {
      const p = pointAt(geom, s, { x: 0, y: 0 });
      const t = tangentAt(geom, s);
      const nx = -t.y;
      const ny = t.x;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(p.x + nx * side * R * 1.16, p.y + ny * side * R * 1.16, 2.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawFurniture(ctx, game) {
  const R = game.T.ballRadius;
  const gate = asset('gate');
  const intake = asset('intake');

  for (let ci = 0; ci < game.geom.length; ci++) {
    const lane = game.geom[ci];

    if (gate) {
      const p = pointAt(lane, 0, { x: 0, y: 0 });
      const size = R * 4.0;
      ctx.drawImage(gate, p.x - size / 2, p.y - size / 2, size, size);
    }

    if (intake) {
      const p = pointAt(lane, lane.length, { x: 0, y: 0 });
      const size = R * 5.2;
      ctx.drawImage(intake, p.x - size / 2, p.y - size / 2, size, size);
    }
  }
}
