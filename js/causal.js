// Causal engine — Pearl's Structural Causal Models
// Linear-Gaussian SCMs with do-calculus and twin-network counterfactuals.
// Pure JS, no deps. MIT-style license.

export class SCM {
  constructor(name, vars, edges, equations) {
    this.name = name;
    this.vars = vars;            // [{id, label, unit}]
    this.edges = edges;          // [{from, to}]
    this.equations = equations;  // {id: {parents: [..], coef: {p: c}, intercept: b, sigma: s}}
    this.validate();
  }
  validate() {
    const ids = new Set(this.vars.map(v => v.id));
    for (const e of this.edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) throw new Error(`edge ${e.from}->${e.to} uses unknown var`);
    }
    for (const [vid, eq] of Object.entries(this.equations)) {
      if (!ids.has(vid)) throw new Error(`equation for unknown var ${vid}`);
      for (const p of eq.parents) if (!ids.has(p)) throw new Error(`eq ${vid} references unknown parent ${p}`);
      // acyclicity via Kahn
      const indeg = Object.fromEntries(this.vars.map(v => [v.id, 0]));
      for (const e of this.edges) indeg[e.to]++;
      const queue = this.vars.filter(v => indeg[v.id] === 0).map(v => v.id);
      const sorted = [];
      while (queue.length) {
        const n = queue.shift(); sorted.push(n);
        for (const e of this.edges.filter(x => x.from === n)) {
          if (--indeg[e.to] === 0) queue.push(e.to);
        }
      }
      if (sorted.length !== this.vars.length) throw new Error('cycle in DAG');
    }
  }
  parentsOf(v) { return this.equations[v]?.parents ?? []; }
  topological() {
    const indeg = Object.fromEntries(this.vars.map(v => [v.id, 0]));
    for (const e of this.edges) indeg[e.to]++;
    const queue = this.vars.filter(v => indeg[v.id] === 0).map(v => v.id);
    const sorted = [];
    while (queue.length) { const n = queue.shift(); sorted.push(n); for (const e of this.edges.filter(x => x.from === n)) if (--indeg[e.to] === 0) queue.push(e.to); }
    return sorted;
  }
  // Sample n parameters with MCMC from linear-Gaussian SCMs
  sample(n = 1000, doVals = {}) {
    const samples = {};
    for (const v of this.vars) samples[v.id] = new Array(n);
    // Box-Muller noise
    const noise = (() => {
      const u = new Array(n), r = new Array(n);
      for (let i = 0; i < n; i++) { u[i] = Math.random(); r[i] = Math.random(); }
      const z = new Array(n);
      for (let i = 0; i < n; i++) z[i] = Math.sqrt(-2 * Math.log(u[i] + 1e-12)) * Math.cos(2 * Math.PI * r[i]);
      return z;
    })();
    const noisePool = { _: noise };
    let pi = 0;
    function gauss(sigma) {
      if (pi >= n) pi = 0;
      return noisePool._[pi++] * sigma;
    }
    // Seed the exogenous (root) variables from N(0, sigma_exo)
    for (const vid of this.topological()) {
      const eq = this.equations[vid];
      if (doVals.hasOwnProperty(vid)) {
        for (let i = 0; i < n; i++) samples[vid][i] = doVals[vid];
      } else if (eq.parents.length === 0) {
        for (let i = 0; i < n; i++) samples[vid][i] = eq.intercept + gauss(eq.sigma);
      } else {
        for (let i = 0; i < n; i++) {
          let val = eq.intercept;
          for (const p of eq.parents) val += (eq.coef[p] ?? 0) * samples[p][i];
          samples[vid][i] = val + gauss(eq.sigma);
        }
      }
    }
    return samples;
  }
  // Distribution summary
  summary(targetId, samples) {
    const a = samples[targetId];
    const n = a.length;
    const sorted = [...a].sort((x, y) => x - y);
    const mean = a.reduce((s, x) => s + x, 0) / n;
    const variance = a.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    return {
      n,
      mean,
      std,
      min: sorted[0],
      max: sorted[n - 1],
      p05: sorted[Math.floor(n * 0.05)],
      p25: sorted[Math.floor(n * 0.25)],
      p50: sorted[Math.floor(n * 0.50)],
      p75: sorted[Math.floor(n * 0.75)],
      p95: sorted[Math.floor(n * 0.95)],
      samples: sorted,
    };
  }
  // Pearl: interventional distribution P(Y | do(X = x))
  interventional(targetId, doVals, n = 1000) {
    const samples = this.sample(n, doVals);
    return this.summary(targetId, samples);
  }
  // Pearl: counterfactual via twin network
  // Abduction-Action-Prediction
  counterfactual(targetId, observed, doNew, n = 1000) {
    // Step 1: Abduction — find noise terms U consistent with observed
    const noiseSamples = {};
    for (const v of this.vars) noiseSamples[v.id] = new Array(n);
    let pi = 0;
    function gauss(sigma) {
      if (pi >= n) pi = 0;
      return Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random()) * sigma;
    }
    // Solve for exogenous noise given observed target
    for (const vid of this.topological()) {
      const eq = this.equations[vid];
      if (eq.parents.length === 0) {
        // U = X - intercept, sample from prior
        for (let i = 0; i < n; i++) {
          noiseSamples[vid][i] = observed[vid] != null ? (observed[vid] - eq.intercept) : gauss(eq.sigma);
        }
      } else {
        for (let i = 0; i < n; i++) {
          if (observed[vid] != null) {
            let pred = eq.intercept;
            for (const p of eq.parents) pred += (eq.coef[p] ?? 0) * (observed[p] ?? 0);
            noiseSamples[vid][i] = observed[vid] - pred;
          } else {
            noiseSamples[vid][i] = gauss(eq.sigma);
          }
        }
      }
    }
    // Step 2-3: Action + Prediction — re-evaluate graph with doNew and the SAME noise
    const outSamples = { _: new Array(n) };
    outSamples[targetId] = new Array(n);
    for (const vid of this.topological()) {
      for (let i = 0; i < n; i++) {
        if (doNew.hasOwnProperty(vid)) {
          outSamples[vid] = outSamples[vid] ?? new Array(n);
          outSamples[vid][i] = doNew[vid];
        } else {
          outSamples[vid] = outSamples[vid] ?? new Array(n);
          const eq = this.equations[vid];
          let val = eq.intercept;
          for (const p of eq.parents) val += (eq.coef[p] ?? 0) * (outSamples[p]?.[i] ?? 0);
          outSamples[vid][i] = val + noiseSamples[vid][i];
        }
      }
    }
    return this.summary(targetId, outSamples);
  }
}

// Detect feedback loops in the SCM (cycle detection)
// Note: our DAG is acyclic by construction; "loops" in CLD sense = reinforcing/balancing cycle patterns
// We use a simplified heuristic: pairs of variables with positive/negative mutual influence
export function detectLoops(scm) {
  const loops = [];
  const eq = scm.equations;
  for (const a of Object.keys(eq)) {
    for (const b of Object.keys(eq)) {
      if (a === b) continue;
      const a_to_b = eq[b].parents.includes(a);
      const b_to_a = eq[a].parents.includes(b);
      if (a_to_b && b_to_a) {
        const coef_ab = eq[b].coef[a] ?? 0;
        const coef_ba = eq[a].coef[b] ?? 0;
        const product = coef_ab * coef_ba;
        loops.push({
          nodes: [a, b],
          polarity: product > 0 ? 'R' : 'B',
          strength: Math.abs(product),
        });
      }
    }
  }
  // Longer cycles: walk the graph in DFS, detect paths that return
  for (const start of scm.vars.map(v => v.id)) {
    const stack = [[start, [start]]];
    while (stack.length) {
      const [node, path] = stack.pop();
      if (path.length > 4) continue;
      for (const next of (eq[node]?.parents || [])) {
        if (next === start && path.length >= 2) {
          // Found cycle
          const coefs = [];
          for (let i = 0; i < path.length; i++) {
            const from = path[i], to = path[(i + 1) % path.length] || next;
            // We need to compute polarity by walking in the parent direction
            // Since we walked by parent links, this is the influence direction
          }
          // Simplified: compute polarity from pairwise coefs (rough approximation)
          const pol_product = path.slice(0, -1).reduce((p, n) => p * (eq[n].coef[path[path.indexOf(n) + 1]] ?? 0), 1);
          loops.push({
            nodes: [...path],
            polarity: pol_product > 0 ? 'R' : 'B',
            strength: Math.abs(pol_product),
          });
        } else if (!path.includes(next)) {
          stack.push([next, [...path, next]]);
        }
      }
    }
  }
  // Deduplicate
  const seen = new Set();
  return loops.filter(l => {
    const key = l.nodes.slice().sort().join('->');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Identify leverage points (Meadows-inspired heuristic for linear SCMs):
// variables with high total effect on a target outcome
export function leverageScores(scm, target) {
  const scores = {};
  for (const v of scm.vars.map(v => v.id)) {
    // Total causal effect on target via path enumeration (DAG is acyclic so finite)
    let total = 0;
    function walk(node, prod, visited) {
      if (node === target) { total += prod; return; }
      if (visited.has(node)) return total;
      visited.add(node);
      const eq = scm.equations[node];
      for (const child of scm.edges.filter(e => e.from === node).map(e => e.to)) {
        const coef = eq.coef[child] ?? 0;
        walk(child, prod * coef, visited);
      }
    }
    walk(v, 1, new Set());
    scores[v] = total;
  }
  return scores;
}

// Find bottleneck variables: those that affect many outcomes (high out-degree in DAG)
export function bottlenecks(scm) {
  const out = {};
  for (const v of scm.vars) {
    out[v.id] = scm.edges.filter(e => e.from === v.id).length;
  }
  return out;
}
