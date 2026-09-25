// Tech sphere: items sit on a Fibonacci sphere that spins slowly, leans toward the pointer,
// and can be dragged/flicked (with momentum). Positions are CSS transforms on the <li>s.
export function initSphere(stage: HTMLElement) {
  const items = Array.from(stage.querySelectorAll<HTMLElement>('[data-tech]'));
  const n = items.length;
  if (!n) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Even spread over the unit sphere
  const pts = items.map((_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const th = Math.PI * (3 - Math.sqrt(5)) * i;
    return { x: Math.cos(th) * r, y, z: Math.sin(th) * r };
  });

  let R = 0;
  const size = () => { R = Math.min(stage.clientWidth, stage.clientHeight) * 0.42; };

  let yaw = 0, pitch = -0.25;            // current orientation
  let vYaw = reduce ? 0 : 0.22, vPitch = 0; // angular velocity (rad/s)
  const BASE = reduce ? 0 : 0.22;          // idle spin it settles back to
  let hovering = false, dragging = false;
  let lean = { x: 0, y: 0 };               // pointer offset from centre, -1..1

  function place() {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const x1 = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy;   // yaw (around Y)
      const y2 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp;      // pitch (around X)
      const depth = (z2 + 1) / 2;                                   // 0 back .. 1 front
      const el = items[i];
      el.style.transform = `translate(-50%, -50%) translate3d(${(x1 * R).toFixed(1)}px, ${(y2 * R).toFixed(1)}px, 0) scale(${(0.55 + depth * 0.6).toFixed(3)})`;
      el.style.opacity = (0.25 + depth * 0.75).toFixed(3);
      el.style.zIndex = String(Math.round(depth * 100));
      el.style.filter = depth < 0.35 ? `blur(${((0.35 - depth) * 4).toFixed(2)}px)` : '';
    }
  }

  let last = performance.now(), visible = true;
  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!dragging) {
      // lean toward the pointer while it's over the stage; ease back to the idle spin otherwise
      const tY = hovering ? BASE + lean.x * 0.9 : BASE;
      const tP = hovering ? lean.y * 0.6 : 0;
      vYaw += (tY - vYaw) * Math.min(1, dt * 1.6);
      vPitch += (tP - vPitch) * Math.min(1, dt * 1.6);
    }
    yaw += vYaw * dt;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + vPitch * dt));
    place();
    if (visible) requestAnimationFrame(frame);
  }

  // pointer: lean, drag to spin, flick for momentum, click for a kick
  let px = 0, py = 0, pt = 0, moved = 0;
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    lean = { x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * -2 };
    hovering = true;
    if (!dragging) return;
    const now = performance.now(), dts = Math.max((now - pt) / 1000, 0.008);
    const dx = e.clientX - px, dy = e.clientY - py;
    moved += Math.abs(dx) + Math.abs(dy);
    yaw += dx / R; pitch = Math.max(-1.2, Math.min(1.2, pitch - dy / R));
    vYaw = (dx / R) / dts; vPitch = (-dy / R) / dts;
    px = e.clientX; py = e.clientY; pt = now;
  });
  stage.addEventListener('pointerleave', () => { hovering = false; });
  stage.addEventListener('pointerdown', (e) => {
    dragging = true; moved = 0; px = e.clientX; py = e.clientY; pt = performance.now();
    stage.setPointerCapture(e.pointerId);
  });
  const end = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (moved < 4) {
      // a click: kick the sphere away from where it was clicked
      const r = stage.getBoundingClientRect();
      vYaw += ((e.clientX - r.left) / r.width - 0.5) * -6;
      vPitch += ((e.clientY - r.top) / r.height - 0.5) * 4;
    }
    vYaw = Math.max(-6, Math.min(6, vYaw)); vPitch = Math.max(-4, Math.min(4, vPitch));
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  size(); place();
  new ResizeObserver(() => { size(); place(); }).observe(stage);
  new IntersectionObserver(([en]) => {
    const was = visible; visible = en.isIntersecting;
    if (visible && !was) { last = performance.now(); requestAnimationFrame(frame); }
  }).observe(stage);
  requestAnimationFrame(frame);
}
