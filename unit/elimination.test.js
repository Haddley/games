// The podium for an ELIMINATION game: nobody has a score, people are knocked out, and the
// finishing order is the elimination order read backwards.
//
// This was hand-rolled in two games with the same algorithm and one difference that mattered:
// RPS appended players who were never eliminated, Liar's Dice dropped them off the board
// entirely. That is what happens when the same idea is implemented twice.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'common.js'), 'utf8');
const a = SRC.indexOf('function rankByElimination');
const rank = new Function(SRC.slice(a, SRC.indexOf('\n}', a) + 2) + '\nreturn rankByElimination;')();

const P = (id, name) => ({ id, name });

test('last one standing first, then the reverse of the order they went out', () => {
    const ps = [P('a', 'Ava'), P('b', 'Ben'), P('c', 'Cal'), P('d', 'Dee')];
    // Ben out first, then Cal, then Dee. Ava wins.
    const out = rank(ps, ['b', 'c', 'd'], 'a');
    assert.deepStrictEqual(out.map(p => p.name), ['Ava', 'Dee', 'Cal', 'Ben'],
        'surviving longest ranks higher; the first one out comes last');
});

test('nobody is ever left off the podium', () => {
    // THE bug this fixes: a player who was never eliminated and did not win — a late joiner,
    // or somebody still in when the game ended another way — used to vanish from Liar's Dice.
    const ps = [P('a', 'Ava'), P('b', 'Ben'), P('c', 'Cal')];
    const out = rank(ps, ['b'], 'a');
    assert.deepStrictEqual(out.map(p => p.name), ['Ava', 'Ben', 'Cal'],
        'Cal was neither champion nor eliminated, and must still appear');
    assert.strictEqual(out.length, ps.length, 'everyone appears exactly once');
});

test('no duplicates, however the inputs overlap', () => {
    const ps = [P('a', 'Ava'), P('b', 'Ben')];
    // a champion who is also (wrongly) in the eliminated list, and a repeated elimination
    const out = rank(ps, ['b', 'a', 'b'], 'a');
    assert.deepStrictEqual(out.map(p => p.id), ['a', 'b']);
});

test('a game with no champion yet still ranks everyone', () => {
    const ps = [P('a', 'Ava'), P('b', 'Ben'), P('c', 'Cal')];
    assert.deepStrictEqual(rank(ps, ['c'], null).map(p => p.id), ['c', 'a', 'b'].sort().length ? ['c', 'a', 'b'] : []);
    // (champion null → the eliminated come first in reverse, then the survivors in order)
});

test('it can be keyed by something other than id — Liar\'s Dice uses names', () => {
    const ps = [P('x1', 'Ava'), P('x2', 'Ben')];
    const out = rank(ps, ['Ben'], 'Ava', p => p.name);
    assert.deepStrictEqual(out.map(p => p.id), ['x1', 'x2']);
});

test('empty and nonsense inputs produce an empty board, not a crash', () => {
    assert.deepStrictEqual(rank([], [], null), []);
    assert.deepStrictEqual(rank(null, null, null), []);
    assert.deepStrictEqual(rank([P('a', 'Ava')], null, undefined).map(p => p.id), ['a']);
    assert.deepStrictEqual(rank([P('a', 'Ava')], ['ghost'], 'nobody').map(p => p.id), ['a'],
        'keys that match no player are ignored');
});

test('AUDIT: no elimination game builds its own podium', () => {
    // Fails if a fourth game starts hand-rolling `[winner, ...reverse(eliminated)]`.
    //
    // A hand-rolled version is fine as the FALLBACK half of a
    // `typeof rankByElimination === 'function' ? … : …` guard — that is the repo's
    // convention for surviving a stale cached common.js, and this test would be wrong to
    // forbid it. It only objects to a game that never reaches for the shared one at all.
    const root = path.join(__dirname, '..');
    const offenders = [];
    fs.readdirSync(root).filter(f => f.endsWith('.html')).forEach(file => {
        const src = fs.readFileSync(path.join(root, file), 'utf8');
        const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        if (!/H\.eliminated/.test(code)) return;                 // not an elimination game
        if (/rankByElimination/.test(code)) return;              // uses the shared one
        offenders.push(`${file}: has H.eliminated but builds its own finishing order`);
    });
    assert.deepStrictEqual(offenders, [], '\n  ' + offenders.join('\n  '));
});
