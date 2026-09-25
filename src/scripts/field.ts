// Hero background: a black dot grid drifting in a slow wave that scatters from the pointer
// and re-forms, plus a few solid bars of varied size that blink and glide one grid step at a
// time. Dots and bars draw on separate canvases so the bars can sit behind the robot.
// Canvas 2D, drawn only while the hero is on screen; a single static frame for reduced motion.

type Bar = {
  cx: number; cy: number;       // grid cell (current)
  tx: number; ty: number;       // grid cell (target, while gliding)
  vertical: boolean;
  violet: boolean;
  len: number;                   // length as a fraction of a cell
  thick: number;                 // thickness in px
  phase: 'idle' | 'blink' | 'glide';
  t: number;                     // time in current phase (s)
  wait: number;                  // idle duration before the next move
};

const COLORS = {
  dot: [11, 7, 18] as const,
  dotHot: [176, 38, 255] as const,
  bar: '#0b0712',
  barViolet: '#b026ff',
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export function initField(canvas: HTMLCanvasElement, barsCanvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  const bctx = barsCanvas.getContext('2d');
  if (!ctx || !bctx) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, cell = 40, cols = 0, rows = 0;
  // seed: per-dot twist so a scatter looks broken up rather than a clean ring
  let dots: { x: number; y: number; ox: number; oy: number; heat: number; seed: number }[] = [];
  let clock = 0;
  let bars: Bar[] = [];
  const pointer = { x: -9999, y: -9999, active: false };

  // Bars pass behind the robot, but keep them out of the header strip and the name/text band
  // (which sits under a soft page-coloured shadow); dots still cover everything.
  const busy = (cx: number, cy: number) => {
    const y = cy / rows;
    // below 861px the orbit nav sits in a band above the robot (~220px); keep that clear too
    const navBand = W < 861 ? Math.ceil(230 / cell) : 2;
    return y > 0.6 || cy < navBand;
  };
  const freeCell = (): [number, number] => {
    for (let i = 0; i < 60; i++) {
      const cx = Math.floor(rand(1, cols - 1)), cy = Math.floor(rand(1, rows - 1));
      if (!busy(cx, cy)) return [cx, cy];
    }
    return [1, 1];
  };

  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    for (const [c, x] of [[canvas, ctx], [barsCanvas, bctx]] as const) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      x!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    cell = W < 700 ? 30 : 40;
    cols = Math.ceil(W / cell); rows = Math.ceil(H / cell);

    dots = [];
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) dots.push({ x: x * cell, y: y * cell, ox: 0, oy: 0, heat: 0, seed: Math.random() * 2 - 1 });

    const count = Math.round((cols * rows) / (W < 700 ? 110 : 85));
    bars = Array.from({ length: count }, () => {
      const [cx, cy] = freeCell();
      return {
        cx, cy, tx: cx, ty: cy, vertical: Math.random() < 0.35, violet: Math.random() < 0.45,
        len: pick([0.25, 0.4, 0.6, 0.9, 1.3]), thick: pick([2, 3, 4, 6]),
        phase: 'idle' as const, t: 0, wait: rand(0.5, 5),
      };
    });
  }

  function stepBars(dt: number) {
    for (const b of bars) {
      b.t += dt;
      if (b.phase === 'idle' && b.t > b.wait) { b.phase = 'blink'; b.t = 0; }
      else if (b.phase === 'blink' && b.t > 0.6) {
        // glide one step along the grid, in the bar's own direction, to a free cell
        const opts = (b.vertical ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]])
          .map(([dx, dy]) => [b.cx + dx, b.cy + dy])
          .filter(([x, y]) => x > 0 && y > 0 && x < cols - 1 && y < rows - 1 && !busy(x, y));
        if (opts.length) { [b.tx, b.ty] = pick(opts); b.phase = 'glide'; } else { b.phase = 'idle'; b.wait = rand(1, 4); }
        b.t = 0;
      } else if (b.phase === 'glide' && b.t > 0.7) {
        b.cx = b.tx; b.cy = b.ty; b.phase = 'idle'; b.t = 0; b.wait = rand(1.5, 6);
      }
    }
  }

  function draw() {
    ctx!.clearRect(0, 0, W, H);
    bctx!.clearRect(0, 0, W, H);

    // dots: a slow swirling wave keeps the grid alive; the pointer scatters them (fast out,
    // slow back) so the pattern visibly breaks up and re-forms, warming to violet near it
    const R = W < 700 ? 100 : 160;
    const amp = reduce ? 0 : Math.min(cell * 0.12, 5);
    for (const d of dots) {
      const a = Math.sin(d.x * 0.006 + clock * 0.6) + Math.cos(d.y * 0.007 - clock * 0.45);
      const wx = Math.cos(a * 1.6) * amp, wy = Math.sin(a * 1.6) * amp;
      const px = d.x + wx, py = d.y + wy;
      let tx = 0, ty = 0, heat = 0;
      if (pointer.active) {
        const dx = px - pointer.x, dy = py - pointer.y, dist = Math.hypot(dx, dy);
        if (dist < R && dist > 0.01) {
          const f = 1 - dist / R;
          const ang = Math.atan2(dy, dx) + d.seed * 0.9;
          const push = f * f * 30 * (0.7 + Math.abs(d.seed) * 0.6);
          tx = Math.cos(ang) * push; ty = Math.sin(ang) * push; heat = f;
        }
      }
      const out = Math.hypot(tx, ty) > Math.hypot(d.ox, d.oy);
      const k = out ? 0.28 : 0.045;
      d.ox += (tx - d.ox) * k; d.oy += (ty - d.oy) * k; d.heat += (heat - d.heat) * (out ? 0.25 : 0.06);
      const c = COLORS.dot.map((v, i) => Math.round(v + (COLORS.dotHot[i] - v) * d.heat));
      ctx!.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.55 + d.heat * 0.45})`;
      ctx!.beginPath();
      ctx!.arc(px + d.ox, py + d.oy, 1.1 + d.heat * 1.6, 0, Math.PI * 2);
      ctx!.fill();
    }

    // bars: blink (on/off) in place, then glide one cell
    for (const b of bars) {
      let x = b.cx, y = b.cy, alpha = 1;
      if (b.phase === 'blink') alpha = Math.floor(b.t / 0.15) % 2 ? 0 : 1;
      if (b.phase === 'glide') { const k = ease(Math.min(b.t / 0.7, 1)); x += (b.tx - b.cx) * k; y += (b.ty - b.cy) * k; }
      const long = cell * b.len, thin = b.thick;
      const w = b.vertical ? thin : long, h = b.vertical ? long : thin;
      if (!alpha) continue;
      bctx!.fillStyle = b.violet ? COLORS.barViolet : COLORS.bar;
      bctx!.fillRect(x * cell - w / 2, y * cell - h / 2, w, h);
    }
  }

  let last = 0, visible = false, running = false;
  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    clock += dt;
    stepBars(dt);
    draw();
    if (visible) requestAnimationFrame(frame); else running = false;
  }
  function start() {
    if (reduce) { draw(); return; }
    if (running) return;
    running = true; last = performance.now(); requestAnimationFrame(frame);
  }

  layout();
  draw();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }).observe(canvas);
  new ResizeObserver(() => { layout(); if (reduce || !running) draw(); }).observe(canvas);

  if (!reduce) {
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.active = true;
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', move, { passive: true });
    document.addEventListener('pointerleave', () => { pointer.active = false; });
    window.addEventListener('blur', () => { pointer.active = false; });
  }
}
