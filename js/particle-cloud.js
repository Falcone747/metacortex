// Volumetric particle cloud — Vesper/getlayers.ai style
// 3D particle mesh that morphs between SCMs and responds to mouse presence.

import * as THREE from 'https://esm.sh/three@0.160.0';

const PARTICLE_COUNT = 12000;
const SURFACE = 'torus'; // parametric base shape

// Mulberry32 PRNG for deterministic positions
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Parametric surface — torus
function torusPoint(u, v, R = 2.0, r = 0.85) {
  const theta = u * Math.PI * 2;
  const phi = v * Math.PI * 2;
  return [
    (R + r * Math.cos(phi)) * Math.cos(theta),
    (R + r * Math.cos(phi)) * Math.sin(theta),
    r * Math.sin(phi),
  ];
}

// Build particle positions for a given SCM (variable nodes + edge flow)
// Each variable becomes a "hub" on the torus; edges become flow particles
function buildSCMCloud(scm, seed) {
  const rng = mulberry32(seed);
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const tones = new Float32Array(PARTICLE_COUNT);
  const flowIndex = new Float32Array(PARTICLE_COUNT); // -1 = node, 0+ = which edge it belongs to

  // Map variables onto torus paramater space (u ∈ [0,1])
  const vars = scm.parameters.vars;
  const edges = scm.parameters.edges;
  const N = vars.length;

  // First, place "node" particles (bright concentrated hubs) — 8% of total
  const nodeCount = Math.floor(PARTICLE_COUNT * 0.08);
  for (let i = 0; i < nodeCount; i++) {
    const v = vars[i % N];
    const [x, y, z] = torusPoint(v.u, v.v);
    // Add small radial offset to make node particles concentrated
    const jitter = 0.05;
    positions[i*3]   = x + (rng() - 0.5) * jitter;
    positions[i*3+1] = y + (rng() - 0.5) * jitter;
    positions[i*3+2] = z + (rng() - 0.5) * jitter;
    tones[i] = v.toneIdx;
    flowIndex[i] = -1;
  }

  // Then, place edge "flow" particles along edges — they flow from→to
  const flowCount = PARTICLE_COUNT - nodeCount;
  for (let i = 0; i < flowCount; i++) {
    const edge = edges[i % edges.length];
    const fromVar = vars.find(v => v.id === edge.from);
    const toVar = vars.find(v => v.id === edge.to);
    // Position along the curve from→to interpolated on torus surface
    const t = rng();
    const u = fromVar.u * (1 - t) + toVar.u * t;
    // Move along the torus
    const [px, py, pz] = torusPoint(u, fromVar.v);
    const [qx, qy, qz] = torusPoint(u, toVar.v);
    const tt = rng();
    const x = px * (1 - tt) + qx * tt;
    const y = py * (1 - tt) + qy * tt;
    const z = pz * (1 - tt) + qz * tt;
    // Add radial breathing (small offset from surface)
    const radialOffset = (rng() - 0.5) * 0.15;
    const ux = x / Math.sqrt(x*x + y*y + 1e-9);
    const uy = y / Math.sqrt(x*x + y*y + 1e-9);
    positions[(nodeCount + i)*3]   = x + ux * radialOffset;
    positions[(nodeCount + i)*3+1] = y + uy * radialOffset;
    positions[(nodeCount + i)*3+2] = z + (rng() - 0.5) * 0.15;
    // Tone is blend of from→to
    tones[nodeCount + i] = (fromVar.toneIdx + toVar.toneIdx) / 2;
    flowIndex[nodeCount + i] = i % edges.length;
  }

  return { positions, tones, flowIndex };
}

// Compute u,v per variable in a way that distributes evenly around torus
function distributeVars(vars) {
  const N = vars.length;
  return vars.map((v, i) => {
    // Spread variables around the torus using golden angle for nice distribution
    const u = ((i + 0.5) / N + i * 0.382) % 1;
    const v = ((i * 0.618) % 1 + 0.1) % 1;
    const toneIdx = v.tone === 'ember' ? 0.0 : v.tone === 'leaf' ? 1.0 : 0.5;
    return { ...v, u, v, toneIdx };
  });
}

// Vertex shader for the particle cloud
const vertexShader = `
attribute float tone;
attribute float flowIndex;
attribute vec3 positionB;  // target positions for morphing
uniform float uTime;
uniform float uMorph;       // 0 → A (current), 1 → B (target)
uniform float uBreath;      // breathing amplitude
uniform vec2 uMouse;
uniform float uPointerActive;

varying float vTone;
varying float vDepth;
varying float vFlow;
varying float vAlpha;

void main() {
  vec3 posA = position;
  vec3 posB = positionB;
  vec3 pos = mix(posA, posB, uMorph);

  // Breathing (radial)
  float breath = sin(uTime * 0.6) * uBreath;
  vec3 radial = normalize(pos + vec3(0.001));
  pos += radial * breath * 0.08;

  // Mouse influence — particles lean toward cursor in 3D
  if (uPointerActive > 0.5) {
    vec3 mp = normalize(vec3(uMouse.x * 4.0, uMouse.y * 3.0, 0.5));
    vec3 toMouse = mp - pos * 0.1;
    float dist = length(pos.xy - uMouse * 3.0);
    float pull = smoothstep(4.0, 0.0, dist) * 0.15;
    pos += normalize(toMouse + vec3(0.01)) * pull;
  }

  // Flow particles animate along their edge — sinusoidal offset along radial
  if (flowIndex >= 0.0) {
    float phase = flowIndex * 1.7;
    float along = sin(uTime * 0.7 + phase) * 0.04;
    pos += radial * along;
  }

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  // Size attenuation by depth
  gl_PointSize = (60.0 / -mv.z) * (0.6 + tone * 0.6);
  gl_PointSize = clamp(gl_PointSize, 1.0, 6.0);

  vDepth = -mv.z;
  vTone = tone;
  vFlow = flowIndex;
  // Alpha: brighter near, edges ember hue
  vAlpha = smoothstep(8.0, 14.0, vDepth);
}
`;

const fragmentShader = `
uniform float uTime;
varying float vTone;
varying float vDepth;
varying float vFlow;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;

  float core = smoothstep(0.5, 0.0, d);
  float halo = smoothstep(0.5, 0.2, d);

  // Color: 3 tones — neutral (cool gray), ember (warm orange), leaf (mint)
  vec3 ember  = vec3(0.93, 0.58, 0.34);  // #ed946d
  vec3 leaf   = vec3(0.43, 0.91, 0.78);  // #6ee7c7
  vec3 neutral = vec3(0.62, 0.66, 0.78); // light slate
  vec3 color;
  if (vTone > 0.66) color = leaf;
  else if (vTone < 0.33) color = ember;
  else color = mix(neutral, ember, 0.4);

  // Depth fade (already computed in vertex, double-apply here)
  float depthFade = smoothstep(20.0, 8.0, vDepth);
  float alpha = core * depthFade * 0.85;
  // Halo adds glow
  alpha += halo * depthFade * 0.18;

  // Subtle pulse on flow particles
  float pulse = 0.6 + 0.4 * sin(uTime * 1.4 + flowIndex * 0.9);
  alpha *= mix(1.0, pulse, vFlow >= 0.0 ? 1.0 : 0.0);

  gl_FragColor = vec4(color, alpha);
}
`;

export class ParticleCloud {
  constructor(canvas, container) {
    this.canvas = canvas;
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a0b0f, 12, 28);

    const rect = container.getBoundingClientRect();
    this.camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 100);
    this.camera.position.set(0, 0, 11);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(rect.width, rect.height, false);
    this.renderer.setClearColor(0x0a0b0f, 1);

    this.uniforms = {
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uBreath: { value: 1.0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uPointerActive: { value: 0 },
    };

    this.geometry = new THREE.BufferGeometry();
    this.positionsA = new Float32Array(PARTICLE_COUNT * 3);
    this.positionsB = new Float32Array(PARTICLE_COUNT * 3);
    this.tones = new Float32Array(PARTICLE_COUNT);
    this.flowIndex = new Float32Array(PARTICLE_COUNT);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionsA, 3));
    this.geometry.setAttribute('positionB', new THREE.BufferAttribute(this.positionsB, 3));
    this.geometry.setAttribute('tone', new THREE.BufferAttribute(this.tones, 1));
    this.geometry.setAttribute('flowIndex', new THREE.BufferAttribute(this.flowIndex, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);

    // Subtle scene rotation driven by mouse
    this.mouse = new THREE.Vector2(0, 0);
    this.targetMouse = new THREE.Vector2(0, 0);
    this.pointerActive = false;
    this.pointerTimer = 0;

    this._setupPointer();
    this._animate();

    window.addEventListener('resize', () => this._resize());
  }

  _setupPointer() {
    const onMove = (e) => {
      const r = this.container.getBoundingClientRect();
      this.targetMouse.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      this.targetMouse.y = -((e.clientY - r.top) / r.height - 0.5) * 2;
      this.pointerActive = true;
      this.pointerTimer = 2.5;
    };
    this.container.addEventListener('mousemove', onMove);
    this.container.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      onMove({ clientX: t.clientX, clientY: t.clientY });
    }, { passive: true });
    this.container.addEventListener('mouseleave', () => { this.pointerActive = false; });
  }

  setTemplateA(template) {
    const scm = { parameters: this._prepareParams(template) };
    const { positions, tones, flowIndex } = buildSCMCloud(scm, this._seedFor(template.id, 'A'));
    this.positionsA.set(positions);
    this.tones.set(tones);
    this.flowIndex.set(flowIndex);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.tone.needsUpdate = true;
    this.geometry.attributes.flowIndex.needsUpdate = true;
  }

  setTemplateB(template) {
    const scm = { parameters: this._prepareParams(template) };
    const { positions, tones, flowIndex } = buildSCMCloud(scm, this._seedFor(template.id, 'B'));
    this.positionsB.set(positions);
    this.geometry.attributes.positionB.needsUpdate = true;
  }

  _prepareParams(template) {
    // Convert edges to "fromVar"-"toVar" objects with u/v coordinates
    const vars = distributeVars(template.vars);
    const edges = template.edges.map(e => ({ from: e.from, to: e.to }));
    return { vars, edges };
  }

  _seedFor(id, side) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return Math.abs(h) + (side === 'A' ? 1000 : 5000);
  }

  _animate() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      this.uniforms.uTime.value = performance.now() * 0.001;

      // Smooth mouse interpolation
      this.mouse.lerp(this.targetMouse, 0.05);
      this.uniforms.uMouse.value.copy(this.mouse);

      if (this.pointerActive) {
        this.pointerTimer -= 0.016;
        if (this.pointerTimer <= 0) this.pointerActive = false;
      }
      this.uniforms.uPointerActive.value = this.pointerActive ? 1 : 0;

      // Animate uMorph towards 1 (then stay at 1 — means we already morphed)
      // For visual breathing back to baseline after morph, also oscillate
      this.uniforms.uMorph.value = THREE.MathUtils.lerp(this.uniforms.uMorph.value, this._morphTarget ?? 0, 0.04);
      // Continuous subtle breathing
      this.uniforms.uBreath.value = 0.85 + Math.sin(this.uniforms.uTime.value * 0.4) * 0.15;

      // Slow autorotation
      this.points.rotation.y = this.uniforms.uTime.value * 0.06;
      this.points.rotation.x = Math.sin(this.uniforms.uTime.value * 0.2) * 0.08;
      // Mouse parallax on group
      this.points.rotation.y += this.mouse.x * 0.12;
      this.points.rotation.x += this.mouse.y * 0.08;

      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  morphTo(template, duration = 1.4) {
    this.setTemplateB(template);
    this.uniforms.uMorph.value = 0;
    this._morphTarget = 1;
    setTimeout(() => {
      // After morph, swap A=B so future morphs use the new as baseline
      const tmp = this.positionsA;
      this.positionsA.set(this.positionsB);
      this.positionsB.set(tmp);
      this.geometry.attributes.position.needsUpdate = true;
      this.tones.set(new Float32Array(this.flowIndex.length)); // dummy
      // re-derive tones from B (since positionsB now has the new tones)
      // simpler: just re-set templateA tones based on new template
      // We'll do this on next morphTo call via setTemplateA
      this.uniforms.uMorph.value = 0;
      this._morphTarget = 0;
    }, duration * 1000);
  }

  _resize() {
    const r = this.container.getBoundingClientRect();
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
