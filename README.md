# metacortex

**Motion instead of chrome.** A living post-interactive layer that turns causal graphs into motion.

The 3D causal graph IS the interface — a volumetric particle cloud (Three.js, ~12 000 particles, custom vertex+fragment shader, additive blending) where each particle is a variable and the edges are causal flow. The cloud breathes, responds to cursor presence, and morphs between SCMs when you switch templates.

## Run

```bash
cd /root/metacortex
python3 -m http.server 8000
# → http://localhost:8000
```

## Files

- `index.html` — Vesper-style landing: hero, sidebar meta, template switcher, particle cloud
- `app.html` — interactive app, full-screen cloud with morphing between SCMs
- `css/vesper.css` — overlay styles
- `js/particle-cloud.js` — Three.js volumetric particle system with custom shaders
- `data/scm-templates.json` — 3 reference SCMs (B2B SaaS acquisition, Manufacturing delays, Talent retention)

## How the cloud is made

- **Particles** are sampled on a parametric torus surface, plus radial jitter
- Each variable in the SCM is mapped to a "node cluster" at golden-angle-distributed positions (u ∈ [0,1])
- Edges become **flow particles** that animate along the radial axis via a sinusoidal offset (vertex shader)
- **Tones**: ember (#ed946d) for problematic variables, leaf (#6ee7c7) for desired outcomes, neutral gray for inputs
- **Vertex shader** handles: morphing between two SCMs, breathing (radial pulse), mouse-presence pull toward cursor
- **Fragment shader**: soft circular sprite via `gl_PointCoord`, additive blending, depth fade so distant particles dim out
- **Morph**: lerp from current particle positions to next SCM's positions over 1.6s
