// Volumetric particle cloud — Vesper/getlayers.ai style
// 3D particle mesh that morphs between SCMs and responds to mouse presence.
// All variable names are explicit to avoid JS shadowing errors.

import * as THREE from 'https://esm.sh/three@0.160.0';

const PARTICLE_COUNT = 12000;

// Mulberry32 PRNG for deterministic positions
function mulberry32(seedValue) {
  let state = seedValue | 0;
  return function() {
    state = (state + 0x6D2B79F5) | 0;
    let temp = Math.imul(state ^ (state >>> 15), state | 1);
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), temp | 61);
    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
  };
}

// Parametric surface — torus
function torusPoint(uParam, vParam, R = 2.0, r = 0.85) {
  const theta = uParam * Math.PI * 2;
  const phi = vParam * Math.PI * 2;
  return [
    (R + r * Math.cos(phi)) * Math.cos(theta),
    (R + r * Math.cos(phi)) * Math.sin(theta),
    r * Math.sin(phi),
  ];
}

// Distribute variables around the torus using golden-angle distribution
function distributeVars(variables) {
  const N = variables.length;
  return variables.map((variable, index) => {
    const uCoord = ((index + 0.5) / N + index * 0.382) % 1;
    const vCoord = ((index * 0.618) % 1 + 0.1) % 1;
    const toneIdx = variable.tone === 'ember' ? 0.0 : variable.tone === 'leaf' ? 1.0 : 0.5;
    return { ...variable, u: uCoord, v: vCoord, toneIdx };
  });
}

// Build particle positions for a given SCM (variable nodes + edge flow)
function buildSCMCloud(scm, seedValue) {
  const rng = mulberry32(seedValue);
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const tones = new Float32Array(PARTICLE_COUNT);
  const flowIndex = new Float32Array(PARTICLE_COUNT);

  const variables = scm.parameters.vars;
  const edges = scm.parameters.edges;
  const N = variables.length;

  // Node particles (bright concentrated hubs) — 8% of total
  const nodeCount = Math.floor(PARTICLE_COUNT * 0.08);
  for (let i = 0; i < nodeCount; i++) {
    const node = variables[i % N];
    const point = torusPoint(node.u, node.v);
    const jitter = 0.06;
    const idx = i * 3;
    positions[idx]   = point[0] + (rng() - 0.5) * jitter;
    positions[idx+1] = point[1] + (rng() - 0.5) * jitter;
    positions[idx+2] = point[2] + (rng() - 0.5) * jitter;
    tones[i] = node.toneIdx;
    flowIndex[i] = -1;
  }

  // Flow particles along edges
  const flowCount = PARTICLE_COUNT - nodeCount;
  for (let i = 0; i < flowCount; i++) {
    const edge = edges[i % edges.length];
    const fromVar = variables.find(v => v.id === edge.from);
    const toVar = variables.find(v => v.id === edge.to);
    if (!fromVar || !toVar) continue;
    const progress = rng();
    const uMix = fromVar.u * (1 - progress) + toVar.u * progress;
    const pointA = torusPoint(uMix, fromVar.v);
    const pointB = torusPoint(uMix, toVar.v);
    const tMix = rng();
    const baseX = pointA[0] * (1 - tMix) + pointB[0] * tMix;
    const baseY = pointA[1] * (1 - tMix) + pointB[1] * tMix;
    const baseZ = pointA[2] * (1 - tMix) + pointB[2] * tMix;
    // Radial breathing offset
    const radialOffset = (rng() - 0.5) * 0.18;
    const len2D = Math.sqrt(baseX * baseX + baseY * baseY) || 1;
    const ux = baseX / len2D;
    const uy = baseY / len2D;
    const idx = (nodeCount + i) * 3;
    positions[idx]   = baseX + ux * radialOffset;
    positions[idx+1] = baseY + uy * radialOffset;
    positions[idx+2] = baseZ + (rng() - 0.5) * 0.15;
    // Tone is blend of from→to
    tones[nodeCount + i] = (fromVar.toneIdx + toVar.toneIdx) / 2;
    flowIndex[nodeCount + i] = i % edges.length;
  }

  return { positions, tones, flowIndex };
}

// Vertex shader
const vertexShader = `
attribute float tone;
attribute float flowIndex;
attribute vec3 positionB;

uniform float uTime;
uniform float uMorph;
uniform float uBreath;
uniform vec2 uMouse;
uniform float uPointerActive;

varying float vTone;
varying float vDepth;
varying float vFlow;

void main() {
  vec3 pos = mix(position, positionB, uMorph);

  // Breathing (radial pulse)
  float breath = sin(uTime * 0.6) * uBreath * 0.08;
  vec3 radial = normalize(pos + vec3(0.001));
  pos += radial * breath;

  // Mouse pull
  if (uPointerActive > 0.5) {
    float dist = length(pos.xy - uMouse * 3.0);
    float pull = smoothstep(4.0, 0.0, dist) * 0.15;
    vec3 toMouse = vec3(uMouse.x * 4.0, uMouse.y * 3.0, 0.5) - pos * 0.1;
    pos += normalize(toMouse + vec3(0.01)) * pull;
  }

  // Flow particles oscillate along radial axis
  if (flowIndex >= 0.0) {
    float phase = flowIndex * 1.7;
    float along = sin(uTime * 0.7 + phase) * 0.04;
    pos += radial * along;
  }

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Larger particles, especially ember ones
  gl_PointSize = (420.0 / -mvPosition.z) * (0.75 + tone * 0.5);
  gl_PointSize = clamp(gl_PointSize, 2.0, 14.0);

  vTone = tone;
  vDepth = -mvPosition.z;
  vFlow = flowIndex;
}
`;

const fragmentShader = `
uniform float uTime;
varying float vTone;
varying float vDepth;
varying float vFlow;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float dist = length(c);
  if (dist > 0.5) discard;

  float diskCore = smoothstep(0.5, 0.0, dist);
  float diskHalo = smoothstep(0.5, 0.18, dist);

  // 3 tones — ember, leaf, neutral
  vec3 ember  = vec3(0.95, 0.62, 0.36);   // #f29e5c
  vec3 leaf   = vec3(0.48, 0.92, 0.80);   // #7bebcc
  vec3 slate  = vec3(0.66, 0.70, 0.80);   // light slate
  vec3 color;
  if (vTone > 0.66) color = leaf;
  else if (vTone < 0.33) color = ember;
  else color = mix(slate, ember, 0.4);

  // Depth fade
  float depthFade = smoothstep(20.0, 6.0, vDepth);
  float alpha = diskCore * depthFade * 0.95;
  alpha += diskHalo * depthFade * 0.22;

  // Flow particles pulse
  float pulse = 0.65 + 0.35 * sin(uTime * 1.4 + vFlow * 0.9);
  if (vFlow >= 0.0) alpha *= pulse;

  gl_FragColor = vec4(color, alpha);
}
`;

export class ParticleCloud {
  constructor(canvasElement, containerElement) {
    this.canvasElement = canvasElement;
    this.containerElement = containerElement;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a0b0f, 12, 28);

    const rect = containerElement.getBoundingClientRect();
    this.camera = new THREE.PerspectiveCamera(50, rect.width / rect.height, 0.1, 100);
    this.camera.position.set(0, 0, 7);

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvasElement,
      antialias: true,
      alpha: false,
    });
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
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);

    this.mouseVec = new THREE.Vector2(0, 0);
    this.targetMouse = new THREE.Vector2(0, 0);
    this.pointerActive = false;
    this.pointerTimer = 0;
    this._morphTarget = 0;

    this._setupPointer();
    this._animate();

    window.addEventListener('resize', () => this._resize());
  }

  _setupPointer() {
    const onMove = (e) => {
      const r = this.containerElement.getBoundingClientRect();
      this.targetMouse.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      this.targetMouse.y = -((e.clientY - r.top) / r.height - 0.5) * 2;
      this.pointerActive = true;
      this.pointerTimer = 2.5;
    };
    this.containerElement.addEventListener('mousemove', onMove);
    this.containerElement.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      onMove({ clientX: t.clientX, clientY: t.clientY });
    }, { passive: true });
    this.containerElement.addEventListener('mouseleave', () => { this.pointerActive = false; });
  }

  _prepareParams(template) {
    const vars = distributeVars(template.vars);
    const edges = template.edges.map(e => ({ from: e.from, to: e.to }));
    return { vars, edges };
  }

  _seedFor(templateId, side) {
    let hash = 0;
    for (let i = 0; i < templateId.length; i++) hash = (hash * 31 + templateId.charCodeAt(i)) | 0;
    return Math.abs(hash) + (side === 'A' ? 1000 : 5000);
  }

  setTemplateA(template) {
    const params = this._prepareParams(template);
    const built = buildSCMCloud({ parameters: params }, this._seedFor(template.id, 'A'));
    this.positionsA.set(built.positions);
    this.tones.set(built.tones);
    this.flowIndex.set(built.flowIndex);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.tone.needsUpdate = true;
    this.geometry.attributes.flowIndex.needsUpdate = true;
  }

  setTemplateB(template) {
    const params = this._prepareParams(template);
    const built = buildSCMCloud({ parameters: params }, this._seedFor(template.id, 'B'));
    this.positionsB.set(built.positions);
    this.geometry.attributes.positionB.needsUpdate = true;
  }

  morphTo(template, duration = 1.6) {
    this.setTemplateB(template);
    this.uniforms.uMorph.value = 0;
    this._morphTarget = 1;
    setTimeout(() => {
      const tmp = this.positionsA;
      this.positionsA.set(this.positionsB);
      this.positionsB.set(tmp);
      this.geometry.attributes.position.needsUpdate = true;
      this.uniforms.uMorph.value = 0;
      this._morphTarget = 0;
    }, duration * 1000);
  }

  _animate() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      this.uniforms.uTime.value = performance.now() * 0.001;

      this.mouseVec.lerp(this.targetMouse, 0.05);
      this.uniforms.uMouse.value.copy(this.mouseVec);

      if (this.pointerActive) {
        this.pointerTimer -= 0.016;
        if (this.pointerTimer <= 0) this.pointerActive = false;
      }
      this.uniforms.uPointerActive.value = this.pointerActive ? 1 : 0;

      this.uniforms.uMorph.value = THREE.MathUtils.lerp(
        this.uniforms.uMorph.value,
        this._morphTarget ?? 0,
        0.04
      );
      this.uniforms.uBreath.value = 0.85 + Math.sin(this.uniforms.uTime.value * 0.4) * 0.15;

      // Slow autorotation + mouse parallax
      this.points.rotation.y = this.uniforms.uTime.value * 0.06 + this.mouseVec.x * 0.12;
      this.points.rotation.x = Math.sin(this.uniforms.uTime.value * 0.2) * 0.08 + this.mouseVec.y * 0.08;

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
