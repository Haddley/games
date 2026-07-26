// Unit tests for common.js's *stateful* helpers — the ones that decide whether a phone
// walks back into its room after a refresh, whether two tabs on one device look like the
// same player, and what the connection badge says.
//
// common.js is a browser script, so we evaluate it with `sessionStorage`, `localStorage`
// and `location` supplied as FUNCTION PARAMETERS: inside the body those identifiers
// resolve to our stubs, no globals harmed. `document` stays undefined, which is exactly
// the branch common.js already guards for.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'common.js'), 'utf8');

function makeStore(initial) {
    const m = new Map(Object.entries(initial || {}));
    return {
        getItem: k => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: k => m.delete(k),
        _map: m,
    };
}
// Load common.js with the browser bits we care about faked.
function load({ session = {}, local = {}, search = '', pathname = '/plumptrek.html' } = {}) {
    const sessionStorage = makeStore(session);
    const localStorage = makeStore(local);
    const location = { search, pathname };
    const api = new Function('sessionStorage', 'localStorage', 'location', 'URLSearchParams', SRC + `
;return { clientId, rememberRoom, savedRoom, forgetRoom, savedName, saveName, setNetState,
          setRelayBadge, NET_GLYPH, NET_NOTES, NET_TITLE, _netShow: () => _netShow, _netState: () => _netState };`
    )(sessionStorage, localStorage, location, URLSearchParams);
    return { ...api, sessionStorage, localStorage };
}

// ── clientId: the device id that survives a reload but not a new tab ───────────
test('clientId: mints one id and then keeps returning it', () => {
    const { clientId, sessionStorage } = load();
    const a = clientId();
    assert.match(a, /^c[a-z0-9]+$/);
    assert.strictEqual(clientId(), a, 'stable within the tab');
    assert.strictEqual(sessionStorage.getItem('games-cid'), a, 'it lives in sessionStorage');
});
test('clientId: a DIFFERENT tab gets a different id', () => {
    // this is the whole reason it is sessionStorage and not localStorage: a TV and a
    // phone opened on one device must never look like the same player
    const tabA = load().clientId();
    const tabB = load().clientId();
    assert.notStrictEqual(tabA, tabB);
});
test('clientId: reuses an id already in storage (a reload keeps your seat)', () => {
    const { clientId } = load({ session: { 'games-cid': 'cprevious1' } });
    assert.strictEqual(clientId(), 'cprevious1');
});
test('clientId: storage blocked (private mode) → null, and no throw', () => {
    const api = new Function('sessionStorage', 'localStorage', 'location', SRC +
        ';return { clientId };')(
        { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } },
        makeStore(), { search: '', pathname: '/x.html' });
    assert.strictEqual(api.clientId(), null, 'falls back to name matching rather than exploding');
});

// ── remembering the room across a refresh ─────────────────────────────────────
test('rememberRoom → savedRoom round-trips the code and role', () => {
    const { rememberRoom, savedRoom } = load();
    rememberRoom('ABCD', 'player');
    assert.deepStrictEqual(
        (({ code, role }) => ({ code, role }))(savedRoom()),
        { code: 'ABCD', role: 'player' });
});
test('savedRoom: nothing remembered → null', () => {
    assert.strictEqual(load().savedRoom(), null);
});
test('savedRoom: a room remembered by a DIFFERENT game is ignored', () => {
    // keyed on pathname, so refreshing bingo can't drop you into a plumptrek room
    const { rememberRoom } = load({ pathname: '/bingo.html' });
    const stored = rememberRoom('ABCD', 'player');
    const other = load({ session: { 'games-room': JSON.stringify({ g: '/bingo.html', code: 'ABCD', role: 'player', t: Date.now() }) },
                         pathname: '/plumptrek.html' });
    assert.strictEqual(other.savedRoom(), null);
});
test('savedRoom: stale entries expire', () => {
    const old = JSON.stringify({ g: '/plumptrek.html', code: 'ABCD', role: 'player', t: Date.now() - 7 * 3600 * 1000 });
    const { savedRoom } = load({ session: { 'games-room': old } });
    assert.strictEqual(savedRoom(), null, 'seven hours later is not "still playing"');
    const fresh = JSON.stringify({ g: '/plumptrek.html', code: 'ABCD', role: 'player', t: Date.now() - 60 * 1000 });
    assert.ok(load({ session: { 'games-room': fresh } }).savedRoom(), 'a minute ago is');
});
test('savedRoom: honours a custom max age', () => {
    const t = Date.now() - 5 * 60 * 1000;                      // five minutes ago
    const { savedRoom } = load({ session: { 'games-room': JSON.stringify({ g: '/plumptrek.html', code: 'ABCD', role: 'viewer', t }) } });
    assert.ok(savedRoom(), 'inside the default window');
    assert.strictEqual(savedRoom(60 * 1000), null, 'outside a one-minute window');
});
test('savedRoom: garbage in storage does not throw', () => {
    assert.strictEqual(load({ session: { 'games-room': 'not json{{' } }).savedRoom(), null);
    assert.strictEqual(load({ session: { 'games-room': '{"g":"/plumptrek.html"}' } }).savedRoom(), null, 'no code = no room');
});
test('forgetRoom clears it (hosting, or giving up, must not loop)', () => {
    const { rememberRoom, forgetRoom, savedRoom } = load();
    rememberRoom('WXYZ', 'player');
    assert.ok(savedRoom());
    forgetRoom();
    assert.strictEqual(savedRoom(), null);
});

// ── the shared name, carried between games ────────────────────────────────────
test('saveName / savedName round-trip on the shared key', () => {
    const { saveName, savedName, localStorage } = load();
    saveName('Neil');
    assert.strictEqual(localStorage.getItem('games-name'), 'Neil');
    assert.strictEqual(savedName(), 'Neil');
});
test('saveName stores verbatim — the games trim at the point of use', () => {
    // deliberate: the input saves on every keystroke, so trimming here would fight
    // someone typing "Neil Smith". joinGame/hostGame do `name.trim().slice(0, 16)`.
    const { saveName, savedName } = load();
    saveName('  Neil  ');
    assert.strictEqual(savedName(), '  Neil  ');
    assert.strictEqual(savedName().trim().slice(0, 16), 'Neil', 'and that is what a game sends');
});
test('savedName: storage blocked → empty string, never a throw', () => {
    const api = new Function('localStorage', 'sessionStorage', 'location', SRC + ';return { savedName, saveName };')(
        { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } },
        makeStore(), { search: '', pathname: '/x.html' });
    assert.strictEqual(api.savedName(), '');
    assert.doesNotThrow(() => api.saveName('Neil'));
});
test('savedName: nothing saved → empty string, never null', () => {
    assert.strictEqual(load().savedName(), '');
});

// ── the connection badge ──────────────────────────────────────────────────────
test('setNetState: every state has a glyph, a title and an explanation', () => {
    const { NET_GLYPH, NET_NOTES, NET_TITLE } = load();
    for (const k of ['relay', 'stun', 'local', 'checking']) {
        assert.ok(NET_GLYPH[k], `glyph for ${k}`);
        assert.ok(NET_NOTES[k] && NET_NOTES[k].length > 20, `plain-English note for ${k}`);
        assert.ok(NET_TITLE[k], `tooltip for ${k}`);
    }
});
test('setNetState: the glyphs are the ones the docs promise', () => {
    const { NET_GLYPH } = load();
    assert.strictEqual(NET_GLYPH.relay, '📡');
    assert.strictEqual(NET_GLYPH.stun, '🌐');
    assert.strictEqual(NET_GLYPH.local, '🏠');
});
test('setNetState: tracks the current state, and "direct" still means STUN', () => {
    const api = load();
    api.setNetState('relay');
    assert.strictEqual(api._netState(), 'relay');
    api.setNetState('direct');                                  // older callers said this
    assert.strictEqual(api._netState(), 'stun');
    api.setNetState('none');
    assert.strictEqual(api._netState(), 'checking', 'not in a room → nothing claimed');
});
test('setRelayBadge(true/false) is the old on/off door onto the same state', () => {
    const api = load();
    api.setRelayBadge(true);
    assert.strictEqual(api._netState(), 'relay');
    api.setRelayBadge(false);
    assert.strictEqual(api._netState(), 'stun');
});
test('?net=0 hides the badge and sticks; ?net=1 brings it back', () => {
    const off = load({ search: '?net=0' });
    assert.strictEqual(off._netShow(), false);
    assert.strictEqual(off.localStorage.getItem('games-netbadge'), '0', 'remembered for next time');
    const stillOff = load({ local: { 'games-netbadge': '0' } });
    assert.strictEqual(stillOff._netShow(), false, 'sticky without the query string');
    const on = load({ search: '?net=1', local: { 'games-netbadge': '0' } });
    assert.strictEqual(on._netShow(), true);
});
test('the badge is on by default', () => {
    assert.strictEqual(load()._netShow(), true);
});
