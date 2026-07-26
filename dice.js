// ─────────────────────────────────────────────────────────────────────────────
// dice.js — a rollable 3D die, shared.
//
// Built for Plump Trek and pulled out here because the fiddly parts are worth having
// once: a CSS cube with proper pipped faces, a throw whose duration AND spin vary
// together (so no two rolls look alike), and a landing that comes from the easing curve
// over-rotating onto the face rather than a scale pop bolted on the end. Getting that
// last part wrong makes a roll feel like animation instead of a die.
//
//   <div id="d1"></div>
//   el.innerHTML = diceHTML({ id: 'd1' });          // a die at rest
//   const ms = throwDie('d1', 4, { onTick, onLand }); // roll it; returns the duration
//   settleDie('d1', 4);                              // snap to a face, no animation
//
// Nothing here makes a sound: SFX are per-game (each game has its own `tone`/`noiseHit`
// bus), so pass `onTick`/`onLand` callbacks and play your own. Everything early-returns
// on a global `REDUCED` the way fx.js does, and the CSS is injected on first use so a
// game needs no markup or styles of its own.
//
// Values above 6 (a d20 from a rule card, say) show numerals instead of pips, because
// pips stop being readable past six.
// ─────────────────────────────────────────────────────────────────────────────

// Which of the 3×3 cells carry a dot, per face value.
const DICE_PIPS = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
// Opposite faces sum to 7 (1-6, 2-5, 3-4), like a real die. To bring face N to the
// front, apply the inverse of however that face was placed on the cube.
const DICE_FACE_ROT = {
    1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180],
};

const DICE_CSS = `
.d3d { display: inline-flex; align-items: center; justify-content: center;
    width: var(--d3d-box, 16vmin); height: var(--d3d-box, 16vmin); perspective: var(--d3d-persp, 60vmin); }
.d3d-cube { position: relative; width: var(--d3d-size, 11vmin); height: var(--d3d-size, 11vmin);
    transform-style: preserve-3d; transform: rotateX(-22deg) rotateY(28deg); }
.d3d-cube.d3d-throwing { transition: transform 1s cubic-bezier(.16,.78,.28,1.045); }
.d3d-face { position: absolute; inset: 0; border-radius: calc(var(--d3d-size, 11vmin) * .14);
    display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr);
    padding: calc(var(--d3d-size, 11vmin) * .1); backface-visibility: hidden;
    background: var(--d3d-bg, linear-gradient(150deg, #fffdf6, #ffd98a));
    border: 1px solid var(--d3d-edge, rgba(120,80,0,.25));
    box-shadow: inset 0 0 calc(var(--d3d-size, 11vmin) * .18) var(--d3d-inner, rgba(160,110,0,.25)); }
.d3d-pip { width: 26%; height: 26%; border-radius: 50%; align-self: center; justify-self: center;
    background: var(--d3d-pip, radial-gradient(circle at 35% 30%, #6b4a12, #241503));
    box-shadow: inset 0 -.08em .08em rgba(0,0,0,.4); }
.d3d-num { grid-column: 1 / -1; grid-row: 1 / -1; align-self: center; justify-self: center;
    font-family: inherit; font-weight: 900; font-size: calc(var(--d3d-size, 11vmin) * .5);
    color: var(--d3d-ink, #2b1a00); }
/* the six faces of the cube; the translate is half the cube's width */
.d3d-f1 { transform: translateZ(calc(var(--d3d-size, 11vmin) / 2)); }
.d3d-f6 { transform: rotateY(180deg) translateZ(calc(var(--d3d-size, 11vmin) / 2)); }
.d3d-f3 { transform: rotateY(90deg) translateZ(calc(var(--d3d-size, 11vmin) / 2)); }
.d3d-f4 { transform: rotateY(-90deg) translateZ(calc(var(--d3d-size, 11vmin) / 2)); }
.d3d-f2 { transform: rotateX(90deg) translateZ(calc(var(--d3d-size, 11vmin) / 2)); }
.d3d-f5 { transform: rotateX(-90deg) translateZ(calc(var(--d3d-size, 11vmin) / 2)); }
@media (prefers-reduced-motion: reduce) { .d3d-cube.d3d-throwing { transition: none; } }
`;

function _diceCSS() {
    if (typeof document === 'undefined' || document.getElementById('dice-style')) return;
    const st = document.createElement('style');
    st.id = 'dice-style';
    st.textContent = DICE_CSS;
    document.head.appendChild(st);
}

// One face. `numeral` shows the value as a digit instead of pips (for a d20, or for the
// faces around it while it spins).
function diceFaceHTML(v, numeral) {
    if (numeral != null) return `<div class="d3d-face d3d-f${v}"><span class="d3d-num">${numeral}</span></div>`;
    const on = new Set(DICE_PIPS[v] || []);
    return `<div class="d3d-face d3d-f${v}">${
        Array.from({ length: 9 }, (_, i) => (on.has(i) ? '<span class="d3d-pip"></span>' : '<span></span>')).join('')
    }</div>`;
}

// Markup for a die sitting at rest.
//   id     — so throwDie/settleDie can find it later (default 'die')
//   value  — the face to show now (over 6 → numerals; omit for the resting pose)
//   sides  — how many sides the die has (only matters for labelling a >6 die)
//   cls    — extra classes on the wrapper, for per-game sizing
function diceHTML(opts) {
    const o = opts || {};
    _diceCSS();
    const id = o.id || 'die';
    const big = o.value != null && o.value > 6;
    const faces = [1, 2, 3, 4, 5, 6].map(v => diceFaceHTML(
        v,
        big ? (v === 1 ? o.value : 1 + Math.floor(Math.random() * (o.sides || 20))) : null,
    )).join('');
    return `<div class="d3d ${o.cls || ''}"><div class="d3d-cube" id="${id}">${faces}</div></div>`;
}

// Put a face to the front with no animation — for a re-render mid-throw, or to show a
// result that has already happened.
function settleDie(id, value) {
    const cube = typeof id === 'string' ? document.getElementById(id) : id;
    if (!cube) return;
    const [fx, fy] = DICE_FACE_ROT[value > 6 ? 1 : value] || [0, 0];
    cube.classList.remove('d3d-throwing');
    cube.style.transitionDuration = '';
    cube.style.transform = `rotateX(${fx}deg) rotateY(${fy}deg)`;
}

// Throw it. Returns the duration in ms so the caller can time whatever comes next
// (Plump Trek holds the pawn until the die has landed).
//   onTick() — as it leaves the hand, for a rattle
//   onLand() — as it settles, for the clack
function throwDie(id, value, opts) {
    const o = opts || {};
    const cube = typeof id === 'string' ? document.getElementById(id) : id;
    if (!cube) return 0;
    const [fx, fy] = DICE_FACE_ROT[value > 6 ? 1 : value] || [0, 0];

    if (typeof REDUCED !== 'undefined' && REDUCED) {
        settleDie(cube, value);
        if (o.onLand) o.onLand();
        return 0;
    }
    // A real die sometimes skitters and sometimes drops dead, so the duration varies —
    // and the spin varies WITH it, or a long throw is just the same tumble in slow motion.
    const dur = o.ms || (620 + Math.floor(Math.random() * 780));
    const turns = 2 + Math.round(dur / 420);

    cube.classList.remove('d3d-throwing');
    cube.style.transform = `rotateX(${-40 + Math.random() * 80}deg) rotateY(${-40 + Math.random() * 80}deg)`;
    if (o.onTick) o.onTick(dur);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        cube.classList.add('d3d-throwing');
        cube.style.transitionDuration = dur + 'ms';
        cube.style.transform = `rotateX(${fx + 360 * turns}deg) rotateY(${fy + 360 * (turns + 1)}deg)`;
    }));
    clearTimeout(cube._diceT);
    cube._diceT = setTimeout(() => { if (o.onLand) o.onLand(); }, dur + 20);
    return dur;
}
