// E2E for Liar's Dice — the other game that had no spec.
//
// Bid, bluff, call liar. Each player sees only their own dice; the host is the only one
// who knows the whole table, which is exactly the sort of thing worth pinning: a guest
// must never be sent someone else's dice.
//
// The bid stepper is a custom widget, so bids are driven through the host's own
// `hostBid`/`hostChallenge` (the same calls the buttons make) and we assert on what each
// PHONE ends up seeing — the protocol and the rendering are still under test.
//
// Run:  npx playwright test tests/liarsdice.e2e.spec.js

const { test, expect } = require('@playwright/test');
const fs = require('fs');

// Each test opens a room plus several phones, i.e. a burst of PeerJS registrations on the
// public broker. Back-to-back rooms occasionally get throttled and a join never lands —
// external-service flake, not a game bug. One retry covers it.
test.describe.configure({ retries: 1 });

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/liarsdice.html?join=' + code);
    await p.locator('#jc').fill(code);
    await p.locator('input[placeholder="e.g. Will Turner"]').fill(name);
    await p.getByRole('button', { name: /Take a seat/ }).click();
    return p;
}

test('phone host: dice are dealt secretly, a bid stands, a challenge resolves', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const pageErrors = [];

    const neil = await browser.newPage({ viewport: PHONE });
    neil.on('pageerror', e => pageErrors.push('host: ' + e.message));
    await neil.goto('/liarsdice.html');
    await neil.locator('#cn').fill('Neil');
    await neil.getByRole('button', { name: /Roll out the barrel/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);
    await shot(neil, 'ld-01-host-lobby');

    const jess = await joinPhone(browser, code, 'Jess');
    jess.on('pageerror', e => pageErrors.push('jess: ' + e.message));
    await expect.poll(() => neil.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);

    await neil.getByRole('button', { name: /Roll the bones/ }).click();
    await expect.poll(() => neil.evaluate(() => H.phase), { timeout: 20_000 }).toBe('bidding');

    // ── everyone has dice, and only their own ──
    const table = await neil.evaluate(() => H.players.map(p => ({ name: p.name, dice: p.dice.slice() })));
    table.forEach(p => expect(p.dice.length).toBe(5));
    const jessSees = await jess.evaluate(() => (D && D.myDice) || []);
    const jessReal = table.find(p => p.name === 'Jess').dice;
    expect(jessSees.slice().sort()).toEqual(jessReal.slice().sort());
    // the host's dice are NOT in the guest's payload anywhere
    const guestBlob = await jess.evaluate(() => JSON.stringify(D));
    const neilDice = table.find(p => p.name === 'Neil').dice;
    expect(guestBlob).not.toContain(JSON.stringify(neilDice), "the guest must not receive the host's hand");
    await shot(jess, 'ld-02-guest-dice');

    // ── a bid stands, and both phones see it ──
    const first = await neil.evaluate(() => H.players[H.activePlayers[H.bidderIdx]].id);
    await neil.evaluate(id => hostBid(id, 2, 3), first);
    await expect.poll(() => neil.evaluate(() => H.currentBid && H.currentBid.qty), { timeout: 10_000 }).toBe(2);
    await expect.poll(() => jess.evaluate(() => D && D.currentBid && D.currentBid.face), { timeout: 10_000 }).toBe(3);
    await shot(neil, 'ld-03-bid-standing');

    // ── a raise must go up, never down ──
    const second = await neil.evaluate(() => H.players[H.activePlayers[H.bidderIdx]].id);
    await neil.evaluate(id => hostBid(id, 1, 2), second);              // lower — illegal
    expect(await neil.evaluate(() => H.currentBid.qty)).toBe(2, 'the standing bid survives a bad raise');
    await neil.evaluate(id => hostBid(id, 3, 3), second);              // higher — fine
    await expect.poll(() => neil.evaluate(() => H.currentBid.qty), { timeout: 10_000 }).toBe(3);

    // ── challenge: somebody loses a die, and the table shrinks ──
    const diceBefore = await neil.evaluate(() => H.players.reduce((s, p) => s + p.diceCount, 0));
    const challenger = await neil.evaluate(() => H.players[H.activePlayers[H.bidderIdx]].id);
    await neil.evaluate(id => hostChallenge(id), challenger);
    await expect.poll(() => neil.evaluate(() => H.phase), { timeout: 15_000 }).toBe('reveal');
    const diceAfter = await neil.evaluate(() => H.players.reduce((s, p) => s + p.diceCount, 0));
    expect(diceAfter).toBe(diceBefore - 1, 'exactly one die is lost per challenge');
    expect(await neil.evaluate(() => !!H.challengeResult)).toBe(true);
    await shot(neil, 'ld-04-reveal');

    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    for (const p of [neil, jess]) await p.close();
});

test('TV room: the big screen shows the table, phones keep their own dice', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    const errs = [];
    tv.on('pageerror', e => errs.push('tv: ' + e.message));
    await tv.goto('/liarsdice.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const pages = { Ava: await joinPhone(browser, code, 'Ava'), Ben: await joinPhone(browser, code, 'Ben') };
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);

    // first phone in is the captain and the only one who can start
    await pages.Ava.getByRole('button', { name: /Roll the bones|Start/ }).first().click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('bidding');

    // the TV knows the whole table; each phone knows only its own hand
    expect(await tv.evaluate(() => H.players.every(p => p.dice.length === 5))).toBe(true);
    for (const [name, page] of Object.entries(pages)) {
        // poll: the phone gets its hand on the next broadcast, a beat after the deal
        await expect.poll(() => page.evaluate(() => ((D && D.myDice) || []).length),
            { timeout: 15_000, message: `${name} should hold five dice` }).toBe(5);
    }
    await shot(tv, 'ld-05-tv-table');

    expect(errs, errs.join('\n')).toEqual([]);
    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});
