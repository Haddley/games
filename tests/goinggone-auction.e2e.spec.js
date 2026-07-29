// Going, Going, GONE! — the AUCTIONEER, end to end.
//
// The other spec (goinggone.e2e.spec.js) proves the game works. This one asks whether it is any
// FUN, which in an auction means one thing: the timing. Three players play three real rounds over
// real PeerJS while the host records a transcript of every beat — what he asked for, how long he
// gave the room to answer, what the phones were offered, and what he actually said — and the
// assertions are made against that transcript rather than against the constants.
//
// The rules it enforces are written up in goinggone-rules.md §3. In short:
//   · no decision window is ever under MIN_DECIDE_MS
//   · he only ever ACCELERATES while the room stays quiet
//   · a bid buys back the longest window on the board
//   · the close is two announced beats and bids still count in them
//   · a lot nobody wants is the FASTEST thing in the game, not the longest
//
// Slow on purpose — the windows are the subject, so they are not shortened. ~3 minutes.
//
// Run:  npx playwright test tests/goinggone-auction.e2e.spec.js

const { test, expect } = require('@playwright/test');
const fs = require('fs');

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';

test.describe.configure({ retries: 1 });

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/goinggone.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

// Everything the room experienced, recorded on the host. openWindow() is the single place a beat
// begins (a unit test enforces that), so wrapping it captures the whole schedule; wrapping say()
// captures the commentary, including the lines a silent TV would only ever print.
async function recordAuction(tv) {
    await tv.evaluate(() => {
        window.__beats = [];
        window.__said = [];
        const realOpen = openWindow;
        window.openWindow = ms => {
            const b = H.bid || {};
            window.__beats.push({
                t: Date.now(), ms, lot: H.lotIndex, round: H.round,
                price: b.price || 0, ask: b.price === 0 ? b.ladder[b.askIdx] : 0,
                askIdx: b.askIdx || 0, soft: b.soft || 0, closing: b.closing || 0,
                // the beat's NAME, which is what the rules document talks in
                kind: b.closing ? 'close' : b.price === 0 ? (b.askIdx ? 'drop' : 'open') : (b.soft ? 'soften' : 'bid'),
            });
            return realOpen(ms);
        };
        const realSay = say;
        window.say = (text, opts) => { window.__said.push({ t: Date.now(), text, rate: (opts || {}).rate || 1 }); return realSay(text, opts); };
    });
}
const beats = tv => tv.evaluate(() => window.__beats);
const said = tv => tv.evaluate(() => window.__said);

// Cheap lots keep three starting purses able to afford whatever is drawn.
const forceCheapLots = tv => tv.evaluate(() => {
    const cheap = LOTS.map((l, i) => [l.value, i]).filter(([v]) => v >= 20 && v <= 200).map(([, i]) => i);
    H.lotOrder = H.lotOrder.map((_, n) => cheap[(n * 7 + 3) % cheap.length]);
    H.mysteryLots = new Set();
});

// Take the auctioneer's ask on `phone` as soon as it is offered.
async function takeTheAsk(phone, tv) {
    const btn = phone.getByRole('button', { name: /Start it at/ });
    await expect(btn).toBeEnabled({ timeout: 25_000 });
    await btn.click();
    await expect.poll(() => tv.evaluate(() => H.bid && H.bid.price), { timeout: 15_000 }).toBeGreaterThan(0);
}

test('three players, three rounds: the auctioneer keeps to his own schedule', async ({ browser }) => {
    test.setTimeout(420_000);
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── the room ──
    const tv = await browser.newPage({ viewport: TV });
    // A thrown handler on the host is silent from the outside — the screen simply stops changing —
    // so surface it rather than debugging a timeout that has nothing to do with the timeout.
    const crashes = [];
    tv.on('pageerror', e => crashes.push(String(e)));
    await tv.goto('/goinggone.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const ada = await joinPhone(browser, code, 'Ada');
    await expect(ada.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const bo = await joinPhone(browser, code, 'Bo');
    const cy = await joinPhone(browser, code, 'Cy');
    await expect(tv.locator('.cxl-chip')).toHaveCount(3, { timeout: 30_000 });

    // Three rounds, shortest sale — the rounds are the point, the lot count is not.
    await ada.getByRole('button', { name: 'Short', exact: true }).click();
    await ada.waitForTimeout(250);
    await ada.getByRole('button', { name: '3', exact: true }).click();
    await ada.waitForTimeout(250);
    expect(await tv.evaluate(() => H.settings.rounds)).toBe(3);

    await ada.getByRole('button', { name: /Start the auction/ }).click();
    await expect(tv.locator('.tv-lot')).toBeVisible({ timeout: 25_000 });
    await forceCheapLots(tv);
    await recordAuction(tv);

    // Every paddle is a different number — he sells to the number, never the name.
    const paddles = await tv.evaluate(() => H.players.map(p => p.paddle));
    expect(new Set(paddles).size).toBe(3);

    // ═══ ROUND 1, LOT 1 — nobody bids. He fishes all the way down and passes it in. ═══
    const passStart = Date.now();
    await expect(tv.locator('.tv-sold')).toBeVisible({ timeout: 60_000 });
    await expect(tv.locator('.tv-sold')).toContainText(/PASSED IN|NO SALE/i);
    const passedMs = Date.now() - passStart;
    await tv.screenshot({ path: `${SHOTS}/auction-01-passed-in.png` });

    const fishing = (await beats(tv)).filter(b => b.kind === 'open' || b.kind === 'drop');
    expect(fishing.length, 'he must come down more than once before giving up').toBeGreaterThan(2);

    // …and he came down each time, never up
    const asks = fishing.map(b => b.ask);
    for (let i = 1; i < asks.length; i++) expect(asks[i], `ask ${i} went the wrong way`).toBeLessThan(asks[i - 1]);

    // …quicker each time. This is the impatience the whole phase is made of.
    for (let i = 1; i < fishing.length; i++) {
        expect(fishing[i].ms, `unanswered ask ${i} is not quicker than the one before`).toBeLessThan(fishing[i - 1].ms);
    }

    // The dullest outcome is not allowed to be the longest. It used to take 38 seconds.
    expect(passedMs, `a lot nobody wanted took ${Math.round(passedMs / 1000)}s`).toBeLessThan(32_000);

    // He said something in every one of those windows — a silent bar is a frozen screen.
    const lines = await said(tv);
    expect(lines.length, 'the fishing phase went quiet').toBeGreaterThanOrEqual(fishing.length);
    expect(lines.some(l => /passed in|no sale|no takers|not a bid/i.test(l.text)), 'he never said it was passed in').toBe(true);

    // ═══ ROUND 1, LOT 2 — Ada opens, Bo and Cy fight, and it closes properly. ═══
    await expect(tv.locator('#v-price')).toBeVisible({ timeout: 30_000 });
    const mark = (await beats(tv)).length;
    await takeTheAsk(ada, tv);

    // A bid buys back the longest window on the board, every time.
    const afterBid = (await beats(tv))[mark];
    expect(afterBid.kind).toBe('bid');
    const gavelMs = afterBid.ms;

    // Bo raises, then Cy raises — each of them buying a full window back.
    for (const p of [bo, cy]) {
        const raise = p.locator('.bid-btns .btn-p:not([disabled])').first();
        await expect(raise).toBeVisible({ timeout: 20_000 });
        await raise.click();
        await tv.waitForTimeout(400);
    }
    await tv.screenshot({ path: `${SHOTS}/auction-02-bidding-war.png` });
    await bo.screenshot({ path: `${SHOTS}/auction-03-phone-options.png` });

    // ONE way to bid, and it is the auctioneer's own number. A rostrum has no menu: your paddle
    // goes up at the price he called or it does not.
    const offered = await bo.evaluate(() =>
        [...document.querySelectorAll('.bid-btns .btn-p')].map(b => +(b.getAttribute('onclick').match(/-?\d+/) || [0])[0]));
    expect(offered.length, 'the phone is offering a menu again').toBe(1);
    expect(offered[0], 'the one button is not his standing ask')
        .toBe(await tv.evaluate(() => softMinRaise(H.bid.price, H.bid.soft || 0)));

    // Now everyone sits on their hands: he softens his ask, step by step, then closes.
    await expect(tv.locator('.tv-sold')).toBeVisible({ timeout: 60_000 });
    await expect(tv.locator('.tv-sold')).toContainText(/SOLD/i);
    await tv.screenshot({ path: `${SHOTS}/auction-04-sold.png` });

    const all = await beats(tv);
    const softens = all.filter(b => b.kind === 'soften' && b.lot === all[mark].lot);
    const closes = all.filter(b => b.kind === 'close' && b.lot === all[mark].lot);

    // He asks for less rather than dropping the hammer…
    expect(softens.length, 'he never came off the full increment').toBeGreaterThan(0);
    for (let i = 1; i < softens.length; i++) {
        expect(softens[i].ms, 'a reduced ask must come quicker than the one before it').toBeLessThan(softens[i - 1].ms);
    }
    // …and then closes in two announced beats, not one window with a changing caption.
    expect(closes.map(c => c.closing)).toEqual([1, 2]);
    expect(closes[0].ms).toBe(closes[1].ms);
    expect(closes[0].ms).toBeLessThan(gavelMs);

    // HE NEVER SAYS "GOING" AND THEN CUTS HIS ASK. Fair warning is a warning he intends to keep,
    // so it may not be uttered while there is still a cheaper rung to call — otherwise the room
    // learns the word means nothing. Every fair-warning line must therefore land after the last
    // time he came down on this lot. (Coming down has its OWN line, at the moment it happens.)
    const lastSoften = softens.length ? softens[softens.length - 1].t : all[mark].t;
    const heard = await said(tv);
    const warnings = heard.filter(l => /fair warning|all done|all through|last call|anybody else/i.test(l.text));
    for (const w of warnings) {
        if (w.t < all[mark].t) continue;                         // an earlier lot's warning
        expect(w.t, `"${w.text}" was said while he still had a cheaper ask to call`)
            .toBeGreaterThanOrEqual(lastSoften);
    }
    // …and coming down is announced where it happens, rather than in silence
    if (softens.length) {
        const splits = heard.filter(l => l.t >= all[mark].t && /i'll take|i'll come down|won't you give|don't lose it|who'll give me/i.test(l.text));
        expect(splits.length, 'he came down and said nothing about it').toBeGreaterThan(0);
    }

    // The lines everybody knows were actually spoken, in order, and separately.
    const spoken = heard.map(l => l.text.toLowerCase());
    const once = spoken.findIndex(t => /going once|^once/.test(t));
    const twice = spoken.findIndex(t => /going twice|^twice/.test(t));
    expect(once, 'nobody said "going once"').toBeGreaterThanOrEqual(0);
    expect(twice, 'nobody said "going twice"').toBeGreaterThan(once);

    // He sold to a paddle NUMBER, not to a name — no player's name is ever spoken. The call is
    // held back to SOLD_STAMP_MS so it lands with the stamp, so wait for the stamp rather than
    // racing it, and then for the utterance.
    await expect(tv.locator('.tv-sold .who')).toBeVisible({ timeout: 10_000 });
    const heardHammer = () => tv.evaluate(() => window.__said.some(l => /sold|gone|hammer/i.test(l.text)));
    for (let i = 0; i < 40 && !(await heardHammer()); i++) await tv.waitForTimeout(250);
    expect(await heardHammer(),
        `the hammer was never called aloud. Host errors: ${JSON.stringify(crashes)}`).toBe(true);
    const sold = (await said(tv)).find(l => /sold|gone|hammer/i.test(l.text));
    expect(sold.text).toMatch(/bidder number|gentleman/i);
    for (const name of ['Ada', 'Bo', 'Cy']) expect(sold.text).not.toContain(name);

    // ═══ EVERY BEAT, EVERY ROUND ═══
    // Skip to the end of round 1 and play the remaining rounds, so the schedule is checked against
    // three rounds' worth of real beats rather than one.
    for (let round = 1; round <= 3; round++) {
        if (round > 1) {
            await expect(tv.locator('.tv-lot')).toBeVisible({ timeout: 90_000 });
            await forceCheapLots(tv);      // startRound draws a fresh order, so this is per round
            await expect(tv.locator('.tv-meta')).toContainText(`Round ${round} of 3`, { timeout: 20_000 });
            await takeTheAsk(ada, tv);
            await expect(tv.locator('.tv-sold')).toContainText(/SOLD/i, { timeout: 60_000 });
        }
        // …to the valuation, without sitting through the rest of the shelf
        await tv.evaluate(() => { H.lotIndex = H.lotOrder.length - 1; });
        if (round < 3) {
            await expect(tv.locator('.bank-title')).toContainText(`ROUND ${round} BANKED`, { timeout: 90_000 });
            await tv.screenshot({ path: `${SHOTS}/auction-05-banked-r${round}.png` });
        }
    }

    // The podium waits for the last round, and then arrives.
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 120_000 });
    await tv.waitForTimeout(3400);
    await tv.screenshot({ path: `${SHOTS}/auction-06-podium.png` });

    // ── THE TRANSCRIPT, judged as a whole ──
    const transcript = await beats(tv);
    const rounds = new Set(transcript.map(b => b.round));
    expect(rounds.size, 'the recording did not span three rounds').toBe(3);

    const floor = await tv.evaluate(() => MIN_DECIDE_MS);
    for (const b of transcript) {
        if (b.kind === 'close') continue;   // the close is deliberately shorter — see §3
        expect(b.ms, `a ${b.kind} beat gave the room only ${b.ms}ms`).toBeGreaterThanOrEqual(floor);
    }
    // A bid buys back a full window — longer than every beat except the very first cold ask of a
    // lot, which is the one decision in the game made with no price on the board at all.
    const bidMs = transcript.filter(b => b.kind === 'bid').map(b => b.ms);
    expect(bidMs.length).toBeGreaterThan(0);
    const longest = Math.max(...bidMs);
    for (const b of transcript) {
        if (b.kind === 'open') continue;
        expect(b.ms, `a ${b.kind} beat outlasted a bid`).toBeLessThanOrEqual(longest);
    }

    // And he never stopped talking: at least one line for every beat of the whole auction.
    const allSaid = await said(tv);
    expect(allSaid.length, 'the auction had silent beats').toBeGreaterThanOrEqual(transcript.length);

    // Written out so a human can read what the room actually heard.
    fs.writeFileSync(`${SHOTS}/auction-transcript.json`,
        JSON.stringify({ beats: transcript, said: allSaid }, null, 2));

    expect(crashes, 'the host threw during the auction').toEqual([]);
    for (const p of [ada, bo, cy, tv]) await p.close();
});
