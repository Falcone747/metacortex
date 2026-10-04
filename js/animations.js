// Premium animations v4 — modern stack:
//   - motion@11 (motion.dev vanilla, spring physics)
//   - animejs@4 (SVG path morphing, value tweening)
//   - GSAP + ScrollTrigger (timeline orchestration, loaded via <script>)
//   - CSS @layer cascade (in premium.css)
//   - View Transitions API

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Dynamic imports (only when needed, no hard fail if CDN blocks)
const loadMotion = async () => {
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/motion@11/+esm');
    return mod.default ?? mod;
  } catch (e) { console.warn('motion failed to load', e); return null; }
};
const loadAnime = async () => {
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/animejs@4.0.2/+esm');
    return mod.default ?? mod;
  } catch (e) { console.warn('anime failed to load', e); return null; }
};

// ============================================================
// 1. PAGE-LEVEL VIEW TRANSITIONS
// ============================================================
export function initViewTransitions() {
  if (!document.startViewTransition || prefersReducedMotion()) return;
  document.querySelectorAll('a[href$=".html"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const url = new URL(a.href);
      if (url.origin === location.origin && url.pathname !== location.pathname) {
        e.preventDefault();
        document.startViewTransition(() => { location.href = a.href; });
      }
    });
  });
}

// ============================================================
// 2. SPRING-PHYSICS REVEALS (Motion)
// ============================================================
export async function initMotionReveals(M) {
  if (!M || prefersReducedMotion()) return;
  const targets = document.querySelectorAll('.card, .arch .layer, .stat-cell, section h2, section .sub');
  targets.forEach((el, i) => {
    if (el.dataset.movReady) return;
    el.dataset.movReady = '1';
    M.animate(el,
      { opacity: [0, 1], y: [40, 0], scale: [0.96, 1] },
      { delay: i * 0.04, duration: 1.1, ease: [0.16, 1, 0.3, 1] }
    );
  });
}

// ============================================================
// 3. HERO STAGGER + SCROLL PARALLAX
// ============================================================
export function initHero(M) {
  if (prefersReducedMotion()) return;
  const heroItems = document.querySelectorAll('.hero .eyebrow, .hero h1, .hero .lead, .hero .ctas, .hero .meta');
  if (M) {
    heroItems.forEach((el, i) => {
      M.animate(el,
        { opacity: [0, 1], y: [30, 0] },
        { delay: 0.15 + i * 0.12, duration: 1.2, ease: [0.16, 1, 0.3, 1] }
      );
    });
  }
  const canvas = document.querySelector('.hero-canvas');
  if (canvas && window.gsap && window.gsap.ScrollTrigger) {
    window.gsap.to(canvas, {
      yPercent: -25, scale: 1.15, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  }
}

// ============================================================
// 4. SCROLL-LINKED PARALLAX (Motion scroll)
// ============================================================
export async function initScrollLinked(M) {
  if (!M || !M.scroll || prefersReducedMotion()) return;
  document.querySelectorAll('.arch .layer').forEach((el, i) => {
    M.scroll(
      (progress) => {
        const p = Math.max(0, Math.min(1, (progress - i * 0.06) * 2.5));
        el.style.opacity = 0.25 + 0.75 * p;
        el.style.transform = `translateY(${(1 - p) * 20}px) scale(${0.94 + 0.06 * p})`;
      },
      { target: el, offset: ['start 90%', 'end 30%'] }
    );
  });
  document.querySelectorAll('.card').forEach(el => {
    M.scroll(
      (progress) => {
        el.style.transform = `translateY(${(0.5 - progress) * 6}px)`;
      },
      { target: el, offset: ['start end', 'end start'] }
    );
  });
}

// ============================================================
// 5. MAGNETIC BUTTONS
// ============================================================
export function initMagneticButtons() {
  if (prefersReducedMotion()) return;
  document.querySelectorAll('.btn-primary, .btn-accent').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) * 0.22;
      const dy = (e.clientY - cy) * 0.22;
      btn.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
}

// ============================================================
// 6. STAT COUNTERS (Anime.js easeOutExpo)
// ============================================================
export async function initStatCounters() {
  if (prefersReducedMotion()) return;
  const anime = await loadAnime();
  if (!anime) return;
  document.querySelectorAll('.stat-cell .num[data-counter]').forEach(el => {
    const target = parseFloat(el.dataset.counter);
    const suffix = el.dataset.suffix || '';
    const decimals = parseInt(el.dataset.decimals || '0');
    const obj = { v: 0 };
    anime({
      targets: obj, v: target,
      round: decimals === 0 ? 1 : Math.pow(10, -decimals),
      duration: 1800, delay: 200, ease: 'outExpo',
      update: () => {
        el.textContent = obj.v.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }) + suffix;
      },
    });
  });
}

// ============================================================
// 7. CARD 3D TILT + CURSOR GLOW
// ============================================================
export function initCardHover() {
  if (prefersReducedMotion()) return;
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const rx = ((e.clientY - rect.top) / rect.height - 0.5) * -6;
      const ry = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
      card.style.setProperty('--mx', `${x}%`);
      card.style.setProperty('--my', `${y}%`);
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

// ============================================================
// 8. CUSTOM CURSOR (lerp + spring-feel)
// ============================================================
export function initCustomCursor() {
  if (prefersReducedMotion() || matchMedia('(pointer: coarse)').matches) return;
  const ring = document.createElement('div');
  const dot = document.createElement('div');
  Object.assign(ring.style, {
    position: 'fixed', top: 0, left: 0,
    width: '32px', height: '32px',
    border: '1px solid rgba(217,119,87,0.5)',
    borderRadius: '50%', pointerEvents: 'none',
    zIndex: 9999, transform: 'translate(-50%, -50%)',
    willChange: 'transform',
    mixBlendMode: 'difference',
  });
  Object.assign(dot.style, {
    position: 'fixed', top: 0, left: 0,
    width: '4px', height: '4px',
    background: '#d97757', borderRadius: '50%',
    pointerEvents: 'none', zIndex: 9999,
    transform: 'translate(-50%, -50%)',
  });
  document.body.appendChild(ring);
  document.body.appendChild(dot);

  let rx = 0, ry = 0, tx = 0, ty = 0;
  document.addEventListener('mousemove', (e) => {
    tx = e.clientX; ty = e.clientY;
    dot.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, -50%)`;
  });
  const animate = () => {
    rx += (tx - rx) * 0.18;
    ry += (ty - ry) * 0.18;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    requestAnimationFrame(animate);
  };
  animate();

  document.querySelectorAll('a, button, .card, .scm-item').forEach(el => {
    el.addEventListener('mouseenter', () => {
      ring.style.width = ring.style.height = '52px';
      ring.style.borderColor = 'rgba(217,119,87,0.9)';
    });
    el.addEventListener('mouseleave', () => {
      ring.style.width = ring.style.height = '32px';
      ring.style.borderColor = 'rgba(217,119,87,0.5)';
    });
  });
}

// ============================================================
// MASTER
// ============================================================
export async function initAll() {
  initViewTransitions();
  initHero(null);
  initScrollLinked(null);
  initCardHover();
  initMagneticButtons();
  initCustomCursor();
  initStatCounters();
  // Motion-loaded features (deferred)
  const M = await loadMotion();
  if (M) {
    initMotionReveals(M);
    initScrollLinked(M);
    initHero(M);
  }
}
