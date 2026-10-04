// DAG visualization on SVG. No external libs.
// Pure JS — renders nodes + directed edges with arrowheads.

export function layoutDAG(scm, height = 380) {
  // Layered layout: assign each variable a topological layer
  const layers = {};
  const indeg = Object.fromEntries(scm.vars.map(v => [v.id, 0]));
  for (const e of scm.edges) indeg[e.to]++;
  let layer = 0;
  const remaining = new Set(scm.vars.map(v => v.id));
  while (remaining.size) {
    const layer_nodes = [];
    for (const id of remaining) if (indeg[id] === 0) layer_nodes.push(id);
    if (!layer_nodes.length) break;
    for (const id of layer_nodes) {
      layers[id] = layer;
      remaining.delete(id);
      for (const e of scm.edges.filter(x => x.from === id)) indeg[e.to]--;
    }
    layer++;
  }
  // Group by layer, position nodes
  const byLayer = {};
  for (const v of scm.vars) {
    const L = layers[v.id] ?? 0;
    if (!byLayer[L]) byLayer[L] = [];
    byLayer[L].push(v);
  }
  const cols = Object.keys(byLayer).map(Number).sort((a,b) => a-b);
  const totalLayers = cols.length;
  const xStep = totalLayers > 1 ? 100 / (totalLayers - 1) : 50;
  const positions = {};
  const xPad = 12, yPad = 30;
  for (const L of cols) {
    const vs = byLayer[L];
    const yStep = (100 - 2*yPad) / Math.max(vs.length, 1);
    vs.forEach((v, i) => {
      positions[v.id] = {
        x: xPad + xStep * L,
        y: yPad + yStep * (i + 0.5),
      };
    });
  }
  return positions;
}

export function renderDAG(svg, scm, opts = {}) {
  const W = svg.clientWidth || 600;
  const H = svg.clientHeight || 380;
  svg.setAttribute('viewBox', `0 0 100 ${100 * H / W}`);
  svg.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  const pos = layoutDAG(scm, H);
  const selected = opts.selected ?? null;
  const highlighted = opts.highlighted ?? null;

  // Arrowhead def
  const defs = document.createElementNS(NS, 'defs');
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '5');
  marker.setAttribute('markerHeight', '5');
  marker.setAttribute('orient', 'auto-start-reverse');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  path.setAttribute('fill', 'currentColor');
  marker.appendChild(path);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // Edges
  for (const e of scm.edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const line = document.createElementNS(NS, 'line');
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const ux = dx/dist, uy = dy/dist;
    const ax = a.x + ux * 6;
    const ay = a.y + uy * 6;
    const bx = b.x - ux * 6;
    const by = b.y - uy * 6;
    line.setAttribute('x1', ax);
    line.setAttribute('y1', ay);
    line.setAttribute('x2', bx);
    line.setAttribute('y2', by);
    line.setAttribute('stroke', highlighted?.edges?.has(`${e.from}->${e.to}`) ? '#6ee7c7' : (highlighted?.nodes?.has(e.from) && highlighted?.nodes?.has(e.to) ? '#9aa6b6' : '#2a3543'));
    line.setAttribute('stroke-width', highlighted?.edges?.has(`${e.from}->${e.to}`) ? '0.6' : '0.3');
    line.setAttribute('marker-end', 'url(#arrow)');
    line.style.color = highlighted?.edges?.has(`${e.from}->${e.to}`) ? '#6ee7c7' : '#9aa6b6';
    svg.appendChild(line);
  }

  // Nodes
  for (const v of scm.vars) {
    const p = pos[v.id];
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${p.x}, ${p.y})`);
    const r = v.id === selected ? 6 : 4;
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('r', r);
    circle.setAttribute('fill', v.id === selected ? '#6ee7c7' : (highlighted?.nodes?.has(v.id) ? '#161c26' : '#11161e'));
    circle.setAttribute('stroke', highlighted?.nodes?.has(v.id) ? '#6ee7c7' : '#5a6473');
    circle.setAttribute('stroke-width', '0.4');
    g.appendChild(circle);
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('y', -7);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', highlighted?.nodes?.has(v.id) ? '#e6ebf2' : '#9aa6b6');
    text.setAttribute('font-size', '3.2');
    text.setAttribute('font-family', 'ui-monospace, monospace');
    text.textContent = v.label;
    g.appendChild(text);
    const sub = document.createElementNS(NS, 'text');
    sub.setAttribute('y', 10);
    sub.setAttribute('text-anchor', 'middle');
    sub.setAttribute('fill', '#5a6473');
    sub.setAttribute('font-size', '2.4');
    sub.setAttribute('font-family', 'ui-monospace, monospace');
    sub.textContent = v.id;
    g.appendChild(sub);
    g.style.cursor = 'pointer';
    g.addEventListener('click', () => opts.onNodeClick?.(v.id));
    svg.appendChild(g);
  }
}

// Render a histogram from sorted samples into a flex row of bars
export function renderHistogram(container, samples, opts = {}) {
  const n = samples.length;
  const bins = opts.bins ?? 20;
  const min = samples[0], max = samples[n - 1];
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of samples) {
    const i = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[i]++;
  }
  const maxC = Math.max(...counts);
  container.innerHTML = '';
  for (let i = 0; i < bins; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${(counts[i] / maxC) * 100}%`;
    bar.style.opacity = counts[i] === 0 ? '0.2' : '0.85';
    bar.title = `${(min + i*width).toFixed(2)} → ${(min + (i+1)*width).toFixed(2)} : ${counts[i]}`;
    container.appendChild(bar);
  }
}
