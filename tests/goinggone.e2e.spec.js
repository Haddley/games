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

    // Ben takes the first rung on offer. The price is READ BACK rather than predicted: the
    // auctioneer splits the increment as the gavel falls, so the button can legitimately
    // re-render smaller between reading its label and clicking it.
    await ben.locator('#bid-btns .btn').first().click();
    await expect.poll(() => tv.evaluate(() => (H.bid && H.bid.price) || 0), { timeout: 10_000 })
        .toBeGreaterThan(opened);
    const afterBen = await tv.evaluate(() => H.bid.price);
    await expect(tv.locator('#v-price')).toHaveText(money(afterBen), { timeout: 10_000 });
    await expect(ben.locator('text=You\'re winning this lot!')).toBeVisible({ timeout: 10_000 });

    await shot(tv, 'gavel-08-tv-bidding');
    await shot(karen, 'gavel-09-phone-outbid');

    // Karen takes it back and holds on to the gavel
    await karen.locator('#bid-btns .btn').first().click();
    await expect.poll(() => tv.evaluate(() => (H.bid && H.bid.leaderId) ? H.players.find(p => p.id === H.bid.leaderId).name : null),
        { timeout: 10_000 }).toBe('Karen');
    const finalPrice = await tv.evaluate(() => H.bid.price);
    expect(finalPrice).toBeGreaterThan(opened);

    // ── Going… going… GONE! ──
    await expect(tv.locator('.tv-sold')).toBeVisible({ timeout: 30_000 });   // 5s gavel + 3x3s steps + 4.6s close
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

test('nobody can read another bidder\'s purse while the bidding is live', async ({ browser }) => {
    // Knowing somebody has $217 left tells you $220 takes it, which turns a guessing game into
    // an arithmetic one. So the exact figure never LEAVES THE HOST during a lot — not to the TV
    // and not to the phones, because hiding it client-side would leave it one console away, the
    // same reason mystery lots are withheld host-side.
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const ivy = await joinPhone(browser, code, 'Ivy');
    await expect(ivy.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const jon = await joinPhone(browser, code, 'Jon');
    await expect(tv.locator('.cxl-chip')).toHaveCount(2, { timeout: 20_000 });

    await ivy.getByRole('button', { name: '1', exact: true }).click();
    await ivy.waitForTimeout(250);
    await ivy.getByRole('button', { name: /Start the auction/ }).click();
    await expect(tv.locator('.tv-lot')).toBeVisible({ timeout: 20_000 });
    await forceCheapLots(tv);
    await openBidding(ivy, tv);                       // spend something, so the purses differ

    // what the host is actually willing to say about everyone, mid-lot
    const live = await tv.evaluate(() => ({
        viewer: viewerStateMsg().players,
        toJon: stateFor(H.players.find(p => p.name === 'Jon')).players,
        myCoins: stateFor(H.players.find(p => p.name === 'Jon')).myCoins,
        phase: H.phase,
    }));
    expect(['lot_intro', 'bidding', 'sold']).toContain(live.phase);
    for (const row of [...live.viewer, ...live.toJon]) {
        expect(row.coins, `${row.name}'s balance went over the wire during ${live.phase}`).toBeUndefined();
        expect(row.purse, `${row.name} has no purse band to show instead`).toBeTruthy();
        expect(row.lotCount, 'lots won should stay public — a paddle going up is not a secret').toBeGreaterThanOrEqual(0);
    }
    expect(live.myCoins, 'you must still be told your OWN purse').toBeGreaterThan(0);

    // and the TV shows the band rather than a number
    await expect(tv.locator('#v-rail .rpurse').first()).toBeVisible();
    expect(await tv.locator('#v-rail .rcoins').count()).toBe(0);
    await shot(tv, 'gavel-17-tv-purse-bands');

    // …but the reveal screens are the payoff and must show the real figures
    const shown = await tv.evaluate(() => {
        H.phase = 'banked';
        return viewerStateMsg().players.map(p => ({ coins: p.coins, purse: p.purse }));
    });
    for (const row of shown) {
        expect(row.coins, 'the banked board must show the real numbers').toBeGreaterThanOrEqual(0);
        expect(row.purse).toBeUndefined();
    }

    await Promise.all([tv, ivy, jon].map(p => p.close()));
});

test('he splits the increment rather than dropping the hammer', async ({ browser }) => {
    // A real auctioneer who cannot get another whole jump asks for less: "I'm bid five thousand,
    // will you give me five-two? Five-one?" So the smallest acceptable raise softens as the gavel
    // falls. Two halves, deliberately tested apart: the PHONE must re-offer at his reduced ask
    // (its own clock, no host involved), and the HOST must actually accept it (its own clock, no
    // click race). One test of both would have to SKEW the two clocks against each other — which
    // is precisely the situation the feature must not tolerate, and an earlier version of this
    // test did exactly that and failed, correctly.
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const gus = await joinPhone(browser, code, 'Gus');
    await expect(gus.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const hal = await joinPhone(browser, code, 'Hal');
    await expect(tv.locator('.cxl-chip')).toHaveCount(2, { timeout: 20_000 });

    await gus.getByRole('button', { name: '1', exact: true }).click();
    await gus.waitForTimeout(250);
    await gus.getByRole('button', { name: /Start the auction/ }).click();
    await expect(tv.locator('.tv-lot')).toBeVisible({ timeout: 20_000 });
    await forceCheapLots(tv);
    await openBidding(gus, tv);      // somebody must be bidding before there is anything to split

    // ── he comes down a step, and the phone re-offers at the new ask ──
    // The step is the HOST's, broadcast like any other state, so nothing here depends on two
    // clocks agreeing. Waiting it out for real would take SOFT_STEP_MS, so the window is simply
    // expired rather than slept through.
    const num = t => parseInt(String(t).replace(/[^0-9]/g, ''), 10);
    const full = num(await hal.locator('#bid-btns .btn').first().textContent());
    await tv.evaluate(() => { H.bid.endsAt = Date.now(); });
    await expect.poll(async () => num(await hal.locator('#bid-btns .btn').first().textContent()),
        { timeout: 6_000, message: 'the auctioneer never came down off his full jump' })
        .toBeLessThan(full);
    await expect(hal.locator('#bid-btns .btn.soft')).toBeVisible();
    expect(await tv.evaluate(() => H.bid.soft), 'the host should have stepped down').toBe(1);
    await shot(hal, 'gavel-14-phone-split-increment');

    // ── and he WAITS there, rather than running out the same gavel ──
    const waited = await tv.evaluate(() => H.bid.endsAt - Date.now());
    expect(waited, 'he came down and gave nobody time to answer').toBeGreaterThan(1500);

    // ── the host takes his reduced ask, and refuses anything under it ──
    const host = await tv.evaluate(() => {
        const p = H.players.find(x => x.name === 'Hal');
        const price = H.bid.price;
        const fullRung = raisesFor(price)[0];
        const ask = softMinRaise(price, H.bid.soft);
        hostBid(p, Math.max(1, Math.floor(ask / 4)));          // under his standing ask
        const refused = H.bid.price === price;
        hostBid(p, ask);                                       // …and exactly it
        return { fullRung, ask, refused, took: H.bid.price - price, resetTo: H.bid.soft };
    });
    expect(host.ask, 'he never came down').toBeLessThan(host.fullRung);
    expect(host.refused, 'the host took a bid below his standing ask').toBe(true);
    expect(host.took, 'the host refused his own reduced ask').toBe(host.ask);
    expect(host.resetTo, 'a bid should put him back to the full jump').toBe(0);

    await Promise.all([tv, gus, hal].map(p => p.close()));
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
    await expect(tv.locator('.tv-sold')).toBeVisible({ timeout: 30_000 });
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
    await expect(tv.locator('.tv-sold')).toBeVisible({ timeout: 30_000 });
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
    await expect(tv.locator('.tv-sold.passed .who')).toHaveText('PASSED IN', { timeout: 30_000 });
    await expect(tv.locator('.tv-sold .sub2')).toContainText('never made its reserve');
    // the card is staged — feather falls, PASSED IN stamps at .7s, the value lands at 1.7s
    await tv.waitForTimeout(2400);
    await shot(tv, 'gavel-31-tv-passed-in');
    // the phone's own card, named precisely: the auctioneer's speech bubble carries the words
    // "Passed in" too, and a loose text= matcher now resolves to both
    await expect(cy.locator('.sold-card .st')).toHaveText('PASSED IN', { timeout: 10_000 });

    // Nobody paid for it and nobody owns it
    const after = await tv.evaluate(() => ({
        shelves: H.players.reduce((s, p) => s + p.lots.length, 0),
        purses: H.players.map(p => p.coins),
    }));
    expect(after.shelves).toBe(0);
    expect(after.purses.every(c => c === 7000 || c > 0)).toBe(true);

    await Promise.all([tv, cy, di].map(p => p.close()));
});

test('the last valuation card is revealed once, not twice', async ({ browser }) => {
    // The host sends one more state after the final reveal, to hold the screen before the
    // standings. The viewer used to re-render on it, rebuilding the last card with its `live`
    // class — and that entrance is staged in CSS and not gated on #app.fresh, so the whole reveal
    // played a second time. On a TV it read as the last lot being sold twice.
    //
    // Driven straight through applyViewerMsg: no PeerJS, no waiting out a real auction, and it
    // pins the exact frame that was wrong.
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    const result = await tv.evaluate(() => {
        const reveals = [
            { player: 'Ada', color: '#e8b75a', paddle: 42, lotName: 'A Canoe', emoji: '🛶', img: null, wasMystery: false, src: 'x', on: '2026-07-01', paid: 100, value: 159, profit: 59 },
            { player: 'Bo', color: '#22d3ee', paddle: 77, lotName: 'A Kayak', emoji: '🛶', img: null, wasMystery: false, src: 'x', on: '2026-07-01', paid: 90, value: 108, profit: 18 },
        ];
        const msg = i => ({
            type: 'viewer_state', phase: 'valuation', roomCode: 'TEST', round: 1, rounds: 1,
            lotNum: 2, lotTotal: 2, lot: null, bid: null, soldInfo: null,
            players: [{ name: 'Ada', color: '#e8b75a', paddle: 42, coins: 100, lotCount: 1 },
                      { name: 'Bo', color: '#22d3ee', paddle: 77, coins: 90, lotCount: 1 }],
            reveals, revealIndex: i, standings: null, awards: null, winner: null,
            tvHost: false, captain: null,
        });
        isViewer = true;
        applyViewerMsg(msg(0));
        applyViewerMsg(msg(1));
        // stamp the live card so we can tell whether the next message rebuilds it
        const live = document.querySelector('.val-card.live');
        if (!live) return { error: 'no live card after the last reveal' };
        live.dataset.stamp = 'original';
        const nameAfterLast = live.querySelector('.vname').textContent.trim();
        // …the extra state the host sends once the reveals have run out
        applyViewerMsg(msg(2));
        const after = document.querySelector('.val-card.live');
        return {
            nameAfterLast,
            survived: !!(after && after.dataset.stamp === 'original'),
            stillLive: !!after,
            liveCount: document.querySelectorAll('.val-card.live').length,
        };
    });
    expect(result.error).toBeUndefined();
    expect(result.nameAfterLast).toBe('A Kayak');
    expect(result.stillLive).toBe(true);
    expect(result.liveCount).toBe(1);
    expect(result.survived, 'the final card was rebuilt and replayed its whole reveal').toBe(true);
    await tv.close();
});

test('the auctioneer sums up the round, from what actually happened', async ({ browser }) => {
    // Commentary is generated on the host from the standings and the round's own reveals, so it
    // has to name the real best bargain and the real disaster — a generic line would be worthless.
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    const lines = await tv.evaluate(() => {
        const rows = [
            { name: 'Ada', color: '#e8b75a', paddle: 42, coins: 3100, shelf: 6200, net: 9300, lots: 3 },
            { name: 'Cy', color: '#4ade80', paddle: 13, coins: 7000, shelf: 0, net: 7000, lots: 0 },
            { name: 'Bux', color: '#22d3ee', paddle: 77, coins: 5400, shelf: 900, net: 6300, lots: 1 },
        ];
        const reveals = [
            { player: 'Ada', paddle: 42, lotName: 'a Zamboni', paid: 9000, value: 45900, profit: 36900 },
            { player: 'Bux', paddle: 77, lotName: 'one Bowling Pin', paid: 900, value: 21, profit: -879 },
        ];
        return {
            round: commentaryFor(rows, reveals, false),
            final: commentaryFor(rows, reveals, true),
            spoken: commentarySpoken({ commentary: commentaryFor(rows, reveals, false) }),
            none: commentaryFor([], [], false),
        };
    });
    const roundText = lines.round.map(l => l.text).join(' | ');
    expect(roundText).toContain('Ada');            // the leader, by name and paddle
    expect(roundText).toContain('42');
    expect(roundText).toContain('Zamboni');        // the real steal of the round
    expect(roundText).toContain('Bowling Pin');    // and the real disaster
    expect(roundText).toContain('Cy');             // who never lifted their paddle
    expect(lines.final.map(l => l.text).join(' ')).toMatch(/takes it/);
    expect(lines.none).toEqual([]);                // no players, no commentary, no crash

    // Spoken lines use PADDLE NUMBERS, never names, and start with a capital
    expect(lines.spoken).toMatch(/number forty-two/i);   // the paddle, not the person
    expect(lines.spoken).not.toContain('Ada');
    expect(lines.spoken).not.toContain('Bux');
    expect(lines.spoken[0]).toBe(lines.spoken[0].toUpperCase());   // each line is a sentence

    // …and it reaches the screen on both the banked board and the podium
    for (const phase of ['banked', 'podium']) {
        await tv.evaluate(([phase, commentary]) => {
            isViewer = true;
            applyViewerMsg({
                type: 'viewer_state', phase, roomCode: 'TEST', round: 1, rounds: 2,
                lotNum: 1, lotTotal: 1, lot: null, bid: null, soldInfo: null, reveals: null, revealIndex: -1,
                players: [], standings: [
                    { name: 'Ada', color: '#e8b75a', paddle: 42, coins: 3100, shelf: 6200, net: 9300, lots: 3 },
                    { name: 'Bux', color: '#22d3ee', paddle: 77, coins: 5400, shelf: 900, net: 6300, lots: 1 },
                ],
                awards: [], winner: 'Ada', commentary, tvHost: false, captain: null,
            });
        }, [phase, lines.round]);
        await expect(tv.locator('.cline').first()).toBeVisible({ timeout: 5000 });
        expect(await tv.locator('.cline').count(), `${phase} dropped the commentary`).toBe(lines.round.length);
    }
    await tv.close();
});

test('the auctioneer stands on the TV only, and his mouth follows the speech', async ({ browser }) => {
    // He is mounted OUTSIDE #app, whose innerHTML is replaced on every render — a head rebuilt
    // mid-sentence would drop its talking class every time a bid landed. And he is the TV's:
    // ten phones each with their own auctioneer is not a joke that lands.
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html?mode=tvsimulation&players=3&rounds=1&lots=2');
    await expect(tv.locator('#auctioneer')).toBeVisible({ timeout: 20_000 });
    expect(await tv.evaluate(() => document.querySelector('#auctioneer').closest('#app'))).toBeNull();

    // he must not sit on top of anything the layout drew — the TV shell reserves him a band
    const clash = await tv.evaluate(() => {
        const a = document.querySelector('#auctioneer').getBoundingClientRect();
        return [...document.querySelectorAll('.tv-lot, .rail-row, .bank-row, .pod, .val-card')]
            .filter(e => { const b = e.getBoundingClientRect(); return b.bottom > a.top && b.left < a.right && b.right > a.left; })
            .map(e => e.className);
    });
    expect(clash, 'the auctioneer is standing on the layout').toEqual([]);

    // the mouth is driven by the utterance's own start/end, not a timer
    expect(await tv.evaluate(() => { auctTalk(true); return document.querySelector('#auctioneer').classList.contains('talking'); })).toBe(true);
    expect(await tv.evaluate(() => { auctTalk(false); return document.querySelector('#auctioneer').classList.contains('talking'); })).toBe(false);

    // …and the SHAPE of it comes from the words. The first version flapped at a fixed rate, so
    // "SOLD!" and a hundred-and-fifty-three-thousand looked identical — which is what a fixed
    // keyframe loop always looks like. The plan must differ per line, scale with length, and
    // close the mouth at punctuation.
    const mouth = await tv.evaluate(() => {
        const plan = t => planMouth(t, 1.28);
        const shape = t => plan(t).map(s => s.open).join(',');
        const ms = t => plan(t).reduce((a, s) => a + s.dur, 0);
        return {
            sold: shape('SOLD!'), ask: shape("Who'll start me at eight thousand five hundred?"),
            shortMs: ms('SOLD!'), longMs: ms('Number forty-two leads, on nine thousand three hundred.'),
            closesAtStop: plan('Passed in. No sale.').some(s => s.open === 0),
            noStopNoClose: plan('going going gone').every(s => s.open > 0),
            openness: new Set(plan("Who'll start me at eight thousand five hundred?").map(s => s.open)).size,
        };
    });
    expect(mouth.sold).not.toBe(mouth.ask);                    // different words, different mouth
    expect(mouth.longMs).toBeGreaterThan(mouth.shortMs * 3);   // and it scales with the line
    expect(mouth.closesAtStop, 'the mouth should shut at a full stop').toBe(true);
    expect(mouth.noStopNoClose, 'nothing to close for, so it should not').toBe(true);
    expect(mouth.openness, 'every syllable opened the same amount — that is a metronome')
        .toBeGreaterThan(1);
    // …and the arm swings on the real hammer blow
    expect(await tv.evaluate(() => { auctBang(); return document.querySelector('#auctioneer').classList.contains('bang'); })).toBe(true);

    // a PHONE gets no auctioneer of its own
    const phone = await browser.newPage({ viewport: PHONE });
    await phone.goto('/goinggone.html');
    await expect(phone.locator('#auctioneer')).toBeHidden();
    await Promise.all([tv.close(), phone.close()]);
});

test('a silenced auctioneer says so, and one tap fixes him', async ({ browser }) => {
    // A browser will not speak on a page nobody has interacted with, and a television is exactly
    // that page — the attract mode runs for hours and nobody clicks it. Measured: 14 lines handed
    // to the engine before any click, 0 started, every one refused "not-allowed"; one click and
    // they play. There is no way around the policy, so the fix is to stop it being a mystery.
    //
    // The refusal is NOT reproducible on demand headlessly (the same page refused in one run and
    // spoke freely in the next), so this drives the mechanism rather than hoping for the gate.
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html?mode=tvsimulation&players=3&rounds=1&lots=2');
    await expect(tv.locator('#auctioneer')).toBeVisible({ timeout: 20_000 });

    await tv.evaluate(() => voiceHint(true));
    await expect(tv.locator('#voice-hint')).toBeVisible();
    await expect(tv.locator('#voice-hint')).toContainText(/tap/i);

    // …and any touch of the screen clears it, because that touch is what unblocks him
    await tv.mouse.click(960, 540);
    await expect(tv.locator('#voice-hint')).toHaveCount(0, { timeout: 5_000 });

    // it is idempotent, and a successful start clears it too
    await tv.evaluate(() => { voiceHint(true); voiceHint(true); });
    expect(await tv.locator('#voice-hint').count()).toBe(1);
    await tv.evaluate(() => voiceHint(false));
    expect(await tv.locator('#voice-hint').count()).toBe(0);

    // a PHONE never shows it — the voice was never its business
    const phone = await browser.newPage({ viewport: PHONE });
    await phone.goto('/goinggone.html');
    await phone.evaluate(() => { mountAuctioneer(); voiceHint(true); });
    await expect(phone.locator('#voice-hint')).toBeHidden();
    await Promise.all([tv.close(), phone.close()]);
});

test('a screen with no speech voices says so, and then stops saying it', async ({ browser }) => {
    // WebAudio and Web Speech are separate subsystems with separate gates, which is how a TV can
    // play music and stingers happily while the auctioneer stays mute — one working tells you
    // nothing about the other. Smart-TV browsers routinely ship no voices at all.
    const tv = await browser.newPage({ viewport: TV });
    await tv.addInitScript(() => { window.speechSynthesis.getVoices = () => []; });
    await tv.goto('/goinggone.html?mode=tvsimulation&players=3&rounds=1&lots=2');

    await expect(tv.locator('#voice-hint')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('#voice-hint')).toContainText(/no speech voices/i);
    expect(await tv.evaluate(() => voiceDiag().voicesInstalled)).toBe(0);

    // …and then it goes away. "Tap the screen" earns a permanent banner because tapping fixes it;
    // "this browser cannot" does not, and an attract screen runs for hours.
    await expect(tv.locator('#voice-hint')).toHaveCount(0, { timeout: 20_000 });

    // the game is entirely playable without him: his patter is on the screen either way
    await expect(tv.locator('#v-leader, .tv-waiting, .lkick').first()).toBeVisible();
    await tv.close();
});

test('any screen may speak, and a TV that JOINS an auction speaks too', async ({ browser }) => {
    // "…or show an existing auction" is a second way a television reaches the room, and it must
    // get a voice like any other. The 🗣️ toggle decides on every device; it merely defaults off
    // on a phone, because five phones and a telly calling the same lot a beat apart is bedlam.
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    // a SECOND television, arriving by the viewer route rather than by hosting
    const tv2 = await browser.newPage({ viewport: TV });
    await tv2.goto('/goinggone.html');
    await tv2.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv2.getByRole('button', { name: /Open auction floor/ }).click();
    await expect(tv2.locator('.cxl-code')).toHaveText(code, { timeout: 30_000 });
    expect(await tv2.evaluate(() => ({ isViewer, voiceOn: voiceOn(), canSpeak: canSpeak() })))
        .toEqual({ isViewer: true, voiceOn: true, canSpeak: true });

    // a phone is silent by default…
    const phone = await joinPhone(browser, code, 'Kit');
    await expect(phone.locator('.player-row').first()).toBeVisible({ timeout: 30_000 });
    expect(await phone.evaluate(() => voiceOn()), 'a phone should not chant unasked').toBe(false);

    // …but may be told to speak, and remembers being told
    await phone.evaluate(() => toggleVoice());
    expect(await phone.evaluate(() => ({ voiceOn: voiceOn(), canSpeak: canSpeak() })))
        .toEqual({ voiceOn: true, canSpeak: true });
    await expect(phone.locator('#tog-voice')).not.toHaveClass(/off/);

    // and a television may be told to shut up
    await tv2.evaluate(() => toggleVoice());
    expect(await tv2.evaluate(() => ({ voiceOn: voiceOn(), canSpeak: canSpeak() })))
        .toEqual({ voiceOn: false, canSpeak: false });
    await expect(tv2.locator('#tog-voice')).toHaveClass(/off/);

    await Promise.all([tv, tv2, phone].map(p => p.close()));
});

test('he says it in writing too, especially where he cannot say it aloud', async ({ browser }) => {
    // The speech bubble is not decoration: on a Fire TV, where Web Speech does not exist at all,
    // it IS the auctioneer's performance. So it must fill on every line regardless of whether the
    // device can speak — which is why bubble() runs before the canSpeak() gate, not after it.
    const tv = await browser.newPage({ viewport: TV });
    await tv.addInitScript(() => {
        // a browser with no speech synthesis whatsoever, which is the case that matters
        Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    });
    await tv.goto('/goinggone.html?mode=tvsimulation&players=3&rounds=1&lots=2');
    await expect(tv.locator('#auctioneer')).toBeVisible({ timeout: 20_000 });
    expect(await tv.evaluate(() => canSpeak()), 'this test is pointless if it can speak').toBe(false);

    await tv.evaluate(() => say("Who'll start me at eight thousand five hundred?"));
    await expect(tv.locator('#auct-bubble')).toBeVisible();
    await expect(tv.locator('#auct-bubble')).toHaveClass(/on/);        // actually showing, not just present
    await expect(tv.locator('#auct-bubble')).toContainText('eight thousand five hundred');
    await expect.poll(() => tv.evaluate(() => getComputedStyle(document.querySelector('#auct-bubble')).opacity),
        { timeout: 3000, message: 'the bubble never faded in' }).toBe('1');
    // …and he mouths it, rather than standing frozen under a speech bubble
    await expect(tv.locator('#auctioneer.talking')).toBeVisible();

    const box = await tv.evaluate(() => {
        const b = document.querySelector('#auct-bubble').getBoundingClientRect();
        const a = document.querySelector('#auctioneer').getBoundingClientRect();
        return { bw: b.width, bh: b.height, ah: a.height, gap: b.left - a.right, right: innerWidth - b.right,
                 overflows: document.querySelector('#auct-bubble').scrollHeight > document.querySelector('#auct-bubble').clientHeight + 2 };
    });
    expect(box.bw, 'it should take the width it can get').toBeGreaterThan(1200);
    expect(box.right, 'and leave a margin on the right').toBeGreaterThan(20);
    expect(box.gap, 'it must not sit on top of him').toBeGreaterThan(0);
    expect(box.bh).toBeGreaterThan(box.ah * 0.5);      // roughly his height
    expect(box.overflows, 'text overflowed the bubble').toBe(false);

    // a long line sets itself smaller rather than spilling
    await tv.evaluate(() => say('Number forty-two paid nine thousand for something worth forty-five thousand nine hundred. Daylight robbery. And number seventy-seven gave nine hundred for a thing worth twenty-one.'));
    await tv.waitForTimeout(200);
    expect(await tv.evaluate(() => document.querySelector('#auct-bubble').scrollHeight
        > document.querySelector('#auct-bubble').clientHeight + 2), 'a long line overflowed').toBe(false);
    await shot(tv, 'gavel-18-tv-speech-bubble');

    // it stands clear of everything the layout drew, like the auctioneer himself
    const clash = await tv.evaluate(() => {
        const b = document.querySelector('#auct-bubble').getBoundingClientRect();
        return [...document.querySelectorAll('.tv-lot, .rail-row, .bank-row, .pod, .val-card')]
            .filter(e => { const r = e.getBoundingClientRect(); return r.bottom > b.top && r.left < b.right && r.right > b.left; })
            .map(e => e.className);
    });
    expect(clash, 'the bubble is covering the layout').toEqual([]);

    // …and a phone never shows one
    const phone = await browser.newPage({ viewport: PHONE });
    await phone.goto('/goinggone.html');
    await phone.evaluate(() => { mountAuctioneer(); bubble('anything at all'); });
    await expect(phone.locator('#auct-bubble')).toBeHidden();
    await Promise.all([tv.close(), phone.close()]);
});

test('the running totals stay shut until every lot has been valued', async ({ browser }) => {
    // A net worth ticking up beside the reveals gives the ending away — you can see who has won
    // long before the last card turns over, so the reveal the whole round builds to lands on a
    // room that already knows. Driven straight through applyViewerMsg, one reveal at a time.
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    const at = (i) => tv.evaluate(idx => {
        isViewer = true;
        const reveals = [
            { player: 'Ada', color: '#e8b75a', paddle: 42, lotName: 'A Canoe', emoji: '🛶', img: null, wasMystery: false, src: 'x', on: '2026-07-01', paid: 100, value: 4159, profit: 4059 },
            { player: 'Bo', color: '#22d3ee', paddle: 77, lotName: 'A Kayak', emoji: '🛶', img: null, wasMystery: false, src: 'x', on: '2026-07-01', paid: 90, value: 108, profit: 18 },
        ];
        _vLotKey = ''; _vRevealIdx = -2;
        applyViewerMsg({
            type: 'viewer_state', phase: 'valuation', roomCode: 'T', round: 1, rounds: 1,
            lotNum: 2, lotTotal: 2, lot: null, bid: null, soldInfo: null,
            players: [{ name: 'Ada', color: '#e8b75a', paddle: 42, coins: 900, lotCount: 1 },
                      { name: 'Bo', color: '#22d3ee', paddle: 77, coins: 6910, lotCount: 1 }],
            reveals, revealIndex: idx, standings: null, awards: null, winner: null, commentary: null,
            tvHost: false, captain: null,
        });
        const rail = document.querySelector('.tv-rail');
        return { title: rail.querySelector('.rail-title').textContent,
                 text: rail.textContent, coins: rail.querySelectorAll('.rcoins').length };
    }, i);

    // …part way through: no figures at all, just what is left to come
    const mid = await at(0);
    expect(mid.title).toBe('Still to be valued');
    expect(mid.coins, 'a total was shown mid-valuation').toBe(0);
    expect(mid.text).toContain('to value');
    expect(mid.text, 'a net worth leaked').not.toMatch(/5,059|6,910|900/);

    // …and once the last card is done, the totals arrive
    const done = await at(2);
    expect(done.title).toBe('Net worth');
    expect(done.coins).toBe(2);
    expect(done.text).toContain('5,059');      // Ada: 900 + 4,159
    expect(done.text).toContain('7,018');      // Bo:  6,910 + 108
    await tv.close();
});

test('switching the voice on SPEAKS inside the tap, which is what iOS demands', async ({ browser }) => {
    // iOS Safari grants permission to speak once, and only from inside a user gesture. Every line
    // this game says arrives later from a network message, so if the toggle merely sets a flag,
    // permission is never obtained and the auctioneer is mute for good — which is exactly what
    // Neil saw on his iPhone while the same build worked on his laptop.
    const phone = await browser.newPage({ viewport: PHONE });
    await phone.addInitScript(() => {
        window.__spoke = [];
        const s = window.speechSynthesis, real = s.speak.bind(s);
        s.speak = u => { window.__spoke.push({ text: u.text, vol: u.volume }); real(u); };
    });
    await phone.goto('/goinggone.html');

    // the very first tap anywhere buys the permission, silently
    await phone.mouse.click(195, 400);
    await expect.poll(() => phone.evaluate(() => window.__spoke.length), { timeout: 3000 })
        .toBeGreaterThan(0);
    const primer = await phone.evaluate(() => window.__spoke[0]);
    expect(primer.vol, 'the primer must be silent').toBe(0);

    // …and turning the voice on says something audible, in the same tick as the tap
    await phone.evaluate(() => { window.__spoke = []; toggleVoice(); });
    const said = await phone.evaluate(() => window.__spoke);
    expect(said.length, 'the toggle set a flag and spoke nothing — iOS will never unlock').toBe(1);
    expect(said[0].vol).toBeGreaterThan(0);
    expect(said[0].text).toMatch(/right then/i);

    // switching it off again says nothing at all
    await phone.evaluate(() => { window.__spoke = []; toggleVoice(); });
    expect(await phone.evaluate(() => window.__spoke.length)).toBe(0);
    expect(await phone.evaluate(() => voiceOn())).toBe(false);
    await phone.close();
});

test('the attract mode takes its settings from the query string', async ({ browser }) => {
    // ?mode=tvsimulation&players=3&rounds=3 should be exactly that: three bidders, three banked
    // rounds. It used to hardcode two rounds and ignore the parameter. The rounds MECHANIC is
    // covered by its own spec above — this only checks the wiring, so it stays fast.
    const tv = await browser.newPage({ viewport: TV });
    const errs = [];
    tv.on('pageerror', e => errs.push(e.message));
    await tv.goto('/goinggone.html?mode=tvsimulation&players=3&rounds=3&lots=4');
    await tv.waitForTimeout(1200);
    expect(await tv.evaluate(() => ({
        players: H.players.length, rounds: H.settings.rounds, lotsPer: H.settings.lotsPer,
    }))).toEqual({ players: 3, rounds: 3, lotsPer: 4 });
    // and the defaults still apply when nothing is asked for
    await tv.goto('/goinggone.html?mode=tvsimulation');
    await tv.waitForTimeout(1200);
    expect(await tv.evaluate(() => ({ players: H.players.length, rounds: H.settings.rounds })))
        .toEqual({ players: 4, rounds: 2 });
    expect(errs).toEqual([]);
    await tv.close();
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
    await expect(tv.locator('.tv-sold')).toBeVisible({ timeout: 30_000 });
    await expect(tv.locator('.tv-sold .who')).toContainText('Jess');
    expect(price).toBeGreaterThan(0);
    await shot(tv, 'gavel-41-tv-viewer-sold');
    await shot(jess, 'gavel-42-phone-won');

    await Promise.all([tv, neil, jess].map(p => p.close()));
});
