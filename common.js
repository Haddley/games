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
/* on the big screen, move each game's sound/music toggles to the BOTTOM-right (like
   letterstorm) so they never collide with the tvLobby ⛶ fullscreen button top-right */
body.viewer-mode #sound-togs, body.tv-mode #sound-togs, body.viewer-mode .audio-togs, body.tv-mode .audio-togs { top: auto !important; bottom: calc(14px + var(--tv-safe, 0px)) !important; right: calc(14px + var(--tv-safe, 0px)) !important; left: auto !important; z-index: 6; }
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

// The CSS-drawn dairy herd (only the 'cows' theme uses these) — reuses the amble/
// bob/graze keyframes, just a bigger black-patched body with a pink muzzle & horns.
const COW_CSS = `
#meadow .cow { position: absolute; transform-origin: bottom center; filter: brightness(var(--br, 1)); transform: translateX(0) scale(var(--sc, 1)); animation-duration: var(--walk, 30s); animation-timing-function: ease-in-out; animation-iteration-count: infinite; animation-delay: var(--dl, 0s); }
#meadow .cow.goR { animation-name: mdw-ambleR; }
#meadow .cow.goL { animation-name: mdw-ambleL; }
#meadow .cow .body {
    position: relative; width: 8vmin; height: 4.4vmin; border-radius: 2.4vmin 2.8vmin 1.4vmin 1.4vmin;
    background: radial-gradient(ellipse 2.2vmin 1.7vmin at 28% 42%, #2b2b30 60%, transparent 63%), radial-gradient(ellipse 1.9vmin 1.5vmin at 66% 58%, #2b2b30 60%, transparent 63%), radial-gradient(120% 130% at 45% 25%, #ffffff, #ececf0 82%);
    box-shadow: 0 .5vmin .8vmin rgba(0,0,0,.3);
    animation: mdw-eweBob var(--bob, 2.6s) ease-in-out infinite var(--dl, 0s);
}
#meadow .cow .body::before { content: ''; position: absolute; left: -1vmin; top: .4vmin; width: .5vmin; height: 2.6vmin; background: #3a3238; border-radius: .3vmin; transform-origin: top; transform: rotate(10deg); }
#meadow .cow .body::after { content: ''; position: absolute; bottom: -1.7vmin; left: 1.2vmin; width: .85vmin; height: 2vmin; background: #3a3238; border-radius: 0 0 .2vmin .2vmin; box-shadow: 2vmin 0 0 #3a3238, 4.1vmin 0 0 #3a3238, 6.1vmin 0 0 #3a3238; }
#meadow .cow .head { position: absolute; z-index: 2; right: -2.4vmin; top: 0; width: 3vmin; height: 2.9vmin; border-radius: 46% 52% 46% 52%; background: radial-gradient(120% 120% at 40% 35%, #ffffff, #e9e9ee); transform-origin: 42% 90%; animation: mdw-eweGraze var(--gz, 5s) ease-in-out infinite var(--dl, 0s); }
#meadow .cow .head::before { content: ''; position: absolute; bottom: .15vmin; right: .3vmin; width: 2vmin; height: 1.6vmin; background: radial-gradient(circle at 50% 40%, #f3aec0, #d97e97); border-radius: 50%; }
#meadow .cow .head::after { content: ''; position: absolute; top: .8vmin; right: .8vmin; width: .55vmin; height: .55vmin; background: #2a2a2e; border-radius: 50%; }
#meadow .cow .ear { position: absolute; top: .5vmin; left: -.5vmin; width: 1.4vmin; height: .95vmin; background: #2b2b30; border-radius: 50%; transform: rotate(-22deg); }
#meadow .cow .horn { position: absolute; top: -.45vmin; left: .8vmin; width: .8vmin; height: .8vmin; background: #e8dcc0; border-radius: 50% 50% 40% 40%; box-shadow: 1.1vmin 0 0 #e8dcc0; }
`;

// Real bingo balls (only the 'bingo' theme): a glossy colour sphere with a BINGO
// letter over a number, printed black — NOT pool balls (no white number-circle).
// They bob and DRIFT left/right without the mirror-flip, so numbers stay upright.
const BINGOBALL_CSS = `
#meadow .bball { position: absolute; bottom: var(--b, 2.4vmin); transform: translateX(0) scale(var(--sc, 1)); animation-duration: var(--walk, 30s); animation-timing-function: ease-in-out; animation-iteration-count: infinite; animation-delay: var(--dl, 0s); }
#meadow .bball.goR { animation-name: mdw-driftR; }
#meadow .bball.goL { animation-name: mdw-driftL; }
#meadow .bball .ball-in { position: relative; width: var(--d, 6vmin); height: var(--d, 6vmin); border-radius: 50%; display: flex; align-items: center; justify-content: center; filter: brightness(var(--br, 1)); background: radial-gradient(circle at 34% 26%, rgba(255,255,255,.9), rgba(255,255,255,0) 40%), radial-gradient(circle at 64% 72%, rgba(0,0,0,.4), rgba(0,0,0,0) 55%), var(--bc, #d0342c); box-shadow: inset -.7vmin -.85vmin 1.3vmin rgba(0,0,0,.32), 0 .5vmin .7vmin rgba(0,0,0,.42); animation: mdw-bob var(--bob, 1.5s) ease-in-out infinite var(--dl, 0s); }
#meadow .bball .bmark { display: flex; flex-direction: column; align-items: center; line-height: .82; color: var(--tc, #1b1b1b); font-family: 'Arial Black', 'Trebuchet MS', sans-serif; font-weight: 900; }
#meadow .bball .bmark .bl { font-size: var(--fl, 1.5vmin); letter-spacing: .04vmin; }
#meadow .bball .bmark .bn { font-size: var(--fn, 2.4vmin); margin-top: -.15vmin; }
@keyframes mdw-driftR { 0%,100% { transform: translateX(0) scale(var(--sc,1)); } 50% { transform: translateX(var(--range,18vw)) scale(var(--sc,1)); } }
@keyframes mdw-driftL { 0%,100% { transform: translateX(0) scale(var(--sc,1)); } 50% { transform: translateX(calc(-1 * var(--range,18vw))) scale(var(--sc,1)); } }
`;

// An auctioneer's gavel — there is no gavel emoji, so scene actors that want one use
// this inline SVG string (the emoji-scene builder injects walk items as innerHTML, so
// an SVG renders as a real gavel). Sized 1em so it matches the emoji cast around it.
const GAVEL_SVG = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:1em;height:1em;overflow:visible;display:inline-block;vertical-align:middle"><rect x="16" y="78" width="52" height="10" rx="5" fill="#7a4e16"/><rect x="16" y="78" width="52" height="4.5" rx="2.2" fill="#a06a20"/><g transform="rotate(40 58 40)"><rect x="53" y="36" width="9" height="46" rx="4.5" fill="#b97e26"/><rect x="34" y="26" width="48" height="27" rx="9.5" fill="#f4b63e"/><rect x="34" y="26" width="10" height="27" rx="4.5" fill="#d1901f"/><rect x="72" y="26" width="10" height="27" rx="4.5" fill="#d1901f"/><rect x="40" y="31" width="36" height="4" rx="2" fill="#ffd777"/></g></svg>';

// Per-theme palette + emoji cast. 'meadow'/'cows' are CSS herds; the rest are emoji.
const SCENE_THEMES = {
    meadow:   { sheep: true, g1: '#59c06d', g2: '#1f7a3a', glow: 'rgba(255,216,140,.22)' },
    cows:     { cows: true,  g1: '#59c06d', g2: '#1f7a3a', glow: 'rgba(255,216,140,.22)' },
    pirates:  { g1: '#7a5636', g2: '#3d2817', glow: 'rgba(90,150,200,.30)', walk: ['🏴‍☠️','🦜','🎲','🏴‍☠️','⚓'], props: ['💰','🪙','🍺','💀'], fly: ['🦜','🦅'] },
    night:    { g1: '#2b3152', g2: '#12142a', glow: 'rgba(150,170,255,.26)', walk: ['🐺','🌲','🧑‍🌾','🐺','🌲'], props: ['🌙','⭐','🍄','⭐'], fly: ['🦇','🦇','🦉'] },
    letters:  { g1: '#4a2f7a', g2: '#26124d', glow: 'rgba(255,90,180,.26)', walk: ['🔤','📖','✏️','🅰️','🅱️'], props: ['✨','⭐','💡'], fly: ['🦋','✨'] },
    library:  { g1: '#7a5a35', g2: '#3f2c17', glow: 'rgba(255,210,150,.28)', walk: ['📚','🦉','📖','🧓','📜'], props: ['✨','🕯️','🗝️'], fly: ['🦉'] },
    carnival: { g1: '#3f6bb5', g2: '#213f7a', glow: 'rgba(255,200,80,.26)', walk: ['🎯','🧩','🎨','🎲','🏆'], props: ['✨','⭐','🎈'], fly: ['🎉','🎈'] },
    art:      { g1: '#b9b9c8', g2: '#83839a', glow: 'rgba(255,255,255,.22)', walk: ['✏️','🖍️','🖌️','🎨','🖊️'], props: ['📐','⭐','📎'], fly: ['🦋','🎈'] },
    bingo:    { balls: true, g1: '#2f9a6a', g2: '#125a3a', glow: 'rgba(255,201,60,.28)', props: ['✨','🎟️','⭐'], fly: ['🎉'] },
    auction:  { g1: '#8a2f3a', g2: '#54141d', glow: 'rgba(255,201,60,.30)', walk: [GAVEL_SVG, '💰','🧑‍⚖️','🏺','💎'], props: ['💵','🪙','✨'], fly: ['💸'] },
    masks:    { g1: '#6a4a8a', g2: '#38254f', glow: 'rgba(255,120,200,.26)', walk: ['🤥','🎭','🕵️','🃏','🤥'], props: ['❓','💬','✨'], fly: ['🎈'] },
    mystery:  { g1: '#2f6a9a', g2: '#154a6a', glow: 'rgba(120,200,255,.26)', walk: ['🔮','💡','❓','🎯','🧠'], props: ['✨','⭐','💭'], fly: ['💭'] },
    market:   { g1: '#3a6a4a', g2: '#1c3f2a', glow: 'rgba(255,201,60,.24)', walk: ['🐂','🐻','💵','📈','📉'], props: ['💰','🪙','✨'], fly: ['💸'] },
    tictactoe:{ g1: '#3a5a8a', g2: '#1b2c4f', glow: 'rgba(120,180,255,.26)', walk: ['❌','⭕','❌','⭕','❌'], props: ['✨','⭐','🏆'], fly: ['🎉'] },
    rps:      { g1: '#4a2f7a', g2: '#26124d', glow: 'rgba(150,120,255,.26)', walk: ['✊','✋','✌️','✊','✋'], props: ['⭐','✨','🏆'], fly: ['🎉'] },
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

function _buildCows(m) {
    let html = '<div class="ground"></div>';
    for (let i = 0; i < 16; i++) {
        html += `<div class="blade" style="left:${_rand(100).toFixed(1)}%;--h:${(1.2 + _rand(1.7)).toFixed(1)}vmin;--dl:${(-_rand(3)).toFixed(2)}s"></div>`;
    }
    const FLOWERS = ['#ff7aa8', '#ffffff', '#c98bff', '#ff9a5c', '#7ad0ff'];
    for (let i = 0; i < 11; i++) {
        html += `<div class="flower" style="left:${_rand(100).toFixed(1)}%;--fb:${(1.4 + _rand(2.8)).toFixed(1)}vmin;--fc:${FLOWERS[i % FLOWERS.length]};--dl:${(-_rand(3)).toFixed(2)}s"></div>`;
    }
    const N = 5;   // cows are big, so a smaller herd with room to roam
    for (let i = 0; i < N; i++) {
        const left = (i / (N - 1)) * 84 + 7 + (_rand(4) - 2);
        const sc = 0.95 + _rand(0.6);   // hearty cattle — noticeably bigger than the ewes
        const br = 0.88 + sc * 0.16;
        const bottom = 2.4 + (1 - sc) * 3.4;
        const bob = (2.4 + _rand(1.4)).toFixed(2);
        const gz = (4 + _rand(4.5)).toFixed(2);
        const dl = (-_rand(6)).toFixed(2);
        const go = left < 50 ? 'goR' : 'goL';
        const range = (11 + _rand(15)).toFixed(1);
        const walk = (22 + _rand(16)).toFixed(1);
        html += `<div class="cow ${go}" style="left:${left.toFixed(1)}%;bottom:${bottom.toFixed(1)}vmin;`
            + `--sc:${sc.toFixed(2)};--br:${br.toFixed(2)};--range:${range}vw;--walk:${walk}s;--dl:${dl}s;z-index:${Math.round(sc * 10)}">`
            + `<div class="body" style="--bob:${bob}s;--dl:${dl}s"></div>`
            + `<div class="head" style="--gz:${gz}s;--dl:${dl}s"><span class="ear"></span><span class="horn"></span></div></div>`;
    }
    html += `<div class="collie" style="--d:22s;--dl:-4s"><div class="cbody"><div class="chead"></div></div></div>`;
    html += `<div class="flyer" style="--d:23s;--dl:-6s;bottom:8vmin"><span class="w">🦋</span></div>`;
    html += `<div class="flyer" style="--d:30s;--dl:-17s;bottom:9.6vmin;--sz:1.9vmin;--fb:.42s"><span class="w">🐝</span></div>`;
    m.innerHTML = html;
}

function _buildBingo(m, t) {
    // solid glossy spheres with a BINGO letter over a number (B 1-15, I 16-30, …)
    const COLORS = [['#d0342c', '#fff'], ['#f2c018', '#1b1b1b'], ['#1a9a3a', '#fff'], ['#2a6fd0', '#fff'], ['#f4f4f4', '#1b1b1b']];
    const COLS = [['B', 1, 15], ['I', 16, 30], ['N', 31, 45], ['G', 46, 60], ['O', 61, 75]];
    let html = '<div class="ground"></div>';
    const props = t.props || [];
    for (let i = 0; i < 10 && props.length; i++) {
        html += `<div class="prop" style="left:${_rand(100).toFixed(1)}%;--b:${(1.2 + _rand(2.6)).toFixed(1)}vmin;--sz:${(1.7 + _rand(1.3)).toFixed(1)}vmin;--dl:${(-_rand(3)).toFixed(2)}s">${props[i % props.length]}</div>`;
    }
    const N = 7;
    for (let i = 0; i < N; i++) {
        const left = (i / (N - 1)) * 88 + 5 + (_rand(4) - 2);
        const sc = (0.82 + _rand(0.5)).toFixed(2);
        const d = 5 + _rand(1.5);
        const br = (0.92 + _rand(0.08)).toFixed(2);
        const b = (2.2 + _rand(1.2)).toFixed(1);
        const bob = (1.0 + _rand(0.9)).toFixed(2);
        const dl = (-_rand(6)).toFixed(2);
        const go = left < 50 ? 'goR' : 'goL';
        const range = (10 + _rand(14)).toFixed(1);
        const walk = (20 + _rand(16)).toFixed(1);
        const col = COLORS[Math.floor(_rand(COLORS.length))];
        const c = COLS[Math.floor(_rand(COLS.length))];
        const num = c[1] + Math.floor(_rand(c[2] - c[1] + 1));
        html += `<div class="bball ${go}" style="left:${left.toFixed(1)}%;--sc:${sc};--range:${range}vw;--walk:${walk}s;--dl:${dl}s;--b:${b}vmin;z-index:${Math.round(sc * 10)}">`
            + `<div class="ball-in" style="--d:${d.toFixed(1)}vmin;--bc:${col[0]};--tc:${col[1]};--br:${br};--bob:${bob}s;--dl:${dl}s;--fl:${(d * 0.26).toFixed(2)}vmin;--fn:${(d * 0.42).toFixed(2)}vmin">`
            + `<span class="bmark"><span class="bl">${c[0]}</span><span class="bn">${num}</span></span></div></div>`;
    }
    const fly = t.fly || ['🎉'];
    fly.slice(0, 2).forEach((e, i) => {
        html += `<div class="flyer" style="--d:${24 + i * 6}s;--dl:${-6 - i * 8}s;bottom:${(8 + i * 1.6).toFixed(1)}vmin;--sz:${(1.9 + _rand(0.6)).toFixed(1)}vmin;--fb:${(0.42 + _rand(0.2)).toFixed(2)}s"><span class="w">${e}</span></div>`;
    });
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
            st.textContent = SCENE_CSS + SHEEP_CSS + COW_CSS + BINGOBALL_CSS + `\n${lift} { position: relative; z-index: 1; }\n`;
            document.head.appendChild(st);
        }
        let m = document.getElementById('meadow');
        if (!m) { m = document.createElement('div'); m.id = 'meadow'; m.setAttribute('aria-hidden', 'true'); document.body.appendChild(m); }
        if (m.dataset.built) return;
        m.dataset.built = '1';
        if (t.g1) m.style.setProperty('--g1', t.g1);
        if (t.g2) m.style.setProperty('--g2', t.g2);
        if (t.glow) m.style.setProperty('--glow', t.glow);
        if (t.sheep) _buildSheep(m); else if (t.cows) _buildCows(m); else if (t.balls) _buildBingo(m, t); else _buildEmojiScene(m, t);
    };
    if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
}

function mountMeadow(contentSelector) { return mountScene('meadow', contentSelector); }

// ─── Shared TV / viewer lobby ──────────────────────────────────────────────────
// The "waiting for players" big-screen page, modelled on letterstorm's: title,
// "scan to join", a big square QR on the left, ROOM CODE + settings on the right,
// captain hint, player chips (or "Waiting for players…"), and a ⛶ button. It
// renders its own QR (needs the qrcode-generator CDN) and injects its own scoped
// stylesheet (`.cxl-*`). Colours follow the game via CSS vars with fallbacks, and
// the title/code inherit the game's own font so it feels native. Usage:
//   return tvLobby({ title:'HERD MIND', roomCode:vD.roomCode, isTvHost:vD.tvHost,
//                    captainName:vD.captain, settings:'First to 12',
//                    players:(vD.players||[]).map(p=>({name:p.name, avatar:p.avatar})) });
function _cxlEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function _cxlQr(url) {
    try {
        const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
        const n = qr.getModuleCount(), m = 2, size = n + m * 2;
        let rects = '';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
            if (qr.isDark(r, c)) rects += `<rect x="${c + m}" y="${r + m}" width="1.05" height="1.05"/>`;
        return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="#ffffff"/><g fill="#0d0d1a">${rects}</g></svg>`;
    } catch (e) { return ''; }
}

const TVLOBBY_CSS = `
.cxl { position: fixed; inset: var(--tv-safe, 0); z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: clamp(12px, 2.6vh, 30px); padding: clamp(20px, 4vh, 48px); text-align: center; pointer-events: none; }
.cxl > * { pointer-events: auto; }
.cxl-title { font-size: clamp(2.1rem, 7vw, 5.4rem); font-weight: 900; letter-spacing: .1em; line-height: 1.02; color: var(--cxl-accent, var(--gold, #ffc93c)); filter: drop-shadow(0 0 30px rgba(0,0,0,.35)); }
.cxl-hint { font-size: clamp(.7rem, 1.4vw, 1rem); color: var(--cxl-muted, var(--muted, #94a1b8)); text-transform: uppercase; letter-spacing: 3px; }
.cxl-row { display: flex; align-items: center; gap: clamp(24px, 5vw, 70px); flex-wrap: wrap; justify-content: center; }
.cxl-qr { width: clamp(200px, 40vmin, 460px); aspect-ratio: 1; flex-shrink: 0; border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 0 0 10px #fff, 0 0 60px rgba(0,0,0,.45); }
.cxl-qr svg { display: block; width: 100%; height: 100%; }
.cxl-side { display: flex; flex-direction: column; gap: clamp(6px, 1.4vh, 14px); }
.cxl-code { font-size: clamp(2.4rem, 9vw, 7rem); font-weight: 900; letter-spacing: .14em; color: var(--cxl-accent, var(--gold, #ffc93c)); filter: drop-shadow(0 0 24px rgba(255,201,60,.45)); }
.cxl-chips { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; max-width: 82vw; }
.cxl-chip { padding: 8px 18px; border-radius: 22px; background: var(--s2, rgba(255,255,255,.07)); border: 1px solid var(--border, rgba(255,255,255,.16)); font-size: clamp(.75rem, 1.5vw, 1.05rem); font-weight: 700; display: flex; align-items: center; gap: 8px; animation: cxlPillIn .4s cubic-bezier(.34,1.56,.64,1) both; }
.cxl-chip .cxl-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--success, #4bd07a); box-shadow: 0 0 8px currentColor; color: var(--success, #4bd07a); }
.cxl-wait { color: var(--cxl-muted, var(--muted, #94a1b8)); font-weight: 700; font-size: clamp(.8rem, 1.6vw, 1.1rem); }
.cxl-fs { position: fixed; top: calc(16px + var(--tv-safe, 0px)); right: calc(16px + var(--tv-safe, 0px)); z-index: 6; background: transparent; border: 1px solid var(--border, rgba(255,255,255,.22)); color: var(--muted, #94a1b8); font-size: clamp(1rem, 2vw, 1.3rem); width: 2.2em; height: 2.2em; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
.cxl-fs:hover { color: var(--cxl-accent, var(--gold, #ffc93c)); border-color: var(--cxl-accent, var(--gold, #ffc93c)); }
@keyframes cxlPillIn { from { opacity: 0; transform: translateY(10px) scale(.9); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .cxl-chip { animation: none; } }
`;

function _ensureTvLobbyStyle() {
    if (typeof document === 'undefined' || document.getElementById('cxl-style')) return;
    const st = document.createElement('style'); st.id = 'cxl-style'; st.textContent = TVLOBBY_CSS;
    document.head.appendChild(st);
}

function tvLobby(opts) {
    _ensureTvLobbyStyle();
    const o = opts || {};
    const code = String(o.roomCode || '');
    const url = o.joinUrl || (location.origin + location.pathname + '?room=' + code);
    const players = o.players || [];
    const chips = players.length
        ? players.map((p, i) => {
            const crown = (o.isTvHost && (p.captain || i === 0)) ? ' 👑' : '';
            const av = p.avatar ? `<span>${_cxlEsc(p.avatar)}</span>` : `<span class="cxl-dot"${p.color ? ` style="background:${_cxlEsc(p.color)};color:${_cxlEsc(p.color)}"` : ''}></span>`;
            return `<div class="cxl-chip" style="animation-delay:${i * 70}ms">${av}<span${p.color ? ` style="color:${_cxlEsc(p.color)}"` : ''}>${_cxlEsc(p.name)}${crown}</span></div>`;
        }).join('')
        : `<div class="cxl-wait">${_cxlEsc(o.waitingText || 'Waiting for players…')}</div>`;
    let captainHint = '';
    if (o.hint) {
        captainHint = `<div class="cxl-hint">${_cxlEsc(o.hint)}</div>`;
    } else if (o.isTvHost) {
        captainHint = o.captainName
            ? `<div class="cxl-hint">👑 ${_cxlEsc(o.captainName)} is the captain — start from their phone</div>`
            : `<div class="cxl-hint">👑 First player to join becomes the captain and starts the game</div>`;
    }
    return `<div class="cxl"${o.accent ? ` style="--cxl-accent:${_cxlEsc(o.accent)}"` : ''}>
        <div class="cxl-title">${_cxlEsc(o.title || '')}</div>
        <div class="cxl-hint">${_cxlEsc(o.scanHint || 'Scan with your phone to join')}</div>
        <div class="cxl-row">
            <div class="cxl-qr">${_cxlQr(url)}</div>
            <div class="cxl-side">
                <div class="cxl-hint">room code</div>
                <div class="cxl-code">${_cxlEsc(code)}</div>
                ${o.settings ? `<div class="cxl-hint" style="margin-top:.6vh">${_cxlEsc(o.settings)}</div>` : ''}
            </div>
        </div>
        ${captainHint}
        <div class="cxl-chips">${chips}</div>
    </div>`;
}

// ─── Shared preferences (one localStorage key each, so they carry across all games) ──
// Same-origin pages share localStorage; using shared keys means a name typed in one
// game pre-fills in every other, and the day/night choice follows you between games.
// Reads happen at load, so callers guard them (`typeof savedName === 'function' && …`)
// exactly like mountScene — a stale/missing common.js then just skips the preference.
function savedName() { try { return localStorage.getItem('games-name') || ''; } catch (_) { return ''; } }
function saveName(n) { try { localStorage.setItem('games-name', n); } catch (_) {} }

// Day/night theme, for the games that expose a toggle. Dark is the default; the
// toggle flips `body.day` and updates the #theme-btn icon. Games call
// `applySavedTheme()` once at load and wire the button to `toggleTheme()`.
function savedTheme() { try { return localStorage.getItem('games-theme') === 'day' ? 'day' : 'dark'; } catch (_) { return 'dark'; } }
function saveTheme(t) { try { localStorage.setItem('games-theme', t); } catch (_) {} }
function applySavedTheme() {
    if (typeof document === 'undefined' || !document.body) return;
    const day = savedTheme() === 'day';
    document.body.classList.toggle('day', day);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = day ? '🌙' : '☀️';
}
function toggleTheme() {
    document.body.classList.toggle('day');
    const day = document.body.classList.contains('day');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = day ? '🌙' : '☀️';
    saveTheme(day ? 'day' : 'dark');
}

// ─── Unified control strip (mounts itself on every page) ───────────────────────
// One fixed top-right vertical strip — ⛶ fullscreen, 🌙 day/night, 🎵 music, 🔊 sound
// — so every game AND index.html carry the same controls in the same place (the
// ticktacktoe layout). It REUSES each game's existing audio container (#sound-togs
// or .audio-togs, already holding #tog-music/#tog-sfx wired to the game's own
// toggleMusic/toggleSfx), so those buttons keep working untouched; it just prepends
// the day/night + fullscreen buttons and restyles the container into the strip.
// Pages with no audio (index.html) get a strip with just fullscreen + day/night.
// Nothing to add per game — mountControls() runs on DOMContentLoaded.
const CONTROLS_CSS = `
/* single vertical column, min width — hugs the right edge (⛶ fullscreen, 🌙 day/night,
   🎵 music, 🔊 sound top→bottom) so it uses the least horizontal space and clears
   each game's right-edge content. Order in DOM is fullscreen, theme, music, sfx. */
#game-controls { position: fixed; top: calc(12px + var(--tv-safe, 0px)); right: calc(12px + var(--tv-safe, 0px)); z-index: 95; display: flex; flex-direction: column; width: max-content; gap: 6px; }
#game-controls button { width: 34px; height: 34px; padding: 0; background: rgba(18,14,32,.60); border: 1px solid rgba(255,255,255,.24); color: #fff; border-radius: 8px; font-size: .98rem; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); transition: border-color .15s, opacity .2s, transform .12s, background .2s; }
#game-controls button:hover { border-color: #fff; }
#game-controls button:active { transform: scale(.88); }
#game-controls button.off { opacity: .34; filter: grayscale(1); }
body.day #game-controls button { background: rgba(255,255,255,.82); border-color: rgba(0,0,0,.16); color: #1b1830; box-shadow: 0 2px 8px rgba(0,0,0,.10); }
body.day #game-controls button:hover { border-color: #1b1830; }
/* 📡 relay badge — only mounted while a connection is being forwarded by TURN */
#game-controls #btn-relay { border-color: rgba(255,196,92,.72); box-shadow: 0 0 0 1px rgba(255,196,92,.20); }
#game-controls #btn-relay.direct { border-color: rgba(120,220,160,.60); box-shadow: none; }
#relay-note { position: fixed; top: calc(12px + var(--tv-safe, 0px)); right: calc(56px + var(--tv-safe, 0px)); z-index: 96;
    max-width: min(260px, 62vw); padding: 10px 12px; border-radius: 10px; font-size: .72rem; font-weight: 700; line-height: 1.35;
    background: rgba(18,14,32,.94); color: #fff; border: 1px solid rgba(255,196,92,.55); box-shadow: 0 8px 24px rgba(0,0,0,.35); }
body.day #relay-note { background: #fff; color: #1b1830; border-color: rgba(190,130,20,.45); }
@media (prefers-reduced-motion: reduce) { #game-controls button { transition: none; } }
`;

function toggleFullscreen() {
    try {
        const d = document, el = d.documentElement;
        if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch (_) {}
}
function _syncFsBtn() {
    const b = document.getElementById('btn-fullscreen'); if (!b) return;
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    b.classList.toggle('on', on); b.title = on ? 'Exit fullscreen' : 'Fullscreen';
}
function _mkCtrlBtn(id, title, glyph, handler) {
    const b = document.createElement('button');
    b.id = id; b.title = title; b.textContent = glyph;
    b.addEventListener('click', handler);
    return b;
}
function mountControls() {
    if (typeof document === 'undefined' || document.getElementById('game-controls')) return;
    if (!document.getElementById('game-controls-style')) {
        const st = document.createElement('style'); st.id = 'game-controls-style';
        // the share-room block rides along with the control strip's stylesheet: every game
        // mounts that, so the styling is there wherever shareRoomHTML is used
        st.textContent = CONTROLS_CSS + '\n' + SHARE_ROOM_CSS;
        document.head.appendChild(st);
    }
    // Reuse the game's audio-toggle container so #tog-music/#tog-sfx stay live; else make a bare strip.
    let host = document.querySelector('#sound-togs, .audio-togs');
    // drop any standalone day/night button — we render our own inside the strip
    document.querySelectorAll('#theme-btn, .theme-toggle').forEach(b => { if (!host || !host.contains(b)) b.remove(); });
    if (!host) { host = document.createElement('div'); document.body.appendChild(host); }
    host.id = 'game-controls'; host.classList.remove('audio-togs');
    // prepend in reverse so the final order is: fullscreen, day/night, [music, sound]
    host.insertBefore(_mkCtrlBtn('theme-btn', 'Toggle day/night mode', savedTheme() === 'day' ? '🌙' : '☀️', toggleTheme), host.firstChild);
    host.insertBefore(_mkCtrlBtn('btn-fullscreen', 'Fullscreen', '⛶', toggleFullscreen), host.firstChild);
    applySavedTheme();
    _syncFsBtn();
    if (_netKnown) setNetState(_netState);      // path was already known before the strip existed
    document.addEventListener('fullscreenchange', _syncFsBtn);
    document.addEventListener('webkitfullscreenchange', _syncFsBtn);
}

// ── innerHTML swap that doesn't strand the on-screen keyboard ───────────────
// Every game re-renders by replacing #app's innerHTML. When a phase change lands
// while you're typing (the puzzle changes, the round ends), that destroys the
// focused <input> — and iOS leaves the keyboard up with nothing behind it, so you
// type into the void and the game feels frozen. Blur before the swap, then put
// focus and the caret back if the same field is still on the new screen.
function setHTML(el, html) {
    const a = document.activeElement;
    const typing = !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && el.contains(a));
    // Prefer the id; fall back to the shared name field, which the games render WITHOUT
    // an id — and which is exactly where a re-render lands while you're still typing
    // (someone else joins the lobby, the screen redraws, your name loses the caret).
    const id = typing && a.id ? a.id : null;
    const byName = typing && !id && a.hasAttribute('data-save-name');
    let s = 0, e = 0;
    if (typing) { try { s = a.selectionStart; e = a.selectionEnd; } catch (_) {} a.blur(); }
    el.innerHTML = html;
    if (!typing) return;
    const n = id ? document.getElementById(id) : (byName ? el.querySelector('input[data-save-name]') : null);
    if (!n) return;
    try { n.focus({ preventScroll: true }); n.setSelectionRange(s, e); } catch (_) {}
}

// ── device id (for reconnects) ──────────────────────────────────────────────
// Browsers deliberately expose no hardware/device identifier, so we mint our own
// and send it with every `join`. The host matches a rejoining player on it first
// (falling back to the name), which survives renames and duplicate names.
// sessionStorage, NOT localStorage, on purpose: it survives a reload, a sleeping
// phone and a browser back/forward, but is per-TAB — so a TV and a phone opened in
// two tabs of the same device can never be mistaken for the same player.
function clientId() {
    try {
        let id = sessionStorage.getItem('games-cid');
        if (!id) {
            id = 'c' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
            sessionStorage.setItem('games-cid', id);
        }
        return id;
    } catch (_) { return null; }   // private mode / storage disabled → name matching
}

// ── sharing the room from a PHONE ───────────────────────────────────────────
// The TV shows a QR code, which is perfect for the people in the room and useless for the
// ones who aren't. Somebody on the sofa can't forward a television to a phone in another
// house — so every player who is already in gets the code and a link they can send on.
//
// Rendered in the guest lobby for EVERYONE, not just the captain: the person with the group
// chat open is rarely the person who joined first.
function shareRoomHTML(code, joinUrl) {
    const c = String(code || '').toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) return '';
    const url = joinUrl || (location.origin + location.pathname + '?room=' + c);
    const j = JSON.stringify(url), t = JSON.stringify('Join my game — room ' + c);
    return `<div class="share-room">
        <div class="share-room-code">Room <b>${c}</b></div>
        <div class="share-room-btns">
            <button class="btn btn-g btn-sm" onclick='copyRoomLink(${j}, this)'>🔗 Copy link</button>
            <button class="btn btn-g btn-sm" onclick='shareRoomLink(${j}, ${t})'>📤 Share</button>
        </div>
        <div class="share-room-hint">Send this to anyone who can't see the TV</div>
    </div>`;
}
function copyRoomLink(url, btn) {
    const done = () => { if (!btn) return; const was = btn.textContent; btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = was; }, 1600); };
    try {
        if (navigator.clipboard) { navigator.clipboard.writeText(url).then(done, () => {}); return; }
    } catch (_) {}
    // clipboard API needs https or a user gesture it did not get — fall back to a prompt so
    // the link is at least selectable rather than unreachable
    try { window.prompt('Copy this link', url); } catch (_) {}
}
function shareRoomLink(url, text) {
    try {
        if (navigator.share) { navigator.share({ title: 'Game night', text, url }).catch(() => {}); return; }
    } catch (_) {}
    copyRoomLink(url, null);
}
const SHARE_ROOM_CSS = `.share-room{margin-top:12px;padding:10px 12px;border:1px dashed var(--border2,rgba(255,255,255,.18));
border-radius:12px;text-align:center}
.share-room-code{font-size:.78rem;opacity:.8;margin-bottom:8px;letter-spacing:.5px}
.share-room-code b{letter-spacing:3px;font-size:1rem}
.share-room-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.share-room-hint{font-size:.62rem;opacity:.55;margin-top:7px;line-height:1.4}`;

// ── final standings for an ELIMINATION game ─────────────────────────────────
// `rankByScore` ranks a game where everyone finishes with a number. This is the other kind:
// nobody has a score, people are knocked OUT, and the finishing order is the elimination
// order read backwards — last one standing first, first one out last.
//
// RPS and Liar's Dice were both doing this by hand, with the same algorithm and a difference
// that mattered: RPS appended anyone who was never eliminated (a player who joined late, or
// who was still alive when the game ended another way), Liar's Dice dropped them off the
// podium entirely. That is exactly the drift that happens when two games implement the same
// idea separately.
//
//   entries    the players (any shape)
//   eliminated the keys of those knocked out, EARLIEST FIRST
//   champion   the key of the winner, if there is one
//   keyOf      how to read a key off an entry — id in most games, name in Liar's Dice
//
// Returns the entries themselves, in finishing order, with no duplicates and nobody lost.
function rankByElimination(entries, eliminated, champion, keyOf) {
    const list = entries || [];
    const key = keyOf || function (e) { return e && e.id; };
    const out = [];
    const seen = [];
    function take(k) {
        if (k == null || seen.indexOf(k) >= 0) return;
        for (let i = 0; i < list.length; i++) {
            if (key(list[i]) === k) { seen.push(k); out.push(list[i]); return; }
        }
    }
    take(champion);                                   // last one standing goes first
    const gone = eliminated || [];
    for (let i = gone.length - 1; i >= 0; i--) take(gone[i]);   // then reverse elimination order
    list.forEach(function (e) { take(key(e)); });     // and nobody is left off the podium
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD VERSION: are we all running the same code?
// ═══════════════════════════════════════════════════════════════════════════
// The host and every phone must agree about the protocol. They can quietly disagree — a tab
// left open for an hour, a page iOS kept in its back-forward cache, a phone that rejoined
// from history — and when they do, the symptoms look like game bugs. Several hours were
// spent this week on duplicate lobby rows that may simply have been one device running
// yesterday's rules.
//
// Cache tokens reduce the odds; they cannot detect it when it happens anyway. This does.
//
// The version is not a constant to keep in sync: it is READ OFF THIS SCRIPT'S OWN URL, which
// every page loads as `common.js?v=<date>-<sha>`. Bump the token and the build changes with
// it, automatically. No token (a local file open, an old page) reports 'dev', which never
// warns — nobody needs a scary banner while hacking on their laptop.
const BUILD = (function () {
    try {
        const el = document.currentScript ||
            [].slice.call(document.scripts).filter(function (x) { return /common\.js/.test(x.src); }).pop();
        const m = el && /[?&]v=([^&"]+)/.exec(el.src);
        return m ? m[1] : 'dev';
    } catch (_) { return 'dev'; }
})();

// HOST: called with each join. Returns true (and tells the phone) if that phone is stale.
function warnIfStale(conn, msg, sendFn) {
    const theirs = msg && msg.build;
    if (!theirs || theirs === 'dev' || BUILD === 'dev' || theirs === BUILD) return false;
    try { sendFn(conn, { type: 'version', host: BUILD, yours: theirs }); } catch (_) {}
    return true;
}

// PHONE: the host says we're out of date. Say so plainly and offer the one-tap fix, rather
// than letting a version mismatch masquerade as a game that behaves oddly.
function showStaleBuild(hostBuild) {
    if (typeof document === 'undefined' || document.getElementById('stale-build')) return;
    const d = document.createElement('div');
    d.id = 'stale-build';
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
        'justify-content:center;background:rgba(8,4,18,.94);backdrop-filter:blur(6px);' +
        'font-family:inherit;color:#fff;text-align:center;padding:24px';
    d.innerHTML = '<div style="max-width:22rem">' +
        '<div style="font-size:2.6rem;margin-bottom:12px">🔄</div>' +
        '<div style="font-weight:900;font-size:1.15rem;margin-bottom:10px">This page is out of date</div>' +
        '<div style="opacity:.75;font-size:.85rem;line-height:1.5;margin-bottom:18px">' +
        'Your phone is running an older copy of the game than the room is. ' +
        'Reload and you\'ll go straight back to your seat.</div>' +
        '<button id="stale-reload" style="font:inherit;font-weight:800;font-size:1rem;padding:14px 26px;' +
        'border-radius:14px;border:0;background:#ffd23f;color:#2b1a00">Reload</button></div>';
    document.body.appendChild(d);
    const b = document.getElementById('stale-reload');
    if (b) b.onclick = function () { location.reload(); };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESENCE: who is actually still there
// ═══════════════════════════════════════════════════════════════════════════
// The host's only built-in signal that a phone has gone is `conn.on('close')`, and it is
// nowhere near good enough. MEASURED: a closed tab produced ZERO close events in 75 seconds
// — the data channel simply goes quiet, there is no FIN. So `guestConns` cheerfully lists
// devices that are switched off, and every "are they here?" question built on it gets the
// wrong answer.
//
// Two visible bugs came from that, in different games:
//   • a room sat waiting on a player who had left, every single round;
//   • a lobby filled up with GHOSTS of one person — close the browser, reopen, and you were
//     a new player each time, because the seat-reclaim rule only reclaims seats whose
//     connection is "dead" and no connection ever looked dead.
//
// So phones say so out loud. Every game's phone sends a heartbeat; the host stamps
// `player.seen` on ANY message from that player, and asks `isPresent()` rather than trusting
// the connection map. This lives here because it must be the same in all 18 games — the rule
// it replaces was copy-pasted into each of them and had already drifted in two.

const HEARTBEAT_MS = 4000;      // phones speak up this often…
const PRESENCE_MS = 13000;      // …and are presumed gone after this long in silence

let _hbTimer = null;
// Start on the phone once it is connected: `startHeartbeat(() => send(hostConn, {type:'hb'}))`.
// Safe to call repeatedly — a reconnect just replaces the old timer.
function startHeartbeat(sendFn, ms) {
    stopHeartbeat();
    if (typeof sendFn !== 'function') return;
    try { sendFn(); } catch (_) {}                      // one immediately, so the host knows at once
    _hbTimer = setInterval(() => { try { sendFn(); } catch (_) {} }, ms || HEARTBEAT_MS);
}
function stopHeartbeat() { if (_hbTimer) { clearInterval(_hbTimer); _hbTimer = null; } }

// Host side. Call at the top of the message handler for EVERY message — a heartbeat is only
// the guaranteed one; a roll or a vote is just as good a proof of life.
function notePresence(player) {
    if (player) player.seen = Date.now();
    return player;
}
// Has this player been heard from recently? A player who has only just joined has no `seen`
// yet, so an open connection stands in until their first heartbeat lands.
function isPresent(player, conns) {
    if (!player) return false;
    const live = !conns || !!conns[player.id];
    if (!player.seen) return live;
    return live && (Date.now() - player.seen) < PRESENCE_MS;
}

// ── claiming a seat back ────────────────────────────────────────────────────
// THE one rule for "is this returning join the same person as an existing player?", shared so
// it cannot drift again. Two ways to match, and they are deliberately not equally trusting:
//
//   cid  — a device id. A device can only be in one place at a time, so a cid match ALWAYS
//          takes the seat over, no matter what the connection map claims. This is what was
//          missing: the old rule required the previous connection to look dead first, and it
//          never does.
//
//   name — much weaker: two people really can both be called Ben. So a name only reclaims a
//          seat that is NOT present — and "present" now means heard-from recently, not merely
//          holding an open connection. That is what makes closing and reopening a browser
//          work: sessionStorage is cleared, so the returning device has a NEW cid and only
//          the name is left to go on.
//
// Returns the player whose seat is being taken over, or null for a genuinely new player.
function claimSeat(players, msg, newId, conns, inLobby) {
    if (!Array.isArray(players)) return null;
    const cid = msg && msg.cid;
    const name = String((msg && msg.name) || '').slice(0, 16);
    if (cid) {
        const sameDevice = players.find(p => p.cid === cid && p.id !== newId);
        if (sameDevice) return sameDevice;
    }
    if (!name) return null;
    // A NAME ALWAYS reclaims its seat — in the lobby and mid-game alike.
    //
    // This was the last hole, and it produced a Buzzin' scoreboard with "Neil (you)" twice on
    // it, on 1 point and 0. The lobby got the simple rule; mid-game still insisted the old
    // seat had gone quiet first, and somebody whose phone reconnects is back inside the
    // presence window — so they were handed a brand-new player with a fresh score while their
    // real one sat there.
    //
    // The trade is deliberate. Two DIFFERENT people who both type "Neil" will now share a
    // seat, which is visible in the lobby and fixed by one of them retyping their name. The
    // alternative was a game that quietly breaks every time anyone's phone reconnects — far
    // worse, and invisible until the final scores. In a family party game, one name is one
    // person.
    //
    // (`inLobby` is no longer needed to make this decision. It is kept because every game
    // passes it and it costs nothing to accept.)
    return players.find(p => p.name === name && p.id !== newId) || null;
}

// ── who is actually here ────────────────────────────────────────────────────
// Every game needs this and every game had its own byte-identical copy of it. It is the
// single most load-bearing question in the repo: it decides whether a round can close, and it
// decides who wears the 👑 crown.
//
// It asks the HEARTBEAT, not the connection map. `guestConns` still lists a phone whose
// browser was closed, because conn.on('close') does not fire for that.
//
// `self` is the host's own row: a phone host is playing, a TV host is not.
function presentPlayers(players, conns, selfId, selfPlays) {
    return (players || []).filter(p => (p.id === selfId ? !!selfPlays : isPresent(p, conns)));
}

// ── rekeying a returning player ─────────────────────────────────────────────
// A player IS their peer id, and a refresh mints a new one. Re-pointing their row in
// `H.players` is the easy half; the id is usually ALSO a key somewhere else, and every one of
// those keeps pointing at a peer that no longer exists.
//
// It is silent and it strands rooms. In Plump Trek it was `H.turn`, so a player who refreshed
// on their own turn never got the Roll button back and the room waited on nobody. In The Odd
// Sheep it was `H.votes`, so their vote was orphaned and `every(p => H.votes[p.id])` never
// came true. In RPS it was `H.eliminated`, so the final standings showed them as "?" and then
// again by name. Same bug, three shapes.
//
// The SHAPES are what's shared, so they live here; each game passes its own field names:
//
//   scalars — H.turn, H.buzzedBy      a field that IS an id
//   arrays  — H.eliminated, H.turnOrder, H.lockedOut, H.order
//   maps    — H.votes[id], H.answers[id], H.pending[id]   (keyed BY id)
//   whoObjs — H.card.who, H.choice.who
//   idObjs  — H.moved.id
//
// Anything not one of those shapes is genuinely game-specific and stays in the game — but
// most of it is one of these.
function rekeyPlayerId(H, oldId, newId, spec) {
    if (!H || !oldId || oldId === newId) return;
    const f = spec || {};
    (f.scalars || []).forEach(k => { if (H[k] === oldId) H[k] = newId; });
    (f.arrays || []).forEach(k => {
        if (Array.isArray(H[k])) H[k] = H[k].map(v => (v === oldId ? newId : v));
    });
    (f.maps || []).forEach(k => {
        const m = H[k];
        if (!m || typeof m !== 'object') return;
        if (Object.prototype.hasOwnProperty.call(m, oldId)) { m[newId] = m[oldId]; delete m[oldId]; }
        // a value that POINTS AT the returning player has to follow them too — a vote cast
        // for them, say
        Object.keys(m).forEach(k2 => { if (m[k2] === oldId) m[k2] = newId; });
    });
    (f.whoObjs || []).forEach(k => { if (H[k] && H[k].who === oldId) H[k].who = newId; });
    (f.idObjs || []).forEach(k => { if (H[k] && H[k].id === oldId) H[k].id = newId; });
}

// ── the periodic re-check ───────────────────────────────────────────────────
// Presence tells a game WHO is here; this is what makes it act on it.
//
// Every game advances a round with a check like
//     if (active.every(p => p.answered)) closeRound();
// and that check is EDGE-TRIGGERED — it is only ever asked when somebody answers. So if the
// last person present answers while a departed phone still counts as present, nobody asks
// again. Thirteen seconds later that phone stops counting, the condition is now true, and
// there is no longer anything to notice it. The room sits there for ever, and in the eight
// games with no round timer that is the end of the evening.
//
// So the host re-asks on a timer.
//
// It re-asks EVERY tick, and the first version of this was cleverer than that: it only
// re-asked when the set of present players had changed. That looked like an obvious saving
// and it was quietly wrong, because the set can change BEFORE the game reaches the state
// where the answer matters — somebody leaves during the question, the round then moves to
// the answering phase, and the set never changes again, so the re-check never runs and the
// room stalls anyway. It made the test for this flaky, which is how it was caught.
//
// The checks are cheap and idempotent — each is an `every()` over a handful of players that
// does nothing unless its condition is already true — so asking every couple of seconds
// costs nothing worth having. Correctness over cleverness.
let _presenceSweep = null;
function watchPresence(recheck, ms) {
    stopPresenceWatch();
    if (typeof recheck !== 'function') return;
    _presenceSweep = setInterval(() => {
        try { recheck(); } catch (_) {}           // a game's advance logic must never kill the sweep
    }, ms || 2500);
}
function stopPresenceWatch() { if (_presenceSweep) { clearInterval(_presenceSweep); _presenceSweep = null; } }

// ── remembering the room (survive a browser refresh) ────────────────────────
// A phone that reloads the page — deliberately, or because iOS reaped the tab —
// used to land back on the home screen and have to re-type the code. We remember
// the room in sessionStorage instead, so boot() walks straight back in. Per-tab
// and per-game, so a fresh tab (or a different game) never auto-joins something.
// The HOST/TV is deliberately never remembered: its `H` is the game, and that
// can't survive a reload, so silently re-creating an empty room would be a lie.
function rememberRoom(code, role) {
    try { sessionStorage.setItem('games-room', JSON.stringify({ g: location.pathname, code, role, t: Date.now() })); } catch (_) {}
}
function forgetRoom() { try { sessionStorage.removeItem('games-room'); } catch (_) {} }
function savedRoom(maxAgeMs) {
    try {
        const r = JSON.parse(sessionStorage.getItem('games-room') || 'null');
        if (!r || r.g !== location.pathname || !r.code) return null;
        return (Date.now() - r.t > (maxAgeMs || 6 * 3600 * 1000)) ? null : r;
    } catch (_) { return null; }
}

// ── connection-path badge ───────────────────────────────────────────────────
// p2p.js reads the ICE candidate pair the connection actually settled on, which
// names the mechanism that got these two devices talking. Every game shows it once
// connected, so "are we relaying?" is answered on screen, never inferred:
//   🏠 local    — both ends are host candidates: same wifi/LAN. No STUN, no TURN.
//   🌐 stun     — a server-reflexive (or peer-reflexive) candidate won: the STUN
//                 server introduced the two NATs and they now talk directly. This
//                 is what two phones on different networks normally get.
//   📡 relay    — a TURN candidate won: no direct path existed, so every packet is
//                 forwarded by the relay. Costs relay quota and adds latency.
//   ⏳ checking — connected, ICE hasn't settled yet.
// Nothing shows before you're in a room; `?net=0` hides it for good (sticky per
// browser, `?net=1` brings it back).
let _netState = 'checking';
let _netKnown = false;         // has a connection reported a path yet?
let _relayOn = false;
let _netShow = true;
try {
    const q = new URLSearchParams(location.search).get('net');
    if (q === '1' || q === '0') localStorage.setItem('games-netbadge', q);
    _netShow = localStorage.getItem('games-netbadge') !== '0';
} catch (_) {}

const NET_NOTES = {
    relay: 'Relay in use 📡 — no direct path was possible (a strict firewall, symmetric NAT or mobile network at one end), so a relay server is forwarding every message. Perfectly playable, just slower than a direct connection.',
    stun: 'Direct connection 🌐 — you’re on different networks, but the devices found each other and are talking directly. No game data passes through any server. This is the good outcome.',
    local: 'Same network 🏠 — both devices are on the same wifi, so the game never leaves the house. The fastest, most reliable connection there is.',
    checking: 'Connecting ⏳ — racing the possible routes (same-network, direct, relayed). Settles to 🏠, 🌐 or 📡 within a few seconds.',
};
const NET_GLYPH = { relay: '📡', stun: '🌐', local: '🏠', checking: '⏳' };
const NET_TITLE = {
    relay: 'Relay in use (TURN) — no direct path was possible',
    stun: 'Direct connection across networks (STUN) — no relay needed',
    local: 'Same network — no server involved at all',
    checking: 'Racing the possible routes…',
};
function _toggleRelayNote() {
    const old = document.getElementById('relay-note');
    if (old) { old.remove(); return; }
    const n = document.createElement('div');
    n.id = 'relay-note'; n.textContent = NET_NOTES[_netState] || NET_NOTES.checking;
    document.body.appendChild(n);
    setTimeout(() => { const x = document.getElementById('relay-note'); if (x) x.remove(); }, 8000);
}
function setNetState(state) {
    if (state === 'none') {                      // no live connection → hide the badge
        _netKnown = false; _netState = 'checking'; _relayOn = false;
    } else {
        if (state === 'direct') state = 'stun';  // older callers said just "direct"
        _netState = NET_GLYPH[state] ? state : 'checking';
        _relayOn = _netState === 'relay';
        if (_netState !== 'checking') _netKnown = true;
    }
    if (typeof document === 'undefined') return;
    const strip = document.getElementById('game-controls');
    if (!strip) return;                          // mountControls() will apply it later
    let b = document.getElementById('btn-relay');
    const want = _netShow && _netKnown;          // only once we're actually connected
    if (want && !b) { b = _mkCtrlBtn('btn-relay', '', NET_GLYPH[_netState], _toggleRelayNote); strip.appendChild(b); }
    else if (!want && b) { b.remove(); const n = document.getElementById('relay-note'); if (n) n.remove(); return; }
    if (b) {
        b.textContent = NET_GLYPH[_netState];
        b.title = NET_TITLE[_netState] + ' — tap for details';
        b.classList.toggle('direct', _netState !== 'relay');
    }
}
// kept as the older name, and as the plain on/off entry point
function setRelayBadge(on) { setNetState(on ? 'relay' : 'direct'); }
// One shared name-save handler for every game: any name <input> marked `data-name`
// persists to the shared 'games-name' key on each keystroke — so you can type your
// name, refresh (or hop to another game), and it's still there. Delegated on the
// document so it also catches inputs rendered later by each game's render().
function _wireNameSave() {
    if (typeof document === 'undefined' || document._nameSaveWired) return;
    document._nameSaveWired = true;
    document.addEventListener('input', function (e) {
        const t = e.target;
        if (t && t.tagName === 'INPUT' && t.hasAttribute('data-save-name')) saveName(t.value);
    }, true);
}
if (typeof document !== 'undefined') {
    _wireNameSave();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountControls);
    else mountControls();
}
