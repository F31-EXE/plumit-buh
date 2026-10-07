import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_DAYS = 30;
const COOKIE = 'plumit_sid';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

// Создаёт первого администратора из переменных окружения, если пользователей ещё нет.
export function ensureAdmin(db, log = console.log) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (count > 0) return;
  const login = process.env.ADMIN_LOGIN || 'admin';
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = randomBytes(9).toString('base64url');
    log(`\n  Создан администратор: логин "${login}", пароль "${password}"\n  Задайте ADMIN_PASSWORD, чтобы выбрать пароль самостоятельно.\n`);
  }
  db.prepare('INSERT INTO users (login, name, password_hash, role) VALUES (?, ?, ?, ?)').run(
    login, process.env.ADMIN_NAME || 'Администратор', hashPassword(password), 'admin',
  );
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieAttrs(maxAge) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function createSession(db, res, userId) {
  const token = randomBytes(32).toString('base64url');
  const maxAge = SESSION_DAYS * 24 * 3600;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + maxAge * 1000);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieAttrs(maxAge)}`);
}

export function destroySession(db, req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieAttrs(0)}`);
}

export function sessionMiddleware(db) {
  return (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const row = db.prepare(
        `SELECT u.id, u.login, u.name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
      ).get(token);
      if (row && row.expires_at > Date.now()) {
        req.user = { id: row.id, login: row.login, name: row.name, role: row.role };
      } else if (row) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      }
    }
    next();
  };
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Нужно войти' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Нужно войти' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только для администратора' });
  next();
}

// Простейшая защита от перебора паролей: не более 10 попыток за 15 минут с одного IP.
const attempts = new Map();
export function loginRateLimit(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const entry = attempts.get(key) || { count: 0, reset: now + 15 * 60 * 1000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 15 * 60 * 1000; }
  entry.count += 1;
  attempts.set(key, entry);
  if (entry.count > 10) return res.status(429).json({ error: 'Слишком много попыток, попробуйте позже' });
  next();
}
