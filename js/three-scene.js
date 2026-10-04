// 3D scene for metacortex — Three.js based
// Loaded via ES module from esm.sh CDN
// Supports two modes:
//   1. Hero background (passive, slow rotation, particles flowing)
//   2. Interactive DAG (orbit controls, click-to-select, particle flow on intervention)

import * as THREE from 'https://esm.sh/three@0.160.0';

// ============================================================
// 1. HERO BACKGROUND SCENE — slow rotating causal graph + particles
// ============================================================
export class HeroScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a0b0f, 8, 30);
    
    const rect = canvas.getBoundingClientRect();
    const aspect = rect.width / rect.height;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
    this.camera.position.set(0, 0, 12);
    
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(rect.width, rect.height, false);
    this.renderer.setClearColor(0x000000, 0);
    
    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xd97757, 1.5);
    dirLight.position.set(5, 5, 5);
    this.scene.add(dirLight);
    const pointLight = new THREE.PointLight(0x6ee7c7, 1.0, 20);
    pointLight.position.set(-3, 2, 4);
    this.scene.add(pointLight);
    const pointLight2 = new THREE.PointLight(0x7dd3fc, 0.8, 20);
    pointLight2.position.set(3, -2, 4);
    this.scene.add(pointLight2);
    
    // Build floating graph
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.nodes = [];
    this.edges = [];
    this.particles = [];
    
    const positions = [
      [-3, 1.5, 0], [0, 2, 0.5], [3, 1.5, -0.5],
      [-3, 0, -0.5], [0, 0, 0], [3, 0, 0.5],
      [-3, -1.5, 0.5], [0, -1.5, -0.5], [3, -1.5, 0],
    ];
    const labels = ['X₁', 'Y₁', 'Z₁', 'X₂', 'Y₂', 'Z₂', 'X₃', 'Y₃', 'Z₃'];
    const colorPalette = [0xd97757, 0x6ee7c7, 0x7dd3fc, 0xfbbf24, 0xfb7185];
    
    positions.forEach((pos, i) => {
      const geo = new THREE.IcosahedronGeometry(0.22, 1);
      const color = colorPalette[i % colorPalette.length];
      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.6,
        roughness: 0.3, metalness: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      this.nodes.push(mesh);
      this.group.add(mesh);
    });
    
    // Edges with particles flowing along them
    const edgeIndices = [
      [0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8],
      [0, 3], [3, 6], [1, 4], [4, 7], [2, 5], [5, 8],
      [0, 4], [4, 8], [1, 5], // picked (à la B)
    ];
    edgeIndices.forEach(([from, to], i) => {
      const start = positions[from], end = positions[to];
      const curve = new THREE.LineCurve3(
        new THREE.Vector3(...start),
        new THREE.Vector3(...end),
      );
      const points = curve.getPoints(20);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0x9aa3b2, transparent: true, opacity: 0.18,
      });
      const line = new THREE.Line(geometry, material);
      this.group.add(line);
      this.edges.push({ curve, line });
      
      // Particles flowing along edges
      const particleCount = 4;
      const particleGeo = new THREE.BufferGeometry();
      const ppos = new Float32Array(particleCount * 3);
      const sizes = new Float32Array(particleCount);
      for (let j = 0; j < particleCount; j++) {
        sizes[j] = Math.random() * 0.06 + 0.03;
        ppos[j*3] = ppos[j*3+1] = ppos[j*3+2] = 0;
      }
      particleGeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
      particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
      const particleMat = new THREE.PointsMaterial({
        color: 0xd97757, size: 0.08, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const particles = new THREE.Points(particleGeo, particleMat);
      this.group.add(particles);
      this.particles.push({ points: particles, curve, offset: Math.random() });
    });
    
    // Mouse parallax
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener('mousemove', (e) => {
      this.mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      this.mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    });
    
    this.clock = new THREE.Clock();
    this.start();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  
  start() {
    const animate = () => {
      this.raf = requestAnimationFrame(animate);
      const t = this.clock.getElapsedTime();
      const dt = this.clock.getDelta();
      
      // Mouse parallax
      this.mouse.x += (this.mouse.tx - this.mouse.x) * 0.05;
      this.mouse.y += (this.mouse.ty - this.mouse.y) * 0.05;
      this.camera.position.x = this.mouse.x * 0.6;
      this.camera.position.y = -this.mouse.y * 0.6;
      this.camera.lookAt(0, 0, 0);
      
      // Slow rotation
      this.group.rotation.y = t * 0.08;
      this.group.rotation.x = Math.sin(t * 0.2) * 0.1;
      
      // Pulse nodes
      this.nodes.forEach((node, i) => {
        const pulse = 1 + Math.sin(t * 1.5 + i * 0.4) * 0.08;
        node.scale.setScalar(pulse);
        node.material.emissiveIntensity = 0.4 + Math.sin(t * 2 + i * 0.5) * 0.3;
      });
      
      // Update particle positions along edges
      this.particles.forEach((p) => {
        const positions = p.points.geometry.attributes.position.array;
        const count = positions.length / 3;
        for (let i = 0; i < count; i++) {
          const t1 = ((t * 0.3 + i / count + p.offset) % 1);
          const point = p.curve.getPoint(t1);
          positions[i*3] = point.x;
          positions[i*3+1] = point.y;
          positions[i*3+2] = point.z;
        }
        p.points.geometry.attributes.position.needsUpdate = true;
      });
      
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }
  
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height, false);
  }
  
  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}

// ============================================================
// 2. INTERACTIVE DAG SCENE — orbit controls, click, particle flow
// ============================================================
export class DagScene {
  constructor(canvas, scm, onNodeClick) {
    this.canvas = canvas;
    this.scm = scm;
    this.onNodeClick = onNodeClick;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a0b0f, 6, 20);
    
    const rect = canvas.getBoundingClientRect();
    const aspect = rect.width / rect.height;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(0, 0, 14);
    
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(rect.width, rect.height, false);
    this.renderer.setClearColor(0x000000, 0);
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.6);
    d1.position.set(5, 5, 5); this.scene.add(d1);
    const d2 = new THREE.PointLight(0xd97757, 1.5, 25);
    d2.position.set(-4, 2, 5); this.scene.add(d2);
    
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.nodes = {}; // id -> {mesh, screenPos}
    this.edges = []; // [{from, to, line, curve, particles}]
    this.edgeFlowParticles = []; // active intervention flow
    
    this.build();
    this.setupControls();
    this.start();
    window.addEventListener('resize', () => this.resize());
  }
  
  build() {
    // Layered 3D layout
    const layers = {};
    const indeg = Object.fromEntries(this.scm.vars.map(v => [v.id, 0]));
    for (const e of this.scm.edges) indeg[e.to]++;
    let layer = 0;
    const remaining = new Set(this.scm.vars.map(v => v.id));
    while (remaining.size) {
      const layer_nodes = [];
      for (const id of remaining) if (indeg[id] === 0) layer_nodes.push(id);
      if (!layer_nodes.length) break;
      for (const id of layer_nodes) {
        layers[id] = layer;
        remaining.delete(id);
        for (const e of this.scm.edges.filter(x => x.from === id)) indeg[e.to]--;
      }
      layer++;
    }
    
    const byLayer = {};
    for (const v of this.scm.vars) {
      const L = layers[v.id] ?? 0;
      if (!byLayer[L]) byLayer[L] = [];
      byLayer[L].push(v);
    }
    
    const cols = Object.keys(byLayer).map(Number).sort((a, b) => a - b);
    const xSpan = 12, ySpan = 8;
    const xPad = -xSpan/2, yPad = -ySpan/2;
    const xStep = cols.length > 1 ? xSpan / (cols.length - 1) : 0;
    
    for (const L of cols) {
      const vs = byLayer[L];
      const yStep = vs.length > 1 ? ySpan / (vs.length - 1) : 0;
      vs.forEach((v, i) => {
        const x = xPad + xStep * L;
        const y = yPad + yStep * i;
        const z = (Math.random() - 0.5) * 0.4;
        this.createNode(v.id, v.label, x, y, z);
      });
    }
    
    // Edges
    for (const e of this.scm.edges) {
      this.createEdge(e.from, e.to);
    }
  }
  
  createNode(id, label, x, y, z) {
    const isHigh = this.scm.edges.filter(e => e.to === id).length >= 2;
    const radius = isHigh ? 0.35 : 0.28;
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const color = isHigh ? 0xd97757 : 0x6ee7c7;
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.5,
      roughness: 0.25, metalness: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.userData = { id, label };
    this.group.add(mesh);
    this.nodes[id] = { mesh, label, baseColor: color, baseIntensity: 0.5 };
    
    // Label sprite
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.font = 'bold 28px ui-monospace, monospace';
    ctx.fillStyle = '#f5f5f7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2.5, 0.6, 1);
    sprite.position.set(x, y + radius + 0.4, z);
    this.group.add(sprite);
    this.nodes[id].sprite = sprite;
  }
  
  createEdge(from, to) {
    const a = this.nodes[from]?.mesh.position;
    const b = this.nodes[to]?.mesh.position;
    if (!a || !b) return;
    const points = [];
    const segs = 16;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      // Slight curve
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      mid.z += (Math.random() - 0.5) * 0.3;
      const p = new THREE.Vector3().lerpVectors(a, b, t).lerp(mid, Math.sin(t * Math.PI) * 0.3);
      points.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x9aa3b2, transparent: true, opacity: 0.35,
    });
    const line = new THREE.Line(geo, mat);
    this.group.add(line);
    this.edges.push({ from, to, line });
  }
  
  setupControls() {
    let isDragging = false, prevMouse = null;
    const onMouseDown = (e) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDragging = false; prevMouse = null; };
    const onMouseMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      if (isDragging && prevMouse) {
        const dx = e.clientX - prevMouse.x;
        const dy = e.clientY - prevMouse.y;
        this.group.rotation.y += dx * 0.005;
        this.group.rotation.x += dy * 0.005;
        prevMouse = { x: e.clientX, y: e.clientY };
      }
    };
    const onWheel = (e) => {
      e.preventDefault();
      this.camera.position.z = Math.max(8, Math.min(25, this.camera.position.z + e.deltaY * 0.01));
    };
    const onClick = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const meshes = Object.values(this.nodes).map(n => n.mesh);
      const intersects = this.raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        const id = intersects[0].object.userData.id;
        this.onNodeClick?.(id);
      }
    };
    
    this.canvas.addEventListener('mousedown', onMouseDown);
    this.canvas.addEventListener('mouseup', onMouseUp);
    this.canvas.addEventListener('mousemove', onMouseMove);
    this.canvas.addEventListener('wheel', onWheel, { passive: false });
    this.canvas.addEventListener('click', onClick);
  }
  
  highlightNodes(idSet) {
    for (const [id, n] of Object.entries(this.nodes)) {
      const isHi = idSet.has(id);
      n.mesh.material.emissiveIntensity = isHi ? 1.2 : 0.3;
      n.mesh.material.color.setHex(isHi ? n.baseColor : 0x5e6877);
      n.mesh.material.emissive.setHex(isHi ? n.baseColor : 0x000000);
      const targetScale = isHi ? 1.3 : 1.0;
      n.mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.15);
    }
  }
  
  start() {
    const animate = () => {
      this.raf = requestAnimationFrame(animate);
      const t = performance.now() * 0.001;
      
      // Gentle auto-rotation when idle
      if (!this._userInteracted) {
        this.group.rotation.y += 0.001;
      }
      
      // Pulse all nodes subtly
      for (const [id, n] of Object.entries(this.nodes)) {
        const pulse = 1 + Math.sin(t * 1.5 + id.length) * 0.04;
        if (!n._highlighted) {
          n.mesh.scale.setScalar(pulse);
        }
      }
      
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }
  
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height, false);
  }
  
  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}
