// E2E screenshot tour of Going, Going, GONE! (auction house).
//
// Plays real auctions over PeerJS. Covers:
//   1. TV-first — captain lobby, the auctioneer's ASK, a bidding war through the
//      network, gavel SOLD, valuation finale, podium, play again
//   2. Rounds — net worth banks back into cash between rounds, the banked board
//      appears, and the podium waits for the LAST round
//   3. Passed in — the auctioneer fishes all the way down, nobody bites, and the
//      lot leaves the room with its true value revealed
//   4. Phone-first — host phone + TV viewer, one bid takes the lot
//
// Bidding no longer opens at zero: the auctioneer calls for an opening bid and
// comes down until somebody takes it, so tests read the live ask off the page
// rather than hardcoding "+50". The lot order is random; tests READ the drawn
// lots via page.evaluate on the host to compute expected net worths.
//
// Screenshots land in screenshots/ (gavel-*.png).
//
// Run:  npm run test:e2e        (needs internet: PeerJS broker)

const { test, expect } = require('@playwright/test');
const fs = require('fs');

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';

function shot(page, name) {
    return page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/goinggone.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

// Take the auctioneer's current ask on `phone`. Returns the price it opened at.
async function openBidding(phone, host) {
    const btn = phone.getByRole('button', { name: /Start it at/ });
    await expect(btn).toBeEnabled({ timeout: 20_000 });
    await btn.click();
    await expect.poll(() => host.evaluate(() => H.bid && H.bid.price), { timeout: 15_000 })
        .toBeGreaterThan(0);
    return host.evaluate(() => H.bid.price);
}

// Cheap, affordable lots make the bidding predictable — the draw is random and a
// $70,000 oven has an opening ask no starting purse can take.
function forceCheapLots(host) {
    return host.evaluate(() => {
        const cheap = LOTS.map((l, i) => [l.value, i]).filter(([v]) => v >= 20 && v <= 200).map(([, i]) => i);
        H.lotOrder = H.lotOrder.map((_, n) => cheap[n % cheap.length]);
        H.mysteryLots = new Set();
    });
}

test('TV-first: the ask, a bidding war, gavel, valuation, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── TV opens the auction house ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    await shot(tv, 'gavel-01-home');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // ── Karen (captain) and Ben take their seats ──
    const karen = await joinPhone(browser, code, 'Karen');
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const ben = await joinPhone(browser, code, 'Ben');
    await expect(ben.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await expect(tv.locator('.cxl-chip')).toHaveCount(2, { timeout: 15_000 });
    await shot(tv, 'gavel-02-tv-lobby');
    await shot(karen, 'gavel-03-captain-lobby');

    // Captain trims the sale to Short (2 lots per player) and a single round
    await karen.getByRole('button', { name: 'Short', exact: true }).click();
    await karen.waitForTimeout(300);
    await karen.getByRole('button', { name: '1', exact: true }).click();
    await karen.waitForTimeout(300);
    expect(await tv.evaluate(() => H.settings.rounds)).toBe(1);

    // ── Start: lot presented, then the auctioneer asks for an opening bid ──
    await karen.getByRole('button', { name: /Start the auction/ }).click();
    await expect(tv.locator('.tv-lot')).toBeVisible({ timeout: 15_000 });
    await forceCheapLots(tv);
    await shot(tv, 'gavel-04-tv-lot-intro');

    // The ask is a real number on both screens, and nothing is bid yet
    await expect(tv.locator('#v-kick')).toHaveText('The auctioneer asks', { timeout: 20_000 });
    await expect(tv.locator('.tv-price.asking')).toBeVisible();
    await expect(tv.locator('#v-leader')).toContainText(/start me at|give me/i);
    await shot(tv, 'gavel-05-tv-asking');
    await shot(karen, 'gavel-06-phone-asking');

    const lot1Value = await tv.evaluate(() => LOTS[H.lotOrder[H.lotIndex]].value);
    const startCoins = await tv.evaluate(() => START_COINS);
    const money = n => n.toLocaleString('en-US');

    // ── Karen takes the ask, Ben starts a war over it ──
    const opened = await openBidding(karen, tv);
    await expect(karen.locator('text=You\'re winning this lot!')).toBeVisible({ timeout: 10_000 });
    await expect(karen.locator('#bid-btns .btn')).toHaveCount(0);   // can't outbid yourself
    await expect(tv.locator('#v-price')).toHaveText(money(opened), { timeout: 10_000 });
    await expect(ben.locator('text=Karen holds the bid')).toBeVisible({ timeout: 10_000 });
    await shot(karen, 'gavel-07-phone-winning');

    // Ben's first raise rung — read it off the button rather than assuming the ladder
    const rung = await ben.locator('#bid-btns .btn').first().textContent();
    const raise = parseInt(rung.replace(/[^0-9]/g, ''), 10);
    await ben.locator('#bid-btns .btn').first().click();
    await expect(tv.locator('#v-price')).toHaveText(money(opened + raise), { timeout: 10_000 });
    await expect(ben.locator('text=You\'re winning this lot!')).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'gavel-08-tv-bidding');
    await shot(karen, 'gavel-09-phone-outbid');

    // Karen takes it back and holds on to the gavel
    await karen.locator('#bid-btns .btn').first().click();
    const finalPrice = await tv.evaluate(() => H.bid.price);
    expect(finalPrice).toBeGreaterThan(opened);

    // ── Going… going… GONE! ──
    await expect(tv.locator('.tv-sold')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.tv-sold .who')).toContainText('Karen');
    await expect(karen.locator('text=YOU WON IT!')).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'gavel-10-tv-sold');

    // Skip ahead: pretend that was the last lot (during the SOLD pause)
    await tv.evaluate(() => { H.lotIndex = H.lotOrder.length - 1; });

    // ── The Valuation ──
    await expect(tv.locator('.tv-val')).toBeVisible({ timeout: 20_000 });
    await expect(tv.locator('.val-card').first()).toBeVisible({ timeout: 15_000 });
    await shot(tv, 'gavel-11-tv-valuation');
    await expect(karen.locator('text=The valuer is in')).toBeVisible({ timeout: 10_000 });

    // ── Podium: net worth = coins + shelf. One round, so it comes straight here. ──
    const karenNet = startCoins - finalPrice + lot1Value;
    const expectedWinner = karenNet >= startCoins ? 'KAREN' : 'BEN';
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 25_000 });
    await tv.waitForTimeout(4600); // pods land bronze → silver → gold (PODIUM_GOLD_MS = 3s)
    await shot(tv, 'gavel-12-tv-podium');
    await expect(karen.locator('.sold-card .st')).toContainText(`${expectedWinner} WINS!`, { timeout: 10_000 });
    await expect(karen.locator('.standings')).toContainText(money(karenNet));
    await shot(karen, 'gavel-13-phone-podium');

    // ── Play again returns everyone to the lobby ──
    await karen.getByRole('button', { name: /Play again/ }).click();
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 15_000 });

    await Promise.all([tv, karen, ben].map(p => p.close()));
});

test('paddles: unique two-digit numbers, drawn on screen, and the auctioneer sells to the number', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const eve = await joinPhone(browser, code, 'Eve');
    await expect(eve.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const fin = await joinPhone(browser, code, 'Fin');
    await expect(tv.locator('.cxl-chip')).toHaveCount(2, { timeout: 20_000 });

    // Every bidder holds a distinct two-digit paddle
    const paddles = await tv.evaluate(() => H.players.map(p => p.paddle));
    expect(paddles).toHaveLength(2);
    expect(new Set(paddles).size).toBe(2);                       // never the same number twice
    for (const n of paddles) expect(n).toBeGreaterThanOrEqual(10);
    for (const n of paddles) expect(n).toBeLessThanOrEqual(99);

    // The phone shows you yours
    await expect(eve.locator('.player-row .paddle').first()).toBeVisible();

    await eve.getByRole('button', { name: '1', exact: true }).click();
    await eve.waitForTimeout(250);
    await eve.getByRole('button', { name: /Start the auction/ }).click();
    await expect(tv.locator('.tv-lot')).toBeVisible({ timeout: 20_000 });
    await forceCheapLots(tv);

    // The TV rail draws a paddle per bidder — and EVERY bidder is still on the screen.
    // A paddle modifier called `.tv` once collided with the game's own full-screen `.tv` wrapper
    // (height: 100dvh), which stretched the rail paddle to fill the column and pushed every
    // bidder but the first off the bottom of the TV. No error, no failing assertion on counts —
    // the rows were all in the DOM. So this checks the geometry, not the count.
    await expect(tv.locator('#v-rail .paddle')).toHaveCount(2, { timeout: 20_000 });
    const rail = await tv.evaluate(() => {
        const h = window.innerHeight;
        return [...document.querySelectorAll('.rail-row')].map(r => {
            const b = r.getBoundingClientRect();
            return { top: Math.round(b.top), height: Math.round(b.height), onScreen: b.bottom <= h + 1 };
        });
    });
    for (const r of rail) {
        expect(r.onScreen, `a bidder row fell off the TV: ${JSON.stringify(rail)}`).toBe(true);
        expect(r.height, `a bidder row is absurdly tall: ${JSON.stringify(rail)}`).toBeLessThan(200);
    }

    // Your own paddle goes UP when you hold the bid
    await openBidding(eve, tv);
    await expect(eve.locator('#my-paddle .paddle.pad-up')).toBeVisible({ timeout: 10_000 });
    const evePaddle = await tv.evaluate(() => H.players.find(p => p.name === 'Eve').paddle);
    await expect(eve.locator('#my-paddle')).toContainText(`number ${evePaddle}`);
    await shot(eve, 'gavel-15-phone-paddle-up');

    // …and the sale is called to the NUMBER, not the name
    await expect(tv.locator('.tv-sold')).toBeVisible({ timeout: 20_000 });
    await expect(tv.locator('.tv-sold')).toContainText(`bidder number ${evePaddle}`);
    await expect(tv.locator('.tv-sold .paddle')).toBeVisible();
    await tv.waitForTimeout(2000);
    await shot(tv, 'gavel-16-tv-sold-paddle');

    await Promise.all([tv, eve, fin].map(p => p.close()));
});

test('rounds: net worth banks back into cash, and the podium waits for the last one', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const ada = await joinPhone(browser, code, 'Ada');
    await expect(ada.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const bo = await joinPhone(browser, code, 'Bo');
    await expect(tv.locator('.cxl-chip')).toHaveCount(2, { timeout: 20_000 });

    // Two rounds, shortest sale
    await ada.getByRole('button', { name: 'Short', exact: true }).click();
    await ada.waitForTimeout(250);
    await ada.getByRole('button', { name: '2', exact: true }).click();
    await ada.waitForTimeout(250);
    expect(await tv.evaluate(() => H.settings.rounds)).toBe(2);
    await shot(ada, 'gavel-20-captain-rounds');

    await ada.getByRole('button', { name: /Start the auction/ }).click();
    await expect(tv.locator('.tv-lot')).toBeVisible({ timeout: 20_000 });
    await forceCheapLots(tv);

    // The TV names the round it is in
    await expect(tv.locator('.tv-meta')).toContainText('Round 1 of 2', { timeout: 20_000 });

    // Buy one thing, then jump to the end of round 1
    await openBidding(ada, tv);
    await expect(tv.locator('.tv-sold')).toBeVisible({ timeout: 20_000 });
    const round1 = await tv.evaluate(() => {
        H.lotIndex = H.lotOrder.length - 1;
        return { spent: START_COINS - H.players.find(p => p.name === 'Ada').coins };
    });
    expect(round1.spent).toBeGreaterThan(0);

    // ── The banked board: shelf sold back, net worth becomes the bankroll ──
    await expect(tv.locator('.bank-title')).toContainText('ROUND 1 BANKED', { timeout: 30_000 });
    await tv.waitForTimeout(2600);   // rows land poorest-first
    await shot(tv, 'gavel-21-tv-banked');
    await expect(ada.locator('text=your shelf sold back')).toBeVisible({ timeout: 10_000 });
    await shot(ada, 'gavel-22-phone-banked');

    // Nobody is on a podium yet — the game is still running
    await expect(tv.locator('.podium-wrap')).toHaveCount(0);

    // Every player's cash is now their whole net worth, and shelves are empty
    const banked = await tv.evaluate(() => H.players.map(p => ({ name: p.name, coins: p.coins, lots: p.lots.length })));
    const adaBank = banked.find(p => p.name === 'Ada');
    expect(adaBank.lots).toBe(0);
    expect(adaBank.coins).toBeGreaterThan(0);

    // ── Round 2 opens, with the banked money intact ──
    await expect(tv.locator('.tv-meta')).toContainText('Round 2 of 2', { timeout: 30_000 });
    const round2Start = await tv.evaluate(() => ({
        round: H.round,
        coins: H.players.find(p => p.name === 'Ada').coins,
        // nothing from round 1 may come round again
        reused: H.lotOrder.filter(i => H.usedLots.has(i)).length === H.lotOrder.length,
    }));
    expect(round2Start.round).toBe(2);
    expect(round2Start.coins).toBe(adaBank.coins);
    await shot(tv, 'gavel-23-tv-round-two');

    // ── Only NOW does the podium arrive ──
    await tv.evaluate(() => { H.lotIndex = H.lotOrder.length - 1; });
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 40_000 });
    await tv.waitForTimeout(4600);
    await shot(tv, 'gavel-24-tv-podium-final');

    await Promise.all([tv, ada, bo].map(p => p.close()));
});

test('passed in: the auctioneer fishes all the way down and nobody bites', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const cy = await joinPhone(browser, code, 'Cy');
    await expect(cy.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const di = await joinPhone(browser, code, 'Di');
    await expect(tv.locator('.cxl-chip')).toHaveCount(2, { timeout: 20_000 });

    await cy.getByRole('button', { name: '1', exact: true }).click();
    await cy.waitForTimeout(250);
    await cy.getByRole('button', { name: /Start the auction/ }).click();
    await expect(tv.locator('.tv-lot')).toBeVisible({ timeout: 20_000 });

    // Wait for the ask, then watch him come down one rung for real
    await expect(tv.locator('.tv-price.asking')).toBeVisible({ timeout: 20_000 });
    const first = await tv.evaluate(() => ({ ask: H.bid.ladder[H.bid.askIdx], rungs: H.bid.ladder.length }));
    if (first.rungs > 1) {
        await tv.evaluate(() => { H.bid.endsAt = Date.now(); });     // hurry the wait along
        await expect.poll(() => tv.evaluate(() => H.bid && H.bid.drops), { timeout: 15_000 }).toBe(1);
        const second = await tv.evaluate(() => H.bid.ladder[H.bid.askIdx]);
        expect(second).toBeLessThan(first.ask);                      // he came DOWN
        await expect(tv.locator('#v-leader')).toContainText(/give me|how about|take|down to|say|make it/i);
        await shot(tv, 'gavel-30-tv-ask-dropped');
    }

    // Run the ladder out: nobody has bid, so the lot must be passed in
    await tv.evaluate(() => { H.bid.askIdx = H.bid.ladder.length - 1; H.bid.endsAt = Date.now(); });
    await expect(tv.locator('.tv-sold.passed .who')).toHaveText('PASSED IN', { timeout: 20_000 });
    await expect(tv.locator('.tv-sold .sub2')).toContainText('never made its reserve');
    // the card is staged — feather falls, PASSED IN stamps at .7s, the value lands at 1.7s
    await tv.waitForTimeout(2400);
    await shot(tv, 'gavel-31-tv-passed-in');
    await expect(cy.locator('text=PASSED IN')).toBeVisible({ timeout: 10_000 });

    // Nobody paid for it and nobody owns it
    const after = await tv.evaluate(() => ({
        shelves: H.players.reduce((s, p) => s + p.lots.length, 0),
        purses: H.players.map(p => p.coins),
    }));
    expect(after.shelves).toBe(0);
    expect(after.purses.every(c => c === 7000 || c > 0)).toBe(true);

    await Promise.all([tv, cy, di].map(p => p.close()));
});

test('phone-first: host phone + TV viewer, one bid takes the lot', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/goinggone.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'gavel-40-host-lobby');

    // ── TV joins as the auction floor ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open auction floor/ }).click();
    await expect(tv.locator('.cxl-code')).toHaveText(code, { timeout: 30_000 });

    // ── Jess joins, Neil opens the sale ──
    const jess = await joinPhone(browser, code, 'Jess');
    await expect(neil.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await neil.getByRole('button', { name: /Start the auction/ }).click();
    await expect(tv.locator('.tv-lot')).toBeVisible({ timeout: 20_000 });
    await forceCheapLots(neil);

    // Jess takes the auctioneer's ask and lets the gavel fall
    const price = await openBidding(jess, neil);
    await expect(jess.locator('text=You\'re winning this lot!')).toBeVisible({ timeout: 10_000 });
    await expect(tv.locator('.tv-sold')).toBeVisible({ timeout: 20_000 });
    await expect(tv.locator('.tv-sold .who')).toContainText('Jess');
    expect(price).toBeGreaterThan(0);
    await shot(tv, 'gavel-41-tv-viewer-sold');
    await shot(jess, 'gavel-42-phone-won');

    await Promise.all([tv, neil, jess].map(p => p.close()));
});
