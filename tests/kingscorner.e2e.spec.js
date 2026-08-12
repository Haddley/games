// E2E for Kings Corner — lobby → deal → draw → play → open a corner with a King →
// win a round → podium, over real PeerJS rooms, for both a TV-hosted and a
// phone-hosted table. Also covers the turn-assistant UI (highlight/hint/explain)
// and a forced stalemate.
//
// Run:  npx playwright test tests/kingscorner.e2e.spec.js

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
    await p.goto('/kingscorner.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

test('TV-hosted table: deal, draw, play, open a corner, win a round, win the match, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const errors = [];

    const tv = await browser.newPage({ viewport: TV });
    tv.on('pageerror', e => errors.push('tv: ' + e.message));
    await tv.goto('/kingscorner.html');
    await shot(tv, 'kc-01-home');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    const ann = await joinPhone(browser, code, 'Ann');
    ann.on('pageerror', e => errors.push('ann: ' + e.message));
    const bo = await joinPhone(browser, code, 'Bo');
    bo.on('pageerror', e => errors.push('bo: ' + e.message));
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);
    await expect(tv.locator('.cxl-chip')).toHaveCount(2, { timeout: 15_000 });
    await shot(tv, 'kc-02-tv-lobby');
    await shot(ann, 'kc-03-captain-lobby');

    // Ann is the captain (first to join) — she can see and drive the settings.
    await expect(ann.locator('.tog-row')).toBeVisible({ timeout: 15_000 });
    await ann.getByRole('button', { name: 'Best of 1', exact: true }).click();
    await ann.waitForTimeout(300);
    expect(await tv.evaluate(() => H.roundsToWin)).toBe(1);

    // ── Deal the table ──
    await ann.getByRole('button', { name: /Deal the table/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('playing');

    // Everyone has 7 cards, and only their own — a guest must never receive another
    // player's hand.
    const hands = await tv.evaluate(() => H.players.map(p => ({ name: p.name, hand: p.hand.slice() })));
    hands.forEach(p => expect(p.hand.length).toBe(7));
    const annSees = await ann.evaluate(() => (D && D.myHand) || []);
    const annReal = hands.find(p => p.name === 'Ann').hand;
    expect(annSees.map(c => c.id).sort()).toEqual(annReal.map(c => c.id).sort());
    const boBlob = await bo.evaluate(() => JSON.stringify(D));
    const annIds = annReal.map(c => c.id);
    expect(annIds.some(id => boBlob.includes(`"${id}"`))).toBe(false);
    await shot(tv, 'kc-04-tv-board');
    await shot(ann, 'kc-05-phone-hand');

    // The board is fully public — the cross piles are exactly what stateFor sends.
    const boardOk = await tv.evaluate(() => {
        const cross = ['N', 'E', 'S', 'W'].every(id => H.piles[id].cards.length === 1);
        const corners = ['NW', 'NE', 'SW', 'SE'].every(id => H.piles[id].cards.length === 0);
        return cross && corners;
    });
    expect(boardOk).toBe(true);

    // ── Whoever's turn it is draws, then plays a King onto an empty corner ──
    const turnName = await tv.evaluate(() => H.players[H.turnIdx].name);
    const turnPage = turnName === 'Ann' ? ann : bo;
    const otherPage = turnName === 'Ann' ? bo : ann;

    // Force a King into the current player's hand and drive the real draw → play path.
    await tv.evaluate(name => {
        const p = H.players.find(x => x.name === name);
        p.hand.push({ rank: 13, suit: 'S', id: '13S' });
        broadcast();
    }, turnName);
    await expect.poll(() => turnPage.evaluate(() => (D && D.myHand || []).some(c => c.id === '13S')), { timeout: 10_000 }).toBe(true);

    await turnPage.getByRole('button', { name: /Draw/ }).click();
    await expect.poll(() => tv.evaluate(() => H.hasDrawnThisTurn), { timeout: 10_000 }).toBe(true);

    await turnPage.locator('[data-card="13S"]').first().click();
    await turnPage.locator('[data-pile="NW"]').click();
    await expect.poll(() => tv.evaluate(() => H.piles.NW.cards.length), { timeout: 10_000 }).toBe(1);
    expect(await tv.evaluate(() => H.piles.NW.cards[0].id)).toBe('13S');
    // a milestone toast for the corner opening reached both phones
    await expect(turnPage.locator('#kc-toasts')).toBeVisible({ timeout: 5000 });
    await shot(tv, 'kc-06-tv-corner-opened');
    await shot(turnPage, 'kc-07-phone-after-play');

    await turnPage.getByRole('button', { name: /End turn/ }).click();
    await expect.poll(() => tv.evaluate(() => H.players[H.turnIdx].name), { timeout: 10_000 }).toBe(await otherPage.evaluate(() => myName));

    // ── Force the round to a win: empty the current player's hand down to one legal play ──
    const winnerName = await tv.evaluate(() => H.players[H.turnIdx].name);
    const winnerPage = winnerName === 'Ann' ? ann : bo;
    await tv.evaluate(name => {
        const p = H.players.find(x => x.name === name);
        // a hand of exactly one card, matched to what's actually on top of a side pile
        const side = ['N', 'E', 'S', 'W'].map(id => H.piles[id]).find(pl => pl.cards.length);
        const top = side.cards[side.cards.length - 1];
        const rank = top.rank - 1;
        const suit = (top.suit === 'H' || top.suit === 'D') ? 'S' : 'H';
        p.hand = [{ rank, suit, id: rank + suit }];
        H.hasDrawnThisTurn = true;   // stock draw already happened, skip straight to the play
        broadcast();
    }, winnerName);
    await expect.poll(() => winnerPage.evaluate(() => (D && D.myHand || []).length), { timeout: 10_000 }).toBe(1);
    const lastCard = await winnerPage.evaluate(() => D.myHand[0].id);
    const targetPile = await tv.evaluate(() => ['N', 'E', 'S', 'W'].find(id => H.piles[id].cards.length));
    await winnerPage.locator(`[data-card="${lastCard}"]`).first().click();
    await winnerPage.locator(`[data-pile="${targetPile}"]`).click();

    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 10_000 }).toBe('match_over');
    expect(await tv.evaluate(name => H.players.find(p => p.name === name).roundsWon, winnerName)).toBe(1);
    await expect(winnerPage.locator('.trophy')).toBeVisible({ timeout: 10_000 });
    await expect(tv.locator('.v-gameover-winner')).toContainText(winnerName, { timeout: 10_000 });
    await shot(tv, 'kc-08-tv-podium');
    await shot(winnerPage, 'kc-09-phone-match-over');

    expect(errors, errors.join('\n')).toEqual([]);
    for (const p of [tv, ann, bo]) await p.close();
});

test('phone-hosted table: legal-move highlighting, hint, and a rejection toast', async ({ browser }) => {
    const errors = [];
    const neil = await browser.newPage({ viewport: PHONE });
    neil.on('pageerror', e => errors.push('host: ' + e.message));
    await neil.goto('/kingscorner.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);

    const jess = await joinPhone(browser, code, 'Jess');
    jess.on('pageerror', e => errors.push('jess: ' + e.message));
    await expect.poll(() => neil.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);

    // assist defaults on
    expect(await neil.evaluate(() => H.assistOn)).toBe(true);
    await neil.getByRole('button', { name: /Deal the table/ }).click();
    await expect.poll(() => neil.evaluate(() => H.phase), { timeout: 20_000 }).toBe('playing');

    const turnName = await neil.evaluate(() => H.players[H.turnIdx].name);
    const turnPage = turnName === 'Neil' ? neil : jess;

    // Force a known hand: one card that legally fits a side pile, one that legally fits
    // nothing (so the rejection path is exercised), and make sure the stock is empty so
    // Draw is skipped and we're straight into the play phase.
    const setup = await neil.evaluate(name => {
        const p = H.players.find(x => x.name === name);
        const side = ['N', 'E', 'S', 'W'].map(id => H.piles[id]).find(pl => pl.cards.length);
        const top = side.cards[side.cards.length - 1];
        const goodRank = top.rank - 1;
        const goodSuit = (top.suit === 'H' || top.suit === 'D') ? 'S' : 'H';
        // a same-colour, wrong-rank card that can never legally land anywhere useful
        const badRank = top.rank - 1 <= 1 ? top.rank : top.rank - 1;
        const badSuit = (top.suit === 'H' || top.suit === 'D') ? 'H' : 'S';
        const bad = { rank: badRank, suit: badSuit, id: 'bad' + badRank + badSuit };
        const good = { rank: goodRank, suit: goodSuit, id: 'good' + goodRank + goodSuit };
        p.hand = [bad, good];
        H.hasDrawnThisTurn = true;
        broadcast();
        return { pileId: side.id, goodId: good.id, badId: bad.id };
    }, turnName);
    await expect.poll(() => turnPage.evaluate(() => (D && D.myHand || []).length), { timeout: 10_000 }).toBe(2);

    // ── highlighting: the legal card is marked .playable, the illegal one is not ──
    await expect(turnPage.locator(`[data-card="${setup.goodId}"]`)).toHaveClass(/playable/, { timeout: 10_000 });
    await expect(turnPage.locator(`[data-card="${setup.badId}"]`)).not.toHaveClass(/playable/);

    // ── explain-rejection: tapping the bad card onto a pile it cannot legally join ──
    const wrongPile = Object.keys(await turnPage.evaluate(() => D.piles)).find(id => id !== setup.pileId && !['NW', 'NE', 'SW', 'SE'].includes(id));
    await turnPage.locator(`[data-card="${setup.badId}"]`).click();
    await turnPage.locator(`[data-pile="${wrongPile}"]`).click();
    await expect(turnPage.locator('.kc-toast.bad')).toBeVisible({ timeout: 5000 });
    // the bad card is still in hand — the host refused nothing was ever sent that would work
    expect((await turnPage.evaluate(() => D.myHand.map(c => c.id)))).toContain(setup.badId);

    // ── turning assist off hides the highlight, but the rejection toast still fires ──
    await neil.evaluate(() => { H.assistOn = false; broadcast(); });
    await expect.poll(() => turnPage.evaluate(() => D.assistOn), { timeout: 10_000 }).toBe(false);
    await expect(turnPage.locator(`[data-card="${setup.goodId}"]`)).not.toHaveClass(/playable/);
    await expect(turnPage.locator('.kc-actrow button', { hasText: 'Hint' })).toHaveCount(0);

    // ── hint (assist back on): selects a legal move and toasts what to try ──
    await neil.evaluate(() => { H.assistOn = true; broadcast(); });
    await expect.poll(() => turnPage.evaluate(() => D.assistOn), { timeout: 10_000 }).toBe(true);
    await turnPage.getByRole('button', { name: /Hint/ }).click();
    await expect(turnPage.locator('.kc-toast').last()).toContainText('Try', { timeout: 5000 });
    await expect(turnPage.locator(`[data-card="${setup.goodId}"]`)).toHaveClass(/sel/);

    // ── and the suggested move actually works when played — the hint already selected the
    // card, so tapping it again would just deselect it; tap the destination pile directly ──
    await turnPage.locator(`[data-pile="${setup.pileId}"]`).click();
    await expect.poll(() => neil.evaluate(
        ({ pileId, goodId }) => H.piles[pileId].cards.some(c => c.id === goodId), setup,
    ), { timeout: 10_000 }).toBe(true);

    expect(errors, errors.join('\n')).toEqual([]);
    for (const p of [neil, jess]) await p.close();
});

test('a dry stock and a full round of empty turns ends in a stalemate', async ({ page }) => {
    await page.goto('/kingscorner.html');
    await page.locator('input[placeholder="Enter name"]').fill('Solo');
    await page.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(page.locator('.room-code')).toBeVisible({ timeout: 30_000 });

    // Force a two-player game state directly (no second phone needed for this path):
    // an empty stock, unequal hands, and no legal move for anybody, so a full
    // round-robin of empty turns must end the round as a stalemate.
    await page.evaluate(() => {
        H.players.push({ id: '__bot__', cid: '__bot__', name: 'Bot', hand: [], roundsWon: 0, spectating: false });
        hostStartGame(H.players[0].id);
        // Wipe the board and hands into a dead position: nothing can legally land anywhere.
        H.stock = [];
        // every side pile holds a rank-7 top — a legal drop there needs a rank-6 of the
        // opposite colour, which nobody has — and the corners need a King nobody has either.
        H.piles.N.cards = [{ rank: 7, suit: 'S', id: '7S' }];
        H.piles.E.cards = [{ rank: 7, suit: 'C', id: '7C' }];
        H.piles.S.cards = [{ rank: 7, suit: 'H', id: '7H' }];
        H.piles.W.cards = [{ rank: 7, suit: 'D', id: '7D' }];
        H.piles.NW.cards = []; H.piles.NE.cards = []; H.piles.SW.cards = []; H.piles.SE.cards = [];
        H.players[0].hand = [{ rank: 1, suit: 'C', id: '1C' }, { rank: 1, suit: 'S', id: '1S' }];
        H.players[1].hand = [{ rank: 1, suit: 'H', id: '1H' }];
        H.turnIdx = 0; H.hasDrawnThisTurn = true; H.cardsPlayedThisTurn = 0; H.passStreak = 0;
        broadcast();
    });
    expect(await page.evaluate(() => anyLegalMove(H.players[0].hand, H.piles))).toBe(false);

    // Two consecutive empty end-turns (one per active player) trip the stalemate.
    await page.getByRole('button', { name: /End turn/ }).click();
    await page.evaluate(() => { H.hasDrawnThisTurn = true; hostEndTurn(H.players[H.turnIdx].id); });
    await expect.poll(() => page.evaluate(() => H.phase), { timeout: 10_000 }).toBe('round_over');
    const winners = await page.evaluate(() => H.stalemateWinners);
    expect(winners).not.toBeNull();
    // whoever holds fewer cards (Bot, with 1) wins the stalemated round
    expect(await page.evaluate(() => H.players[H.stalemateWinners[0]].name)).toBe('Bot');
    await expect(page.locator('.kc-banner')).toContainText('Stalemate', { timeout: 10_000 });
    await page.screenshot({ path: `${SHOTS}/kc-10-stalemate.png` });
});
