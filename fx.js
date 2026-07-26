// ─────────────────────────────────────────────────────────────────────────────
// fx.js — shared visual FX used across the games. Loaded AFTER common.js:
//   <script src="common.js"></script><script src="fx.js"></script>
//
// v1 owns the two most-duplicated effects:
//   • burst(x, y, colors, n)   — a particle explosion (self-contained: fx.js injects
//                                its own `.fxp` particle stylesheet; colours are passed
//                                in, so every game keeps its own palette at the callsite)
//   • popText(x, y, text, cls) — floating score text; renders `.pop <cls>` and RELIES on
//                                each game's own `.pop` / `.pop.*` CSS (kept in the game),
//                                so every game's font + colours stay exactly as they were.
//
// These are plain function *declarations* (not const): if a game still has an inline
// copy, the inline one (defined later, in the game's own script) simply wins — a safe,
// non-breaking failure mode. Still, a SYNTAX error here breaks every game at load, so
// keep this tiny and run `npx playwright test tests/smoke.e2e.spec.js` after any edit.
// (confetti / emojiRain / flashEdge are intentionally left inline for now — they're
// coupled to a canvas + per-game palette/CSS and will move in a later, careful pass.)
// ─────────────────────────────────────────────────────────────────────────────

// Particle stylesheet for burst() — matches the games' original `.pt`/`ptFly`.
const FX_CSS = `
.fxp { position: fixed; width: 9px; height: 9px; border-radius: 2px; z-index: 950; pointer-events: none; animation: fxFly .75s cubic-bezier(.15,.65,.4,1) forwards; }
@keyframes fxFly { 0% { transform: translate(0,0) rotate(0deg) scale(1); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) rotate(560deg) scale(.3); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .fxp { animation: none !important; } }
`;
function _fxEnsureStyle() {
    if (typeof document === 'undefined' || document.getElementById('fx-style')) return;
    const st = document.createElement('style'); st.id = 'fx-style'; st.textContent = FX_CSS;
    (document.head || document.documentElement).appendChild(st);
}
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _fxEnsureStyle);
    else _fxEnsureStyle();
}

// Particle explosion at (x, y). `colors` is the caller's palette; `n` particles (default 14).
function burst(x, y, colors, n = 14) {
    if (typeof REDUCED !== 'undefined' && REDUCED) return;
    const cols = (colors && colors.length) ? colors : ['#ffc93c', '#ff2d78', '#22d3ee', '#4ade80'];
    for (let i = 0; i < n; i++) {
        const p = document.createElement('div');
        p.className = 'fxp';
        const ang = Math.random() * Math.PI * 2;
        const dist = 40 + Math.random() * 90;
        p.style.cssText = `left:${x}px;top:${y}px;background:${cols[i % cols.length]};` +
            `--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist - 30}px;`;
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 800);
    }
}

// Floating score/label text at (x, y). Renders `.pop <cls>` — colour + font come from the
// game's own `.pop` / `.pop.<cls>` CSS, which each game keeps, so the look is unchanged.
function popText(x, y, text, cls = 'gold') {
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1150);
}

// ─── Confetti (canvas) ─────────────────────────────────────────────────────────
// fx.js owns ONE fullscreen confetti <canvas> (#fx-confetti), its particle state and
// its resize handling. Games just call startConfetti(ms); for their own palette they
// define `const CONFETTI_COLS = [...]` (read at call time) — or pass colours as the
// 2nd arg. Without either, a default festive palette is used. Matches the games'
// original canvas confetti exactly (130 pieces, same physics), z-index 60.
const FX_CONFETTI_DEFAULT = ['#ffc93c', '#ff2d78', '#22d3ee', '#4ade80', '#a78bfa', '#f8f4e3'];
let _fxCf = { parts: [], raf: 0, running: false, until: 0, cv: null };
function _fxConfettiCanvas() {
    if (_fxCf.cv && document.body && document.body.contains(_fxCf.cv)) return _fxCf.cv;
    let cv = document.getElementById('fx-confetti');
    if (!cv) {
        cv = document.createElement('canvas');
        cv.id = 'fx-confetti';
        cv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;';
        document.body.appendChild(cv);
    }
    _fxCf.cv = cv;
    return cv;
}
function startConfetti(ms, cols) {
    if (typeof REDUCED !== 'undefined' && REDUCED) return;
    const cv = _fxConfettiCanvas(), ctx = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    _fxCf.until = performance.now() + (ms || 2600);
    const palette = (cols && cols.length) ? cols
        : (typeof CONFETTI_COLS !== 'undefined' && CONFETTI_COLS && CONFETTI_COLS.length ? CONFETTI_COLS : FX_CONFETTI_DEFAULT);
    for (let i = 0; i < 130; i++) {
        _fxCf.parts.push({
            x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5,
            vx: (Math.random() - 0.5) * 2.4, vy: 2 + Math.random() * 3.6,
            rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.25,
            w: 6 + Math.random() * 7, h: 4 + Math.random() * 5,
            col: palette[Math.floor(Math.random() * palette.length)],
        });
    }
    if (_fxCf.running) return;
    _fxCf.running = true;
    (function frame(t) {
        ctx.clearRect(0, 0, cv.width, cv.height);
        _fxCf.parts = _fxCf.parts.filter(p => p.y < cv.height + 30);
        for (const p of _fxCf.parts) {
            p.x += p.vx; p.y += p.vy; p.rot += p.vr;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }
        if (t < _fxCf.until || _fxCf.parts.length) _fxCf.raf = requestAnimationFrame(frame);
        else { _fxCf.running = false; ctx.clearRect(0, 0, cv.width, cv.height); }
    })(performance.now());
}
if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
        if (_fxCf.cv && _fxCf.running) { _fxCf.cv.width = innerWidth; _fxCf.cv.height = innerHeight; }
    });
}
