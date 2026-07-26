// ─────────────────────────────────────────────────────────────────────────────
// audio.js — shared audio ENGINE core. Loaded after common.js + fx.js:
//   <script src="common.js"></script><script src="fx.js"></script><script src="audio.js"></script>
//
// ONLY the two functions that are byte-identical across every game live here:
//   • tone(freq, dur, opts) — the core synth voice (oscillator + envelope + optional LP)
//   • startMusicLoop()      — starts the step-sequencer scheduler
//
// Everything sonically DISTINCTIVE stays inline in each game — ac() (per-game
// reverb/echo character), playMusicStep() (per-game groove/tuning), duckMusic(),
// setMusic(), the TRACKS data and the s* stingers — because it's tuned by ear and
// parameterising it would risk silently changing a game's sound with no test to catch it.
//
// These reference game globals (AC, sfxGain, TRACKS, musicNext, musicStep, musicBar,
// musicTimer, musicDelay, musicTrack, musicScheduler) at CALL time, exactly as the
// inline copies did — the game still defines all of them. Plain function declarations,
// so if a game still has an inline copy it simply wins (safe, non-breaking). A syntax
// error here breaks every game at load — keep it tiny and run the smoke e2e after edits.
// (rockpaperscissors is NOT a client: it has a different, simpler audio engine.)
// ─────────────────────────────────────────────────────────────────────────────

function tone(freq, dur, { type = 'sine', vol = 0.5, when = 0, slide = 0, dest = null, lp = 0, attack = 0.012 } = {}) {
    if (!AC) return;
    const t = AC.currentTime + when;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(slide, 20), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (lp) {
        const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
        o.connect(f); f.connect(g);
    } else {
        o.connect(g);
    }
    g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + 0.06);
}

function startMusicLoop() {
    if (musicTimer || !AC) return;
    musicNext = AC.currentTime + 0.1;
    musicStep = 0;
    musicBar = 0;
    if (musicDelay) musicDelay.delayTime.value = 60 / TRACKS[musicTrack].bpm * 0.5;
    musicTimer = setInterval(musicScheduler, 30);
}
