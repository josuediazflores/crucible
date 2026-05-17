const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');

const SESSION_DAYS = 30;
const COOKIE = 'crucible_sid';

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
}

function createUser({ name, email, password }) {
  if (!name || !email || !password) throw new Error('Fill all fields.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  const cleanEmail = String(email).toLowerCase().trim();
  if (findUserByEmail(cleanEmail)) throw new Error('Account already exists. Sign in instead.');
  const hash = bcrypt.hashSync(password, 10);
  const now = Date.now();
  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), cleanEmail, hash, now);
  return { id: info.lastInsertRowid, name: name.trim(), email: cleanEmail, created_at: now };
}

function verifyPassword({ email, password }) {
  const u = findUserByEmail(email);
  if (!u) throw new Error('Bad email or password.');
  if (!bcrypt.compareSync(password, u.password_hash)) throw new Error('Bad email or password.');
  return { id: u.id, name: u.name, email: u.email, created_at: u.created_at };
}

function updateProfile(userId, { name, email }) {
  if (!name || !email) throw new Error('Name and email are required.');
  const cleanName = String(name).trim();
  const cleanEmail = String(email).toLowerCase().trim();
  if (!cleanName) throw new Error('Name cannot be empty.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Invalid email format.');
  const collision = findUserByEmail(cleanEmail);
  if (collision && collision.id !== userId) throw new Error('Email already in use.');
  db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(cleanName, cleanEmail, userId);
  const u = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(userId);
  return u;
}

function changePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) throw new Error('Current and new password are required.');
  if (newPassword.length < 6) throw new Error('New password must be at least 6 characters.');
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  if (!u) throw new Error('Account not found.');
  if (!bcrypt.compareSync(currentPassword, u.password_hash)) throw new Error('Current password is incorrect.');
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  return true;
}

function startSession(userId) {
  const token = randomToken();
  const now = Date.now();
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, now, expires);
  return { token, expires };
}

function destroySession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function getUserFromToken(token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s) return null;
  if (s.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  const u = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(s.user_id);
  return u || null;
}

function setSessionCookie(res, token, expires) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,            // local dev
    expires: new Date(expires)
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE);
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  const u = getUserFromToken(token);
  if (!u) return res.status(401).json({ error: 'Not signed in.' });
  req.user = u;
  req.sessionToken = token;
  next();
}

function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  req.user = getUserFromToken(token);
  req.sessionToken = token;
  next();
}

module.exports = {
  COOKIE,
  createUser, verifyPassword, updateProfile, changePassword,
  startSession, destroySession,
  getUserFromToken, setSessionCookie, clearSessionCookie,
  requireAuth, attachUser,
};
