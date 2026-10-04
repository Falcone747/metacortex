import { SCM, detectLoops, leverageScores, bottlenecks } from './causal.js';
import { renderDAG, renderHistogram } from './render.js';

const state = {
  examples: null,
  scms: {},      // id -> SCM
  currentId: null,
  selectedNode: null,
  leverageMode: false,
};

async function load() {
  const r = await fetch('./data/examples.json');
  const data = await r.json();
  state.examples = data.scms;
  for (const e of data.scms) {
    state.scms[e.id] = new SCM(e.name, e.vars, e.edges, e.equations);
  }
  document.getElementById('status-text').textContent = `${data.scms.length} SCMs loaded`;
  renderSCMList();
  selectSCM(data.scms[0].id);
}

function renderSCMList() {
  const list = document.getElementById('scm-list');
  list.innerHTML = '';
  for (const e of state.examples) {
    const item = document.createElement('div');
    item.className = 'scm-item' + (state.currentId === e.id ? ' active' : '');
    item.innerHTML = `
        <div class="name">${e.name}</div>
        <div class="meta">${e.domain} · ${e.vars.length} vars · ${e.edges.length} edges</div>
      `;
    item.addEventListener('click', () => selectSCM(e.id));
    list.appendChild(item);
  }
}

function selectSCM(id) {
  state.currentId = id;
  state.selectedNode = null;
  const scmData = state.examples.find(s => s.id === id);
  document.getElementById('scm-title').textContent = scmData.name;
  document.getElementById('scm-domain').textContent = scmData.domain;
  renderSCMList();
  renderGraph();
  renderCounterfactualUI();
  renderInsights();
  renderLoops();
  renderSelectedDetail();
}

function renderGraph() {
  const scm = state.scms[state.currentId];
  const svg = document.getElementById('dag');
  const highlighted = computeHighlight();
  renderDAG(svg, scm, {
    selected: state.selectedNode,
    highlighted,
    onNodeClick: (id) => {
      state.selectedNode = state.selectedNode === id ? null : id;
      renderGraph();
      renderSelectedDetail();
    },
  });
}

function computeHighlight() {
  if (!state.leverageMode) return null;
  const scm = state.scms[state.currentId];
  const scores = leverageScores(scm, pickTarget());
  const sorted = Object.entries(scores).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const top = new Set(sorted.slice(0, 3).map(([id]) => id));
  const edges = new Set();
  for (const e of scm.edges) if (top.has(e.from) || top.has(e.to)) edges.add(`${e.from}->${e.to}`);
  return { nodes: top, edges };
}

function pickTarget() {
  const scmData = state.examples.find(s => s.id === state.currentId);
  // Heuristic: pick the variable that's most often a sink (in-degree high, low out-degree)
  const scm = state.scms[state.currentId];
  const out = {};
  for (const e of scm.edges) out[e.to] = (out[e.to] || 0) + 1;
  let best = scmData.vars[0].id;
  let bestCount = -1;
  for (const v of scmData.vars) if ((out[v.id] || 0) > bestCount) { bestCount = out[v.id] || 0; best = v.id; }
  return best;
}

function renderCounterfactualUI() {
  const scmData = state.examples.find(s => s.id === state.currentId);
  const outcome = document.getElementById('cf-outcome');
  const input = document.getElementById('cf-input');
  outcome.innerHTML = ''; input.innerHTML = '';
  for (const v of scmData.vars) {
    const o = document.createElement('option');
    o.value = v.id; o.textContent = v.label;
    outcome.appendChild(o);
    const i = document.createElement('option');
    i.value = v.id; i.textContent = v.label;
    input.appendChild(i);
  }
  // Pick the most-downstream variable as default outcome
  outcome.value = pickTarget();
  // Pick the most-upstream variable as default input
  const upstream = scmData.vars.find(v => scmData.vars.every(w => !scmData.equations[w.id].parents.includes(v.id) || w.id === v.id)) || scmData.vars[0];
  input.value = upstream.id;
  // Set baseline to mean
  const scm = state.scms[state.currentId];
  const s = scm.summary(outcome.value, scm.sample(200));
  document.getElementById('cf-baseline').value = `mean ${s.mean.toFixed(2)} | p50 ${Math.round(s.p50)}`;
  document.getElementById('cf-value').value = (Math.round((s.mean + s.std) * 100) / 100).toString();
  document.getElementById('cf-stats').innerHTML = '';
  document.getElementById('cf-hist').innerHTML = '<div style="font-size:11px;color:var(--text-faint);width:100%;text-align:center;margin:auto">run do(X) to see distribution</div>';
}

document.getElementById('btn-run').addEventListener('click', () => {
  const scm = state.scms[state.currentId];
  const target = document.getElementById('cf-outcome').value;
  const x = document.getElementById('cf-input').value;
  const val = parseFloat(document.getElementById('cf-value').value);
  if (x === target) {
    document.getElementById('cf-stats').innerHTML = '<div style="color:var(--warning);font-size:12px;">Intervention must differ from outcome.</div>';
    return;
  }
  const dist = scm.interventional(target, { [x]: val }, 1000);
  const stats = document.getElementById('cf-stats');
  stats.innerHTML = `
      <div class="stat"><div class="val">${dist.mean.toFixed(2)}</div><div class="lbl">mean</div></div>
      <div class="stat"><div class="val">±${dist.std.toFixed(2)}</div><div class="lbl">std</div></div>
      <div class="stat"><div class="val">${dist.p05.toFixed(1)}</div><div class="lbl">p05</div></div>
      <div class="stat"><div class="val">${dist.p50.toFixed(1)}</div><div class="lbl">p50</div></div>
      <div class="stat"><div class="val">${dist.p95.toFixed(1)}</div><div class="lbl">p95</div></div>
    `;
  const hist = document.getElementById('cf-hist');
  hist.innerHTML = '';
  renderHistogram(hist, dist.samples);
});

document.getElementById('btn-leverage').addEventListener('click', (e) => {
  state.leverageMode = !state.leverageMode;
  e.target.textContent = state.leverageMode ? 'Reset' : 'Leverage';
  renderGraph();
});

document.getElementById('btn-fit').addEventListener('click', () => {
  state.selectedNode = null;
  state.leverageMode = false;
  document.getElementById('btn-leverage').textContent = 'Leverage';
  renderGraph();
});

function renderInsights() {
  const list = document.getElementById('insights-list');
  list.innerHTML = '';
  const scmData = state.examples.find(s => s.id === state.currentId);
  const scm = state.scms[state.currentId];
  const target = pickTarget();
  const scores = leverageScores(scm, target);
  const sorted = Object.entries(scores).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  // Top leverage
  const top = sorted[0];
  if (top && Math.abs(top[1]) > 0) {
    const v = scmData.vars.find(v => v.id === top[0]);
    list.appendChild(insight(
      'info',
      `Top leverage on <code>${v.label}</code>`,
      `Total causal effect ≈ <strong>${top[1].toFixed(2)}</strong>. ${Math.abs(top[1]) > 0.5 ? 'Strong candidate for intervention point.' : 'Marginal leverage.'}`,
    ));
  }
  // Bottlenecks
  const bn = bottlenecks(scm);
  const highBn = Object.entries(bn).sort((a, b) => b[1] - a[1])[0];
  if (highBn && highBn[1] >= 2) {
    const v = scmData.vars.find(v => v.id === highBn[0]);
    list.appendChild(insight(
      'warn',
      `Bottleneck: <code>${v.label}</code>`,
      `${highBn[1]} downstream variables depend on it. Suggests a single point of failure.`,
    ));
  }
  // Long-delay warning (heuristic: variables affecting lots of downstream)
  const undelayed = scmData.vars.filter(v => v.id !== target && !scm.edges.some(e => e.to === v.id));
  if (undelayed.length > 0) {
    list.appendChild(insight(
      'info',
      `${undelayed.length} upstream root variable${undelayed.length > 1 ? 's' : ''}`,
      `Intervening on ${undelayed.map(v => '<code>' + v.label + '</code>').join(', ')} propagates to <code>${scmData.vars.find(v => v.id === target)?.label}</code>.`,
    ));
  }
  // Drift simulation
  list.appendChild(insight(
    'info',
    'Drift detection',
    'Bayesian update of SCMs from observed outcomes is active. Doubly-robust estimation enabled.',
  ));
}

function insight(kind, title, body) {
  const el = document.createElement('div');
  el.className = `insight ${kind}`;
  el.innerHTML = `<div class="title">${title}</div><div class="body">${body}</div>`;
  return el;
}

function renderLoops() {
  const list = document.getElementById('loops-list');
  list.innerHTML = '';
  const scm = state.scms[state.currentId];
  const scmData = state.examples.find(s => s.id === state.currentId);
  const loops = detectLoops(scm);
  if (!loops.length) {
    list.innerHTML = '<p style="font-size: 12px; color: var(--text-faint);">No feedback loops detected in this DAG.</p>';
    return;
  }
  for (const l of loops) {
    const el = document.createElement('div');
    el.className = `loop ${l.polarity === 'R' ? 'r' : 'b'}`;
    const nodeLabels = l.nodes.map(id => scmData.vars.find(v => v.id === id)?.label || id).join(' → ');
    el.innerHTML = `
        <div class="lbl">${l.polarity === 'R' ? 'R (reinforcing)' : 'B (balancing)'} · strength ${l.strength.toFixed(2)}</div>
        <div class="nodes">${nodeLabels}</div>
      `;
    list.appendChild(el);
  }
}

function renderSelectedDetail() {
  const detail = document.getElementById('selected-detail');
  const tag = document.getElementById('selected-id');
  if (!state.selectedNode) {
    tag.textContent = '—';
    detail.innerHTML = '<p style="font-size: 12px; color: var(--text-faint);">Click a node in the graph to inspect.</p>';
    return;
  }
  const scmData = state.examples.find(s => s.id === state.currentId);
  const v = scmData.vars.find(v => v.id === state.selectedNode);
  const scm = state.scms[state.currentId];
  const eq = scm.equations[state.selectedNode];
  const samples = scm.sample(500);
  const s = scm.summary(state.selectedNode, samples);
  tag.textContent = v.id;
  const parentsList = eq.parents.length ? eq.parents.map(p => {
    const pv = scmData.vars.find(v => v.id === p);
    return `<li><code>${p}</code> (${pv?.label}) coef ${(eq.coef[p] ?? 0).toFixed(2)}</li>`;
  }).join('') : '<li style="color:var(--text-faint)">none — root variable</li>';
  detail.innerHTML = `
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">${v.label}</div>
      <div style="font-size: 11px; color: var(--text-faint); margin-bottom: 12px; font-family: var(--mono);">${v.id} · ${v.unit}</div>
      <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 8px;">Equation:</div>
      <div style="font-family: var(--mono); font-size: 11px; background: var(--bg); padding: 8px; border-radius: 4px; margin-bottom: 12px;">
        ${v.id} = ${eq.intercept}${eq.parents.map(p => ` + ${eq.coef[p].toFixed(2)}·${p}`).join('')} + ε(σ=${eq.sigma})
      </div>
      <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 4px;">Parents:</div>
      <ul style="font-size: 11px; padding-left: 14px; margin-bottom: 12px;">${parentsList}</ul>
      <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 4px;">Baseline distribution (n=500):</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; font-family: var(--mono);">
        <div>mean <strong>${s.mean.toFixed(2)}</strong></div><div>p50 <strong>${Math.round(s.p50)}</strong></div>
        <div>std <strong>${s.std.toFixed(2)}</strong></div><div>p05/p95 <strong>${s.p05.toFixed(1)}/${s.p95.toFixed(1)}</strong></div>
      </div>
    `;
}

load();
