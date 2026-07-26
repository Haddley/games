// Tic Tac Toe over a real PeerJS room: a TV screen hosting two phones, and the
// resilience the other games got — a dropped phone rejoins into its own seat (X
// stays X) and the board is handed back mid-game instead of everyone being
// dumped to the lobby.
//
// Run:  npx playwright test tests/ticktacktoe.e2e.spec.js

const { test, expect } = require('@playwright/test');
const fs = require('fs');

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/ticktacktoe.html?room=' + code);
    await p.locator('#player-name-input').fill(name);
    await p.locator('#join-game-btn').click();
    return p;
}

// Find whoever is ❌ in the current match and play a scripted board through both
// phones. `line` is the winning row for ❌ (0,1,2) unless `draw` is asked for.
async function playMatch(pages, tv, { draw = false } = {}) {
    const st = await tv.evaluate(() => ({ x: App.tour.x, o: App.tour.o, names: App.tour.seats.map(s => s.name) }));
    const X = pages[st.names[st.x]], O = pages[st.names[st.o]];
    const moves = draw
        ? [[X, 0], [O, 1], [X, 2], [O, 4], [X, 3], [O, 5], [X, 7], [O, 6], [X, 8]]   // cat's game
        : [[X, 0], [O, 3], [X, 1], [O, 4], [X, 2]];                                   // ❌ takes the top row
    for (const [pg, cell] of moves) {
        await pg.locator(`.cell[data-index="${cell}"]`).click();
        await pg.waitForTimeout(160);
    }
    return st;
}

test('TV tournament: 4 players, random draw, a champion', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/ticktacktoe.html');
    await tv.locator('#tv-host-btn').click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => App.roomCode);

    const pages = {};
    for (const n of ['Ava', 'Ben', 'Cal', 'Dee']) pages[n] = await joinPhone(browser, code, n);
    await expect.poll(() => tv.evaluate(() => App.tour.seats.length), { timeout: 30_000 }).toBe(4);

    // the first phone in is captain and the only one who can start it
    await expect(pages.Ava.locator('#tour-start-btn')).toBeVisible();
    await expect(pages.Ben.locator('#tour-start-btn')).toBeHidden();
    await shot(tv, 'ttt-10-tv-tournament-lobby');

    await pages.Ava.locator('#tour-start-btn').click();
    await expect.poll(() => tv.evaluate(() => App.tour.live), { timeout: 10_000 }).toBe(true);

    // a 4-player bracket: two semis then a final, everyone drawn in
    const bracket = await tv.evaluate(() => App.tour.rounds.map(r => r.map(m => [m.a, m.b])));
    expect(bracket.length).toBe(2);
    expect(bracket[0].length).toBe(2);
    expect(bracket[0].flat().filter(v => v !== null).sort()).toEqual([0, 1, 2, 3]);
    await expect(tv.locator('#ttt-bracket .mt.live')).toBeVisible();
    await shot(tv, 'ttt-11-tv-bracket');

    // the two who aren't playing are told to watch
    const playing = await tv.evaluate(() => [App.tour.seats[App.tour.x].name, App.tour.seats[App.tour.o].name]);
    const watcher = ['Ava', 'Ben', 'Cal', 'Dee'].find(n => !playing.includes(n));
    await expect(pages[watcher].locator('#waiting-screen')).toHaveClass(/active/);
    await expect(pages[watcher].locator('#room-code-text')).toContainText(' v ');

    // play all three matches out
    for (let i = 0; i < 3; i++) {
        await playMatch(pages, tv);
        await tv.waitForTimeout(3200);              // reveal, then the next match / trophy
    }

    const champ = await tv.evaluate(() => ({
        live: App.tour.live,
        name: App.tour.champion != null ? App.tour.seats[App.tour.champion].name : null,
    }));
    expect(champ.live).toBe(false);
    expect(['Ava', 'Ben', 'Cal', 'Dee']).toContain(champ.name);
    await expect(pages[champ.name].locator('#room-code-text')).toHaveText(champ.name);
    await expect(pages[champ.name].locator('#waiting-screen .room-code-label')).toContainText('You win');
    await shot(tv, 'ttt-12-tv-champion');

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

test('a drawn match replays with the starts swapped', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/ticktacktoe.html');
    await tv.locator('#tv-host-btn').click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => App.roomCode);

    const pages = { Karen: await joinPhone(browser, code, 'Karen'), Ollie: await joinPhone(browser, code, 'Ollie') };
    await expect.poll(() => tv.evaluate(() => App.tour.seats.length), { timeout: 30_000 }).toBe(2);
    await pages.Karen.locator('#tour-start-btn').click();
    await expect.poll(() => tv.evaluate(() => App.tour.live), { timeout: 10_000 }).toBe(true);

    const first = await playMatch(pages, tv, { draw: true });
    expect(await tv.evaluate(() => App.gameState.winner)).toBe('draw');

    // nobody is knocked out on a draw — the same two play again, other way round
    await expect.poll(() => tv.evaluate(() => App.tour.x), { timeout: 15_000 }).toBe(first.o);
    expect(await tv.evaluate(() => App.tour.o)).toBe(first.x);
    expect(await tv.evaluate(() => App.tour.live)).toBe(true);
    expect(await tv.evaluate(() => App.tour.champion)).toBe(null);
    expect(await tv.evaluate(() => App.gameState.board.every(c => c === ''))).toBe(true);

    // …and a decisive rematch crowns the champion
    await playMatch(pages, tv);
    await expect.poll(() => tv.evaluate(() => App.tour.champion), { timeout: 15_000 }).not.toBe(null);

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

test('TV tournament: a dropped phone keeps its seat and its board', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/ticktacktoe.html');
    await tv.locator('#tv-host-btn').click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => App.roomCode);

    const pages = { Karen: await joinPhone(browser, code, 'Karen'), Ollie: await joinPhone(browser, code, 'Ollie') };
    await expect.poll(() => tv.evaluate(() => App.tour.seats.length), { timeout: 30_000 }).toBe(2);
    await pages.Karen.locator('#tour-start-btn').click();
    await expect.poll(() => tv.evaluate(() => App.tour.live), { timeout: 10_000 }).toBe(true);

    const st = await tv.evaluate(() => ({ x: App.tour.x, names: App.tour.seats.map(s => s.name) }));
    const xName = st.names[st.x], oName = st.names[st.x === 0 ? 1 : 0];
    await pages[xName].locator('.cell[data-index="4"]').click();
    await expect.poll(() => tv.evaluate(() => App.gameState.board[4]), { timeout: 10_000 }).toBe('X');

    // ❌'s phone drops mid-match: the seat and the board are held, ⭕ is told to wait
    await pages[xName].evaluate(() => App.connection.close());
    await expect(pages[xName].locator('#p2p-curtain')).toBeVisible({ timeout: 5_000 });
    await expect(pages[oName].locator('#connection-text')).toContainText('reconnecting', { timeout: 10_000 });
    expect(await tv.evaluate(() => App.tour.live)).toBe(true);
    expect(await tv.evaluate(() => App.gameState.board[4])).toBe('X');

    // …and walks back into the same seat, still ❌, board intact
    await expect(pages[xName].locator('#p2p-curtain')).toHaveCount(0, { timeout: 25_000 });
    expect(await pages[xName].evaluate(() => App.myRole)).toBe('X');
    expect(await pages[xName].evaluate(() => App.gameState.board[4])).toBe('X');
    await expect.poll(() => tv.evaluate(() => App.tour.seats.filter(s => s.conn).length), { timeout: 10_000 }).toBe(2);

    // and can carry on playing
    await pages[oName].locator('.cell[data-index="0"]').click();
    await expect.poll(() => tv.evaluate(() => App.gameState.board[0]), { timeout: 10_000 }).toBe('O');

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

test('phone room: the host holds the board while the guest reconnects', async ({ browser }) => {
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/ticktacktoe.html');
    await neil.locator('#player-name-input').fill('Neil');
    await neil.locator('#create-game-btn').click();
    await expect(neil.locator('#room-code-text')).not.toBeEmpty({ timeout: 30_000 });
    const code = await neil.evaluate(() => App.roomCode);

    const jess = await joinPhone(browser, code, 'Jess');
    await expect(neil.locator('#game-screen')).toHaveClass(/active/, { timeout: 30_000 });
    await expect(jess.locator('#game-screen')).toHaveClass(/active/, { timeout: 30_000 });

    await neil.locator('.cell[data-index="4"]').click();                       // host is X
    await expect.poll(() => jess.evaluate(() => App.gameState.board[4]), { timeout: 10_000 }).toBe('X');

    await jess.evaluate(() => App.connection.close());
    await expect(jess.locator('#p2p-curtain')).toBeVisible({ timeout: 5_000 });
    await expect(neil.locator('#game-status')).toContainText('holding the game', { timeout: 10_000 });

    await expect(jess.locator('#p2p-curtain')).toHaveCount(0, { timeout: 25_000 });
    await expect.poll(() => jess.evaluate(() => App.gameState.board[4]), { timeout: 15_000 }).toBe('X');
    expect(await jess.evaluate(() => App.myRole)).toBe('O');

    await jess.locator('.cell[data-index="0"]').click();
    await expect.poll(() => neil.evaluate(() => App.gameState.board[0]), { timeout: 10_000 }).toBe('O');

    for (const p of [neil, jess]) await p.close();
});

// Rematch: the "Accept" button used to fall through to leaveGame(), so accepting a
// rematch quit the game and the requester waited forever.
test('rematch: one asks, the other accepts, a fresh board for both', async ({ browser }) => {
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/ticktacktoe.html');
    await neil.locator('#player-name-input').fill('Neil');
    await neil.locator('#create-game-btn').click();
    await expect(neil.locator('#room-code-text')).not.toBeEmpty({ timeout: 30_000 });
    const code = await neil.evaluate(() => App.roomCode);
    const jess = await joinPhone(browser, code, 'Jess');
    await expect(jess.locator('#game-screen')).toHaveClass(/active/, { timeout: 30_000 });

    // X wins down the middle column: 1,4,7 vs 0,2
    for (const [who, cell] of [[neil, 1], [jess, 0], [neil, 4], [jess, 2], [neil, 7]]) {
        await who.locator(`.cell[data-index="${cell}"]`).click();
        await who.waitForTimeout(250);
    }
    await expect.poll(() => neil.evaluate(() => App.gameState.isGameOver), { timeout: 10_000 }).toBe(true);

    // Neil asks for a rematch; Jess gets the modal and accepts
    await neil.locator('#play-again-btn').click();
    await expect(jess.locator('#modal-btn')).toHaveText('Accept', { timeout: 10_000 });
    await jess.locator('#modal-btn').click();

    // both back to an empty board, still connected, and playable
    await expect.poll(() => jess.evaluate(() => App.gameState.board.every(c => c === '')), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => neil.evaluate(() => App.gameState.board.every(c => c === '')), { timeout: 10_000 }).toBe(true);
    expect(await jess.evaluate(() => App.gameState.isGameOver)).toBe(false);
    await neil.locator('.cell[data-index="4"]').click();
    await expect.poll(() => jess.evaluate(() => App.gameState.board[4]), { timeout: 10_000 }).toBe('X');

    for (const p of [neil, jess]) await p.close();
});
