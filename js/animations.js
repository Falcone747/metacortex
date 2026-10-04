// Premium animations v5 — full premium stack as window globals:
//   - Motion@11 (motion.dev) — spring physics, scroll-linked, gestures
//   - Anime.js v4 — SVG path morphing, value animations, easings
//   - GSAP + ScrollTrigger — timelines, orchestration
//   - Theatre.js — state-based studio-quality animation
//   - Lottie — After Effects vector animations
//   - CSS @layer cascade
//   - View Transitions API

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================
// 1. PAGE-LEVEL VIEW TRANSITIONS (browser-native)
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
// 2. MOTION — spring reveals, scroll-linked, magnetic hover
// ============================================================
export function initMotion() {
  if (prefersReducedMotion() || !window.motion) return;
  const M = window.motion;

  // Hero stagger
  document.querySelectorAll('.hero .eyebrow, .hero h1, .hero .lead, .hero .ctas, .hero .meta').forEach((el, i) => {
    M.animate(el, { opacity: [0, 1], y: [30, 0] }, { delay: 0.15 + i * 0.12, duration: 1.2, ease: [0.16, 1, 0.3, 1] });
  });

  // Section reveals
  const targets = document.querySelectorAll('.card, .arch .layer, .stat-cell, section h2, section .sub');
  targets.forEach((el, i) => {
    M.animate(el, { opacity: [0, 1], y: [40, 0], scale: [0.96, 1] }, { delay: i * 0.04, duration: 1.1, ease: [0.16, 1, 0.3, 1] });
  });

  // Scroll-linked layer parallax
  if (M.scroll) {
    document.querySelectorAll('.arch .layer').forEach((el, i) => {
      M.scroll((progress) => {
        const p = Math.max(0, Math.min(1, (progress - i * 0.06) * 2.5));
        el.style.opacity = 0.25 + 0.75 * p;
        el.style.transform = `translateY(${(1 - p) * 20}px) scale(${0.94 + 0.06 * p})`;
      }, { target: el, offset: ['start 90%', 'end 30%'] });
    });
    document.querySelectorAll('.card').forEach(el => {
      M.scroll((progress) => {
        el.style.transform = `translateY(${(0.5 - progress) * 6}px)`;
      }, { target: el, offset: ['start end', 'end start'] });
    });
  }

  // Magnetic buttons
  document.querySelectorAll('.btn-primary, .btn-accent').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * 0.22;
      const dy = (e.clientY - (r.top + r.height / 2)) * 0.22;
      btn.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
}

// ============================================================
// 3. ANIME.JS v4 — counter easings + SVG path draw
// ============================================================
export function initAnime() {
  if (prefersReducedMotion() || !window.anime) return;
  const a = window.anime;

  // Counter animation
  document.querySelectorAll('.stat-cell .num[data-counter]').forEach(el => {
    const target = parseFloat(el.dataset.counter);
    const suffix = el.dataset.suffix || '';
    const decimals = parseInt(el.dataset.decimals || '0');
    a({
      targets: { v: 0 },
      v: target,
      round: decimals === 0 ? 1 : Math.pow(10, -decimals),
      duration: 1800, delay: 200, ease: 'outExpo',
      update: (anim) => {
        const v = anim.targets[0].v;
        el.textContent = v.toLocaleString(undefined, {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        }) + suffix;
      },
    });
  });

  // SVG path drawing
  document.querySelectorAll('svg [data-animate-path]').forEach(el => {
    try {
      const len = el.getTotalLength();
      el.style.strokeDasharray = len;
      el.style.strokeDashoffset = len;
      a({
        targets: el,
        strokeDashoffset: [len, 0],
        duration: 2200, delay: 400, ease: 'inOutQuart',
      });
    } catch (e) {}
  });
}

// ============================================================
// 4. GSAP — hero parallax, scrub effects, stagger orchestration
// ============================================================
export function initGSAP() {
  if (prefersReducedMotion() || !window.gsap) return;
  if (window.gsap.ScrollTrigger) window.gsap.registerPlugin(window.gsap.ScrollTrigger);

  // Hero canvas parallax
  const canvas = document.querySelector('.hero-canvas');
  if (canvas && window.gsap.ScrollTrigger) {
    window.gsap.to(canvas, {
      yPercent: -25, scale: 1.15, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  }
}

// ============================================================
// 5. THEATRE.JS — studio-quality state-based animation
// (Hooked but not heavy-handed: only used for a subtle page intro)
// ============================================================
export function initTheatre() {
  if (prefersReducedMotion() || !window.Theatre || !window.Theatre.getStudio) return;
  try {
    const studio = window.Theatre.getStudio();
    const sheet = studio.getSheet('page-intro');
    const obj = sheet.object('intro', {
      progress: window.Theatre.core.types.number(0, { range: [0, 1] }),
    });
    obj.onValuesChange(({ progress }) => {
      document.body.style.setProperty('--theatre-progress', progress.toFixed(3));
      const hero = document.querySelector('.hero-content');
      if (hero) {
        hero.style.transform = `translateY(${(1 - progress) * 12}px)`;
        hero.style.filter = `blur(${(1 - progress) * 6}px) saturate(${0.6 + progress * 0.4})`;
      }
    });
    studio.setStudioReady().then(() => {
      window.Theatre.coreAnimationPlayer
        ? window.Theatre.coreAnimationPlayer(obj, { values: { progress: 1 }, range: [0, 1], duration: 1.6, ease: 'outExpo' })
        : setTimeout(() => { obj.value.progress = 1; }, 50);
    });
  } catch (e) { console.warn('Theatre init skipped:', e); }
}

// ============================================================
// 6. LOTTIE — vector animations (used for a subtle decoration)
// ============================================================
export function initLottie() {
  if (prefersReducedMotion() || !window.lottie) return;
  document.querySelectorAll('[data-lottie]').forEach(el => {
    const src = el.dataset.lottie;
    if (!src) return;
    try {
      window.lottie.loadAnimation({
        container: el,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: src,
      });
    } catch (e) {}
  });
}

// ============================================================
// 7. CSS — Card 3D tilt + cursor-following glow
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
// 8. CUSTOM CURSOR (lerp + blend-mode)
// ============================================================
export function initCustomCursor() {
  if (prefersReducedMotion() || matchMedia('(pointer: coarse)').matches) return;
  const ring = document.createElement('div');
  const dot = document.createElement('div');
  Object.assign(ring.style, {
    position: 'fixed', top: 0, left: 0, width: '32px', height: '32px',
    border: '1px solid rgba(217,119,87,0.5)', borderRadius: '50%',
    pointerEvents: 'none', zIndex: 9999, willChange: 'transform',
    transform: 'translate(-50%, -50%)', mixBlendMode: 'difference',
  });
  Object.assign(dot.style, {
    position: 'fixed', top: 0, left: 0, width: '4px', height: '4px',
    background: '#d97757', borderRadius: '50%',
    pointerEvents: 'none', zIndex: 9999, transform: 'translate(-50%, -50%)',
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
export function initAll() {
  initViewTransitions();
  initGSAP();
  initMotion();
  initAnime();
  initTheatre();
  initLottie();
  initCardHover();
  initCustomCursor();
}
