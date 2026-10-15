// G10 status relay: a Cloudflare Worker that lets the dashboard's status buttons save to Notion.
//
// The browser can't call Notion directly (Notion blocks browser requests, and the Notion key must
// stay secret), so the page sends each click here. The Worker checks the team password, checks
// that the status is one the dashboard offers, and updates that one row in Notion.
//
// Secrets (Cloudflare > Worker > Settings > Variables and Secrets):
//   NOTION_TOKEN   the same Notion integration secret the GitHub Action uses (needs "Update content",
//                  "Read comments" and "Insert comments")
//   TEAM_PASSWORD  the dashboard password
//
// Routes:
//   POST /status    {password, kind, id, value}  -> sets one status
//   POST /statuses  {password}                   -> current statuses of every row, so the page
//                                                   shows changes made since its last rebuild
//   POST /comments  {password, kind, id}         -> the Notion comments on one row
//   POST /comment   {password, kind, id, name, text} -> adds a comment to that row, signed with the name

const ALLOWED_ORIGIN = 'https://ladywakaka.github.io';
const NOTION_VERSION = '2022-06-28';

// kind -> Notion database, the status property and the values the dashboard offers
const KINDS = {
  act: {db: '5b09a1ff7932403298c3ba900a810dc4', prop: 'Status', values: ['Not started', 'Started', 'Pending', 'Finished', 'Dropped']},
  kol: {db: '0b39c31466f6419d98a5042e3bde1399', prop: 'Reply Status', values: ['TBC', 'Waiting for reply', 'Accepted', 'Turned down']},
  dec: {db: '64f50abec3f0440c9f42512e82555529', prop: 'Status', values: ['Open', 'Confirmed']},
  igo: {db: 'ccb74e7b08314c0f9f8d3a722b108669', prop: 'Outreach', values: ['To contact', 'Contacted', 'In talks', 'Confirmed', 'Declined']},
  xhs: {db: '4e40da92f23a4b7db466d4730867046c', prop: 'Outreach', values: ['To contact', 'Contacted', 'In talks', 'Confirmed', 'Declined']},
};

const bare = (id) => String(id || '').replace(/-/g, '').toLowerCase();

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function reply(origin, status, body) {
  return new Response(JSON.stringify(body), {status, headers: {...cors(origin), 'Content-Type': 'application/json'}});
}

// Compare passwords without leaking how much of the guess was right
async function samePassword(given, expected) {
  if (!expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map((s) => crypto.subtle.digest('SHA-256', enc.encode(String(s || '')))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function notion(env, method, path, body) {
  const res = await fetch('https://api.notion.com/v1/' + path, {
    method,
    headers: {'Authorization': 'Bearer ' + env.NOTION_TOKEN, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Notion ${res.status}: ${data.message || 'error'}`);
  return data;
}

async function rows(env, db) {
  const out = [];
  let cursor;
  do {
    const page = await notion(env, 'POST', `databases/${db}/query`, cursor ? {page_size: 100, start_cursor: cursor} : {page_size: 100});
    out.push(...page.results.filter((r) => !r.archived && !r.in_trash));
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return out;
}

const text = (prop) => ((prop && prop.rich_text) || []).map((t) => t.plain_text).join('');

// The dashboard identifies a row by its Key, or by the Notion page id when Key is empty
async function findRow(env, kind, id) {
  const {db} = KINDS[kind];
  const byKey = await notion(env, 'POST', `databases/${db}/query`, {filter: {property: 'Key', rich_text: {equals: id}}, page_size: 2});
  const hit = byKey.results.find((r) => !r.archived && !r.in_trash);
  if (hit) return hit;
  if (/^[0-9a-f]{32}$/.test(bare(id))) {
    const page = await notion(env, 'GET', `pages/${bare(id)}`);
    // Only rows of this kind's own database can be changed
    if (page.parent && bare(page.parent.database_id) === db && !page.archived) return page;
  }
  return null;
}

async function setStatus(env, kind, id, value) {
  const k = KINDS[kind];
  const row = await findRow(env, kind, id);
  if (!row) return {ok: false, code: 404, error: 'Row not found in Notion'};
  await notion(env, 'PATCH', `pages/${row.id}`, {properties: {[k.prop]: {select: {name: value}}}});
  return {ok: true};
}

// Dashboard comments are signed "Name (via dashboard): text" so the author shows in Notion too
const SIGN = / \(via dashboard\): /;

async function listComments(env, kind, id) {
  const row = await findRow(env, kind, id);
  if (!row) return {ok: false, code: 404, error: 'Row not found in Notion'};
  const out = [];
  let cursor;
  do {
    const page = await notion(env, 'GET', `comments?block_id=${row.id}&page_size=100` + (cursor ? `&start_cursor=${cursor}` : ''));
    for (const c of page.results) {
      const full = (c.rich_text || []).map((t) => t.plain_text).join('');
      const m = full.split(SIGN);
      out.push(m.length > 1 ? {name: m[0], text: m.slice(1).join(' (via dashboard): '), time: c.created_time} : {name: '', text: full, time: c.created_time});
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor && out.length < 300);
  return {ok: true, comments: out};
}

async function addComment(env, kind, id, name, text) {
  const row = await findRow(env, kind, id);
  if (!row) return {ok: false, code: 404, error: 'Row not found in Notion'};
  const content = `${name} (via dashboard): ${text}`;
  await notion(env, 'POST', 'comments', {parent: {page_id: row.id}, rich_text: [{type: 'text', text: {content}}]});
  return {ok: true};
}

async function allStatuses(env) {
  const out = {};
  await Promise.all(Object.entries(KINDS).map(async ([kind, k]) => {
    out[kind] = {};
    for (const r of await rows(env, k.db)) {
      const sel = r.properties[k.prop] && r.properties[k.prop].select;
      // Same id the dashboard uses: the Key, or the page id when Key is empty
      if (sel) out[kind][text(r.properties.Key) || r.id] = sel.name;
    }
  }));
  return out;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(origin)});
    if (request.method !== 'POST') return reply(origin, 405, {ok: false, error: 'Use POST'});
    if (origin !== ALLOWED_ORIGIN) return reply(origin, 403, {ok: false, error: 'Not allowed from this site'});

    let body;
    try { body = await request.json(); } catch (e) { return reply(origin, 400, {ok: false, error: 'Bad request'}); }
    if (!(await samePassword(body.password, env.TEAM_PASSWORD))) return reply(origin, 401, {ok: false, error: 'Wrong password'});

    const path = new URL(request.url).pathname;
    try {
      if (path === '/statuses') return reply(origin, 200, {ok: true, statuses: await allStatuses(env)});
      if (path === '/status') {
        const {kind, id, value} = body;
        if (!KINDS[kind] || !KINDS[kind].values.includes(value) || !id || String(id).length > 100) return reply(origin, 400, {ok: false, error: 'Unknown status'});
        const r = await setStatus(env, kind, String(id), value);
        return reply(origin, r.ok ? 200 : r.code, r);
      }
      if (path === '/comments' || path === '/comment') {
        const {kind, id} = body;
        if (!KINDS[kind] || !id || String(id).length > 100) return reply(origin, 400, {ok: false, error: 'Unknown row'});
        let r;
        if (path === '/comments') r = await listComments(env, kind, String(id));
        else {
          const name = String(body.name || '').trim().slice(0, 40), text = String(body.text || '').trim();
          if (!name || !text) return reply(origin, 400, {ok: false, error: 'Name and comment are both needed'});
          if (text.length > 1800) return reply(origin, 400, {ok: false, error: 'Comment is too long (1,800 characters max)'});
          r = await addComment(env, kind, String(id), name, text);
        }
        return reply(origin, r.ok ? 200 : r.code, r);
      }
      return reply(origin, 404, {ok: false, error: 'Not found'});
    } catch (e) {
      return reply(origin, 502, {ok: false, error: String(e.message || e)});
    }
  },
};
