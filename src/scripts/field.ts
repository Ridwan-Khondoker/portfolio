// Hero background: a dot grid that reacts to the pointer, and small bars that blink and
// glide one grid step at a time.
// Canvas 2D, drawn only while the hero is on screen; a single static frame for reduced motion.

type Bar = {
  cx: number; cy: number;       // grid cell (current)
  tx: number; ty: number;       // grid cell (target, while gliding)
  vertical: boolean;
  violet: boolean;
  phase: 'idle' | 'blink' | 'glide';
  t: number;                     // time in current phase (s)
  wait: number;                  // idle duration before the next move
};

const COLORS = {
  dot: [207, 198, 220] as const,
  dotHot: [176, 38, 255] as const,
  bar: 'rgba(170, 156, 196, .55)',
  barViolet: 'rgba(176, 38, 255, .55)',
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export function initField(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, cell = 40, cols = 0, rows = 0;
  let dots: { x: number; y: number; ox: number; oy: number; heat: number }[] = [];
  let bars: Bar[] = [];
  const pointer = { x: -9999, y: -9999, active: false };

  // Keep the robot column, the header strip and the name/text band (which sits under a soft
  // page-coloured shadow) free of bars; dots still cover everything.
  const busy = (cx: number, cy: number) => {
    const x = cx / cols, y = cy / rows;
    // below 861px the orbit nav sits in a band above the robot (~220px); keep that clear too
    const navBand = W < 861 ? Math.ceil(230 / cell) : 2;
    return (x > 0.34 && x < 0.66) || y > 0.6 || cy < navBand;
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
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = W < 700 ? 30 : 40;
    cols = Math.ceil(W / cell); rows = Math.ceil(H / cell);

    dots = [];
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) dots.push({ x: x * cell, y: y * cell, ox: 0, oy: 0, heat: 0 });

    const count = Math.round((cols * rows) / (W < 700 ? 40 : 28));
    bars = Array.from({ length: count }, () => {
      const [cx, cy] = freeCell();
      return { cx, cy, tx: cx, ty: cy, vertical: Math.random() < 0.35, violet: Math.random() < 0.22, phase: 'idle' as const, t: 0, wait: rand(0.5, 5) };
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

    // dots: pushed away from the pointer, warming to violet near it
    const R = W < 700 ? 90 : 140;
    for (const d of dots) {
      let tx = 0, ty = 0, heat = 0;
      if (pointer.active) {
        const dx = d.x - pointer.x, dy = d.y - pointer.y, dist = Math.hypot(dx, dy);
        if (dist < R && dist > 0.01) {
          const f = 1 - dist / R;
          tx = (dx / dist) * f * 14; ty = (dy / dist) * f * 14; heat = f;
        }
      }
      d.ox += (tx - d.ox) * 0.15; d.oy += (ty - d.oy) * 0.15; d.heat += (heat - d.heat) * 0.15;
      const c = COLORS.dot.map((v, i) => Math.round(v + (COLORS.dotHot[i] - v) * d.heat));
      ctx!.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx!.beginPath();
      ctx!.arc(d.x + d.ox, d.y + d.oy, 1.2 + d.heat * 1.6, 0, Math.PI * 2);
      ctx!.fill();
    }

    // bars: blink (on/off) in place, then glide one cell
    for (const b of bars) {
      let x = b.cx, y = b.cy, alpha = 1;
      if (b.phase === 'blink') alpha = Math.floor(b.t / 0.15) % 2 ? 0.15 : 1;
      if (b.phase === 'glide') { const k = ease(Math.min(b.t / 0.7, 1)); x += (b.tx - b.cx) * k; y += (b.ty - b.cy) * k; }
      const long = cell * 0.62, thin = Math.max(3, cell * 0.14);
      const w = b.vertical ? thin : long, h = b.vertical ? long : thin;
      ctx!.globalAlpha = alpha;
      ctx!.fillStyle = b.violet ? COLORS.barViolet : COLORS.bar;
      ctx!.fillRect(x * cell - w / 2, y * cell - h / 2, w, h);
    }
    ctx!.globalAlpha = 1;
  }

  let last = 0, visible = false, running = false;
  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
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
