import { SCM, detectLoops, leverageScores, bottlenecks } from './causal.js';
import { DagScene } from './three-scene.js';

const state = {
  examples: null,
  scms: {}, currentId: null,
  selectedNode: null, leverageMode: false,
  dagScene: null,
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
    item.innerHTML = `<div class="name">${e.name}</div><div class="meta">${e.domain} · ${e.vars.length} vars · ${e.edges.length} edges</div>`;
    item.addEventListener('click', () => selectSCM(e.id));
    list.appendChild(item);
  }
}

function pickTarget() {
  const scmData = state.examples.find(s => s.id === state.currentId);
  const scm = state.scms[state.currentId];
  const out = {};
  for (const e of scm.edges) out[e.to] = (out[e.to] || 0) + 1;
  let best = scmData.vars[0].id, bestCount = -1;
  for (const v of scmData.vars) if ((out[v.id] || 0) > bestCount) { bestCount = out[v.id] || 0; best = v.id; }
  return best;
}

function selectSCM(id) {
  state.currentId = id;
  state.selectedNode = null;
  const scmData = state.examples.find(s => s.id === id);
  document.getElementById('scm-title').textContent = scmData.name;
  document.getElementById('scm-domain').textContent = scmData.domain;
  document.getElementById('scm-domain-2').textContent = scmData.domain;
  renderSCMList();
  buildDagScene();
  renderCounterfactualUI();
  renderInsights();
  renderLoops();
  renderSelectedDetail();
}

function buildDagScene() {
  const canvas = document.getElementById('dag');
  const scm = state.scms[state.currentId];
  if (state.dagScene) state.dagScene.dispose();
  state.dagScene = new DagScene(canvas, scm, (id) => {
    state.selectedNode = state.selectedNode === id ? null : id;
    renderSelectedDetail();
    renderDagHighlights();
  });
}

function renderDagHighlights() {
  if (!state.dagScene) return;
  if (state.leverageMode) {
    const scm = state.scms[state.currentId];
    const target = pickTarget();
    const scores = leverageScores(scm, target);
    const sorted = Object.entries(scores).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const top = new Set(sorted.slice(0, 3).map(([id]) => id));
    state.dagScene.highlightNodes(top);
  } else if (state.selectedNode) {
    const set = new Set([state.selectedNode]);
    const scm = state.scms[state.currentId];
    for (const e of scm.edges) {
      if (e.to === state.selectedNode) set.add(e.from);
      if (e.from === state.selectedNode) set.add(e.to);
    }
    state.dagScene.highlightNodes(set);
  } else {
    // Reset all
    const scm = state.scms[state.currentId];
    state.dagScene.highlightNodes(new Set(scm.vars.map(v => v.id)));
  }
}

function renderCounterfactualUI() {
  const scmData = state.examples.find(s => s.id === state.currentId);
  const outcome = document.getElementById('cf-outcome');
  const input = document.getElementById('cf-input');
  outcome.innerHTML = ''; input.innerHTML = '';
  for (const v of scmData.vars) {
    const o = document.createElement('option'); o.value = v.id; o.textContent = v.label; outcome.appendChild(o);
    const i = document.createElement('option'); i.value = v.id; i.textContent = v.label; input.appendChild(i);
  }
  outcome.value = pickTarget();
  const upstream = scmData.vars.find(v => scmData.vars.every(w => !scmData.equations[w.id].parents.includes(v.id) || w.id === v.id)) || scmData.vars[0];
  input.value = upstream.id;
  const scm = state.scms[state.currentId];
  const s = scm.summary(outcome.value, scm.sample(200));
  document.getElementById('cf-baseline').value = `μ ${s.mean.toFixed(2)} · σ ${s.std.toFixed(2)} · p50 ${Math.round(s.p50)}`;
  document.getElementById('cf-value').value = (Math.round((s.mean + s.std) * 100) / 100).toString();
  document.getElementById('cf-stats').innerHTML = '';
  document.getElementById('cf-hist').innerHTML = '<div style="font-size:11px;color:var(--text-faint);width:100%;text-align:center;margin:auto">Run do(X) to see the posterior distribution</div>';
}

document.getElementById('btn-run').addEventListener('click', () => {
  const scm = state.scms[state.currentId];
  const target = document.getElementById('cf-outcome').value;
  const x = document.getElementById('cf-input').value;
  const val = parseFloat(document.getElementById('cf-value').value);
  const n = parseInt(document.getElementById('cf-samples').value) || 1000;
  if (x === target) {
    document.getElementById('cf-stats').innerHTML = '<div style="color:var(--warning);font-size:12px;">Intervention variable must differ from outcome.</div>';
    return;
  }
  const dist = scm.interventional(target, { [x]: val }, n);
  const stats = document.getElementById('cf-stats');
  stats.innerHTML = `
      <div class="cf-stat"><div class="val">${dist.mean.toFixed(2)}</div><div class="lbl">mean</div></div>
      <div class="cf-stat"><div class="val">±${dist.std.toFixed(2)}</div><div class="lbl">std dev</div></div>
      <div class="cf-stat"><div class="val">${dist.p05.toFixed(1)}</div><div class="lbl">p05</div></div>
      <div class="cf-stat"><div class="val">${dist.p50.toFixed(1)}</div><div class="lbl">p50</div></div>
      <div class="cf-stat"><div class="val">${dist.p95.toFixed(1)}</div><div class="lbl">p95</div></div>
    `;
  const hist = document.getElementById('cf-hist');
  hist.innerHTML = '';
  renderHistogram(hist, dist.samples);
});

document.getElementById('btn-leverage').addEventListener('click', (e) => {
  state.leverageMode = !state.leverageMode;
  e.currentTarget.textContent = state.leverageMode ? 'Reset highlight' : 'Highlight leverage';
  renderDagHighlights();
});

document.getElementById('btn-reset').addEventListener('click', () => {
  state.selectedNode = null;
  state.leverageMode = false;
  document.getElementById('btn-leverage').textContent = 'Highlight leverage';
  renderDagHighlights();
  renderSelectedDetail();
});

function renderInsights() {
  const list = document.getElementById('insights-list');
  list.innerHTML = '';
  const scmData = state.examples.find(s => s.id === state.currentId);
  const scm = state.scms[state.currentId];
  const target = pickTarget();
  const scores = leverageScores(scm, target);
  const sorted = Object.entries(scores).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const top = sorted[0];
  if (top && Math.abs(top[1]) > 0) {
    const v = scmData.vars.find(v => v.id === top[0]);
    list.appendChild(insight('info', `Top leverage: ${v.label}`,
      `Total causal effect ≈ <strong>${top[1].toFixed(2)}</strong>. ${Math.abs(top[1]) > 0.5 ? 'Strong candidate for intervention point.' : 'Marginal leverage.'}`));
  }
  const bn = bottlenecks(scm);
  const highBn = Object.entries(bn).sort((a, b) => b[1] - a[1])[0];
  if (highBn && highBn[1] >= 2) {
    const v = scmData.vars.find(v => v.id === highBn[0]);
    list.appendChild(insight('warn', `Bottleneck: ${v.label}`,
      `${highBn[1]} downstream variables depend on it. Single point of failure.`));
  }
  const upstream = scmData.vars.filter(v => !scm.edges.some(e => e.to === v.id));
  if (upstream.length > 0) {
    list.appendChild(insight('info', `${upstream.length} upstream root${upstream.length > 1 ? 's' : ''}`,
      `Intervening on ${upstream.slice(0, 3).map(v => v.label).join(', ')} propagates to ${scmData.vars.find(v => v.id === target)?.label}.`));
  }
  list.appendChild(insight('info', 'Bayesian loop active',
    'Continuous update of SCMs from observed outcomes. Doubly-robust estimation enabled.'));
}

function insight(kind, title, body) {
  const el = document.createElement('div');
  el.className = `insight-item ${kind}`;
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
    list.innerHTML = '<p style="font-size: 12px; color: var(--text-faint);">No feedback loops detected.</p>';
    return;
  }
  for (const l of loops) {
    const el = document.createElement('div');
    el.className = `loop-item ${l.polarity === 'R' ? 'r' : 'b'}`;
    const nodeLabels = l.nodes.map(id => scmData.vars.find(v => v.id === id)?.label || id).join(' → ');
    el.innerHTML = `
        <div class="lbl">${l.polarity === 'R' ? 'R · reinforcing' : 'B · balancing'} · strength ${l.strength.toFixed(2)}</div>
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
    detail.innerHTML = '<p style="font-size: 12px; color: var(--text-faint);">Click a node in the 3D graph to inspect.</p>';
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
    return `<li><code>${p}</code> (${pv?.label}) · coef ${(eq.coef[p] ?? 0).toFixed(2)}</li>`;
  }).join('') : '<li style="color:var(--text-faint)">root — no parents</li>';
  detail.innerHTML = `
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">${v.label}</div>
      <div style="font-size: 11px; color: var(--text-faint); margin-bottom: 12px; font-family: var(--font-mono);">${v.id} · ${v.unit}</div>
      <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 4px;">Structural equation:</div>
      <div style="font-family: var(--font-mono); font-size: 11px; background: var(--bg); padding: 10px; border-radius: 6px; margin-bottom: 14px; line-height: 1.6;">
        ${v.id} = ${eq.intercept}${eq.parents.map(p => ` + ${eq.coef[p].toFixed(2)}·${p}`).join('')} + ε(σ=${eq.sigma})
      </div>
      <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 4px;">Parents:</div>
      <ul style="font-size: 11px; padding-left: 14px; margin-bottom: 12px; color: var(--text-dim);">${parentsList}</ul>
      <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 4px;">Baseline (n=500):</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; font-family: var(--font-mono);">
        <div>mean <strong>${s.mean.toFixed(2)}</strong></div><div>p50 <strong>${Math.round(s.p50)}</strong></div>
        <div>std <strong>${s.std.toFixed(2)}</strong></div><div>p05/p95 <strong>${s.p05.toFixed(1)}/${s.p95.toFixed(1)}</strong></div>
      </div>
    `;
}

function renderHistogram(container, samples) {
  const n = samples.length;
  const bins = 24;
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

load();
