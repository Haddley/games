// Unit tests for the pure helpers in common.js — run with `npm run test:unit`
// (Node's built-in test runner; no browser, no deps). common.js is a classic
// browser script, so we evaluate it and pull out the names we want to test. It
// has no top-level DOM/qrcode access, so this is safe under Node.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'common.js'), 'utf8');
const { rankByScore, _cxlEsc, SCENE_THEMES, ICE_CFG } =
    new Function(src + '\n;return { rankByScore, _cxlEsc, SCENE_THEMES, ICE_CFG };')();

// ── rankByScore: competition ranking (1-2-2-4), ties share a place ──
test('rankByScore: empty list', () => {
    assert.deepStrictEqual(rankByScore([]), []);
});
test('rankByScore: single player is rank 0', () => {
    assert.deepStrictEqual(rankByScore([{ score: 5 }]), [0]);
});
test('rankByScore: two equal top scores are JOINT first, next is bronze', () => {
    assert.deepStrictEqual(rankByScore([{ score: 5 }, { score: 5 }, { score: 3 }]), [0, 0, 2]);
});
test('rankByScore: all equal share rank 0', () => {
    assert.deepStrictEqual(rankByScore([{ score: 4 }, { score: 4 }, { score: 4 }]), [0, 0, 0]);
});
test('rankByScore: distinct descending scores → 0,1,2', () => {
    assert.deepStrictEqual(rankByScore([{ score: 9 }, { score: 7 }, { score: 5 }]), [0, 1, 2]);
});
test('rankByScore: a tie in the middle (1-2-2-4)', () => {
    assert.deepStrictEqual(rankByScore([{ score: 5 }, { score: 3 }, { score: 3 }, { score: 1 }]), [0, 1, 1, 3]);
});
test('rankByScore: honours a custom score key', () => {
    assert.deepStrictEqual(rankByScore([{ net: 5 }, { net: 5 }, { net: 2 }], 'net'), [0, 0, 2]);
});

// ── _cxlEsc: HTML-escape for the shared TV lobby ──
test('_cxlEsc escapes the five HTML-significant characters', () => {
    assert.strictEqual(_cxlEsc(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});
test('_cxlEsc treats null/undefined as empty string', () => {
    assert.strictEqual(_cxlEsc(null), '');
    assert.strictEqual(_cxlEsc(undefined), '');
});
test('_cxlEsc leaves plain text untouched', () => {
    assert.strictEqual(_cxlEsc('Ada 42'), 'Ada 42');
});

// ── ICE_CFG: the shared TURN config ──
test('ICE_CFG exposes 5 ICE servers, each with a urls field', () => {
    assert.ok(ICE_CFG && ICE_CFG.config && Array.isArray(ICE_CFG.config.iceServers));
    assert.strictEqual(ICE_CFG.config.iceServers.length, 5);
    for (const s of ICE_CFG.config.iceServers) assert.ok(s.urls, 'server has urls');
});

// ── SCENE_THEMES: the ambient-scene registry ──
test('SCENE_THEMES contains the expected themes with sane shapes', () => {
    const t = SCENE_THEMES;
    for (const k of ['meadow', 'cows', 'bingo', 'pirates', 'night', 'letters', 'rps', 'tictactoe']) {
        assert.ok(t[k], `missing theme "${k}"`);
    }
    // CSS-drawn actors are flagged
    assert.ok(t.meadow.sheep, 'meadow is a sheep flock');
    assert.ok(t.cows.cows, 'cows theme flagged');
    assert.ok(t.bingo.balls, 'bingo theme is CSS balls');
    // emoji themes carry non-empty cast arrays
    for (const k of ['pirates', 'night', 'letters', 'rps', 'tictactoe']) {
        assert.ok(Array.isArray(t[k].walk) && t[k].walk.length > 0, `${k}.walk`);
    }
    // every theme defines a ground palette
    for (const k of Object.keys(t)) {
        assert.ok(t[k].g1 && t[k].g2, `${k} has a ground gradient`);
    }
});
