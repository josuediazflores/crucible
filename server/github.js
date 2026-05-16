const crypto = require('crypto');
const db = require('./db');

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const REDIRECT_URL = process.env.GITHUB_REDIRECT_URL
  || `http://localhost:${process.env.PORT || 4317}/api/github/callback`;
const SCOPES = ['read:user', 'repo'];

function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

function buildAuthorizeUrl(state) {
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('redirect_uri', REDIRECT_URL);
  u.searchParams.set('scope', SCOPES.join(' '));
  u.searchParams.set('state', state);
  u.searchParams.set('allow_signup', 'true');
  return u.toString();
}

function newState(userId) {
  const state = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO oauth_states (state, user_id, created_at) VALUES (?, ?, ?)')
    .run(state, userId, Date.now());
  return state;
}

function consumeState(state) {
  const row = db.prepare('SELECT user_id, created_at FROM oauth_states WHERE state = ?').get(state);
  if (!row) return null;
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
  if (Date.now() - row.created_at > 10 * 60 * 1000) return null;
  return row.user_id;
}

async function exchangeCodeForToken(code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Crucible/0.1'
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URL,
    })
  });
  const body = await res.json();
  if (body.error) throw new Error(`${body.error}: ${body.error_description || ''}`);
  return body;
}

async function getViewer(accessToken) {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Crucible/0.1'
    }
  });
  if (!res.ok) throw new Error(`GitHub /user failed: ${res.status}`);
  return res.json();
}

async function listRepos(accessToken) {
  // Pull up to ~100 user repos; private + public. Sort by updated.
  const repos = [];
  let page = 1;
  while (page <= 3) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=50&sort=updated&page=${page}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Crucible/0.1'
      }
    });
    if (!res.ok) break;
    const batch = await res.json();
    repos.push(...batch);
    if (batch.length < 50) break;
    page += 1;
  }
  return repos;
}

function storeAccount(userId, viewer, accessToken, scopes) {
  db.prepare(`INSERT INTO github_accounts (user_id, login, github_id, avatar_url, access_token, scopes, connected_at, is_demo)
              VALUES (@user_id, @login, @github_id, @avatar_url, @access_token, @scopes, @connected_at, 0)
              ON CONFLICT(user_id) DO UPDATE SET
                login=excluded.login, github_id=excluded.github_id,
                avatar_url=excluded.avatar_url, access_token=excluded.access_token,
                scopes=excluded.scopes, connected_at=excluded.connected_at, is_demo=0`)
    .run({
      user_id: userId,
      login: viewer.login,
      github_id: viewer.id,
      avatar_url: viewer.avatar_url,
      access_token: accessToken,
      scopes: scopes || '',
      connected_at: Date.now()
    });
}

function storeDemoAccount(userId, email) {
  const login = (email.split('@')[0] || 'user').replace(/[^a-z0-9]/gi, '-').toLowerCase() + '-dev';
  db.prepare(`INSERT INTO github_accounts (user_id, login, github_id, avatar_url, access_token, scopes, connected_at, is_demo)
              VALUES (@user_id, @login, NULL, NULL, NULL, NULL, @connected_at, 1)
              ON CONFLICT(user_id) DO UPDATE SET
                login=excluded.login, access_token=NULL, scopes=NULL,
                connected_at=excluded.connected_at, is_demo=1`)
    .run({ user_id: userId, login, connected_at: Date.now() });
}

function getAccount(userId) {
  return db.prepare('SELECT * FROM github_accounts WHERE user_id = ?').get(userId);
}

const DEMO_REPOS = [
  { owner: 'acme-labs',     name: 'core-platform',   lang: 'TypeScript', lastPush: '2h ago',    stars: 248, ai: true,  default_branch: 'main' },
  { owner: 'acme-labs',     name: 'support-copilot', lang: 'Python',     lastPush: '5h ago',    stars: 84,  ai: true,  default_branch: 'main' },
  { owner: 'acme-labs',     name: 'ledger-svc',      lang: 'Go',         lastPush: '1d ago',    stars: 12,  ai: false, default_branch: 'main' },
  { owner: 'acme-labs',     name: 'agent-runtime',   lang: 'TypeScript', lastPush: '3h ago',    stars: 521, ai: true,  default_branch: 'main' },
  { owner: 'acme-labs',     name: 'design-tokens',   lang: 'JSON',       lastPush: '1w ago',    stars: 6,   ai: false, default_branch: 'main' },
  { owner: 'ada-lovelace',  name: 'rag-experiments', lang: 'Python',     lastPush: 'yesterday', stars: 33,  ai: true,  default_branch: 'main' },
  { owner: 'acme-labs',     name: 'marketing-site',  lang: 'Astro',      lastPush: '3d ago',    stars: 4,   ai: false, default_branch: 'main' },
];

function relativeUpdated(iso) {
  if (!iso) return 'recently';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days/7)}w ago`;
  return `${Math.floor(days/30)}mo ago`;
}

async function listReposForUser(userId) {
  const acct = getAccount(userId);
  if (!acct) return null;
  if (acct.is_demo || !acct.access_token) {
    return DEMO_REPOS.map(r => ({
      owner: r.owner, name: r.name, full_name: `${r.owner}/${r.name}`,
      lang: r.lang, lastPush: r.lastPush, stars: r.stars, ai: r.ai,
      default_branch: r.default_branch, clone_url: null, demo: true
    }));
  }
  try {
    const repos = await listRepos(acct.access_token);
    return repos.map(r => ({
      owner: r.owner.login,
      name: r.name,
      full_name: r.full_name,
      lang: r.language || 'Unknown',
      lastPush: relativeUpdated(r.pushed_at),
      stars: r.stargazers_count,
      ai: false,
      default_branch: r.default_branch || 'main',
      clone_url: r.clone_url,
      demo: false,
    }));
  } catch (err) {
    console.error('listRepos failed, returning demo data:', err.message);
    return DEMO_REPOS.map(r => ({
      owner: r.owner, name: r.name, full_name: `${r.owner}/${r.name}`,
      lang: r.lang, lastPush: r.lastPush, stars: r.stars, ai: r.ai,
      default_branch: r.default_branch, clone_url: null, demo: true
    }));
  }
}

module.exports = {
  isConfigured, buildAuthorizeUrl, newState, consumeState,
  exchangeCodeForToken, getViewer,
  storeAccount, storeDemoAccount, getAccount,
  listReposForUser, DEMO_REPOS, relativeUpdated,
};
