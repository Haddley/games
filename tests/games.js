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
    { g: 'letterstorm', hostPhone: /Host Party/, openTv: /Open Scoreboard/, join: /Join with your phone/ },
    { g: 'familytrivia', hostPhone: /Host on this phone/, openTv: /Open TV screen/, join: /Join with your phone/ },
    { g: 'fibbers', hostPhone: /Host on this phone/, openTv: /Open TV screen/, join: /Join with your phone/ },
    { g: 'doodleparty', hostPhone: /Host on this phone/, openTv: /Open TV screen/, join: /Join with your phone/ },
    { g: 'oddsheep', hostPhone: /Host on this phone/, openTv: /Open TV screen/, join: /Join with your phone/ },
    { g: 'herdmind', hostPhone: /Host on this phone/, openTv: /Open TV screen/, join: /Join with your phone/ },
    { g: 'categoryclash', hostPhone: /Host on this phone/, openTv: /Open TV screen/, join: /Join with your phone/ },
    { g: 'bestguess', hostPhone: /Host on this phone/, openTv: /Open the board/, join: /Join with your phone/ },
    { g: 'brokenpencil', hostPhone: /Host on this phone/, openTv: /Open TV screen/, join: /Join with your phone/ },
    { g: 'moonlightvillage', hostPhone: /Host on this phone/, openTv: /Open narrator screen/, join: /Join with your phone/ },
    { g: 'goinggone', hostPhone: /Host on this phone/, openTv: /Open auction floor/, join: /Join with your phone/ },
    { g: 'bingo', hostPhone: /Host on this phone/, openTv: /Open the flashboard/, join: /Join with your phone/ },
    // liarsdice takes ?join= rather than ?room=, and has its own code field to fill
    { g: 'liarsdice', hostPhone: /Roll out the barrel/, openTv: /Open Scoreboard/, tvCodeSel: '#vc', join: /Take a seat/, param: 'join', codeSel: '#jc',
      name: 'input[placeholder="e.g. Will Turner"]' },
    { g: 'cornerthemarket', hostPhone: /Host on this phone/, openTv: /Open trading floor/, join: /Join with your phone/ },
    { g: 'rockpaperscissors', hostPhone: /Host on this phone/, openTv: /Open Arena/, join: /Join with your phone/ },
    { g: 'lastlaugh', hostPhone: /Host on this phone/, openTv: /Open TV screen/, join: /Join with your phone/ },
    { g: 'buzzin', hostPhone: /Host on this phone/, openTv: /Open TV screen/, join: /Join with your phone/ },
    { g: 'plumptrek', hostPhone: /Host on this phone/, openTv: /Open TV screen/, join: /Join with your phone/ },
    // ticktacktoe hosts head-to-head on a phone and has no 'watch an existing room'
    // screen of this shape, so it sits out the phone-host battery (noTvJoin).
    { g: 'ticktacktoe', noTvJoin: true, hostBtn: '#tv-host-btn', code: () => App.roomCode,
      nameSel: '#player-name-input', joinSel: '#join-game-btn',
      seats: () => (App.tour ? App.tour.seats.map(s => s.name) : []) },
    // The four host-can-also-play card games share the exact "Host on this phone" /
    // "Host the party on this screen" / "Join with your phone" / "Open Table" wording every
    // other game above uses — no per-game hooks needed.
    { g: 'kingscorner', hostPhone: /Host on this phone/, openTv: /Host the party on this screen/, join: /Join with your phone/ },
    { g: 'gofish', hostPhone: /Host on this phone/, openTv: /Host the party on this screen/, join: /Join with your phone/ },
    { g: 'idoubtit', hostPhone: /Host on this phone/, openTv: /Host the party on this screen/, join: /Join with your phone/ },
    { g: 'lastcard', hostPhone: /Host on this phone/, openTv: /Host the party on this screen/, join: /Join with your phone/ },
    // blackjack is the one card game with a real dealer-only host role: its plain
    // "Deal on this phone" does NOT seat the host as a player, which would break the
    // "the host IS a player" assumption in phone-host-room.e2e.spec.js — so this points at
    // its host-AND-play button instead ("Deal me in" → hostGameAndPlay), which does.
    // hostBtn is ALSO needed (openRoom() in this file, used by openRoom-based specs, reads
    // hostBtn/a text locator for TV-hosts-from-scratch — a different helper from openTv,
    // which only the viewer-attaches-to-an-existing-room path reads).
    { g: 'blackjack', hostPhone: /Deal me in/, hostBtn: 'text=Deal on the big screen', openTv: /Deal on the big screen/, join: /Join with your phone/ },
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

// How many players does THIS game refuse to start without? Games express it three ways —
// a MIN_PLAYERS constant, a minPlayers() function, or nothing at all — and a mid-game test
// that ignores it silently never leaves the lobby, which is exactly how the mid-game battery
// came to be testing the lobby rule instead.
const minSeats = tv => tv.evaluate(() => {
    try { if (typeof minPlayers === 'function') return minPlayers(); } catch (e) {}
    try { if (typeof MIN_PLAYERS !== 'undefined') return MIN_PLAYERS; } catch (e) {}
    return 2;
});

// Get the room out of the lobby, however this game spells it. There is no single entry point:
// most games have hostStartGame, letterstorm and cornerthemarket have hostStartRound,
// goinggone has hostStartAuction, and blackjack has hostStartTable. Calling a name that does
// not exist is a silent no-op inside page.evaluate, so a test built on one guess passes while
// never starting anything.
//
// The card games (kingscorner/gofish/idoubtit/lastcard/blackjack) additionally gate their
// start function on `capPlayer()?.id !== fromId` — a captain check baked directly into the
// function itself, unlike the party games where the equivalent check lives one layer up (in
// whatever wraps this). Calling `fn()` with no argument makes `fromId` `undefined`, which
// never equals a real peer id, so the guard silently rejects it. Passing `capPlayer()`'s id as
// the one argument fixes those without affecting any game whose start function ignores extra
// arguments (which is all of them — JS silently drops params a function never declared).
// Returns which function worked and the phase it produced, so a failure can say so out loud.
const hostStart = tv => tv.evaluate(() => {
    const phase = () => (typeof H !== 'undefined' && H) ? H.phase : null;
    const captainId = () => { try { return typeof capPlayer === 'function' ? capPlayer()?.id : undefined; } catch (e) { return undefined; } };
    const tried = [];
    for (const name of ['hostStartGame', 'hostStartRound', 'hostStartAuction', 'hostStartTable']) {
        let fn = null;
        try { fn = eval(`typeof ${name} === 'function' ? ${name} : null`); } catch (e) {}
        if (!fn) continue;
        tried.push(name);
        try { fn(captainId()); } catch (e) { /* a game that refuses is a phase check below, not a throw */ }
        if (phase() && phase() !== 'lobby') return { fn: name, phase: phase(), tried };
    }
    return { fn: null, phase: phase(), tried };
});

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


module.exports = { GAMES, PHONE, TV, openRoom, joinFresh, seatNames, seatCount, minSeats, hostStart };
