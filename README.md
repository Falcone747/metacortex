# metacortex

A causal reasoning layer for the enterprise. Open methodology and reference implementation, built on Judea Pearl's structural causal models, do-calculus, and Meadows' systems thinking.

**Status:** v0.1 — reference implementation, three example SCMs, fully interactive app.

## What is this?

metacortex is an executable framework for installing causal reasoning inside an organisation. It answers three questions that classical BI cannot:

1. **Association (L1)** — P(Y | X): what is observed? (dashboards)
2. **Intervention (L2)** — P(Y | do(X)): what would happen if I acted? (experiments + SCMs)
3. **Counterfactual (L3)** — P(Y_x | X', Y'): given what actually happened, what would have happened had X been different? (twin networks)

Most business intelligence answers L1. The metacortex answers all three.

## Quick start

```bash
# Clone
git clone https://github.com/Falcone747/metacortex.git
cd metacortex

# Serve (any static server works)
python3 -m http.server 8000

# Open
open http://localhost:8000
```

No build, no dependencies beyond a static file server. Pure HTML / CSS / ES modules.

## What's in the box

```
metacortex/
├── index.html              # Landing
├── app.html                # Interactive app
├── methodology.html        # Full methodology documentation
├── css/main.css            # Shared styles
├── js/
│   ├── causal.js           # SCM engine, do-calculus, twin networks
│   ├── render.js           # DAG layout and SVG rendering
│   └── app.js              # Interactive application logic
└── data/
    └── examples.json       # Three reference SCMs
```

## The example SCMs

1. **Customer Acquisition (B2B SaaS)** — 7 variables, outbound → MQL → SQL → win → ARR.
2. **Manufacturing Delays (B2B Fabricant)** — 6 variables, the diagnostic that surfaces priority attribution as the dominant lever (not capacity).
3. **Employee Retention (PME Services)** — 6 variables, the loop between hiring cost and management quality.

## Methodology in 30 seconds

1. **Diagnostic** (3 maps: CLD, decision graph, mental models) — before any code.
2. **Build the SCM** — variables + structural equations + acyclicity.
3. **Run interventions** via graph mutilation (L2).
4. **Run counterfactuals** via twin networks (L3).
5. **Close the loop** — observed outcomes update coefficients, drift detection flags model obsolescence.

See `methodology.html` for the full version.

## License

MIT-style. Use it, fork it, build on it.

## Status & roadmap

- [x] Reference implementation in vanilla JS
- [x] Three example SCMs covering acquisition, operations, HR
- [x] Interactive app with counterfactual playground
- [x] Loop detection, leverage scoring, bottleneck detection
- [ ] Non-linear SCMs (bucketing, neural SCMs)
- [ ] Continuous causal discovery (PC, GES, NOTEARS)
- [ ] Causal mediation analysis
- [ ] Multi-SCM federation for cross-department reasoning
- [ ] Bayesian model averaging over competing SCMs

## Citation

```
metacortex (2026). A causal reasoning layer for the enterprise.
https://github.com/Falcone747/metacortex
```
