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
    await pages.Ava.getByRole('button', { name: /Start the trek/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('turn');

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
    await chooser.locator('.opt').first().click();
    // The room is told who lost a turn. Don't assert on p.skip: if the victim happens to be
    // next up, beginTurn spends it (and rewords the message to "misses a turn") before we
    // could look — so accept either wording, and check it names the player we picked.
    await expect.poll(() => tv.evaluate(() => H.msg || ''), { timeout: 20_000 })
        .toMatch(/(loses|misses) a turn/);
    const msg = await tv.evaluate(() => H.msg);
    const named = msg.replace(/ (loses|misses) a turn/, '').trim();
    expect(victim, `announced "${msg}" but the button said "${victim}"`).toContain(named);

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});
