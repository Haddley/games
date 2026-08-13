// E2E for Blackjack — lobby → bet → deal → hit/stand/double → dealer reveal →
// resolve → next hand → end session → podium, over real PeerJS rooms, for both a
// TV-hosted and a phone-hosted table. The host is ALWAYS the dealer here (never a
// seated player), so a phone-hosted table still needs a SECOND phone to actually play.
//
// Run:  npx playwright test tests/blackjack.e2e.spec.js

const { test, expect } = require('@playwright/test');
const fs = require('fs');

// A burst of PeerJS registrations in one test file occasionally gets throttled by
// the public broker — external-service flake, not a game bug. One retry covers it.
test.describe.configure({ retries: 1 });

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/blackjack.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

test('TV-hosted table: bet, deal, stand/hit/bust, dealer reveal, next hand, end session, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const errors = [];

    const tv = await browser.newPage({ viewport: TV });
    tv.on('pageerror', e => errors.push('tv: ' + e.message));
    await tv.goto('/blackjack.html');
    await shot(tv, 'bj-01-home');
    await tv.getByRole('button', { name: /Deal on the big screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    const ann = await joinPhone(browser, code, 'Ann');
    ann.on('pageerror', e => errors.push('ann: ' + e.message));
    const bo = await joinPhone(browser, code, 'Bo');
    bo.on('pageerror', e => errors.push('bo: ' + e.message));
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);
    await expect(tv.locator('.cxl-chip')).toHaveCount(2, { timeout: 15_000 });
    await shot(tv, 'bj-02-tv-lobby');

    // Ann joined first, so she's the captain — she opens the table.
    await expect(ann.locator('button', { hasText: /Open the table/ })).toBeVisible({ timeout: 15_000 });
    await ann.getByRole('button', { name: /Open the table/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 10_000 }).toBe('betting');
    await shot(ann, 'bj-03-captain-betting');

    // ── Both players place a bet, then the captain deals ──
    await ann.getByRole('button', { name: '+50', exact: true }).click();
    await bo.getByRole('button', { name: '+50', exact: true }).click();
    await expect.poll(() => tv.evaluate(() => H.players.map(p => p.bet)), { timeout: 10_000 }).toEqual([50, 50]);

    await ann.getByRole('button', { name: /Deal$/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 10_000 }).toBe('playing');
    expect(await tv.evaluate(() => H.players.every(p => p.hand.length === 2))).toBe(true);
    expect(await tv.evaluate(() => H.dealer.cards.length)).toBe(2);

    // ── The dealer's hole card must never cross the wire before the reveal ──
    await expect.poll(() => bo.evaluate(() => (D && D.dealer && D.dealer.cards.length) || 0), { timeout: 10_000 }).toBe(1);
    expect(await bo.evaluate(() => D.dealer.holeHidden)).toBe(true);
    await shot(tv, 'bj-04-tv-dealt');
    await shot(ann, 'bj-05-phone-hand');

    // Turn order is join order: Ann, then Bo.
    expect(await tv.evaluate(() => H.players.map(p => p.name))).toEqual(['Ann', 'Bo']);

    // ── Ann: force a strong hand and stand ──
    await tv.evaluate(() => {
        H.players[0].hand = [{ rank: 10, suit: 'S', id: '10S' }, { rank: 9, suit: 'H', id: '9H' }];
        broadcast();
    });
    await expect.poll(() => ann.evaluate(() => (D && D.myBet != null && D.players.find(p => p.name === 'Ann').total)), { timeout: 10_000 }).toBe(19);
    await ann.getByRole('button', { name: /Stand/ }).click();
    await expect.poll(() => tv.evaluate(() => H.players[0].standing), { timeout: 10_000 }).toBe(true);

    // ── Bo: force a hand that busts on a forced next card, then Hit ──
    await expect.poll(() => tv.evaluate(() => H.turnIdx), { timeout: 10_000 }).toBe(1);
    await tv.evaluate(() => {
        H.players[1].hand = [{ rank: 10, suit: 'D', id: '10D' }, { rank: 6, suit: 'C', id: '6C' }];
        H.deck.push({ rank: 10, suit: 'H', id: 'bustcard' });   // next pop() — forces a bust
        broadcast();
    });
    await expect.poll(() => bo.evaluate(() => D.players.find(p => p.name === 'Bo').total), { timeout: 10_000 }).toBe(16);
    await bo.getByRole('button', { name: /Hit/ }).click();
    await expect.poll(() => tv.evaluate(() => H.players[1].busted), { timeout: 10_000 }).toBe(true);
    expect(await tv.evaluate(() => H.players[1].hand.some(c => c.id === 'bustcard'))).toBe(true);
    await shot(bo, 'bj-06-phone-bust');

    // ── Dealer reveals and plays out; both players eventually get an outcome ──
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('round_over');
    expect(await tv.evaluate(() => H.dealer.holeHidden)).toBe(false);
    await expect.poll(() => ann.evaluate(() => D.dealer.holeHidden), { timeout: 10_000 }).toBe(false);
    expect(await tv.evaluate(() => H.players[1].lastOutcome)).toBe('lose');   // Bo busted — always loses
    expect(await tv.evaluate(() => H.players[1].chips)).toBe(450);           // 500 - 50 bet, nothing back
    expect(await tv.evaluate(() => typeof H.players[0].lastOutcome)).toBe('string');
    await shot(tv, 'bj-07-tv-round-over');
    await shot(ann, 'bj-08-phone-round-over');

    // ── Next hand, then end the session and check the podium ──
    await ann.getByRole('button', { name: /Next hand/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 10_000 }).toBe('betting');
    expect(await tv.evaluate(() => H.players.every(p => p.bet === 0))).toBe(true);

    await ann.getByRole('button', { name: /End session/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 10_000 }).toBe('session_over');
    await expect(ann.locator('.trophy')).toBeVisible({ timeout: 10_000 });
    await expect(tv.locator('.v-gameover-winner')).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'bj-09-tv-podium');
    await shot(ann, 'bj-10-phone-podium');

    expect(errors, errors.join('\n')).toEqual([]);
    for (const p of [tv, ann, bo]) await p.close();
});

test('phone-hosted table (dealer never plays): double down doubles the bet and forces a stand', async ({ browser }) => {
    const errors = [];
    const neil = await browser.newPage({ viewport: PHONE });
    neil.on('pageerror', e => errors.push('host: ' + e.message));
    await neil.goto('/blackjack.html');
    await neil.getByRole('button', { name: /Deal on this phone/ }).click();
    await expect(neil.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    // The host never gets a name field or a seat — no player rows exist yet.
    expect(await neil.evaluate(() => H.players.length)).toBe(0);
    const code = await neil.evaluate(() => roomCode);

    const jess = await joinPhone(browser, code, 'Jess');
    jess.on('pageerror', e => errors.push('jess: ' + e.message));
    await expect.poll(() => neil.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(1);

    // Jess is the only connected player, so she's automatically the captain too — a single
    // human really can play solo against the house, per MIN_PLAYERS = 1.
    await expect(jess.locator('button', { hasText: /Open the table/ })).toBeVisible({ timeout: 15_000 });
    await jess.getByRole('button', { name: /Open the table/ }).click();
    await expect.poll(() => neil.evaluate(() => H.phase), { timeout: 10_000 }).toBe('betting');

    await jess.getByRole('button', { name: '+100', exact: true }).click();
    await expect.poll(() => neil.evaluate(() => H.players[0].bet), { timeout: 10_000 }).toBe(100);
    await jess.getByRole('button', { name: /Deal$/ }).click();
    await expect.poll(() => neil.evaluate(() => H.phase), { timeout: 10_000 }).toBe('playing');

    // Force a hand that can profitably double, and a known next card.
    await neil.evaluate(() => {
        H.players[0].hand = [{ rank: 5, suit: 'S', id: '5S' }, { rank: 6, suit: 'H', id: '6H' }];
        H.deck.push({ rank: 10, suit: 'C', id: 'doublecard' });
        broadcast();
    });
    await expect.poll(() => jess.evaluate(() => D.canDouble), { timeout: 10_000 }).toBe(true);
    expect(await neil.evaluate(() => H.players[0].chips)).toBe(400);   // 500 - the original 100 bet

    await jess.getByRole('button', { name: /Double/ }).click();
    await expect.poll(() => neil.evaluate(() => H.players[0].standing), { timeout: 10_000 }).toBe(true);
    expect(await neil.evaluate(() => H.players[0].bet)).toBe(200);
    expect(await neil.evaluate(() => H.players[0].doubled)).toBe(true);
    expect(await neil.evaluate(() => H.players[0].hand.length)).toBe(3);
    expect(await neil.evaluate(() => H.players[0].hand.some(c => c.id === 'doublecard'))).toBe(true);
    expect(await neil.evaluate(() => H.players[0].chips)).toBe(300);   // 500 - 200 total staked

    // The dealer plays out on its own — whatever it draws, the payout math must be internally
    // consistent: chips after resolve = chips right after doubling + whatever resolveHand
    // (the real function this game runs on) says a 200 bet against the actual outcome is worth.
    await expect.poll(() => neil.evaluate(() => H.phase), { timeout: 20_000 }).toBe('round_over');
    const check = await neil.evaluate(() => {
        const r = resolveHand(H.players[0].hand, H.dealer.cards, 200);
        return { expectedChips: 300 + r.payout, actualChips: H.players[0].chips, outcome: H.players[0].lastOutcome, expectedOutcome: r.outcome };
    });
    expect(check.actualChips).toBe(check.expectedChips);
    expect(check.outcome).toBe(check.expectedOutcome);

    expect(errors, errors.join('\n')).toEqual([]);
    for (const p of [neil, jess]) await p.close();
});

test('"Deal me in": one device is both the dealer and a seated player — genuine solo play', async ({ browser }) => {
    const errors = [];
    const solo = await browser.newPage({ viewport: PHONE });
    solo.on('pageerror', e => errors.push('solo: ' + e.message));
    await solo.goto('/blackjack.html');
    await solo.locator('input[placeholder="Enter name"]').fill('Robin');
    await solo.getByRole('button', { name: /Deal me in/ }).click();
    // Unlike dealer-only hosting (which lands on the shared tvLobby() component and its
    // `.cxl-code`), hostGameAndPlay renders through the normal player lobby — its own
    // `.qr-box`, since this player is also the room's creator and needs to show it.
    await expect(solo.locator('.qr-box')).toBeVisible({ timeout: 30_000 });

    // Unlike dealer-only hosting, this seats the host as a real player immediately.
    expect(await solo.evaluate(() => H.players.length)).toBe(1);
    expect(await solo.evaluate(() => H.players[0].name)).toBe('Robin');
    expect(await solo.evaluate(() => hostPlays)).toBe(true);
    // And they're automatically their own captain — no second device required to start.
    await solo.getByRole('button', { name: /Open the table/ }).click();
    await expect.poll(() => solo.evaluate(() => H.phase), { timeout: 10_000 }).toBe('betting');

    await solo.getByRole('button', { name: '+50', exact: true }).click();
    await expect.poll(() => solo.evaluate(() => H.players[0].bet), { timeout: 10_000 }).toBe(50);
    await solo.getByRole('button', { name: /Deal$/ }).click();
    await expect.poll(() => solo.evaluate(() => H.phase), { timeout: 10_000 }).toBe('playing');
    expect(await solo.evaluate(() => H.players[0].hand.length)).toBe(2);
    expect(await solo.evaluate(() => H.dealer.cards.length)).toBe(2);

    // Force a clean stand so the round resolves deterministically without needing a hit.
    await solo.evaluate(() => {
        H.players[0].hand = [{ rank: 10, suit: 'S', id: '10S' }, { rank: 9, suit: 'H', id: '9H' }];
        broadcast();
    });
    await expect.poll(() => solo.evaluate(() => D.players[0].total), { timeout: 10_000 }).toBe(19);
    await solo.getByRole('button', { name: /Stand/ }).click();
    await expect.poll(() => solo.evaluate(() => H.phase), { timeout: 20_000 }).toBe('round_over');
    expect(await solo.evaluate(() => typeof H.players[0].lastOutcome)).toBe('string');

    expect(errors, errors.join('\n')).toEqual([]);
    await solo.close();
});
