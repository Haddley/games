// common.js and a game's inline <script> share ONE global lexical scope.
//
// So a top-level `const castOf = …` in common.js is a **SyntaxError** in any game that already
// declares that name — "Identifier 'castOf' has already been declared" — and a SyntaxError does
// not fail politely: the game's entire inline script never runs. Blank page, no QR, no scene.
//
// That is not hypothetical. Adding an emoji-font helper called `castOf` to common.js instantly
// blanked Plump Trek, which has had its own `castOf` all along. The smoke e2e caught it, but only
// because that game happens to be covered; this catches it for every game, in milliseconds, and
// names both files.
//
// Nothing here is about style. A collision is a broken game.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHARED = ['common.js', 'p2p.js', 'fx.js', 'dice.js', 'audio.js', 'ambient.js', 'bracket.js', 'cards.js', 'character.js'];
const GAMES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));

// Top-level declarations only: a name indented by even one space is inside a function or block,
// where shadowing is legal and harmless (plumptrek has a local `glyph` inside a render helper,
// which is fine and must NOT be reported).
//
// The distinction that matters is const/let/class versus function/var. Redeclaring a FUNCTION is
// legal — the later definition simply wins — so `toggleFullscreen` existing in both common.js and
// letterstorm is a deliberate override, not a crash. Redeclaring a CONST is a SyntaxError that
// takes the whole script with it. Only the second kind is a bug, so only it fails the build.
const LEXICAL = /^(?:const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
const FUNCTIONS = /^(?:function|var)\s+([A-Za-z_$][\w$]*)/gm;

function declared(src, re) {
    const names = new Set();
    for (const m of src.matchAll(re)) names.add(m[1]);
    return names;
}

// A game's inline script, which is what shares scope with the shared files.
function inlineScripts(html) {
    return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
}

// Which shared files does this page actually load? Only those can collide with it.
function sharedFilesFor(html) {
    return SHARED.filter(f => html.includes(`src="${f}`) || html.includes(`src='${f}`));
}

test('no shared file declares a top-level CONST that a game it loads also declares', () => {
    const sharedLex = {};
    for (const f of SHARED) {
        const p = path.join(ROOT, f);
        if (fs.existsSync(p)) sharedLex[f] = declared(fs.readFileSync(p, 'utf8'), LEXICAL);
    }

    const fatal = [], overrides = [];
    for (const game of GAMES) {
        const html = fs.readFileSync(path.join(ROOT, game), 'utf8');
        const src = inlineScripts(html);
        const mineLex = declared(src, LEXICAL);
        const mineFns = declared(src, FUNCTIONS);
        for (const f of sharedFilesFor(html)) {
            for (const name of sharedLex[f] || []) {
                if (mineLex.has(name) || mineFns.has(name)) fatal.push(`${game} and ${f} both declare "${name}"`);
            }
            const sharedFns = declared(fs.readFileSync(path.join(ROOT, f), 'utf8'), FUNCTIONS);
            for (const name of sharedFns) {
                if (mineLex.has(name)) fatal.push(`${game} declares const "${name}", which ${f} declares as a function`);
                else if (mineFns.has(name)) overrides.push(`${game} overrides ${f}'s ${name}()`);
            }
        }
    }
    // Function overrides are legal and sometimes deliberate — reported, never failed.
    if (overrides.length) console.log('      deliberate overrides →', overrides.join(', '));
    assert.deepEqual(fatal, [],
        'a duplicate lexical declaration is a SyntaxError that blanks the whole game:\n  ' +
        fatal.join('\n  '));
});

test('the shared files do not collide with each other either', () => {
    // Most games load several together, so the same rule applies between them. audio.js and
    // ambient.js are the documented exception: they are alternatives and a game loads exactly
    // one, which is why they can both define tone().
    const clashes = [];
    const seen = {};
    for (const f of SHARED.filter(f => f !== 'ambient.js')) {
        const p = path.join(ROOT, f);
        if (!fs.existsSync(p)) continue;
        for (const name of declared(fs.readFileSync(p, 'utf8'), LEXICAL)) {
            if (seen[name]) clashes.push(`${seen[name]} and ${f} both declare "${name}"`);
            else seen[name] = f;
        }
    }
    assert.deepEqual(clashes, [], 'shared files collide:\n  ' + clashes.join('\n  '));
});

test('no game loads both audio profiles, which really would collide', () => {
    for (const game of GAMES) {
        const html = fs.readFileSync(path.join(ROOT, game), 'utf8');
        const both = html.includes('src="audio.js') && html.includes('src="ambient.js');
        assert.ok(!both, `${game} loads audio.js AND ambient.js — both define tone()`);
    }
});

test('the audit can actually see a collision', () => {
    // A test that cannot fail is worse than no test. Prove the matcher works, and prove it
    // ignores the indented (function-scoped) case that is perfectly legal.
    assert.ok(declared('const castOf = 1;\n', LEXICAL).has('castOf'));
    assert.ok(declared('function emojiOK() {}\n', FUNCTIONS).has('emojiOK'));

    const game = declared(inlineScripts('<script>\nconst castOf = 2;\n    const glyph = 3;\n</script>'), LEXICAL);
    assert.ok(game.has('castOf'), 'a real top-level clash must be seen');
    assert.ok(!game.has('glyph'), 'an indented, function-scoped name must be ignored');
});
