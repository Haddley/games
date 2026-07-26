// Unit tests for dice.js — the shared rollable die. `npm run test:unit`, no browser.
// dice.js only touches the DOM inside its functions, so it evaluates cleanly under Node.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'dice.js'), 'utf8');
const { DICE_PIPS, DICE_FACE_ROT, diceFaceHTML, diceHTML, DICE_CSS } =
    new Function(src + ';return { DICE_PIPS, DICE_FACE_ROT, diceFaceHTML, diceHTML, DICE_CSS };')();

// ── pips ──────────────────────────────────────────────────────────────────────
test('every face has as many pips as its value', () => {
    for (let v = 1; v <= 6; v++) {
        assert.ok(DICE_PIPS[v], `face ${v} exists`);
        assert.strictEqual(DICE_PIPS[v].length, v);
        assert.strictEqual(new Set(DICE_PIPS[v]).size, v, 'no pip drawn twice');
        DICE_PIPS[v].forEach(i => assert.ok(i >= 0 && i < 9, 'inside the 3×3 grid'));
    }
});
test('odd faces use the centre cell, even faces never do', () => {
    for (const v of [1, 3, 5]) assert.ok(DICE_PIPS[v].includes(4), `face ${v}`);
    for (const v of [2, 4, 6]) assert.ok(!DICE_PIPS[v].includes(4), `face ${v}`);
});
test('pip layouts are symmetric, like a real die', () => {
    // cell i mirrors cell 8-i through the centre
    for (let v = 1; v <= 6; v++) {
        const on = new Set(DICE_PIPS[v]);
        on.forEach(i => assert.ok(on.has(8 - i), `face ${v}: ${i} has no partner at ${8 - i}`));
    }
});

// ── orientations ──────────────────────────────────────────────────────────────
test('every face has a rotation, and no two share one', () => {
    for (let v = 1; v <= 6; v++) {
        assert.ok(Array.isArray(DICE_FACE_ROT[v]) && DICE_FACE_ROT[v].length === 2, `face ${v}`);
        DICE_FACE_ROT[v].forEach(d => assert.strictEqual(Math.abs(d) % 90, 0, 'square angles only'));
    }
    assert.strictEqual(new Set(Object.values(DICE_FACE_ROT).map(r => r.join(','))).size, 6);
});
test('opposite faces sum to seven, as they must on a die', () => {
    // 1-6 and 3-4 are opposite about Y; 2-5 about X
    assert.deepStrictEqual(DICE_FACE_ROT[1], [0, 0]);
    assert.strictEqual(DICE_FACE_ROT[6][1], 180, '6 faces away from 1');
    assert.strictEqual(DICE_FACE_ROT[3][1], -DICE_FACE_ROT[4][1], '3 and 4 are opposite');
    assert.strictEqual(DICE_FACE_ROT[2][0], -DICE_FACE_ROT[5][0], '2 and 5 are opposite');
});

// ── markup ────────────────────────────────────────────────────────────────────
test('diceFaceHTML draws the right number of pips', () => {
    for (let v = 1; v <= 6; v++) {
        const html = diceFaceHTML(v);
        assert.strictEqual((html.match(/d3d-pip/g) || []).length, v, `face ${v}`);
        assert.ok(html.includes(`d3d-f${v}`), 'and is placed as that face');
    }
});
test('diceFaceHTML can show a numeral instead (for a d20)', () => {
    const html = diceFaceHTML(1, 17);
    assert.ok(html.includes('17'));
    assert.ok(!html.includes('d3d-pip'), 'numerals replace pips, not join them');
});
test('diceHTML builds all six faces, with an id to find it by', () => {
    // `document` is undefined under Node, so the CSS injection no-ops and we get markup
    const html = diceHTML({ id: 'mydie' });
    assert.ok(html.includes('id="mydie"'));
    for (let v = 1; v <= 6; v++) assert.ok(html.includes(`d3d-f${v}`), `face ${v} present`);
    assert.strictEqual((html.match(/d3d-face/g) || []).length, 6);
});
test('diceHTML: a value over six switches the whole die to numerals', () => {
    const html = diceHTML({ id: 'd', value: 14, sides: 20 });
    assert.ok(html.includes('14'), 'the rolled value is on the landing face');
    assert.ok(!html.includes('d3d-pip'));
});
test('diceHTML: six or under keeps pips', () => {
    assert.ok(diceHTML({ id: 'd', value: 5 }).includes('d3d-pip'));
});
test('diceHTML: extra classes ride on the wrapper, for per-game sizing', () => {
    assert.ok(diceHTML({ id: 'd', cls: 'die big' }).includes('class="d3d die big"'));
});
test('diceHTML defaults to the id "die"', () => {
    assert.ok(diceHTML().includes('id="die"'));
});

// ── the stylesheet is self-contained and themeable ────────────────────────────
test('the CSS is namespaced so it cannot collide with a game', () => {
    const selectors = DICE_CSS.match(/^\.[a-z0-9-]+/gim) || [];
    selectors.forEach(sel => assert.ok(sel.startsWith('.d3d'), `${sel} is not namespaced`));
});
test('size, skin and ink are all CSS variables a game can override', () => {
    for (const v of ['--d3d-size', '--d3d-box', '--d3d-bg', '--d3d-ink', '--d3d-pip'])
        assert.ok(DICE_CSS.includes(v), `${v} is a hook`);
});
test('the throw is disabled under prefers-reduced-motion', () => {
    assert.ok(/prefers-reduced-motion[\s\S]*d3d-throwing[\s\S]*none/.test(DICE_CSS));
});
