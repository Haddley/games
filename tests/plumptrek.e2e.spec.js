// E2E for Plump Trek — the roll-and-move board game.
//
//   1. TV hosts, phones join, the captain sets the board length and starts
//   2. a Build card opens the game, then turns rotate and pawns move
//   3. each Gimmick FLAVOUR behaves: a movement card, a kept card, a dare
//   4. the Finale decides the win condition, and the podium shows finish order
//
// Turns are rigged through `H` (the deck, positions) rather than played out for
// forty rolls — same trick the other suites use.
//
// Run:  npx playwright test tests/plumptrek.e2e.spec.js

const { test, expect } = require('@playwright/test');
const fs = require('fs');

// Each test opens a TV plus 2–3 phones, i.e. several PeerJS peers in quick succession.
// The public broker occasionally throttles a burst of registrations, which shows up as a
// join that never completes — a network flake, not a game bug. One retry covers it.
test.describe.configure({ retries: 1 });

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/plumptrek.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}
// Resolve whatever the game is waiting on (a dare's Done, a card's "pick a player",
// the fork) until it's somebody's turn again — the same things a room would do.
async function settle(tv, pages, tries = 12) {
    for (let i = 0; i < tries; i++) {
        const st = await tv.evaluate(() => ({
            phase: H.phase,
            dareFor: H.phase === 'card' && H.card && H.card.o && H.card.o.dare ? (H.players.find(p => p.id === H.card.who) || {}).name : null,
            chooseFor: H.phase === 'choose' && H.choice ? (H.players.find(p => p.id === H.choice.who) || {}).name : null,
        }));
        if (st.phase === 'turn') return;
        if (st.dareFor && pages[st.dareFor]) await pages[st.dareFor].getByRole('button', { name: /Done it/ }).click().catch(() => {});
        else if (st.chooseFor && pages[st.chooseFor]) await pages[st.chooseFor].locator('.opt').first().click().catch(() => {});
        await tv.waitForTimeout(1200);
    }
}

// whoever the host says is on, and their phone
async function onTurn(tv, pages) {
    const name = await tv.evaluate(() => { const p = H.players.find(x => x.id === H.turn); return p ? p.name : null; });
    return { name, page: pages[name] };
}
// force the next card the current player will draw
const stackDeck = (tv, title) => tv.evaluate(t => {
    const c = GIMMICKS.find(g => g.t === t);
    H.drawPile.push(c);
    return !!c;
}, title);
// Park the player one square short of the space we want and walk them onto it, so the
// real movement → resolve → card path runs without waiting for a lucky die.
const landOn = (tv, type) => tv.evaluate(t => {
    const p = H.players.find(x => x.id === H.turn);
    const ix = H.board.findIndex(s => s.t === t && !s.sc);
    p.pos = ix - 1; p.mods = [];
    H.roll = 1;
    walk(p, 1);
    return { who: p.name, ix };
}, type);

test('a full trek: build, turns, all three card flavours, finale, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const pageErrors = [];

    const tv = await browser.newPage({ viewport: TV });
    tv.on('pageerror', e => pageErrors.push('tv: ' + e.message));
    await tv.goto('/plumptrek.html');
    await shot(tv, 'pt-01-home');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    const pages = {};
    for (const n of ['Ava', 'Ben', 'Cal']) {
        pages[n] = await joinPhone(browser, code, n);
        pages[n].on('pageerror', e => pageErrors.push(n + ': ' + e.message));
    }
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(3);
    await expect(tv.locator('.cxl-chip')).toHaveCount(3, { timeout: 15_000 });
    await shot(tv, 'pt-02-tv-lobby');
    await shot(pages.Ava, 'pt-03-captain-lobby');

    // captain picks the short board and starts
    await pages.Ava.getByRole('button', { name: /Short/ }).click();
    await expect.poll(() => tv.evaluate(() => H.settings.length), { timeout: 10_000 }).toBe('short');
    await pages.Ava.getByRole('button', { name: /Start the trek/ }).click();

    // the game opens on this game's Build card, then hands the first player the die
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 10_000 }).toBe('build');
    expect(await tv.evaluate(() => !!H.build)).toBe(true);
    await expect(tv.locator('.bcard')).toBeVisible();
    await shot(tv, 'pt-04-tv-build');
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 15_000 }).toBe('turn');
    expect(await tv.evaluate(() => H.board.length)).toBeGreaterThan(20);
    await expect(tv.locator('.sq')).toHaveCount(await tv.evaluate(() => H.board.length));

    // ── 1. a movement card: Sprint! adds +3 to the next roll ──
    // one real roll from a phone first, to prove the button actually drives the host
    let t = await onTurn(tv, pages);
    await t.page.locator('.btn-roll').click();
    await expect.poll(() => tv.evaluate(() => H.roll), { timeout: 15_000 }).toBeGreaterThan(0);
    await expect.poll(() => tv.evaluate(() => H.players.find(p => p.pos > 0) ? 1 : 0), { timeout: 15_000 }).toBe(1);
    await settle(tv, pages);
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 25_000 }).toBe('turn');

    // ── 1. a movement card: Sprint! leaves a +3 modifier on the next roll ──
    expect(await stackDeck(tv, 'Sprint!')).toBe(true);
    const m1 = await landOn(tv, 'gimmick');
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 15_000 }).toBe('card');
    await expect(tv.locator('.gcard')).toBeVisible();
    await expect(tv.locator('.gct')).toContainText('Sprint');
    await shot(tv, 'pt-05-tv-gimmick');
    await expect.poll(() => tv.evaluate(n => (H.players.find(p => p.name === n).mods || []).length, m1.who), { timeout: 15_000 }).toBeGreaterThan(0);

    // ── 2. a dare: the room sees it, the phone gets a Done button ──
    await settle(tv, pages);
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('turn');
    await stackDeck(tv, 'Swole!');
    const m2 = await landOn(tv, 'gimmick');
    t = { name: m2.who, page: pages[m2.who] };
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 15_000 }).toBe('card');
    await expect(tv.locator('.gcard.dare')).toBeVisible();
    await expect(t.page.getByRole('button', { name: /Done it/ })).toBeVisible({ timeout: 10_000 });
    await shot(t.page, 'pt-06-phone-dare');
    await t.page.getByRole('button', { name: /Done it/ }).click();
    // the dare is done with — a Gimmick ×2 space may deal another card straight after,
    // so assert THIS card cleared rather than that the phase left 'card'
    await expect.poll(() => tv.evaluate(() => (H.card && H.card.t) || '-'), { timeout: 15_000 }).not.toBe('Swole!');

    // ── 3. a kept card goes to the hand and can be played ──
    await settle(tv, pages);
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('turn');
    await stackDeck(tv, 'Shortcut!');
    const m3 = await landOn(tv, 'gimmick');
    await expect.poll(() => tv.evaluate(n => (H.players.find(p => p.name === n).hand || []).length, m3.who), { timeout: 20_000 }).toBe(1);
    await settle(tv, pages);
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('turn');
    const holder = await tv.evaluate(() => H.players.find(p => (p.hand || []).length) ? H.players.find(p => (p.hand || []).length).name : null);
    expect(holder).toBeTruthy();
    await shot(pages[holder], 'pt-07-phone-hand');

    // ── 4. the Finale decides it. Rig the deck so we get the simple one ──
    await tv.evaluate(() => { FINALES.length = 1; FINALES[0] = { t: 'Win.', x: 'You win. No strings attached.', k: 'now' }; });
    const m4 = await landOn(tv, 'finale');
    t = { name: m4.who, page: pages[m4.who] };
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('finale');
    await expect(tv.locator('.fcard')).toBeVisible();
    await shot(tv, 'pt-08-tv-finale');

    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('podium');
    const st = await tv.evaluate(() => H.lastPodium.standings.map(s => s.name));
    expect(st[0]).toBe(t.name);
    await expect(tv.locator('.tv-champ')).toContainText(t.name);
    await shot(tv, 'pt-09-tv-podium');
    await expect(pages[t.name].locator('.prow').first()).toContainText(t.name);

    // captain can start another one
    await expect(pages.Ava.getByRole('button', { name: /Play again/ })).toBeVisible();
    await pages.Ava.getByRole('button', { name: /Play again/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 10_000 }).toBe('lobby');

    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

test('the demo mode plays itself', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    const errs = [];
    tv.on('pageerror', e => errs.push(e.message));
    await tv.goto('/plumptrek.html?mode=tvsimulation');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    // pawns actually get somewhere within a few rounds
    await expect.poll(() => tv.evaluate(() => Math.max(...H.players.map(p => p.pos))), { timeout: 45_000 }).toBeGreaterThan(4);
    expect(await tv.evaluate(() => H.round)).toBeGreaterThan(0);
    expect(errs, errs.join('\n')).toEqual([]);
    await shot(tv, 'pt-10-tv-demo');
    await tv.close();
});

// The fork used to hang the whole game: the route labels were interpolated into the
// button's onclick, and the quotes in them closed the attribute, so tapping a path did
// nothing at all.
test('the fork: picking a path actually works', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    const errs = [];
    tv.on('pageerror', e => errs.push(e.message));
    await tv.goto('/plumptrek.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const pages = {};
    for (const n of ['Ava', 'Ben']) pages[n] = await joinPhone(browser, code, n);
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);
    await pages.Ava.getByRole('button', { name: /Start the trek/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('turn');

    // park whoever is on the fork square, then start their next turn there
    // park everyone on the fork, so whoever comes up next is standing on it
    await tv.evaluate(() => {
        const fk = H.board.findIndex(s => s.t === 'fork');
        H.players.forEach(p => { p.pos = fk; });
        clearHostTimers();
        beginTurn();
    });
    const who = await tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name);
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 10_000 }).toBe('choose');
    expect(await tv.evaluate(() => H.choice.kind)).toBe('route');

    // two real, tappable paths — and tapping one moves the game on
    const opts = pages[who].locator('.opt');
    await expect(opts).toHaveCount(2, { timeout: 10_000 });
    await shot(pages[who], 'pt-11-phone-fork');
    await opts.nth(1).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 10_000 }).toBe('turn');
    expect(await tv.evaluate(n => H.players.find(p => p.name === n).route, who)).toBe(1);
    expect(await tv.evaluate(() => H.msg)).toContain('short cut');

    // …and that route really does send them down the short cut. One step, so a big
    // roll can't shoot straight through all three of its squares.
    await tv.evaluate(n => { const p = H.players.find(x => x.name === n); H.roll = 1; walk(p, 1); }, who);
    await expect.poll(() => tv.evaluate(n => {
        const p = H.players.find(x => x.name === n);
        return H.board[p.pos] ? !!H.board[p.pos].sc : false;
    }, who), { timeout: 15_000 }).toBe(true);

    expect(errs, errs.join('\n')).toEqual([]);
    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

// ── Build cards bend a rule for the whole game ────────────────────────────────
test('the SPEEDRUN build swaps the d6 for a d20', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await tv.evaluate(() => { clearInterval(simTimer); clearTimeout(simTimer); clearHostTimers(); });

    expect(await tv.evaluate(() => dieMax())).toBe(6, 'a plain game rolls a d6');
    await tv.evaluate(() => { H.build = BUILDS.find(b => b.b === 'd20'); });
    expect(await tv.evaluate(() => dieMax())).toBe(20);

    // and over six, the cube shows numerals instead of pips (pips stop making sense)
    const html = await tv.evaluate(() => dieHTML(17));
    expect(html).toContain('num');
    expect(await tv.evaluate(() => dieHTML(4))).toContain('pip');
    await tv.close();
});

test('HANDICAP halves the leader\'s roll; FAMILY helps last place', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await tv.evaluate(() => { clearInterval(simTimer); clearTimeout(simTimer); clearHostTimers(); });

    // rig a clear leader and a clear last place, then roll each of them many times
    const stats = await tv.evaluate(() => {
        H.build = BUILDS.find(b => b.b === 'handicap');
        H.players[0].pos = 20; H.players[1].pos = 10; H.players[2].pos = 1;
        const rolls = { leader: [], last: [] };
        for (let i = 0; i < 60; i++) {
            for (const who of ['leader', 'last']) {
                const p = who === 'leader' ? H.players[0] : H.players[2];
                const keep = p.pos;
                H.phase = 'turn'; H.turn = p.id; p.mods = [];
                hostRoll(p);
                rolls[who].push(H.roll);
                p.pos = keep;
                clearHostTimers();
            }
        }
        return rolls;
    });
    expect(Math.max(...stats.leader)).toBeLessThanOrEqual(3, 'the leader never rolls more than half of six');
    expect(Math.max(...stats.last)).toBeGreaterThan(3, 'everyone else rolls normally');
    await tv.close();
});

// ── a Finale mini-game, played for real ──────────────────────────────────────
test('the Rock finale: second place is dragged up for rock-paper-scissors', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const pages = {};
    for (const n of ['Ava', 'Ben', 'Cal']) pages[n] = await joinPhone(browser, code, n);
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(3);
    await pages.Ava.getByRole('button', { name: /Start the trek/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('turn');

    // force the Rock finale, and a known 1st/2nd so we know who duels
    await tv.evaluate(() => {
        FINALES.length = 1;
        FINALES[0] = { t: 'Rock.', x: 'Second place joins you: rock, paper, scissors.', k: 'rps' };
        H.players[0].pos = 5; H.players[1].pos = 4; H.players[2].pos = 1;
    });
    await tv.evaluate(() => {
        const p = H.players[0];
        H.turn = p.id; H.phase = 'turn';
        p.pos = H.board.findIndex(s => s.t === 'finale') - 1; p.mods = [];
        H.roll = 1; walk(p, 1);
    });

    await expect.poll(() => tv.evaluate(() => H.finaleState && H.finaleState.kind), { timeout: 30_000 }).toBe('rps');
    const duel = await tv.evaluate(() => ({
        a: (H.players.find(p => p.id === H.finaleState.a) || {}).name,
        b: (H.players.find(p => p.id === H.finaleState.b) || {}).name,
    }));
    expect([duel.a, duel.b].sort()).toEqual(['Ava', 'Ben'], 'first and second place duel');

    // both duellists get three throw buttons; the watcher gets none
    await expect(pages[duel.a].locator('.opts.rps .opt')).toHaveCount(3, { timeout: 25_000 });
    await expect(pages.Cal.locator('.opts.rps .opt')).toHaveCount(0);
    await shot(tv, 'pt-12-tv-finale-rps');

    // paper beats rock — and the winner takes the whole game
    await expect(pages[duel.b].locator('.opts.rps .opt')).toHaveCount(3, { timeout: 25_000 });
    await pages[duel.a].locator('.opts.rps .opt').nth(1).click();     // paper
    await pages[duel.b].locator('.opts.rps .opt').nth(0).click();     // rock
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('podium');
    expect(await tv.evaluate(() => H.lastPodium.standings[0].name)).toBe(duel.a);

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

// ── STOP gates ───────────────────────────────────────────────────────────────
test('a STOP gate holds you up until you roll big enough', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await tv.evaluate(() => { clearInterval(simTimer); clearTimeout(simTimer); clearHostTimers(); });

    const out = await tv.evaluate(() => {
        const gate = H.board.findIndex(s => s.t === 'gate' && !s.sc);
        const need = H.board[gate].need;
        const p = H.players[0];
        p.pos = gate - 2; p.gates = {};
        H.roll = need - 1;                   // under what the gate asks: it stops them
        walk(p, need - 1 + 2);
        const stoppedAt = p.pos;
        return { gate, stoppedAt, need, tries: p.gates['g' + gate] || 0 };
    });
    expect(out.stoppedAt, 'held at the gate rather than sailing past').toBe(out.gate);
    expect(out.tries).toBe(1, 'the gate remembers the attempt');

    // a big enough roll gets through
    const through = await tv.evaluate(gate => {
        const p = H.players[0];
        p.pos = gate - 1;
        H.roll = 6;
        walk(p, 6);
        return p.pos;
    }, out.gate);
    expect(through).toBeGreaterThan(out.gate, 'a big roll clears it');
    await tv.close();
});

// ── a sabotage card asks the room a question ──────────────────────────────────
test('Sabotage! makes the drawer pick a victim, who then misses a turn', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const pages = {};
    for (const n of ['Ava', 'Ben']) pages[n] = await joinPhone(browser, code, n);
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);
    // No Build card: this test is about Sabotage, and a random Build rule is a second thing
    // announcing itself into the same banner. UNSTABLE ("Ava and Ben swapped places") landed
    // between the click and the poll and made this flaky.
    await tv.evaluate(() => { H.settings.build = false; });
    await pages.Ava.getByRole('button', { name: /Start the trek/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('turn');
    expect(await tv.evaluate(() => H.build), 'no Build rule in play').toBeNull();

    await stackDeck(tv, 'Sabotage!');
    const m = await landOn(tv, 'gimmick');
    await expect.poll(() => tv.evaluate(() => H.choice && H.choice.kind), { timeout: 30_000 }).toBe('sabotage');

    // only the drawer chooses, and they get one button per rival
    const chooser = pages[m.who];
    await expect(chooser.locator('.opt')).toHaveCount(1, { timeout: 25_000 });   // one rival
    const other = ['Ava', 'Ben'].find(n => n !== m.who);
    await expect(pages[other].locator('.opt')).toHaveCount(0, 'only the drawer chooses');
    await shot(chooser, 'pt-13-phone-sabotage');

    const victim = (await chooser.locator('.opt').first().textContent()).trim();
    // H.msg is a banner the next event overwrites, so SAMPLING it is a race no timeout fixes.
    // Record every value it takes instead, from before the click, and assert on the history.
    await tv.evaluate(() => {
        let v = H.msg;
        window._msgLog = [];
        Object.defineProperty(H, 'msg', {
            configurable: true,
            get: () => v,
            set: x => { v = x; if (x) window._msgLog.push(x); },
        });
    });
    await chooser.locator('.opt').first().click();
    // Don't assert on p.skip either: if the victim happens to be next up, beginTurn spends it
    // (and rewords the message to "misses a turn") before we could look — so accept either
    // wording, and check it names the player we picked.
    await expect.poll(() => tv.evaluate(() => (window._msgLog || []).find(m => /(loses|misses) a turn/.test(m)) || ''),
        { timeout: 20_000 }).toMatch(/(loses|misses) a turn/);
    const msg = await tv.evaluate(() => window._msgLog.find(m => /(loses|misses) a turn/.test(m)));
    const named = msg.replace(/ (loses|misses) a turn/, '').trim();
    expect(victim, `announced "${msg}" but the button said "${victim}"`).toContain(named);

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

// ── player tokens ─────────────────────────────────────────────────────────────
// They used to be ~20px emoji clipped to the bottom edge of a square, and two players
// sharing one square just sat side by side getting smaller. Now they STACK: a tower with
// the active player on top, leaning and riffling so every animal gets seen — and it has
// to hold up to a dozen of them on one 90px square.
async function pileUp(tv, n, square = 5) {
    return tv.evaluate(({ count, sq }) => {
        clearInterval(simTimer); clearTimeout(simTimer); clearHostTimers();
        H.players = [];
        for (let i = 0; i < count; i++) {
            hostAddPlayer('t' + i, 'P' + (i + 1), i);      // seat i → a known piece and colour
            guestConns['t' + i] = { peer: 't' + i, send() {} };
        }
        H.players.forEach(p => { p.pos = sq; });
        H.turn = H.players[count - 1].id;       // last player is mid-turn
        H.phase = 'turn';
        applyViewerMsg(viewerStateMsg());
        return H.players[count - 1].name;
    }, { count: n, sq: square });
}
const tokenGeo = tv => tv.evaluate(() => {
    const sqr = document.getElementById('sq-5').getBoundingClientRect();
    return [...document.querySelectorAll('#sq-5 .tok')].map(e => {
        const r = e.getBoundingClientRect();
        return {
            p: e.dataset.p, up: e.classList.contains('up'),
            w: Math.round(r.width), z: Number(getComputedStyle(e).zIndex) || 0,
            // measured from the square's CENTRE, so the sign says which tower it's in
            cx: Math.round(r.left + r.width / 2 - (sqr.left + sqr.width / 2)),
            cy: Math.round(r.top + r.height / 2 - sqr.top),
        };
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE TREKKERS — sprite pieces
// ═══════════════════════════════════════════════════════════════════════════════
// The pieces are windows onto one CC0 sprite sheet (see sprites/CREDITS.md) and every
// animation is a fixed frame sequence, not a tween. That buys the tests something a drawn
// token never gave them: a frame is a NUMBER, so "did it walk?" and "did it flinch?" are
// things a browser can be asked, instead of eyeballed. These read `background-position`.
//
// Frame map: 0 idle · 1 walk_a · 2 walk_b · 3 jump · 4 hit · 5 duck · 6 front ·
//            7 climb_a · 8 climb_b  — all nine the source pack ships.
// One frame is 100%/8 of the sheet's travel, so frame f sits at f × 12.5%.
const FRAME = f => +(f * 100 / 8).toFixed(2);
// what frame is this sprite showing right now?
const frameOf = bgx => Math.round(parseFloat(bgx) / (100 / 8));

test('the sprite sheets load, at the size the CSS assumes', async ({ page }) => {
    await page.goto('/plumptrek.html');          // needs an origin to resolve /sprites/… from
    // A 404 here would leave every piece an invisible empty box, and a mis-sized sheet
    // would show two half-trekkers per token — neither throws a page error, so nothing
    // else in the suite would notice.
    for (const [file, w, h] of [['sprites/trekkers.png', 756, 510], ['sprites/emotes.png', 768, 76]]) {
        const res = await page.request.get('/' + file);
        expect(res.status(), `${file} is served`).toBe(200);
        const size = await page.evaluate(src => new Promise(done => {
            const i = new Image();
            i.onload = () => done([i.naturalWidth, i.naturalHeight]);
            i.onerror = () => done([0, 0]);
            i.src = src;
        }), '/' + file);
        expect(size, `${file} is ${w}×${h} — the CSS background-size depends on it`).toEqual([w, h]);
    }
});

test('tokens stack in towers, every face visible, shrinking politely as the pile grows', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });

    const widths = {};
    for (const n of [1, 2, 4, 8, 12]) {
        await pileUp(tv, n);
        await tv.waitForTimeout(250);
        const toks = await tokenGeo(tv);
        expect(toks.length, `all ${n} players are on the square`).toBe(n);
        widths[n] = toks[0].w;

        // every token is somewhere different — nobody is completely hidden
        for (let i = 0; i < toks.length; i++) {
            for (let j = i + 1; j < toks.length; j++) {
                const d = Math.hypot(toks[i].cx - toks[j].cx, toks[i].cy - toks[j].cy);
                expect(d, `tokens ${i} and ${j} of ${n} sit on top of each other`).toBeGreaterThan(6);
            }
        }
        // Above four they split into two towers side by side, so a dozen players are a
        // crowd about a square and a half tall rather than a skyscraper. (A couple of
        // percent of jitter is not a column — pieces never land perfectly square.)
        const side = t => (t.cx < -8 ? 'l' : t.cx > 8 ? 'r' : 'c');
        const sides = new Set(toks.map(side));
        if (n <= 4) {
            expect([...sides], `${n} in a pile is one tower`).toEqual(['c']);
        } else {
            expect([...sides].sort(), `${n} in a pile is two towers`).toEqual(['l', 'r']);
            const per = Math.ceil(n / 2);
            expect(toks.filter(t => side(t) === 'l').length, 'the towers are even').toBe(per);
        }

        // THE FACE TEST: within a tower each piece must clear the helmet of the one below,
        // or the pile is a heap of legs. A helmet is a bit under half the sprite's height —
        // 0.35 rather than 0.45 because the token box is square while the sprite is not.
        const towers = n <= 4 ? [toks.slice()] : [toks.filter(t => side(t) === 'l'), toks.filter(t => side(t) === 'r')];
        for (const col of towers) {
            col.sort((a, b) => b.cy - a.cy);        // bottom of the tower first
            for (let i = 1; i < col.length; i++) {
                const gap = col[i - 1].cy - col[i].cy;
                expect(gap, `${n} in a pile: only ${gap}px between faces, needs ~${Math.round(0.35 * col[i].w)}`)
                    .toBeGreaterThanOrEqual(Math.round(0.35 * col[i].w));
            }
        }
        // and it doesn't run off up the screen
        const tall = Math.max(...toks.map(t => t.cy)) - Math.min(...toks.map(t => t.cy));
        expect(tall, `a pile of ${n} stays under ~1.6 squares tall`).toBeLessThan(150);
    }
    expect(widths[1], 'a lone token is the biggest').toBeGreaterThan(widths[12]);
    expect(widths[12], 'even twelve deep they stay legible').toBeGreaterThan(28);
    await tv.close();
});

test('the player whose turn it is sits on top of the pile', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });

    await pileUp(tv, 6);
    await tv.waitForTimeout(250);
    const toks = await tokenGeo(tv);
    const top = toks.find(t => t.up);
    expect(top, 'the active player is marked').toBeTruthy();
    expect(Math.max(...toks.map(t => t.z))).toBe(top.z, 'and painted above everyone else');
    expect(top.cy).toBe(Math.min(...toks.map(t => t.cy)), 'and is the highest in the stack');
    expect(top.w).toBeGreaterThanOrEqual(Math.max(...toks.filter(t => !t.up).map(t => t.w)));
    await tv.close();
});

// The whole reason for a sprite: a piece crossing the board WALKS it.
test('a token walks from its old square to the new one, facing the way it goes', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 2);
    await tv.waitForTimeout(300);

    // move one player several squares along and re-render the way a real move does
    const moved = await tv.evaluate(() => {
        const p = H.players[0];
        p.pos = 12;
        applyViewerMsg(viewerStateMsg());
        const tok = document.querySelector(`.tok[data-p="${p.id}"]`);
        const trk = tok.querySelector('.trk');
        // which way IS square 13 from square 6? The board snakes, so work it out rather
        // than assume — the answer changes with BOARD_RUN.
        const from = document.getElementById('sq-5').getBoundingClientRect();
        const to = document.getElementById('sq-12').getBoundingClientRect();
        return {
            slide: tok.querySelector('.tk').getAnimations().length,
            walking: trk.classList.contains('walking'),
            frame: getComputedStyle(trk).backgroundPositionX,
            dir: tok.querySelector('.tb').style.getPropertyValue('--dir'),
            wentRight: to.left > from.left,
        };
    });
    expect(moved.slide, 'the move is animated, not a teleport').toBeGreaterThan(0);
    expect(moved.walking, 'and the sprite is on its walk cycle while it travels').toBe(true);
    expect([1, 2], 'showing a walk frame, not standing still').toContain(frameOf(moved.frame));
    expect(moved.dir, `and facing the way it is going (${moved.wentRight ? 'right' : 'left'})`)
        .toBe(moved.wentRight ? '1' : '-1');

    // the walk stops when the journey does, and it lands on the new square
    await tv.waitForTimeout(900);
    const landed = await tv.evaluate(() => {
        const el = document.querySelector('.tok[data-p="t0"]');
        const trk = el.querySelector('.trk');
        const sq = document.getElementById('sq-12').getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return { off: Math.abs((r.left + r.width / 2) - (sq.left + sq.width / 2)),
                 walking: trk.classList.contains('walking'),
                 dir: el.querySelector('.tb').style.getPropertyValue('--dir') };
    });
    expect(landed.off, 'and lands on square 13').toBeLessThan(40);
    expect(landed.walking, 'and stops walking once it is there').toBe(false);
    expect(landed.dir, 'and faces forward again').toBe('');
    await tv.close();
});

// Reactions are worked out by comparing snapshots, so the host never sends anything extra
// — which also means the phone and the TV react to the same events on their own.
test('trekkers react to what the game does to them, on the board AND in the rail', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 4);
    await tv.waitForTimeout(300);
    // start everyone neutral: the whole point of mood is that the SAME event reads
    // differently from a different starting place, so an unpinned mood makes this flaky
    await tv.evaluate(() => resetMoods());

    // each case: what changes about a player → the pose and balloon it should earn
    const cases = [
        ['sent backwards',   p => { p.pos = 1; },                  'hit',  'angry'],
        ['made to miss a turn', p => { p.skip = 2; },              'duck', 'sleep'],
        ['boosted a long way', p => { p.pos = p.pos + 9; },        'jump', 'laugh'],
        // ↑ this one also proves the pose waits for the walk: a held frame kills the walk
        //   cycle, so if it fired immediately the piece would slide across frozen mid-jump.
        // a player who's home leaves the BOARD, so only their rail portrait celebrates
        ['home first',       p => { p.done = true; },              'jump', 'star', 1],
    ];
    for (const [what, mutate, wantPose, wantEmote, copies = 2] of cases) {
        const got = await tv.evaluate(({ i }) => {
            const before = JSON.parse(JSON.stringify(vD));
            return { before, id: H.players[i].id };
        }, { i: 1 });
        // fire it, and read the balloon straight away — that pops immediately
        const balloons = await tv.evaluate(({ before, id, src }) => {
            resetMoods();          // …and not a moment earlier: putting a player back to
                                   // their old square is itself a backwards move, which the
                                   // mood pass quite rightly counts as a knock
            const p = H.players.find(x => x.id === id);
            // eslint-disable-next-line no-new-func
            new Function('p', src)(p);
            const events = moodPass(before, viewerStateMsg());
            applyViewerMsg(viewerStateMsg());
            playReactions(events);
            return [...document.querySelectorAll(`[data-p="${id}"]`)].map(el => {
                const m = el.querySelector('.emo');
                return { where: el.classList.contains('tok') ? 'board' : 'rail',
                         pop: m.classList.contains('pop'), e: m.style.getPropertyValue('--e') };
            });
        }, { before: got.before, id: got.id, src: '(' + mutate.toString() + ')(p)' });

        expect(balloons.length, `${what}: expected ${copies} cop(y|ies) on screen`).toBeGreaterThanOrEqual(copies);
        expect(new Set(balloons.map(r => r.where)).size, `${what}: ${copies} distinct place(s)`).toBe(copies);
        const wantE = String(await tv.evaluate(k => EMO[k], wantEmote));
        for (const r of balloons) {
            expect(r.pop, `${what}: a balloon pops over the ${r.where} trekker`).toBe(true);
            expect(r.e, `${what}: the balloon is "${wantEmote}"`).toBe(wantE);
        }

        // the POSE lands a beat later — it waits for any walk to finish, because a held
        // frame stops the walk cycle and a piece must never slide across frozen mid-jump
        await tv.waitForTimeout(850);
        const poses = await tv.evaluate(id => [...document.querySelectorAll(`[data-p="${id}"]`)].map(el => {
            const t = el.querySelector('.trk');
            return { where: el.classList.contains('tok') ? 'board' : 'rail',
                     rx: t.classList.contains('rx'), f: t.style.getPropertyValue('--f'),
                     walking: t.classList.contains('walking') };
        }), got.id);
        const wantF = String(await tv.evaluate(k => POSE[k], wantPose));
        for (const r of poses) {
            expect(r.walking, `${what}: the ${r.where} sprite has finished travelling`).toBe(false);
            expect(r.rx, `${what}: the ${r.where} sprite holds a reaction pose`).toBe(true);
            expect(r.f, `${what}: the ${r.where} sprite shows the ${wantPose} frame`).toBe(wantF);
        }

        // put them back for the next case
        await tv.evaluate(() => { H.players[1].pos = 5; H.players[1].skip = 0; H.players[1].done = false;
                                  applyViewerMsg(viewerStateMsg()); });
        await tv.waitForTimeout(80);
    }
    await tv.close();
});

test('a reaction wears off and the trekker goes back to idling', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 3);
    await tv.waitForTimeout(200);

    await tv.evaluate(() => pawnReact(H.players[0].id, EMO.angry, POSE.hit, 400));
    expect(await tv.evaluate(() =>
        document.querySelector('.tok[data-p="t0"] .trk').classList.contains('rx'))).toBe(true);
    await tv.waitForTimeout(700);
    const after = await tv.evaluate(() => {
        const t = document.querySelector('.tok[data-p="t0"] .trk');
        return { rx: t.classList.contains('rx'), f: t.style.getPropertyValue('--f'),
                 anims: t.getAnimations().length };
    });
    expect(after.rx, 'the pose is released').toBe(false);
    expect(after.f, 'and the inline frame is cleared, so the idle owns it again').toBe('');
    expect(after.anims, 'and the idle is running again').toBeGreaterThan(0);
    await tv.close();
});

test('tokens stop moving under prefers-reduced-motion', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV, reducedMotion: 'reduce' });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 6);
    await tv.waitForTimeout(300);
    const running = await tv.evaluate(() =>
        [...document.querySelectorAll('#sq-5 .sqp, #sq-5 .tok, #sq-5 .tb, #sq-5 .trk, #sq-5 .emo')]
            .reduce((n, el) => n + el.getAnimations().length, 0));
    expect(running, 'nothing is animating').toBe(0);
    // and a reaction fired anyway must not start one
    await tv.evaluate(() => pawnReact(H.players[0].id, EMO.angry, POSE.hit, 800));
    expect(await tv.evaluate(() =>
        document.querySelector('.tok[data-p="t0"] .trk').classList.contains('rx')),
        'reactions are motion too').toBe(false);
    await tv.close();
});

// Emoji can't act — 🐰 is one fixed glyph — so the pieces are sprites, and each player is
// dealt a character, a colour, an idle and an emote from their name and seat.
test('every trekker is a real window onto the sheet, and no two behave the same', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 12);
    await tv.waitForTimeout(300);

    const cast = await tv.evaluate(() => [...document.querySelectorAll('#sq-5 .tok')].map(t => {
        const trk = t.querySelector('.trk'), emo = t.querySelector('.emo');
        const cs = getComputedStyle(trk);
        return {
            idle: (trk.className.match(/i-[a-z]+/) || [])[0],
            row: trk.style.getPropertyValue('--row'),
            hue: trk.style.getPropertyValue('--hue'),
            frame: cs.backgroundPositionX,
            sheet: cs.backgroundImage,
            size: cs.backgroundSize,
            colour: getComputedStyle(t).getPropertyValue('--pc').trim(),
            beat: trk.style.getPropertyValue('--dl'),
            emote: emo ? emo.style.getPropertyValue('--e') : null,
            emoteEvery: emo ? emo.style.getPropertyValue('--eDur') : null,
            anims: trk.getAnimations().length,
        };
    }));

    expect(cast.length).toBe(12);
    cast.forEach((c, i) => {
        expect(c.sheet, `#${i} is drawn from the sheet`).toContain('trekkers.png');
        expect(c.size, `#${i} windows onto 9 poses × 5 characters`).toBe('900% 500%');
        expect(+c.row, `#${i} sits on a real sheet row`).toBeGreaterThanOrEqual(0);
        expect(+c.row, `#${i} sits on a real sheet row`).toBeLessThanOrEqual(4);
        expect(c.idle, `#${i} has an idle`).toBeTruthy();
        expect(c.anims, `#${i} is actually animating`).toBeGreaterThan(0);
        expect(c.emote, `#${i} has an emote to pull out`).toBeTruthy();
        // whatever frame it happens to be on, it must be a WHOLE frame — never a slice of
        // two, which is what a tweened background-position would give you
        const f = parseFloat(c.frame) / (100 / 8);
        expect(Math.abs(f - Math.round(f)), `#${i} is showing half of two frames (${c.frame})`)
            .toBeLessThan(0.02);
        expect(Math.round(f), `#${i} is on a frame that exists`).toBeLessThanOrEqual(8);
    });
    // the repertoire is actually used, not one animation for everybody
    expect(new Set(cast.map(c => c.idle)).size, 'several different idles').toBeGreaterThan(2);
    expect(new Set(cast.map(c => c.beat)).size, 'and nobody moves in time with anybody else').toBeGreaterThan(4);
    expect(new Set(cast.map(c => c.emote)).size, 'and they do not all pull the same face').toBeGreaterThan(2);
    // all five characters get used, so a full table isn't twelve of the same creature
    expect(new Set(cast.map(c => c.row)).size, 'the whole cast shows up').toBeGreaterThanOrEqual(4);
    // twelve players, twelve colours — this used to key off name LENGTH, so Mum/Dad/Ben
    // all came out identical
    expect(new Set(cast.map(c => c.colour)).size, 'twelve distinct colours').toBe(12);
    // …and the colour on the disc is the colour the sprite has been rotated to
    const mismatch = await tv.evaluate(() => {
        const bad = [];
        [...document.querySelectorAll('#sq-5 .tok')].forEach(t => {
            const want = PAWN_COLS.indexOf(getComputedStyle(t).getPropertyValue('--pc').trim());
            const hue = t.querySelector('.trk').style.getPropertyValue('--hue');
            if (want < 0 || hue !== TREK_CAST[want][1] + 'deg') bad.push([want, hue]);
        });
        return bad;
    });
    expect(mismatch, 'the piece and its colour must come from the same seat').toEqual([]);
    await tv.close();
});

test('a player keeps the same character, colour and idle wherever they are', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 4);
    await tv.waitForTimeout(200);

    const read = sel => tv.evaluate(s => {
        const t = document.querySelector(s);
        const trk = t.querySelector('.trk');
        return { c: getComputedStyle(t).getPropertyValue('--pc').trim(),
                 row: trk.style.getPropertyValue('--row'), hue: trk.style.getPropertyValue('--hue'),
                 idle: (trk.className.match(/i-[a-z]+/) || [])[0],
                 beat: trk.style.getPropertyValue('--dl') };
    }, sel);

    const board = await read('.tok[data-p="t1"]');
    // the same person in the rail is doing the same thing at the same moment
    const rail = await read('.rail-row [data-p="t1"]');
    expect(rail, 'the rail shows the same trekker as the board').toEqual(board);

    // move them, and shuffle who is mid-turn, so their slot in the pile changes
    await tv.evaluate(() => { H.players[1].pos = 14; H.turn = H.players[1].id; applyViewerMsg(viewerStateMsg()); });
    await tv.waitForTimeout(300);
    expect(await read('.tok[data-p="t1"]'), 'and none of it changes because they moved').toEqual(board);
    await tv.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PICKING YOUR PIECE
// ═══════════════════════════════════════════════════════════════════════════════
// You tap a trekker before you join, but you can't know from outside the room which ones
// are already taken — so the pick is a request and the host is the one who grants it.
// Two people tapping the gold duck at the same moment is the ordinary case.
test('the picker offers all thirty pieces and remembers the one you tapped', async ({ page }) => {
    await page.goto('/plumptrek.html', { waitUntil: 'load' });
    const cells = page.locator('.trekpick');
    const total = await page.evaluate(() => TREK_CAST.length);
    expect(total, 'thirty on offer makes a collision unlikely').toBe(30);
    await expect(cells).toHaveCount(total);
    // one is already chosen for you, at random, so you can just play
    await expect(page.locator('.trekpick.sel')).toHaveCount(1);
    const first = await page.evaluate(() => fSeat);
    expect(first, 'a piece is picked for you').toBeGreaterThanOrEqual(0);
    // …and it's from the well-spread pool, so a room that never opens the picker looks right
    expect(first, 'the pre-pick comes from the auto-assigned twelve')
        .toBeLessThan(await page.evaluate(() => AUTO_SEATS));
    // out here we can't know what anyone else has, and the picker says so rather than lying
    await expect(page.locator('.pickhint')).toContainText('already have your pick');
    await expect(page.locator('.trekpick.gone')).toHaveCount(0);

    // every cell is a different piece off the sheet
    const looks = await cells.evaluateAll(els => els.map(e => {
        const t = e.querySelector('.trk');
        return t.style.getPropertyValue('--row') + '|' + t.style.getPropertyValue('--hue');
    }));
    expect(new Set(looks).size, 'thirty visibly different pieces').toBe(total);

    // tap a different one and it sticks, across a reload
    const other = (first + 17) % total;
    await cells.nth(other).click();
    await expect(cells.nth(other)).toHaveClass(/sel/);
    expect(await page.evaluate(() => localStorage.getItem('trek-seat'))).toBe(String(other));
    await page.reload({ waitUntil: 'load' });
    expect(await page.evaluate(() => fSeat), 'your piece is remembered').toBe(other);
    await expect(page.locator('.trekpick').nth(other)).toHaveClass(/sel/);
});

test('in the lobby the taken pieces are crossed out and cannot be tapped', async ({ browser }) => {
    // The honest bit: outside a room we can't know what's taken, so nothing is disabled. In
    // the lobby the host tells us, so we show it.
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/plumptrek.html');
    await neil.locator('input[data-save-name]').first().fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });

    // three more players turn up, all wanting the piece Neil already has
    const mine = await neil.evaluate(() => H.players[0].seat);
    await neil.evaluate(m => {
        ['Jess', 'Ollie', 'Bea'].forEach((n, i) => hostAddPlayer('x' + i, n, m));
        render();
    }, mine);

    const state = await neil.evaluate(() => ({
        seats: H.players.map(p => p.seat),
        cells: [...document.querySelectorAll('.trekpick')].map(e => ({
            gone: e.classList.contains('gone'), sel: e.classList.contains('sel'),
            tappable: !!e.getAttribute('onclick'),
        })),
    }));
    expect(new Set(state.seats).size, 'four players, four different pieces').toBe(4);
    expect(state.cells.length).toBe(30);
    const gone = state.cells.filter(c => c.gone);
    expect(gone.length, 'the other three players\' pieces are crossed out').toBe(3);
    gone.forEach(c => expect(c.tappable, 'and a taken piece is not tappable').toBe(false));
    // your own piece is selected, not crossed out — you can always keep what you have
    const sel = state.cells.filter(c => c.sel);
    expect(sel.length).toBe(1);
    expect(sel[0].gone, 'your own piece is never shown as taken').toBe(false);
    expect(state.cells.filter(c => c.tappable).length, 'the other 27 are still open').toBe(27);

    // swapping to a free piece works and changes your colour on the board
    const free = state.cells.findIndex((c, i) => !c.gone && !c.sel);
    const before = await neil.evaluate(() => H.players[0].col);
    await neil.locator('.trekpick').nth(free).click();
    await expect.poll(() => neil.evaluate(() => H.players[0].seat), { timeout: 5000 }).toBe(free);
    expect(await neil.evaluate(() => H.players[0].col)).not.toBe(before);
    // …and swapping onto a taken one is refused by the host even if the tap gets through
    const takenSeat = await neil.evaluate(() => H.players[1].seat);
    await neil.evaluate(t => hostSetSeat(H.players[0].id, t), takenSeat);
    expect(await neil.evaluate(() => H.players[0].seat), 'the host refuses a taken piece').toBe(free);
    await neil.close();
});

test('a trekker held up at a gate strains to climb rather than freezing', async ({ browser }) => {
    // The two climb frames were the last unused thing in the pack. A held frame says
    // "stopped"; a climb loop says "still trying", which is what a STOP square is.
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 3);
    await tv.waitForTimeout(200);

    const climbing = await tv.evaluate(async () => {
        resetMoods();
        pawnReact('t0', EMO.question, POSE.climb, 900);
        await new Promise(r => setTimeout(r, 120));
        const t = document.querySelector('.tok[data-p="t0"] .trk');
        const cs = getComputedStyle(t);
        return { strain: t.classList.contains('strain'), rx: t.classList.contains('rx'),
                 name: cs.animationName, bgx: cs.backgroundPositionX, held: t.style.getPropertyValue('--f') };
    });
    expect(climbing.strain, 'the climb is a looping class, not a held frame').toBe(true);
    expect(climbing.rx, 'and not the held-frame mechanism').toBe(false);
    expect(climbing.held, 'so no inline frame is set').toBe('');
    expect(climbing.name, 'the climb loop is running').toBe('spClimb');
    expect([7, 8], 'showing one of the two climb frames').toContain(frameOf(climbing.bgx));

    // and it lets go afterwards, back to the idle
    await tv.waitForTimeout(1000);
    const after = await tv.evaluate(() => {
        const t = document.querySelector('.tok[data-p="t0"] .trk');
        return { strain: t.classList.contains('strain'), anims: t.getAnimations().length };
    });
    expect(after.strain).toBe(false);
    expect(after.anims, 'back to idling').toBeGreaterThan(0);
    await tv.close();
});

test('two players who want the same piece do not get it — the second is moved, at random', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });

    const res = await tv.evaluate(() => {
        clearInterval(simTimer); clearTimeout(simTimer); clearHostTimers();
        H.players = [];
        // everybody wants seat 3
        for (let i = 0; i < 5; i++) hostAddPlayer('g' + i, 'P' + i, 3);
        return H.players.map(p => ({ name: p.name, seat: p.seat, col: p.col }));
    });
    expect(res.length).toBe(5);
    expect(res[0].seat, 'first in gets what they asked for').toBe(3);
    expect(new Set(res.map(p => p.seat)).size, 'and nobody shares a piece').toBe(5);
    expect(new Set(res.map(p => p.col)).size, 'so nobody shares a colour either').toBe(5);
    res.slice(1).forEach(p => expect(p.seat, `${p.name} was moved off the taken piece`).not.toBe(3));

    // a full room, then one more: the twelfth gets the last piece, the thirteenth is turned away
    const full = await tv.evaluate(() => {
        H.players = [];
        for (let i = 0; i < 14; i++) hostAddPlayer('f' + i, 'Q' + i, 0);   // all want seat 0
        return { n: H.players.length, seats: H.players.map(p => p.seat).sort((a, b) => a - b) };
    });
    expect(full.n, 'the room caps at twelve').toBe(12);
    expect(full.seats, 'and every piece is used exactly once').toEqual([0,1,2,3,4,5,6,7,8,9,10,11]);

    // a nonsense request still gets a real piece rather than breaking the board
    const junk = await tv.evaluate(() => {
        H.players = [];
        [undefined, null, -1, 99, 'duck', 2.5].forEach((bad, i) => hostAddPlayer('b' + i, 'B' + i, bad));
        return H.players.map(p => p.seat);
    });
    expect(junk.length).toBe(6);
    junk.forEach(sk => expect(Number.isInteger(sk) && sk >= 0 && sk < 12, `seat ${sk} is real`).toBe(true));
    expect(new Set(junk).size, 'and they are all different').toBe(6);
    await tv.close();
});

test('there is one piece per player on screen, not a piece and an emoji', async ({ browser }) => {
    // The rail used to show the sprite AND the animal emoji the player picked, which read
    // as two playing pieces for one person.
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 4);
    await tv.waitForTimeout(250);

    const rail = await tv.evaluate(() => [...document.querySelectorAll('.rail-row')].map(r => ({
        trekkers: r.querySelectorAll('.trk').length,
        emoji: /\p{Extended_Pictographic}/u.test(r.querySelector('.rnm').textContent),
    })));
    expect(rail.length).toBeGreaterThan(0);
    rail.forEach((r, i) => {
        expect(r.trekkers, `rail row ${i} shows exactly one piece`).toBe(1);
        expect(r.emoji, `rail row ${i} has no second, emoji piece beside the name`).toBe(false);
    });
    // and the board is the same: one sprite per player
    const onBoard = await tv.evaluate(() =>
        [...document.querySelectorAll('#sq-5 .tok')].map(t => t.querySelectorAll('.trk').length));
    onBoard.forEach((n, i) => expect(n, `board piece ${i} is one sprite`).toBe(1));
    await tv.close();
});

test('the active player speeds up in the rail and on the board by the same amount', async ({ browser }) => {
    // The eager-on-your-turn speed-up used to hang off the board token, which the rail has
    // no equivalent of — so the piece you were watching ran at a different speed from its
    // portrait, which is worse than not animating at all.
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 4);
    await tv.waitForTimeout(250);

    const speeds = await tv.evaluate(() => {
        const out = {};
        H.players.forEach(p => {
            const els = [...document.querySelectorAll(`[data-p="${p.id}"] .trk`)];
            out[p.id] = els.map(e => ({
                where: e.closest('.tok') ? 'board' : 'rail',
                now: e.classList.contains('now'),
                dur: getComputedStyle(e).animationDuration,
                delay: getComputedStyle(e).animationDelay,
                name: getComputedStyle(e).animationName,
            }));
        });
        return { turn: H.turn, out };
    });
    for (const [id, copies] of Object.entries(speeds.out)) {
        expect(copies.length, `${id} is on screen in both places`).toBeGreaterThanOrEqual(2);
        const [a, ...rest] = copies;
        for (const b of rest) {
            expect(b.dur, `${id}: the ${b.where} copy runs at the ${a.where} copy's speed`).toBe(a.dur);
            expect(b.delay, `${id}: …and on the same beat`).toBe(a.delay);
            expect(b.name, `${id}: …playing the same animation`).toBe(a.name);
        }
        // and the player whose turn it is is the one marked eager, in both places
        copies.forEach(c => expect(c.now, `${id} eager == its turn`).toBe(id === speeds.turn));
    }
    await tv.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOOD
// ═══════════════════════════════════════════════════════════════════════════════
// Mood is the memory a reaction on its own doesn't have. It's derived on the client from
// the same snapshots everyone gets, so these drive real state changes and read what the
// trekkers end up looking like.
const moodStyle = (tv, id) => tv.evaluate(pid => [...document.querySelectorAll(`[data-p="${pid}"]`)].map(el => {
    const trk = el.querySelector('.trk'), tb = el.querySelector('.tb'), emo = el.querySelector('.emo');
    const cs = getComputedStyle(trk);
    return {
        where: el.closest('.tok') ? 'board' : 'rail',
        mood: (trk.className.match(/md-(\w+)/) || [])[1],
        dur: cs.animationDuration,
        sat: (cs.filter.match(/saturate\(([\d.]+)\)/) || [])[1],
        // the DECLARED posture, not the resolved matrix: `translateY(6%)` is a percentage
        // of the element's own height, so the board piece and the smaller rail portrait
        // legitimately compute to different pixel values from identical CSS
        tilt: tb.style.getPropertyValue('--tilt'),
        slump: tb.style.getPropertyValue('--slump'),
        posture: getComputedStyle(tb).transform,
        emote: emo.style.getPropertyValue('--e'),
        every: emo.style.getPropertyValue('--eDur'),
    };
}), id);

test('a run of bad luck leaves a trekker visibly fed up, and it wears off', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 4);
    await tv.evaluate(() => resetMoods());
    await tv.waitForTimeout(200);

    const neutral = (await moodStyle(tv, 't1'))[0];
    expect(neutral.mood, 'everyone starts level').toBe('ok');

    // two knocks in a row
    await tv.evaluate(() => {
        for (let i = 0; i < 2; i++) {
            const before = JSON.parse(JSON.stringify(vD));
            H.players[1].pos = Math.max(0, H.players[1].pos - 3);
            const events = moodPass(before, viewerStateMsg());
            applyViewerMsg(viewerStateMsg());
            playReactions(events);
        }
    });
    // wait out BOTH the walk (up to 760ms) and the held reaction pose (up to 1.9s) — while
    // either is running the sprite's animation isn't its idle, so the tempo means nothing
    await tv.waitForTimeout(2400);
    const glum = await moodStyle(tv, 't1');
    expect(glum[0].mood, 'two knocks and they are properly fed up').toBe('glum');
    // and it SHOWS: slower, duller, slumped forward
    expect(parseFloat(glum[0].dur)).toBeGreaterThan(parseFloat(neutral.dur));
    expect(parseFloat(glum[0].sat)).toBeLessThan(1);
    expect(glum[0].posture, 'a slumped posture, not the upright default').not.toBe('none');
    expect(parseFloat(glum[0].tilt), 'leaning forward').toBeGreaterThan(0);
    expect(parseFloat(glum[0].slump), 'and sagging').toBeGreaterThan(0);
    expect(glum[0].emote, 'and the balloon they sigh is not a happy one').not.toBe(neutral.emote);
    expect(parseFloat(glum[0].every), 'sighed more often than a neutral trekker beams')
        .toBeLessThan(parseFloat(neutral.every));
    // both copies of them agree
    expect(glum.length).toBeGreaterThanOrEqual(2);
    glum.slice(1).forEach(c => expect(c, `the ${c.where} copy feels the same`)
        .toEqual({ ...glum[0], where: c.where, posture: c.posture }));

    // …and it fades as their own turns come round again. Mood fades for whoever's turn just
    // STARTED, so with four players it takes four turn-changes to come back round to them —
    // three of their own turns to climb from −3 to neutral, i.e. a dozen changes in all.
    const trail = [];
    for (let i = 0; i < 14; i++) {
        await tv.evaluate(() => {
            // one turn-change, through the real message path (which runs moodPass itself —
            // calling it here too would fade twice per turn)
            H.turn = H.players[(H.players.findIndex(p => p.id === H.turn) + 1) % H.players.length].id;
            applyViewerMsg(viewerStateMsg());
        });
        trail.push(await tv.evaluate(() => moodOf('t1')));
    }
    expect(trail[trail.length - 1], `mood never recovered: ${trail}`).toBe(0);
    expect(trail.filter(v => v < 0).length, 'but it sulked for several turns').toBeGreaterThanOrEqual(4);
    // strictly toward neutral, never away, and never more than a step at a time
    for (let i = 1; i < trail.length; i++) {
        expect(Math.abs(trail[i]), `mood moved away from neutral: ${trail}`)
            .toBeLessThanOrEqual(Math.abs(trail[i - 1]));
        expect(Math.abs(trail[i] - trail[i - 1]), `mood jumped more than one step: ${trail}`)
            .toBeLessThanOrEqual(1);
    }
    await tv.close();
});

test('a good run leaves them delighted — the opposite of fed up in every way', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 4);
    await tv.evaluate(() => resetMoods());
    await tv.waitForTimeout(200);
    const neutral = (await moodStyle(tv, 't1'))[0];

    await tv.evaluate(() => {
        MOOD.t1 = 3;                                    // as good as it gets
        applyViewerMsg(viewerStateMsg());
    });
    await tv.waitForTimeout(200);
    const up = (await moodStyle(tv, 't1'))[0];
    expect(up.mood).toBe('elated');
    expect(parseFloat(up.dur), 'quicker on their feet').toBeLessThan(parseFloat(neutral.dur));
    expect(parseFloat(up.sat), 'and brighter').toBeGreaterThan(1);

    await tv.evaluate(() => { MOOD.t1 = -3; applyViewerMsg(viewerStateMsg()); });
    await tv.waitForTimeout(200);
    const down = (await moodStyle(tv, 't1'))[0];
    // the two extremes must be unmistakably different, not a shade apart
    expect(parseFloat(down.dur)).toBeGreaterThan(parseFloat(up.dur) * 1.5);
    expect(parseFloat(down.sat)).toBeLessThan(parseFloat(up.sat) * 0.7);
    expect(parseFloat(down.tilt), 'and leaning the other way').toBeGreaterThan(parseFloat(up.tilt));
    await tv.close();
});

test('the same knock reads differently depending on the mood it lands on', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 4);
    await tv.waitForTimeout(200);

    const knock = start => tv.evaluate(m => {
        // Set the mood AFTER the setup render, not before it: moving the player up the board
        // is itself an event (they take the lead), and applyViewerMsg runs its own mood pass
        // — so a mood set first gets overwritten before the knock ever lands.
        H.players[1].pos = 8;
        applyViewerMsg(viewerStateMsg());
        resetMoods();
        MOOD.t1 = m;
        const before = JSON.parse(JSON.stringify(vD));
        H.players[1].pos = 4;                            // sent backwards
        const events = moodPass(before, viewerStateMsg());
        applyViewerMsg(viewerStateMsg());
        playReactions(events);
        const el = document.querySelector('.tok[data-p="t1"]');
        return { emote: el.querySelector('.emo').style.getPropertyValue('--e'),
                 felt: (events.find(e => e[0] === 't1') || [])[2] };
    }, start);

    const whenGlum = await knock(-3);
    await tv.waitForTimeout(200);
    const whenFine = await knock(0);
    await tv.waitForTimeout(200);
    const whenFlying = await knock(3);
    // the mood carried on the event is the one it landed on, as designed
    expect([whenGlum.felt, whenFine.felt, whenFlying.felt]).toEqual([-3, 0, 3]);
    expect(whenGlum.emote, 'a glum trekker sulks rather than fumes').not.toBe(whenFine.emote);
    expect(whenFlying.emote, 'a flying one is startled rather than furious').not.toBe(whenFine.emote);
    await tv.close();
});

test('a new game wipes every mood', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html?mode=tvsimulation&players=3');
    await expect(tv.locator('.sq').first()).toBeVisible({ timeout: 15_000 });
    await pileUp(tv, 3);
    await tv.evaluate(() => { MOOD.t0 = -3; MOOD.t1 = 3; });
    expect(await tv.evaluate(() => [moodOf('t0'), moodOf('t1')])).toEqual([-3, 3]);
    // back to the lobby is a fresh start — nobody carries a grudge into the next game
    await tv.evaluate(() => { H.phase = 'lobby'; applyViewerMsg({ ...lobbyMsg(), type: 'viewer_lobby' }); });
    expect(await tv.evaluate(() => [moodOf('t0'), moodOf('t1')])).toEqual([0, 0]);
    await tv.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// RECONNECT MID-TURN
// ═══════════════════════════════════════════════════════════════════════════════
// Straight from a real game: Neil was captain, it was his turn, his page reloaded, he
// rejoined — and his phone no longer thought it was his turn. The other player sat waiting
// for a roll that could never come, and the room was stuck with nobody able to move.
//
// The cause is that a player's identity IS their peer id, and a refresh gets them a new
// one. `H.players` is re-pointed at the new id on rejoin, but the id is also stored in
// H.turn, H.turnOrder, H.card.who, H.choice.who, H.order… — everywhere else it kept
// pointing at a peer that no longer exists.
test('a refresh on your own turn gives you your turn back, and the room keeps moving', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const pages = {};
    for (const n of ['Ava', 'Ben']) pages[n] = await joinPhone(browser, code, n);
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);
    // Ava joined first, so Ava is captain
    await pages.Ava.getByRole('button', { name: /Start the trek/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('turn');

    // make sure it's Ava's turn — the captain's own turn is the case that broke
    await tv.evaluate(() => {
        const ava = H.players.find(p => p.name === 'Ava');
        // beginTurn advances to the NEXT player, so wind back one to land on Ava
        const n = H.turnOrder.length;
        H.turnIdx = (H.turnOrder.indexOf(ava.id) - 1 + n) % n;
        beginTurn();
    });
    await expect.poll(() => tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name),
        { timeout: 20_000 }).toBe('Ava');
    await expect(pages.Ava.getByRole('button', { name: /ROLL/i })).toBeVisible({ timeout: 15_000 });
    const oldId = await tv.evaluate(() => H.turn);

    // …and the page reloads out from under her
    await pages.Ava.reload({ waitUntil: 'load' });
    // wait for her to be back in her seat: same two players, both with a live connection
    await expect.poll(() => tv.evaluate(() =>
        H.players.filter(p => guestConns[p.id]).length), { timeout: 30_000 }).toBe(2);
    expect(await tv.evaluate(() => H.players.length), 'she took her old seat, not a new one').toBe(2);
    const newId = await tv.evaluate(() => (H.players.find(p => p.name === 'Ava') || {}).id);
    expect(newId, 'a refresh really does mint a new peer id').not.toBe(oldId);

    // THE BUG: every other place that stored her id still points at the dead peer
    const dangling = await tv.evaluate(old => {
        const bad = [];
        if (H.turn === old) bad.push('H.turn');
        if ((H.turnOrder || []).includes(old)) bad.push('H.turnOrder');
        if (H.card && H.card.who === old) bad.push('H.card.who');
        if (H.choice && H.choice.who === old) bad.push('H.choice.who');
        if ((H.order || []).includes(old)) bad.push('H.order');
        return bad;
    }, oldId);
    expect(dangling, `these still point at the peer that went away: ${dangling.join(', ')}`).toEqual([]);

    // …so what the room actually needs: it is still Ava's turn, and she can roll
    expect(await tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name),
        'the host still thinks it is Ava\'s turn').toBe('Ava');
    await expect(pages.Ava.getByRole('button', { name: /ROLL/i }),
        'and her phone gives her the button back').toBeVisible({ timeout: 20_000 });
    await expect(pages.Ben.getByRole('button', { name: /ROLL/i }),
        'while Ben still cannot roll for her').toHaveCount(0);

    // and the game genuinely moves on from there
    await pages.Ava.getByRole('button', { name: /ROLL/i }).click();
    await expect.poll(() => tv.evaluate(() => H.roll), { timeout: 20_000 }).toBeGreaterThan(0);
    await expect.poll(() => tv.evaluate(() => (H.players.find(p => p.name === 'Ava') || {}).pos),
        { timeout: 25_000 }).toBeGreaterThan(0);

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

// What happens when a phone vanishes ON ITS OWN TURN, for three different lengths of time.
// The rule the whole design rests on: nothing may stall the room, and the captain must never
// have to do anything about it.
test('a phone that vanishes on its own turn: quick back, slow back, and never', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const pages = {};
    for (const n of ['Ava', 'Ben', 'Cal']) pages[n] = await joinPhone(browser, code, n);
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(3);
    await tv.evaluate(() => { H.settings.build = false; });
    await pages.Ava.getByRole('button', { name: /Start the trek/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('turn');

    const giveTurnTo = name => tv.evaluate(n => {
        const p = H.players.find(x => x.name === n);
        const len = H.turnOrder.length;
        H.turnIdx = (H.turnOrder.indexOf(p.id) - 1 + len) % len;
        beginTurn();
    }, name);

    // ── 1. BACK QUICKLY: they keep their turn, and the safety net is re-armed ──
    await giveTurnTo('Ben');
    await expect.poll(() => tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name),
        { timeout: 15_000 }).toBe('Ben');
    await pages.Ben.reload({ waitUntil: 'load' });
    await expect.poll(() => tv.evaluate(() =>
        H.players.filter(p => guestConns[p.id]).length), { timeout: 30_000 }).toBe(3);

    expect(await tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name),
        'back inside the grace period, so the turn is still theirs').toBe('Ben');
    await expect(pages.Ben.getByRole('button', { name: /ROLL/i })).toBeVisible({ timeout: 20_000 });
    // the close handler REPLACED the idle-roll timer with a 12s "they've gone" one; coming
    // back has to restore a real safety net, or a phone put face-down now hangs the room
    expect(await tv.evaluate(() => !!_phaseTimeout),
        'a returning player still gets an idle-roll timeout').toBe(true);

    // ── 2. GONE FOR GOOD ──
    // The host cannot tell. Closing a tab does NOT fire conn.on('close') — the data channel
    // just goes quiet — so `guestConns` still lists them and the 12s "they've gone" fallback
    // never runs. Measured: the room sat on that player's turn for the full IDLE_ROLL_MS.
    // What saves it is the idle-roll, which now also MARKS THEM AWAY, so the room pays that
    // wait once rather than every lap.
    await giveTurnTo('Cal');
    await expect.poll(() => tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name),
        { timeout: 15_000 }).toBe('Cal');
    await pages.Cal.close();                      // never coming back
    delete pages.Cal;

    // shrink the wait so the test doesn't sit here for 70 real seconds
    await tv.evaluate(() => {
        clearHostTimers();
        const p = H.players.find(x => x.name === 'Cal');
        _phaseTimeout = setTimeout(() => {
            if (H.phase !== 'turn' || H.turn !== p.id) return;
            p.away = true;
            hostRoll(p);
        }, 800);
    });
    await expect.poll(() => tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name),
        { timeout: 25_000, message: 'the room moves on by itself — the captain does nothing' })
        .not.toBe('Cal');
    expect(await tv.evaluate(() => H.players.find(p => p.name === 'Cal').away),
        'and the host has now decided they are gone').toBe(true);
    expect(await tv.evaluate(() => H.players.length), 'their seat is held, not deleted').toBe(3);
    // the room can see it, so nobody wonders why Cal is being skipped
    expect(await tv.evaluate(() => (playersWire().find(p => p.name === 'Cal') || {}).here),
        'and the rail shows them as away').toBe(false);

    // …and on every later lap they are SKIPPED outright, with no wait at all
    const laps = [];
    for (let i = 0; i < 6; i++) {
        const t0 = Date.now();
        await tv.evaluate(() => beginTurn());
        laps.push(Date.now() - t0);
        const who = await tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name);
        expect(who, 'an absent player never takes another turn').not.toBe('Cal');
        expect(['Ava', 'Ben']).toContain(who);
    }
    expect(Math.max(...laps), 'skipping them is instant — the 70s wait is paid once, not per lap')
        .toBeLessThan(2000);

    // ── 3. AND IF THEY COME BACK, they rejoin the rotation ──
    await tv.evaluate(() => {
        const cal = H.players.find(p => p.name === 'Cal');
        cal.away = false;                          // any message from the phone does this
    });
    let sawCal = false;
    for (let i = 0; i < 8 && !sawCal; i++) {
        await tv.evaluate(() => beginTurn());
        sawCal = (await tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name)) === 'Cal';
    }
    expect(sawCal, 'a returning player gets their turns back').toBe(true);

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// KEEPING EVERYONE ON BOARD
// ═══════════════════════════════════════════════════════════════════════════════
// These are rare, and they're also the ones people judge a party game on: if the room ever
// sits there waiting for a phone that isn't coming back, or somebody can't get back in, the
// evening is over. The rule under all of them is the same — the game keeps moving on its
// own, and the captain's controls are a tidy-up, never a requirement.

// a room with the game under way and `n` players
async function trekRoom(browser, names) {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    const pages = {};
    for (const n of names) pages[n] = await joinPhone(browser, code, n);
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(names.length);
    await tv.evaluate(() => { H.settings.build = false; });
    await pages[names[0]].getByRole('button', { name: /Start the trek/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('turn');
    return { tv, pages, code };
}
// pretend a phone has gone for good, the way the host eventually works it out
const markGone = (tv, name) => tv.evaluate(n => {
    const p = H.players.find(x => x.name === n);
    p.away = true;
    delete guestConns[p.id];
    broadcastAll();
}, name);

test('the captain can continue without someone who has gone — but never below the minimum',
    async ({ browser }) => {
    const { tv, pages } = await trekRoom(browser, ['Ava', 'Ben', 'Cal']);

    // nothing is offered while everyone is present — no clutter, no scary buttons
    expect(await tv.evaluate(() => publicState().absent)).toEqual([]);
    await expect(pages.Ava.locator('.awaycard')).toHaveCount(0);

    await markGone(tv, 'Cal');
    await expect.poll(() => tv.evaluate(() => publicState().absent), { timeout: 10_000 }).toEqual(['Cal']);

    // the captain is offered it; the other player is told what's happening but gets no button
    await expect(pages.Ava.locator('.awaycard')).toBeVisible({ timeout: 10_000 });
    await expect(pages.Ava.getByRole('button', { name: /Continue without/ })).toBeVisible();
    await expect(pages.Ben.locator('.awaycard')).toBeVisible({ timeout: 10_000 });
    await expect(pages.Ben.getByRole('button', { name: /Continue without/ })).toHaveCount(0);

    await pages.Ava.getByRole('button', { name: /Continue without/ }).click();
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 10_000 }).toBe(2);
    expect(await tv.evaluate(() => H.players.map(p => p.name).sort())).toEqual(['Ava', 'Ben']);
    // …and nothing anywhere still refers to them
    expect(await tv.evaluate(() => H.turnOrder.length)).toBe(2);
    expect(await tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name),
        'and the game is still on somebody').toBeTruthy();

    // now only two are left, so dropping another would end the game — refuse it
    await markGone(tv, 'Ben');
    expect(await tv.evaluate(() => publicState().canDrop),
        'dropping below the minimum must not be offered').toBe(false);
    await expect(pages.Ava.getByText(/needs 2 players/)).toBeVisible({ timeout: 10_000 });
    // and the HOST refuses it even if the message arrives anyway — a button is a suggestion
    await tv.evaluate(() => hostDropAbsent());
    expect(await tv.evaluate(() => H.players.length), 'the host is the one that decides').toBe(2);

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

test('dropping the player whose turn it is gets the game moving again', async ({ browser }) => {
    // The nastiest version: the room is waiting on exactly the person who left.
    const { tv, pages } = await trekRoom(browser, ['Ava', 'Ben', 'Cal']);
    await tv.evaluate(() => {
        const cal = H.players.find(p => p.name === 'Cal');
        const n = H.turnOrder.length;
        H.turnIdx = (H.turnOrder.indexOf(cal.id) - 1 + n) % n;
        beginTurn();
    });
    await expect.poll(() => tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name),
        { timeout: 15_000 }).toBe('Cal');

    await markGone(tv, 'Cal');
    await pages.Ava.getByRole('button', { name: /Continue without/ }).click();

    await expect.poll(() => tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name),
        { timeout: 15_000, message: 'the turn must move to somebody who is actually here' })
        .toMatch(/Ava|Ben/);
    expect(await tv.evaluate(() => H.phase), 'and the room is playable, not stuck mid-phase')
        .toMatch(/turn|choose/);
    // the captain's own phone shows the roll control if it landed on them
    const turnName = await tv.evaluate(() => (H.players.find(p => p.id === H.turn) || {}).name);
    await expect(pages[turnName].getByRole('button', { name: /ROLL/i })).toBeVisible({ timeout: 15_000 });

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

test('back to the lobby reopens the room — for the people who left AND for new players',
    async ({ browser }) => {
    const { tv, pages, code } = await trekRoom(browser, ['Ava', 'Ben', 'Cal']);
    await tv.evaluate(() => { H.players.forEach((p, i) => { p.pos = 3 + i; }); broadcastAll(); });
    await markGone(tv, 'Cal');

    await expect(pages.Ava.getByRole('button', { name: /Back to the lobby/ })).toBeVisible({ timeout: 10_000 });
    await pages.Ava.getByRole('button', { name: /Back to the lobby/ }).click();

    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 15_000 }).toBe('lobby');
    // the people still here kept their seats; the one who left did not
    expect(await tv.evaluate(() => H.players.map(p => p.name).sort())).toEqual(['Ava', 'Ben']);
    // and the game is properly reset, not half-finished
    expect(await tv.evaluate(() => H.players.every(p => p.pos === 0 && !p.done && !p.away))).toBe(true);
    expect(await tv.evaluate(() => [H.turn, H.card, H.choice, H.finale])).toEqual([null, null, null, null]);
    await expect(pages.Ben.locator('.player-row')).toHaveCount(2, { timeout: 15_000 });

    // the door is open again: the player who dropped out can walk back in…
    const calAgain = await joinPhone(browser, code, 'Cal');
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(3);
    // …and so can somebody who was never here
    const dee = await joinPhone(browser, code, 'Dee');
    await expect.poll(() => tv.evaluate(() => H.players.map(p => p.name).sort()), { timeout: 30_000 })
        .toEqual(['Ava', 'Ben', 'Cal', 'Dee']);
    // everyone has a different piece, including the two who just arrived
    expect(await tv.evaluate(() => new Set(H.players.map(p => p.seat)).size)).toBe(4);

    // and the next trek runs with all four
    await pages.Ava.getByRole('button', { name: /Start the trek/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('turn');
    expect(await tv.evaluate(() => H.turnOrder.length)).toBe(4);

    for (const p of [...Object.values(pages), calAgain, dee]) await p.close();
    await tv.close();
});

test('the room never strands itself: two players, one leaves, nothing is offered that would end it',
    async ({ browser }) => {
    const { tv, pages } = await trekRoom(browser, ['Ava', 'Ben']);
    await markGone(tv, 'Ben');

    const st = await tv.evaluate(() => publicState());
    expect(st.absent).toEqual(['Ben']);
    expect(st.canDrop, 'dropping Ben would leave one player').toBe(false);
    expect(st.canLobby, 'and so would going back to the lobby').toBe(false);
    await expect(pages.Ava.getByRole('button', { name: /Continue without/ })).toHaveCount(0);
    await expect(pages.Ava.getByRole('button', { name: /Back to the lobby/ })).toHaveCount(0);
    // the host refuses both outright
    await tv.evaluate(() => { hostDropAbsent(); hostBackToLobby(); });
    expect(await tv.evaluate(() => H.players.length)).toBe(2);
    expect(await tv.evaluate(() => H.phase)).not.toBe('lobby');

    // Ben coming back is all it takes — no captain action needed, ever
    await tv.evaluate(() => {
        const ben = H.players.find(p => p.name === 'Ben');
        ben.away = false; guestConns[ben.id] = { peer: ben.id, send() {} };
        broadcastAll();
    });
    expect(await tv.evaluate(() => publicState().absent)).toEqual([]);
    await expect(pages.Ava.locator('.awaycard')).toHaveCount(0, { timeout: 10_000 });

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

test('a player who comes back after the captain dropped them can just join again', async ({ browser }) => {
    // The unhappiest path: they were tidied away, then their phone reconnects. They must not
    // be stuck on a dead screen — they get in again as a new player.
    const { tv, pages, code } = await trekRoom(browser, ['Ava', 'Ben', 'Cal']);
    await markGone(tv, 'Cal');
    await pages.Ava.getByRole('button', { name: /Continue without/ }).click();
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 10_000 }).toBe(2);

    // back to the lobby so there's a room to walk into, then Cal rejoins
    await pages.Ava.getByRole('button', { name: /Back to the lobby/ }).click().catch(() => {});
    await tv.evaluate(() => { if (H.phase !== 'lobby') hostBackToLobby(); });
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 15_000 }).toBe('lobby');

    const calAgain = await joinPhone(browser, code, 'Cal');
    await expect.poll(() => tv.evaluate(() => H.players.map(p => p.name).sort()), { timeout: 30_000 })
        .toEqual(['Ava', 'Ben', 'Cal']);
    await expect(calAgain.locator('.player-row')).toHaveCount(3, { timeout: 15_000 });

    for (const p of [...Object.values(pages), calAgain]) await p.close();
    await tv.close();
});
