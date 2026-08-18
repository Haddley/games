// ─────────────────────────────────────────────────────────────────────────────
// character.js — a CSS-drawn TV character with a mouth that opens per-syllable of
// whatever it's saying, plus a speech-bubble fallback for devices with no Web
// Speech at all. Extracted once two games (Going, Going, GONE!'s auctioneer,
// Blackjack's dealer) had independently built the identical mechanism — this file
// owns the MECHANISM only. What stays per-game: the character's own art/CSS, its
// exact positioning, and its own speak-wrapper (voice picking, watchdogs, iOS
// priming) — see goinggone.html's `speakNow`/blackjack.html's `sayDealer` for that
// half, which calls into this file's `startMouth`/`charBubble`/`charBeat`.
//
// Narrowly scoped like dice.js/bracket.js — a game with no TV character pays
// nothing for loading it. Only ONE character can be mounted at a time (no game
// has needed two speaking characters live at once); extend with an id-keyed
// registry if that ever changes.
// ─────────────────────────────────────────────────────────────────────────────

let _charId = null, _charEl = null;
// Mounted once, outside #app, because #app's innerHTML is replaced on every render
// and a head rebuilt mid-sentence loses its mouth.
function mountCharacter(id, innerHTML) {
    if (_charEl || !document.body) return;
    _charId = id;
    _charEl = document.createElement('div');
    _charEl.id = id;
    _charEl.innerHTML = innerHTML;
    document.body.appendChild(_charEl);
    const b = document.createElement('div');
    b.id = id + '-bubble';
    b.setAttribute('aria-live', 'polite');
    document.body.appendChild(b);
}

// What the character is saying, in writing — shown for every line, even on a
// device that can't speak it at all (some smart-TV browsers ship no voices).
let _charBubbleTimer = null;
function charBubble(text, ms) {
    const el = _charId && document.getElementById(_charId + '-bubble');
    if (!el || !text) return;
    clearTimeout(_charBubbleTimer);
    el.textContent = text;
    el.classList.toggle('long', text.length > 60);
    el.classList.toggle('vlong', text.length > 120);
    el.classList.add('on');
    // ~14 characters a second, with a floor and a ceiling
    const hold = ms || Math.min(9000, Math.max(2200, text.length * 72));
    _charBubbleTimer = setTimeout(() => el.classList.remove('on'), hold);
}
function charBubbleOff() {
    clearTimeout(_charBubbleTimer);
    const el = _charId && document.getElementById(_charId + '-bubble');
    if (el) el.classList.remove('on');
}

function charTalk(on) { if (_charEl) _charEl.classList.toggle('talking', !!on); if (!on) stopMouth(); }

// ── the mouth ──
// Driven by the WORDS, not by a timer at a fixed rate. Speech engines give you
// onstart and (in most browsers) onboundary per word, but nothing about shape —
// so the plan is built from the text itself: one step per syllable, opened by the
// vowel in that syllable, and CLOSED at punctuation, which is what makes a full
// stop read as a full stop. onboundary, where it fires, re-anchors the plan
// against the real audio so it cannot drift over a long line.
let _mouthTimer = null, _mouthPlan = null, _mouthStep = 0;
// An average English syllable at rate 1. Erring LONG is the safe direction: onend
// always stops the mouth, so a plan that outlives the audio costs nothing, while
// one that finishes early leaves the character mouthing silence — and if it does
// run out mid-sentence the plan simply loops.
const SYL_MS = 210;

// Exported shape so a test can assert the plan rather than watch a face.
function planMouth(text, rate) {
    const steps = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text || ''))) {
        const at = m.index, word = m[0];
        const letters = word.replace(/[^a-z']/gi, '').toLowerCase();
        const vowels = letters.match(/[aeiouy]+/g) || [];
        const syl = Math.max(1, vowels.length);
        for (let k = 0; k < syl; k++) {
            const v = vowels[Math.min(k, vowels.length - 1)] || 'a';
            // how far the jaw drops for this syllable — "aw" is not "ee"
            const open = /^[ao]/.test(v) ? 1 : /^[eu]/.test(v) ? 0.66 : 0.42;
            steps.push({ at, open, dur: Math.round(SYL_MS / (rate || 1)) });
        }
        const tail = word.slice(-1);
        if (/[,;:—-]/.test(tail)) steps.push({ at, open: 0, dur: Math.round(150 / (rate || 1)) });
        else if (/[.!?]/.test(tail)) steps.push({ at, open: 0, dur: Math.round(300 / (rate || 1)) });
    }
    return steps;
}

// `opts.widthBase`/`opts.widthSlope` let each character's mouth narrow at its own
// rate as it opens (a wide-open mouth is also a narrower one, or it reads as a
// letterbox) — defaults match the auctioneer's original numbers.
function setMouth(open, opts) {
    if (!_charEl) return;
    const m = _charEl.querySelector('.mouth');
    if (!m) return;
    const widthBase = (opts && opts.widthBase) || 26, widthSlope = (opts && opts.widthSlope) || 7;
    m.style.height = (6 + open * 26).toFixed(1) + '%';
    m.style.width = (widthBase - open * widthSlope).toFixed(1) + '%';
}

function stopMouth() {
    clearTimeout(_mouthTimer); _mouthTimer = null; _mouthPlan = null; _mouthStep = 0;
    setMouth(0);
}

function startMouth(text, rate, opts) {
    stopMouth();
    if (typeof REDUCED !== 'undefined' && REDUCED) return;
    _mouthPlan = planMouth(text, rate);
    _mouthStep = 0;
    const tick = () => {
        if (!_mouthPlan) { stopMouth(); return; }
        if (_mouthStep >= _mouthPlan.length) {
            // still talking? a slower voice than we estimated — go round again rather
            // than closing the mouth while sound is still coming out of it
            if (!_charEl || !_charEl.classList.contains('talking')) { stopMouth(); return; }
            _mouthStep = 0;
        }
        const s = _mouthPlan[_mouthStep++];
        setMouth(s.open, opts);
        _mouthTimer = setTimeout(tick, s.dur);
    };
    tick();
}

// the engine tells us which character (of the text) it has reached — jump the plan to that word
function charBeat(e) {
    if (!_mouthPlan || !e || typeof e.charIndex !== 'number') return;
    const i = _mouthPlan.findIndex(s => s.at >= e.charIndex);
    if (i >= 0) _mouthStep = i;
}
