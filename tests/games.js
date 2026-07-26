// The one table of how to reach every game, shared by the connection specs.
//
// It exists because the first version of the rejoin spec was built from card HEADINGS rather
// than buttons and most of its cases silently hung. Generated from the actual markup, with
// per-game hooks only where a game genuinely differs: liarsdice takes ?join= and has its own
// code field; ticktacktoe keeps its state on `App` rather than a global `H`.
const { expect } = require('@playwright/test');

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };

const GAMES = [
    { g: 'letterstorm', join: /Join with your phone/ },
    { g: 'familytrivia', join: /Join with your phone/ },
    { g: 'fibbers', join: /Join with your phone/ },
    { g: 'doodleparty', join: /Join with your phone/ },
    { g: 'oddsheep', join: /Join with your phone/ },
    { g: 'herdmind', join: /Join with your phone/ },
    { g: 'categoryclash', join: /Join with your phone/ },
    { g: 'bestguess', join: /Join with your phone/ },
    { g: 'brokenpencil', join: /Join with your phone/ },
    { g: 'moonlightvillage', join: /Join with your phone/ },
    { g: 'goinggone', join: /Join with your phone/ },
    { g: 'bingo', join: /Join with your phone/ },
    // liarsdice takes ?join= rather than ?room=, and has its own code field to fill
    { g: 'liarsdice', join: /Take a seat/, param: 'join', codeSel: '#jc',
      name: 'input[placeholder="e.g. Will Turner"]' },
    { g: 'cornerthemarket', join: /Join with your phone/ },
    { g: 'rockpaperscissors', join: /Join with your phone/ },
    { g: 'lastlaugh', join: /Join with your phone/ },
    { g: 'buzzin', join: /Join with your phone/ },
    { g: 'plumptrek', join: /Join with your phone/ },
    { g: 'ticktacktoe', hostBtn: '#tv-host-btn', code: () => App.roomCode,
      nameSel: '#player-name-input', joinSel: '#join-game-btn',
      seats: () => (App.tour ? App.tour.seats.map(s => s.name) : []) },
];

// open a TV-hosted room and return its code
async function openRoom(browser, spec) {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto(`/${spec.g}.html`);
    if (spec.hostBtn) await tv.locator(spec.hostBtn).click();
    else await tv.getByRole('button', { name: /Host the party on this screen|Host on this screen/i }).first().click();
    // wait for the CODE, not for a particular element — the games lay their lobbies out
    // differently and more than one of them has a hidden phone-lobby code node in the DOM
    await expect.poll(() => tv.evaluate(fn => {
        try { return fn ? eval(fn)() : (typeof roomCode !== 'undefined' ? roomCode : null); }
        catch (e) { return null; }
    }, spec.code ? spec.code.toString() : null), { timeout: 30_000 }).toMatch(/^[A-Z]{4}$/);
    const code = await tv.evaluate(fn => (fn ? eval(fn)() : (typeof roomCode !== 'undefined' ? roomCode : null)),
        spec.code ? spec.code.toString() : null);
    expect(code, `${spec.g}: a TV room must produce a code`).toMatch(/^[A-Z]{4}$/);
    return { tv, code };
}

// join from a FRESH browser context — new sessionStorage, i.e. a restarted browser
async function joinFresh(browser, spec, code, name) {
    const ctx = await browser.newContext({ viewport: PHONE });
    const p = await ctx.newPage();
    await p.goto(`/${spec.g}.html?${spec.param || 'room'}=${code}`);
    if (spec.codeSel) await p.locator(spec.codeSel).fill(code);
    await p.locator(spec.nameSel || spec.name || 'input[placeholder="Enter name"]').first().fill(name);
    if (spec.joinSel) await p.locator(spec.joinSel).click();
    else await p.getByRole('button', { name: spec.join }).first().click();
    return { ctx, page: p };
}

// Who does the host think is in the room? ticktacktoe keeps its state on a class instance
// (App) rather than a global H, hence the per-game hook.
const seatNames = (tv, spec) => tv.evaluate(fn => (fn ? eval(fn)() :
    ((typeof H !== 'undefined' && H && H.players) || []).map(p => p.name)),
    spec.seats ? spec.seats.toString() : null);
const seatCount = async (tv, spec) => (await seatNames(tv, spec)).length;

// Nineteen games × three fresh browsers each is several minutes of real PeerJS handshakes,
// so this runs a SPREAD rather than all of them: the game the bug was reported in, the two
// whose join flow differs from the rest, and a few of the plain ones. The unit test
// ("every game uses the shared rule") is what covers the other twelve — it fails if any game
// still hand-rolls the rule or forgets to send a heartbeat.
const COVERED = ['ticktacktoe', 'liarsdice', 'plumptrek', 'herdmind', 'bingo', 'rockpaperscissors'];


module.exports = { GAMES, PHONE, TV, openRoom, joinFresh, seatNames, seatCount };
