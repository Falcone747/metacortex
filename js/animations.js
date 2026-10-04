// Premium interactions: scroll-triggered reveals, hover effects, micro-interactions
// Loaded from CDN (gsap + ScrollTrigger)
// No external deps at module-level — uses window.gsap if available, falls back to CSS

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initReveals() {
  const els = document.querySelectorAll('.reveal, section, .card, .hero .lead, .hero .ctas, .hero .meta');
  if (!els.length) return;
  
  if (typeof window.gsap === 'undefined' || prefersReducedMotion()) {
    // CSS-only fallback
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.15 });
    els.forEach(el => { el.classList.add('reveal'); observer.observe(el); });
    return;
  }
  
  // GSAP + ScrollTrigger
  const { gsap } = window;
  if (window.gsap.ScrollTrigger) gsap.registerPlugin(window.gsap.ScrollTrigger);
  
  els.forEach((el, i) => {
    gsap.from(el, {
      opacity: 0, y: 30, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' },
    });
  });
}

export function initHeroAnimations() {
  if (typeof window.gsap === 'undefined' || prefersReducedMotion()) return;
  const { gsap } = window;
  const hero = document.querySelector('.hero');
  if (!hero) return;
  
  gsap.from('.hero .eyebrow', { opacity: 0, y: 12, duration: 0.7, delay: 0.1, ease: 'power2.out' });
  gsap.from('.hero h1', { opacity: 0, y: 32, duration: 1.0, delay: 0.2, ease: 'power3.out' });
  gsap.from('.hero .lead', { opacity: 0, y: 20, duration: 0.9, delay: 0.5, ease: 'power2.out' });
  gsap.from('.hero .ctas', { opacity: 0, y: 16, duration: 0.7, delay: 0.7, ease: 'power2.out' });
  gsap.from('.hero .meta', { opacity: 0, y: 12, duration: 0.7, delay: 0.9, ease: 'power2.out' });
}

export function initStatCounter() {
  if (typeof window.gsap === 'undefined' || prefersReducedMotion()) return;
  const stats = document.querySelectorAll('.stat-cell .num');
  if (!stats.length) return;
  
  const { gsap } = window;
  stats.forEach(el => {
    const raw = el.textContent;
    const match = raw.match(/([\d,]+)/);
    if (!match) return;
    const target = parseInt(match[1].replace(/,/g, ''));
    const suffix = raw.replace(match[1], '');
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target, duration: 1.6, ease: 'power2.out',
      onUpdate: () => { el.textContent = Math.round(obj.v).toLocaleString() + suffix; },
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });
}

export function initCardHover() {
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(600px) rotateY(${x * 3}deg) rotateX(${-y * 3}deg) translateY(-2px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

export function initCustomCursor() {
  if (prefersReducedMotion() || matchMedia('(pointer: coarse)').matches) return;
  const ring = document.createElement('div');
  const dot = document.createElement('div');
  Object.assign(ring.style, {
    position: 'fixed', top: '0', left: '0',
    width: '32px', height: '32px',
    border: '1px solid rgba(217,119,87,0.5)',
    borderRadius: '50%',
    pointerEvents: 'none',
    zIndex: '9999',
    transition: 'transform 0.15s ease-out, width 0.2s, height 0.2s, border-color 0.2s',
    transform: 'translate(-50%, -50%)',
  });
  Object.assign(dot.style, {
    position: 'fixed', top: '0', left: '0',
    width: '4px', height: '4px',
    background: 'var(--accent)',
    borderRadius: '50%',
    pointerEvents: 'none',
    zIndex: '9999',
    transform: 'translate(-50%, -50%)',
  });
  document.body.appendChild(ring);
  document.body.appendChild(dot);
  
  document.addEventListener('mousemove', (e) => {
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
    ring.style.left = e.clientX + 'px';
    ring.style.top = e.clientY + 'px';
  });
  document.addEventListener('mousedown', () => {
    ring.style.transform = 'translate(-50%, -50%) scale(1.3)';
    ring.style.borderColor = 'rgba(217,119,87,0.9)';
  });
  document.addEventListener('mouseup', () => {
    ring.style.transform = 'translate(-50%, -50%) scale(1)';
    ring.style.borderColor = 'rgba(217,119,87,0.5)';
  });
  document.querySelectorAll('a, button, .card').forEach(el => {
    el.addEventListener('mouseenter', () => {
      ring.style.width = '48px';
      ring.style.height = '48px';
      ring.style.borderColor = 'rgba(217,119,87,0.9)';
    });
    el.addEventListener('mouseleave', () => {
      ring.style.width = '32px';
      ring.style.height = '32px';
      ring.style.borderColor = 'rgba(217,119,87,0.5)';
    });
  });
}

export function initAll() {
  initReveals();
  initHeroAnimations();
  initStatCounter();
  initCardHover();
  initCustomCursor();
}
