// Volumetric particle cloud — Vesper/getlayers.ai style
// Built on Three.js built-in PointsMaterial + vertex colors. No custom shader.

import * as THREE from 'https://esm.sh/three@0.160.0';

const PARTICLE_COUNT = 14000;

// Mulberry32 PRNG for deterministic positions
function mulberry32(seedValue) {
  let s = seedValue | 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function torusPoint(uParam, vParam, R = 2.2, r = 0.95) {
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

// Bright colors for visibility against dark bg
const COLOR_EMBER = new THREE.Color('#f29e5c').convertSRGBToLinear();
const COLOR_LEAF = new THREE.Color('#7bebcc').convertSRGBToLinear();
const COLOR_SLATE = new THREE.Color('#a8b0cc').convertSRGBToLinear();

function pickToneColor(toneIdx) {
  if (toneIdx > 0.66) return COLOR_LEAF;
  if (toneIdx < 0.33) return COLOR_EMBER;
  return COLOR_SLATE;
}

function buildSCMCloud(params, seedValue) {
  const rng = mulberry32(seedValue);
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const sizes = new Float32Array(PARTICLE_COUNT);

  const variables = params.vars;
  const edges = params.edges;
  const N = variables.length;

  const nodeCount = Math.floor(PARTICLE_COUNT * 0.10);
  for (let i = 0; i < nodeCount; i++) {
    const node = variables[i % N];
    const pt = torusPoint(node.u, node.v);
    const idx = i * 3;
    positions[idx]   = pt[0] + (rng() - 0.5) * 0.08;
    positions[idx+1] = pt[1] + (rng() - 0.5) * 0.08;
    positions[idx+2] = pt[2] + (rng() - 0.5) * 0.08;
    const c = pickToneColor(node.toneIdx);
    colors[idx]   = c.r;
    colors[idx+1] = c.g;
    colors[idx+2] = c.b;
    sizes[i] = 2.8 + rng() * 0.6;  // big hub particles
  }

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
    const idx = (nodeCount + i) * 3;
    positions[idx]   = baseX + (rng() - 0.5) * 0.2;
    positions[idx+1] = baseY + (rng() - 0.5) * 0.2;
    positions[idx+2] = baseZ + (rng() - 0.5) * 0.18;
    const c1 = pickToneColor(fromVar.toneIdx);
    const c2 = pickToneColor(toVar.toneIdx);
    colors[idx]   = (c1.r + c2.r) * 0.5;
    colors[idx+1] = (c1.g + c2.g) * 0.5;
    colors[idx+2] = (c1.b + c2.b) * 0.5;
    sizes[nodeCount + i] = 1.8 + rng() * 0.8;  // smaller flow particles
  }

  return { positions, colors, sizes };
}

export class ParticleCloud {
  constructor(canvasElement, containerElement) {
    this.canvasElement = canvasElement;
    this.containerElement = containerElement;
    this.scene = new THREE.Scene();

    const rect = containerElement.getBoundingClientRect();
    this.camera = new THREE.PerspectiveCamera(50, rect.width / rect.height, 0.1, 100);
    this.camera.position.set(0, 0, 6.5);

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvasElement,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(rect.width, rect.height, false);
    this.renderer.setClearColor(0x0a0b0f, 0);  // transparent so page bg shows through

    // Geometry: positions + colors + sizes
    this.geometry = new THREE.BufferGeometry();
    this.positionsA = new Float32Array(PARTICLE_COUNT * 3);
    this.positionsB = new Float32Array(PARTICLE_COUNT * 3);
    this.colorsA = new Float32Array(PARTICLE_COUNT * 3);
    this.colorsB = new Float32Array(PARTICLE_COUNT * 3);
    this.sizesA = new Float32Array(PARTICLE_COUNT);
    this.sizesB = new Float32Array(PARTICLE_COUNT);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionsA, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colorsA, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizesA, 1));

    // Material: built-in PointsMaterial with vertexColors + additive
    this.material = new THREE.PointsMaterial({
      size: 0.08,                    // base point size
      vertexColors: true,             // use color attribute
      sizeAttenuation: true,          // perspective scaling
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: this._createSpriteTexture(),
      alphaTest: 0.01,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);

    this.mouseVec = new THREE.Vector2(0, 0);
    this.targetMouse = new THREE.Vector2(0, 0);
    this._morphTarget = 0;
    this._pointerActive = false;
    this._pointerTimer = 0;

    this._setupPointer();
    this._animate();
    window.addEventListener('resize', () => this._resize());
  }

  _createSpriteTexture() {
    // Soft circular sprite for nice glow
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1.0)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    return tex;
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
    const built = buildSCMCloud(params, this._seedFor(template.id, 'A'));
    this.positionsA.set(built.positions);
    this.colorsA.set(built.colors);
    this.sizesA.set(built.sizes);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
  }

  setTemplateB(template) {
    const params = this._prepareParams(template);
    const built = buildSCMCloud(params, this._seedFor(template.id, 'B'));
    this.positionsB.set(built.positions);
    this.colorsB.set(built.colors);
    this.sizesB.set(built.sizes);
  }

  morphTo(template, duration = 1.6) {
    this.setTemplateB(template);
    this._morphTarget = 1;
    const morphStart = performance.now();
    const morphDuration = duration * 1000;
    const animateMorph = () => {
      const t = (performance.now() - morphStart) / morphDuration;
      if (t >= 1) {
        // swap A↔B
        const tp = this.positionsA; this.positionsA = this.positionsB; this.positionsB = tp;
        const tc = this.colorsA; this.colorsA = this.colorsB; this.colorsB = tc;
        const ts = this.sizesA; this.sizesA = this.sizesB; this.sizesB = ts;
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionsA, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colorsA, 3));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizesA, 1));
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.attributes.size.needsUpdate = true;
        this._morphTarget = 0;
        return;
      }
      // Lerp positions and colors during morph
      for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
        this.geometry.attributes.position.array[i] =
          this.positionsA[i] + (this.positionsB[i] - this.positionsA[i]) * t;
        this.geometry.attributes.color.array[i] =
          this.colorsA[i] + (this.colorsB[i] - this.colorsA[i]) * t;
      }
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
      requestAnimationFrame(animateMorph);
    };
    animateMorph();
  }

  _animate() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      this.uniforms_uTime = (this.uniforms_uTime || 0) + 0.016;

      this.mouseVec.lerp(this.targetMouse, 0.05);

      // Slow autorotation + mouse parallax
      const t = performance.now() * 0.001;
      this.points.rotation.y = t * 0.06 + this.mouseVec.x * 0.15;
      this.points.rotation.x = Math.sin(t * 0.2) * 0.08 + this.mouseVec.y * 0.1;

      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  _resize() {
    const r = this.containerElement.getBoundingClientRect();
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(r.width, r.height, false);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
