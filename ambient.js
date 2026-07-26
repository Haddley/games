// ─────────────────────────────────────────────────────────────────────────────
// ambient.js — the LIGHTWEIGHT audio profile (an alternative to audio.js).
//
// A game picks ONE audio profile:
//   • audio.js  — the full step-sequencer engine: hand-authored `TRACKS` + per-game
//                 ac()/playMusicStep()/setMusic(). Rich, bespoke music. More work.
//   • ambient.js (this) — a drifting three-note chord pad + a simple synth voice + an
//                 SFX bus. Almost no authoring: load it, write a few blip stingers, and
//                 (optionally) set the pad's mood via `AMBIENT_CHORDS`. Used by
//                 rockpaperscissors. Good default for a new game that doesn't need
//                 composed music.
// Load AFTER common.js (+ fx.js if the game uses it). Do NOT load both audio.js and
// ambient.js — they both define ac()/tone() and own the audio graph.
//
// This file OWNS the audio-graph state (AC, musicGain, sfxGain, padTimer); the game
// owns musicOn/sfxOn (the toggle flags) and its stingers. A syntax error here breaks
// every game that loads it — keep it tiny and run the smoke e2e after edits.
// ─────────────────────────────────────────────────────────────────────────────

let AC = null, musicGain = null, sfxGain = null, padTimer = null;

// A gentle default progression; a game can override with `const AMBIENT_CHORDS = [...]`
// (each entry is a chord of note frequencies in Hz).
const AMBIENT_CHORDS_DEFAULT = [[196, 294, 370], [220, 330, 415], [174, 261, 330], [147, 220, 294]];

function ac() {
    if (AC) return AC;
    try {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        musicGain = AC.createGain(); musicGain.gain.value = 0.22; musicGain.connect(AC.destination);
        sfxGain = AC.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(AC.destination);
    } catch (_) {}
    return AC;
}

// Simple synth voice: tone(freq, dur, type?, when?, gain?, dest?). Defaults to a sine
// blip on the SFX bus. Pass `musicGain` as dest for pad/music voices.
function tone(freq, dur, type, when, gain, dest) {
    if (!AC) return;
    const o = AC.createOscillator();
    const g = AC.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    const t = (when || AC.currentTime);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest || sfxGain); o.start(t); o.stop(t + dur + 0.02);
}

// Sidechain-style dip of the music/pad so a stinger reads clearly over it, then restore.
function duck(sec) {
    if (!musicGain || !AC) return;
    const t = AC.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(0.05, t + 0.05);
    musicGain.gain.linearRampToValueAtTime(0.22, t + sec);
}

// Start the drifting chord pad (idempotent). Respects the game's musicOn flag and
// prefers-reduced-motion; reads `AMBIENT_CHORDS` if the game defines one.
function startPad() {
    if ((typeof musicOn !== 'undefined' && !musicOn) || (typeof REDUCED !== 'undefined' && REDUCED) || padTimer || !ac()) return;
    const chords = (typeof AMBIENT_CHORDS !== 'undefined' && AMBIENT_CHORDS && AMBIENT_CHORDS.length) ? AMBIENT_CHORDS : AMBIENT_CHORDS_DEFAULT;
    let ix = 0;
    const step = () => {
        if (typeof musicOn !== 'undefined' && !musicOn) return;
        const t = AC.currentTime; const ch = chords[ix % chords.length];
        ch.forEach(f => tone(f, 1.9, 'sine', t, 0.12, musicGain));
        ix++; padTimer = setTimeout(step, 2000);
    };
    step();
}
function stopPad() { if (padTimer) { clearTimeout(padTimer); padTimer = null; } }
