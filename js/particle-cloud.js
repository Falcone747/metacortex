// Volumetric particle cloud — Vesper/getlayers.ai style
// Canvas 2D rendering. Bulletproof — no WebGL, no shader compile, no Three.js.
// Each particle is a soft glow circle composited additively.

const PARTICLE_COUNT = 2000;  // Canvas 2D is heavier per-particle, but 2k looks great

function mulberry32(seedValue) {
  let s = seedValue | 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function torusPoint(uParam, vParam, R = 1.0, r = 0.42) {
  const theta = uParam * Math.PI * 2;
  const phi = vParam * Math.PI * 2;
  return [
    (R + r * Math.cos(phi)) * Math.cos(theta),
    (R + r * Math.cos(phi)) * Math.sin(theta),
    r * Math.sin(phi),
  ];
}

function distributeVars(variables) {
  const N = variables.length;
  return variables.map((variable, index) => {
    const uCoord = ((index + 0.5) / N + index * 0.382) % 1;
    const vCoord = ((index * 0.618) % 1 + 0.1) % 1;
    const toneIdx = variable.tone === 'ember' ? 0.0 : variable.tone === 'leaf' ? 1.0 : 0.5;
    return { ...variable, u: uCoord, v: vCoord, toneIdx };
  });
}

// 3-tone colors
const COLOR_EMBER = { r: 242, g: 158, b: 92 };   // #f29e5c
const COLOR_LEAF  = { r: 123, g: 235, b: 204 };  // #7bebcc
const COLOR_SLATE = { r: 168, g: 176, b: 204 };  // light slate

function pickToneColor(toneIdx) {
  if (toneIdx > 0.66) return COLOR_LEAF;
  if (toneIdx < 0.33) return COLOR_EMBER;
  // Mix slate with a hint of ember for neutral
  return { r: 168, g: 176, b: 204 };
}

function buildParticles(params, seedValue) {
  const rng = mulberry32(seedValue);
  const variables = params.vars;
  const edges = params.edges;
  const N = variables.length;

  const particles = [];

  // Node clusters (bright hubs) — 30% of particles
  const nodeCount = Math.floor(PARTICLE_COUNT * 0.30);
  for (let i = 0; i < nodeCount; i++) {
    const node = variables[i % N];
    const pt = torusPoint(node.u, node.v);
    const c = pickToneColor(node.toneIdx);
    particles.push({
      x: pt[0] + (rng() - 0.5) * 0.05,
      y: pt[1] + (rng() - 0.5) * 0.05,
      z: pt[2] + (rng() - 0.5) * 0.05,
      baseX: pt[0], baseY: pt[1], baseZ: pt[2],
      toneR: c.r, toneG: c.g, toneB: c.b,
      baseSize: 3.5 + rng() * 1.5,
      phase: rng() * Math.PI * 2,
      speed: 0.4 + rng() * 0.4,
      flowIndex: -1,
      edgeProgress: 0,
      baseEdgeU: 0, baseEdgeV: 0,
    });
  }

  // Flow particles — 70%
  const flowCount = PARTICLE_COUNT - nodeCount;
  for (let i = 0; i < flowCount; i++) {
    const edge = edges[i % edges.length];
    const fromVar = variables.find(v => v.id === edge.from);
    const toVar = variables.find(v => v.id === edge.to);
    if (!fromVar || !toVar) continue;
    const progress = rng();
    const uMix = fromVar.u * (1 - progress) + toVar.u * progress;
    const ptA = torusPoint(uMix, fromVar.v);
    const ptB = torusPoint(uMix, toVar.v);
    const tMix = rng();
    const baseX = ptA[0] * (1 - tMix) + ptB[0] * tMix;
    const baseY = ptA[1] * (1 - tMix) + ptB[1] * tMix;
    const baseZ = ptA[2] * (1 - tMix) + ptB[2] * tMix;
    const c1 = pickToneColor(fromVar.toneIdx);
    const c2 = pickToneColor(toVar.toneIdx);
    particles.push({
      x: baseX + (rng() - 0.5) * 0.15,
      y: baseY + (rng() - 0.5) * 0.15,
      z: baseZ + (rng() - 0.5) * 0.15,
      baseX, baseZ, baseY,
      toneR: Math.round((c1.r + c2.r) / 2),
      toneG: Math.round((c1.g + c2.g) / 2),
      toneB: Math.round((c1.b + c2.b) / 2),
      baseSize: 1.5 + rng() * 1.5,
      phase: rng() * Math.PI * 2,
      speed: 0.6 + rng() * 0.6,
      flowIndex: i % edges.length,
      edgeProgress: rng(),
      baseEdgeU: uMix,
      baseEdgeV: fromVar.v,
      baseEdgeU2: toVar.u,
      baseEdgeV2: toVar.v,
    });
  }

  return particles;
}

export class ParticleCloud {
  constructor(canvasElement, containerElement) {
    this.canvasElement = canvasElement;
    this.containerElement = containerElement;
    this.ctx = canvasElement.getContext('2d');
    this.particlesA = [];
    this.particlesB = [];
    this.startTime = performance.now();
    this.mouseVec = { x: 0, y: 0 };
    this.targetMouse = { x: 0, y: 0 };
    this._morphStart = null;
    this._morphDuration = 1600;
    this._morphing = false;
    this._pointerActive = false;
    this._pointerTimer = 0;

    this._resize();
    this._setupPointer();
    this._animate();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const r = this.containerElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvasElement.width = r.width * dpr;
    this.canvasElement.height = r.height * dpr;
    this.canvasElement.style.width = r.width + 'px';
    this.canvasElement.style.height = r.height + 'px';
    this.ctx.scale(dpr, dpr);
    this.cssWidth = r.width;
    this.cssHeight = r.height;
  }

  _setupPointer() {
    const onMove = (e) => {
      const r = this.containerElement.getBoundingClientRect();
      this.targetMouse.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      this.targetMouse.y = -((e.clientY - r.top) / r.height - 0.5) * 2;
      this._pointerActive = true;
      this._pointerTimer = 2.5;
    };
    this.containerElement.addEventListener('mousemove', onMove);
    this.containerElement.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      onMove({ clientX: t.clientX, clientY: t.clientY });
    }, { passive: true });
    this.containerElement.addEventListener('mouseleave', () => { this._pointerActive = false; });
  }

  _prepareParams(template) {
    return {
      vars: distributeVars(template.vars),
      edges: template.edges.map(e => ({ from: e.from, to: e.to })),
    };
  }

  _seedFor(templateId, side) {
    let h = 0;
    for (let i = 0; i < templateId.length; i++) h = (h * 31 + templateId.charCodeAt(i)) | 0;
    return Math.abs(h) + (side === 'A' ? 1000 : 5000);
  }

  setTemplateA(template) {
    const params = this._prepareParams(template);
    this.particlesA = buildParticles(params, this._seedFor(template.id, 'A'));
  }

  setTemplateB(template) {
    const params = this._prepareParams(template);
    this.particlesB = buildParticles(params, this._seedFor(template.id, 'B'));
  }

  morphTo(template, dur) {
    this.setTemplateB(template);
    this._morphStart = performance.now();
    this._morphDuration = (dur || 1.6) * 1000;
    this._morphing = true;
  }

  _animate() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      const time = (performance.now() - this.startTime) * 0.001;

      // Smooth mouse tracking
      this.mouseVec.x += (this.targetMouse.x - this.mouseVec.x) * 0.06;
      this.mouseVec.y += (this.targetMouse.y - this.mouseVec.y) * 0.06;

      const ctx = this.ctx;
      const w = this.cssWidth;
      const h = this.cssHeight;

      // Clear with bg color (semi-transparent for slight trail effect)
      ctx.fillStyle = 'rgba(10, 11, 15, 1)';
      ctx.fillRect(0, 0, w, h);

      // Additive blending
      ctx.globalCompositeOperation = 'lighter';

      // Camera transform
      const rotY = time * 0.06 + this.mouseVec.x * 0.4;
      const rotX = Math.sin(time * 0.2) * 0.15 + this.mouseVec.y * 0.3;
      const cx = Math.cos(rotY), sx_ = Math.sin(rotY);
      const cy = Math.cos(rotX), sy_ = Math.sin(rotX);

      const scale = Math.min(w, h) * 0.32;
      const cx2 = w / 2, cy2 = h / 2;

      // Morph progress
      let morphT = 0;
      if (this._morphing) {
        morphT = Math.min(1, (performance.now() - this._morphStart) / this._morphDuration);
        if (morphT >= 1) {
          this._morphing = false;
          // swap A↔B
          const tmp = this.particlesA;
          this.particlesA = this.particlesB;
          this.particlesB = tmp;
        }
      }

      const source = this._morphing ? this.particlesA : this.particlesA;
      const target = this._morphing ? this.particlesB : this.particlesA;

      const N = source.length;
      for (let i = 0; i < N; i++) {
        const pA = source[i];
        const pB = this._morphing ? target[i % target.length] : pA;

        // Position interpolation
        const baseX = pA.baseX + (pB.baseX - pA.baseX) * morphT;
        const baseY = pA.baseY + (pB.baseY - pA.baseY) * morphT;
        const baseZ = pA.baseZ + (pB.baseZ - pA.baseZ) * morphT;
        const toneR = pA.toneR + (pB.toneR - pA.toneR) * morphT;
        const toneG = pA.toneG + (pB.toneG - pA.toneG) * morphT;
        const toneB = pA.toneB + (pB.toneB - pA.toneB) * morphT;

        // Flow particles oscillate along the edge radial axis
        let x = baseX, y = baseY, z = baseZ;
        if (pA.flowIndex >= 0) {
          const phase = pA.phase + time * pA.speed;
          const along = Math.sin(phase) * 0.05;
          // Radial offset
          const len2D = Math.sqrt(baseX * baseX + baseY * baseY) || 1;
          x += (baseX / len2D) * along;
          y += (baseY / len2D) * along;
        }

        // Breathing
        const breath = 1 + Math.sin(time * 0.5 + pA.phase) * 0.05;
        x *= breath; y *= breath; z *= breath;

        // Mouse pull (3D → 2D)
        if (this._pointerActive) {
          const pullStrength = 0.08;
          x += this.mouseVec.x * pullStrength;
          y += this.mouseVec.y * pullStrength * 0.7;
        }

        // 3D rotation
        const rx1 = x * cy + z * sy_;
        const rz1 = -x * sy_ + z * cy;
        const ry = y;
        const rx = rx1;
        // const rz = rz1; // unused but kept for clarity

        // Project to 2D
        const fov = 4;
        const distance = 4;
        const proj = fov / (rz1 + distance);
        const sx = rx * proj * scale + cx2;
        const sy = ry * proj * scale + cy2;

        // Skip if outside viewport
        if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) continue;

        // Depth fade + size attenuation
        const depthZ = rz1 + distance;
        const size = Math.max(2, pA.baseSize * 6 * proj);
        const alpha = Math.max(0.25, Math.min(1, 1.5 / depthZ));

        // Draw soft glow circle
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size);
        grad.addColorStop(0, `rgba(${toneR|0}, ${toneG|0}, ${toneB|0}, ${alpha})`);
        grad.addColorStop(0.5, `rgba(${toneR|0}, ${toneG|0}, ${toneB|0}, ${alpha * 0.4})`);
        grad.addColorStop(1, `rgba(${toneR|0}, ${toneG|0}, ${toneB|0}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';

      // Pointer fade
      if (this._pointerActive) {
        this._pointerTimer -= 0.016;
        if (this._pointerTimer <= 0) this._pointerActive = false;
      }
    };
    tick();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
  }
}
