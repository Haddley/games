// ─────────────────────────────────────────────────────────────────────────────
// common.js — small, stable shared core for the multiplayer games.
//
// Loaded via  <script src="common.js"></script>  in each game's <head>, BEFORE
// the game's own inline <script>, so the names below become globals the game
// uses directly (no build step, no modules — this is a classic script).
//
// Keep this TINY and STABLE: a syntax error here breaks EVERY game at once, so
// only truly identical, rarely-changing primitives belong here. Each game is
// otherwise still a self-contained file.
// ─────────────────────────────────────────────────────────────────────────────

// TURN relay (Metered) so players on restrictive / remote networks (symmetric
// NAT, mobile carriers, corporate wifi) can connect — STUN alone only punches
// through friendly NATs. Passed to EVERY `new Peer(...)`:
//   host   → new Peer(id, ICE_CFG)          guest/viewer → new Peer(undefined, ICE_CFG)
// The credentials are public (free tier, ~50 GB/mo shared). To ROTATE a burned
// quota: get a new key from the Metered dashboard and change it here — once,
// instead of ~4× across every game (ticktacktoe still inlines its own copy).
const ICE_CFG = { config: { iceServers: [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:standard.relay.metered.ca:80', username: '35410ce7572a64d0dad7b813', credential: 'Tmwfl6WHxuBNXj2G' },
    { urls: 'turn:standard.relay.metered.ca:80?transport=tcp', username: '35410ce7572a64d0dad7b813', credential: 'Tmwfl6WHxuBNXj2G' },
    { urls: 'turn:standard.relay.metered.ca:443', username: '35410ce7572a64d0dad7b813', credential: 'Tmwfl6WHxuBNXj2G' },
    { urls: 'turns:standard.relay.metered.ca:443?transport=tcp', username: '35410ce7572a64d0dad7b813', credential: 'Tmwfl6WHxuBNXj2G' }
] } };

// Competition ranking (1-2-2-4): equal scores share a place, so tied players
// get the SAME medal/place. Input `list` must already be sorted by score
// descending; pass `key` for a non-default score field (e.g. 'totalScore', 'net').
function rankByScore(list, key = 'score') {
    let rank = 0;
    return list.map((p, i) => { if (i > 0 && p[key] < list[i - 1][key]) rank = i; return rank; });
}

// ─── Ambient scene (opt-in) ───────────────────────────────────────────────────
// A lively little scene along the bottom of a TV/viewer screen: figures amble
// back and forth (turning to FACE their travel), props sway on the ground, and a
// couple of things flit above. `mountScene(theme)` injects a scoped stylesheet
// (everything under `#meadow`, keyframes `mdw-*` so it can't collide with a game),
// shows only under `body.viewer-mode`, kills motion under prefers-reduced-motion,
// and lifts the viewer root (#app) above it.
//   • theme 'meadow' → the CSS-drawn woolly flock + border collie (farm games)
//   • any other theme → themed emoji walkers / props / flyers on a themed ground
// `mountMeadow()` is kept as an alias for mountScene('meadow').
// ──────────────────────────────────────────────────────────────────────────────
const SCENE_CSS = `
#meadow { position: fixed; left: 0; right: 0; bottom: 0; height: 15vmin; z-index: 0; pointer-events: none; display: none; overflow: hidden; }
body.viewer-mode #meadow, body.tv-mode #meadow { display: block; }
#meadow::before { content: ''; position: absolute; left: 0; right: 0; bottom: 3vmin; height: 11vmin; background: radial-gradient(120% 130% at 50% 100%, var(--glow, rgba(255,216,140,.22)), rgba(0,0,0,0) 62%); }
#meadow .ground { position: absolute; left: -2%; right: -2%; bottom: 0; height: 6.4vmin; border-radius: 50% 50% 0 0 / 2.8vmin 2.8vmin 0 0; background: repeating-linear-gradient(86deg, transparent 0 1vmin, rgba(255,255,255,.07) 1vmin 1.3vmin), linear-gradient(180deg, var(--g1,#59c06d), var(--g2,#1f7a3a)); box-shadow: inset 0 .55vmin 0 rgba(255,255,255,.3), 0 -0.4vmin 1.4vmin rgba(0,0,0,.28); }
#meadow .walker { position: absolute; bottom: var(--b, 2.6vmin); font-size: var(--sz, 5vmin); line-height: 1; filter: brightness(var(--br, 1)) drop-shadow(0 .4vmin .4vmin rgba(0,0,0,.4)); transform: translateX(0) scale(var(--sc, 1)); animation-duration: var(--walk, 30s); animation-timing-function: ease-in-out; animation-iteration-count: infinite; animation-delay: var(--dl, 0s); }
#meadow .walker.goR { animation-name: mdw-ambleR; }
#meadow .walker.goL { animation-name: mdw-ambleL; }
#meadow .walker .b { display: inline-block; animation: mdw-bob var(--bob, 1.5s) ease-in-out infinite var(--dl, 0s); }
#meadow .prop { position: absolute; bottom: var(--b, 1.7vmin); font-size: var(--sz, 2.4vmin); line-height: 1; transform-origin: bottom center; filter: drop-shadow(0 .2vmin .3vmin rgba(0,0,0,.35)); animation: mdw-sway 3.4s ease-in-out infinite alternate var(--dl, 0s); }
#meadow .flyer { position: absolute; left: 0; font-size: var(--sz, 2.2vmin); opacity: .95; animation: mdw-flit var(--d, 26s) linear var(--dl, 0s) infinite; }
#meadow .flyer .w { display: inline-block; animation: mdw-flitBob var(--fb, .5s) ease-in-out infinite alternate; }
#meadow .blade { position: absolute; bottom: 1vmin; width: .55vmin; height: var(--h, 2vmin); background: linear-gradient(180deg, rgba(190,245,170,.15), rgba(120,215,120,.95)); border-radius: 50% 50% 0 0; transform-origin: bottom center; animation: mdw-sway 3.4s ease-in-out infinite alternate var(--dl, 0s); }
#meadow .flower { position: absolute; bottom: var(--fb, 2.6vmin); width: 1.2vmin; height: 1.2vmin; border-radius: 50%; background: radial-gradient(circle at 50% 50%, #ffe58a 0 24%, var(--fc, #ff7aa8) 26%); box-shadow: 0 .2vmin .35vmin rgba(0,0,0,.28); transform-origin: bottom center; animation: mdw-sway 3.4s ease-in-out infinite alternate var(--dl, 0s); }
@keyframes mdw-sway { from { transform: rotate(-9deg); } to { transform: rotate(9deg); } }
@keyframes mdw-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-.7vmin); } }
@keyframes mdw-ambleR { 0%,100% { transform: translateX(0) scale(var(--sc,1)) scaleX(1); } 47% { transform: translateX(var(--range,20vw)) scale(var(--sc,1)) scaleX(1); } 50% { transform: translateX(var(--range,20vw)) scale(var(--sc,1)) scaleX(-1); } 97% { transform: translateX(0) scale(var(--sc,1)) scaleX(-1); } }
@keyframes mdw-ambleL { 0%,100% { transform: translateX(0) scale(var(--sc,1)) scaleX(-1); } 47% { transform: translateX(calc(-1 * var(--range,20vw))) scale(var(--sc,1)) scaleX(-1); } 50% { transform: translateX(calc(-1 * var(--range,20vw))) scale(var(--sc,1)) scaleX(1); } 97% { transform: translateX(0) scale(var(--sc,1)) scaleX(1); } }
@keyframes mdw-flit { 0% { transform: translateX(-6vmin); } 100% { transform: translateX(104vw); } }
@keyframes mdw-flitBob { from { transform: translateY(0); } to { transform: translateY(-2.4vmin); } }
@media (prefers-reduced-motion: reduce) { #meadow, #meadow * { animation: none !important; } }
`;

// The CSS-drawn woolly flock + border collie (only the 'meadow' theme uses these).
const SHEEP_CSS = `
#meadow .ewe { position: absolute; transform-origin: bottom center; filter: brightness(var(--br, 1)); transform: translateX(0) scale(var(--sc, 1)); animation-duration: var(--walk, 30s); animation-timing-function: ease-in-out; animation-iteration-count: infinite; animation-delay: var(--dl, 0s); }
#meadow .ewe.goR { animation-name: mdw-ambleR; }
#meadow .ewe.goL { animation-name: mdw-ambleL; }
#meadow .ewe .wool { position: relative; width: 6.4vmin; height: 4.1vmin; border-radius: 3.3vmin 3.5vmin 2.6vmin 2.6vmin; background: radial-gradient(125% 135% at 42% 28%, #ffffff 0%, #edecf3 70%, #dad9e4 100%); box-shadow: -2.3vmin -.3vmin 0 -.7vmin #f3f2f9, -.9vmin -1.55vmin 0 -.55vmin #fbfbff, 1.15vmin -1.6vmin 0 -.5vmin #edeef6, 2.5vmin -.2vmin 0 -.8vmin #f3f2f9, 0 .5vmin .8vmin rgba(0,0,0,.3); animation: mdw-eweBob var(--bob, 2.6s) ease-in-out infinite var(--dl, 0s); }
#meadow .ewe .wool::before { content: ''; position: absolute; bottom: -1.6vmin; left: 1.3vmin; width: .72vmin; height: 1.75vmin; background: #39323f; border-radius: 0 0 .2vmin .2vmin; box-shadow: 3.1vmin 0 0 #39323f; }
#meadow .ewe .head { position: absolute; z-index: 2; right: -1.7vmin; top: .2vmin; width: 2.4vmin; height: 2.7vmin; border-radius: 52% 52% 46% 46%; background: linear-gradient(155deg, #4c4048, #29232b); transform-origin: 45% 90%; animation: mdw-eweGraze var(--gz, 5s) ease-in-out infinite var(--dl, 0s); }
#meadow .ewe .head::before { content: ''; position: absolute; top: .5vmin; left: -.5vmin; width: 1.5vmin; height: .85vmin; background: #29232b; border-radius: 50%; transform: rotate(-22deg); }
#meadow .ewe .head::after { content: ''; position: absolute; top: .95vmin; right: .55vmin; width: .5vmin; height: .5vmin; border-radius: 50%; background: #fff; box-shadow: 0 0 0 .12vmin rgba(0,0,0,.3); }
@keyframes mdw-eweBob { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-.5vmin) rotate(1deg); } }
@keyframes mdw-eweGraze { 0%,70%,100% { transform: rotate(7deg); } 84% { transform: rotate(40deg); } }
#meadow .collie { position: absolute; bottom: 2.6vmin; left: 0; transform-origin: bottom center; z-index: 12; animation: mdw-trot var(--d, 26s) linear infinite var(--dl, 0s); }
#meadow .collie .cbody { position: relative; width: 5vmin; height: 2.3vmin; border-radius: 1.3vmin 1.7vmin 1vmin 1vmin; background: linear-gradient(160deg, #2a2a2e 0 52%, #f6f6fa 52% 100%); box-shadow: 0 .4vmin .6vmin rgba(0,0,0,.3); }
#meadow .collie .cbody::before { content: ''; position: absolute; bottom: -1.3vmin; left: .7vmin; width: .6vmin; height: 1.4vmin; background: #2a2a2e; box-shadow: 1.5vmin 0 0 #f0f0f4, 2.6vmin 0 0 #2a2a2e; }
#meadow .collie .cbody::after { content: ''; position: absolute; left: -1.5vmin; top: -.4vmin; width: 1.8vmin; height: .8vmin; background: #2a2a2e; border-radius: 1vmin; transform-origin: right center; animation: mdw-wag .4s ease-in-out infinite alternate; }
#meadow .collie .chead { position: absolute; right: -1.9vmin; top: -1.1vmin; width: 2.4vmin; height: 2.1vmin; border-radius: 55% 60% 45% 45%; background: #2a2a2e; animation: mdw-dogNod .5s ease-in-out infinite; }
#meadow .collie .chead::before { content: ''; position: absolute; right: -.3vmin; bottom: -.1vmin; width: 1.4vmin; height: 1.2vmin; background: #f6f6fa; border-radius: 50%; }
#meadow .collie .chead::after { content: ''; position: absolute; left: .3vmin; top: -.5vmin; width: .9vmin; height: 1.1vmin; background: #2a2a2e; border-radius: 50% 50% 40% 40%; }
@keyframes mdw-trot { 0% { transform: translateX(-9vmin) translateY(0); } 24% { transform: translateX(24vw) translateY(-.4vmin); } 50% { transform: translateX(54vw) translateY(0); } 76% { transform: translateX(82vw) translateY(-.4vmin); } 100% { transform: translateX(110vw) translateY(0); } }
@keyframes mdw-wag { from { transform: rotate(14deg); } to { transform: rotate(-18deg); } }
@keyframes mdw-dogNod { 0%,100% { transform: translateY(0); } 50% { transform: translateY(.3vmin); } }
`;

// Per-theme palette + emoji cast. 'meadow' is the CSS flock; the rest are emoji.
const SCENE_THEMES = {
    meadow:   { sheep: true, g1: '#59c06d', g2: '#1f7a3a', glow: 'rgba(255,216,140,.22)' },
    pirates:  { g1: '#7a5636', g2: '#3d2817', glow: 'rgba(90,150,200,.30)', walk: ['🏴‍☠️','🦜','🎲','🏴‍☠️','⚓'], props: ['💰','🪙','🍺','💀'], fly: ['🦜','🦅'] },
    night:    { g1: '#2b3152', g2: '#12142a', glow: 'rgba(150,170,255,.26)', walk: ['🐺','🌲','🧑‍🌾','🐺','🌲'], props: ['🌙','⭐','🍄','⭐'], fly: ['🦇','🦇','🦉'] },
    letters:  { g1: '#4a2f7a', g2: '#26124d', glow: 'rgba(255,90,180,.26)', walk: ['🔤','📖','✏️','🅰️','🅱️'], props: ['✨','⭐','💡'], fly: ['🦋','✨'] },
    library:  { g1: '#7a5a35', g2: '#3f2c17', glow: 'rgba(255,210,150,.28)', walk: ['📚','🦉','📖','🧓','📜'], props: ['✨','🕯️','🗝️'], fly: ['🦉'] },
    carnival: { g1: '#3f6bb5', g2: '#213f7a', glow: 'rgba(255,200,80,.26)', walk: ['🎯','🧩','🎨','🎲','🏆'], props: ['✨','⭐','🎈'], fly: ['🎉','🎈'] },
    art:      { g1: '#b9b9c8', g2: '#83839a', glow: 'rgba(255,255,255,.22)', walk: ['✏️','🖍️','🖌️','🎨','🖊️'], props: ['📐','⭐','📎'], fly: ['🦋','🎈'] },
    bingo:    { g1: '#2f9a6a', g2: '#125a3a', glow: 'rgba(255,201,60,.28)', walk: ['🎱','🔴','🟡','🟢','🔵'], props: ['✨','🎟️','⭐'], fly: ['🎉'] },
    auction:  { g1: '#8a2f3a', g2: '#54141d', glow: 'rgba(255,201,60,.30)', walk: ['🔨','💰','🧑‍⚖️','🏺','💎'], props: ['💵','🪙','✨'], fly: ['💸'] },
    masks:    { g1: '#6a4a8a', g2: '#38254f', glow: 'rgba(255,120,200,.26)', walk: ['🤥','🎭','🕵️','🃏','🤥'], props: ['❓','💬','✨'], fly: ['🎈'] },
    mystery:  { g1: '#2f6a9a', g2: '#154a6a', glow: 'rgba(120,200,255,.26)', walk: ['🔮','💡','❓','🎯','🧠'], props: ['✨','⭐','💭'], fly: ['💭'] },
    market:   { g1: '#3a6a4a', g2: '#1c3f2a', glow: 'rgba(255,201,60,.24)', walk: ['🐂','🐻','💵','📈','📉'], props: ['💰','🪙','✨'], fly: ['💸'] },
    tictactoe:{ g1: '#3a5a8a', g2: '#1b2c4f', glow: 'rgba(120,180,255,.26)', walk: ['❌','⭕','❌','⭕','❌'], props: ['✨','⭐','🏆'], fly: ['🎉'] },
};

function _rand(n) { return Math.random() * n; }

function _buildSheep(m) {
    let html = '<div class="ground"></div>';
    for (let i = 0; i < 16; i++) {
        html += `<div class="blade" style="left:${_rand(100).toFixed(1)}%;--h:${(1.2 + _rand(1.7)).toFixed(1)}vmin;--dl:${(-_rand(3)).toFixed(2)}s"></div>`;
    }
    const FLOWERS = ['#ff7aa8', '#ffffff', '#c98bff', '#ff9a5c', '#7ad0ff'];
    for (let i = 0; i < 11; i++) {
        html += `<div class="flower" style="left:${_rand(100).toFixed(1)}%;--fb:${(1.4 + _rand(2.8)).toFixed(1)}vmin;--fc:${FLOWERS[i % FLOWERS.length]};--dl:${(-_rand(3)).toFixed(2)}s"></div>`;
    }
    const N = 8;
    for (let i = 0; i < N; i++) {
        const left = (i / (N - 1)) * 88 + 5 + (_rand(4) - 2);
        const sc = 0.78 + _rand(0.5);
        const br = 0.88 + sc * 0.16;
        const bottom = 2.4 + (1 - sc) * 3.4;
        const bob = (2.2 + _rand(1.3)).toFixed(2);
        const gz = (4 + _rand(4.5)).toFixed(2);
        const dl = (-_rand(6)).toFixed(2);
        const go = left < 50 ? 'goR' : 'goL';
        const range = (12 + _rand(18)).toFixed(1);
        const walk = (20 + _rand(16)).toFixed(1);
        html += `<div class="ewe ${go}" style="left:${left.toFixed(1)}%;bottom:${bottom.toFixed(1)}vmin;`
            + `--sc:${sc.toFixed(2)};--br:${br.toFixed(2)};--range:${range}vw;--walk:${walk}s;--dl:${dl}s;z-index:${Math.round(sc * 10)}">`
            + `<div class="wool" style="--bob:${bob}s;--dl:${dl}s"></div>`
            + `<div class="head" style="--gz:${gz}s;--dl:${dl}s"></div></div>`;
    }
    html += `<div class="collie" style="--d:22s;--dl:-4s"><div class="cbody"><div class="chead"></div></div></div>`;
    html += `<div class="flyer" style="--d:23s;--dl:-6s;bottom:8vmin"><span class="w">🦋</span></div>`;
    html += `<div class="flyer" style="--d:30s;--dl:-17s;bottom:9.6vmin;--sz:1.9vmin;--fb:.42s"><span class="w">🐝</span></div>`;
    m.innerHTML = html;
}

function _buildEmojiScene(m, t) {
    let html = '<div class="ground"></div>';
    const props = t.props || [];
    for (let i = 0; i < 12 && props.length; i++) {
        html += `<div class="prop" style="left:${_rand(100).toFixed(1)}%;--b:${(1.2 + _rand(2.6)).toFixed(1)}vmin;--sz:${(1.7 + _rand(1.4)).toFixed(1)}vmin;--dl:${(-_rand(3)).toFixed(2)}s">${props[i % props.length]}</div>`;
    }
    const walk = t.walk || ['⭐'];
    const N = 7;
    for (let i = 0; i < N; i++) {
        const left = (i / (N - 1)) * 88 + 5 + (_rand(4) - 2);
        const sc = (0.82 + _rand(0.5)).toFixed(2);
        const sz = (4.4 + _rand(1.8)).toFixed(1);
        const br = (0.9 + _rand(0.1)).toFixed(2);
        const b = (2.4 + _rand(1.2)).toFixed(1);
        const bob = (1.05 + _rand(0.9)).toFixed(2);
        const dl = (-_rand(6)).toFixed(2);
        const go = left < 50 ? 'goR' : 'goL';
        const range = (12 + _rand(18)).toFixed(1);
        const walkD = (20 + _rand(16)).toFixed(1);
        html += `<div class="walker ${go}" style="left:${left.toFixed(1)}%;--sz:${sz}vmin;--sc:${sc};--br:${br};--b:${b}vmin;--range:${range}vw;--walk:${walkD}s;--dl:${dl}s;z-index:${Math.round(sc * 10)}">`
            + `<span class="b" style="--bob:${bob}s;--dl:${dl}s">${walk[i % walk.length]}</span></div>`;
    }
    const fly = t.fly || [];
    fly.slice(0, 3).forEach((e, i) => {
        html += `<div class="flyer" style="--d:${22 + i * 6}s;--dl:${-6 - i * 8}s;bottom:${(7.6 + i * 1.6).toFixed(1)}vmin;--sz:${(1.8 + _rand(0.8)).toFixed(1)}vmin;--fb:${(0.42 + _rand(0.2)).toFixed(2)}s"><span class="w">${e}</span></div>`;
    });
    m.innerHTML = html;
}

function mountScene(theme, contentSelector) {
    if (typeof document === 'undefined') return;
    const t = SCENE_THEMES[theme] || SCENE_THEMES.meadow;
    const lift = contentSelector || 'body.viewer-mode #app';
    const run = () => {
        if (!document.getElementById('scene-style')) {
            const st = document.createElement('style');
            st.id = 'scene-style';
            st.textContent = SCENE_CSS + SHEEP_CSS + `\n${lift} { position: relative; z-index: 1; }\n`;
            document.head.appendChild(st);
        }
        let m = document.getElementById('meadow');
        if (!m) { m = document.createElement('div'); m.id = 'meadow'; m.setAttribute('aria-hidden', 'true'); document.body.appendChild(m); }
        if (m.dataset.built) return;
        m.dataset.built = '1';
        if (t.g1) m.style.setProperty('--g1', t.g1);
        if (t.g2) m.style.setProperty('--g2', t.g2);
        if (t.glow) m.style.setProperty('--glow', t.glow);
        if (t.sheep) _buildSheep(m); else _buildEmojiScene(m, t);
    };
    if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
}

function mountMeadow(contentSelector) { return mountScene('meadow', contentSelector); }
