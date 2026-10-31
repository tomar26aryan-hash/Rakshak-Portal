'use strict';
/**
 * Rakshak Portal - backend API + static frontend host
 * Team Thunderbolts
 *
 * One process serves both the REST API (/api/*) and the web UI (/frontend),
 * so the whole portal deploys as a single service.
 */
require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { createPool } = require('./lib/db');
const { applySchema, bootstrapAdminFromEnv } = require('./lib/init');
const v = require('./lib/validate');

// ============================================
// CONFIGURATION (all from environment variables)
// ============================================

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT, 10) || 5000;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
const DB_AUTO_INIT = String(process.env.DB_AUTO_INIT || 'true').toLowerCase() !== 'false';
const FORCE_HTTPS = String(process.env.FORCE_HTTPS || 'false').toLowerCase() === 'true';

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (isProd) {
    console.error('FATAL: JWT_SECRET must be set to a random string of 32+ characters in production.');
    console.error('Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
  }
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('WARNING: JWT_SECRET not set - using a temporary secret. Logins reset on every restart.');
}

const pool = createPool();
const app = express();

// ============================================
// SMALL HELPERS
// ============================================

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const assertValid = (error) => {
  if (error) throw new HttpError(400, error);
};

async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* connection already gone */ }
    throw err;
  } finally {
    conn.release();
  }
}

const audit = (db, req, userId, action, details) =>
  db.query(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
    [userId || null, action, String(details).slice(0, 1000), req.ip || null]
  );

// For events where a logging problem must never block the user.
const auditSafe = (db, req, userId, action, details) =>
  audit(db, req, userId, action, details).catch((e) => console.error('Audit log failed:', e.message));

const notify = (db, userId, type, message) =>
  db.query('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)', [userId, type, message]);

function paging(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

const likePattern = (s) => `%${String(s).replace(/[\\%_]/g, '\\$&')}%`;

// "123" -> look up by numeric id, anything else -> look up by reference number.
function lookupBy(param, numberColumn) {
  return /^\d+$/.test(param)
    ? { clause: 'id = ?', value: Number(param) }
    : { clause: `${numberColumn} = ?`, value: String(param).toUpperCase() };
}

const staff = (user) => user.role === 'admin' || user.role === 'officer';

// Citizens never see internal officer notes.
const FIR_PUBLIC_COLS =
  'f.id, f.fir_number, f.user_id, f.complainant_name, f.mobile, f.email, f.address, f.crime_type, ' +
  'f.incident_details, f.incident_date, f.location, f.status, f.created_at, f.updated_at';
const firCols = (user) =>
  staff(user)
    ? `${FIR_PUBLIC_COLS}, f.notes, f.assigned_officer, o.full_name AS assigned_officer_name`
    : FIR_PUBLIC_COLS;

// ============================================
// MIDDLEWARE
// ============================================

app.set('trust proxy', (() => {
  const t = process.env.TRUST_PROXY;
  if (t === undefined || t === '') return isProd ? 1 : false; // 1 hop: Render/Railway/Nginx/Caddy
  if (t === 'true') return true;
  if (t === 'false') return false;
  return Number.isNaN(Number(t)) ? t : Number(t);
})());

if (FORCE_HTTPS) {
  app.use((req, res, next) => {
    if (req.secure || req.path === '/api/health') return next();
    return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
  });
}

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],                       // no inline scripts -> blocks injected JS
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      ...(FORCE_HTTPS ? { upgradeInsecureRequests: [] } : {})
    }
  },
  crossOriginEmbedderPolicy: false
}));

// The UI is served by this same server, so CORS is only needed if you host the
// frontend somewhere else. Set CORS_ORIGIN=https://a.example,https://b.example
if (process.env.CORS_ORIGIN) {
  app.use('/api', cors({ origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
}

app.use(express.json({ limit: '50kb' }));

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store'); // never let a proxy cache personal data
  next();
});

const limiter = (opts) => rateLimit({
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: opts.error || 'Too many requests. Please try again later.' },
  ...opts
});

app.use('/api', limiter({ windowMs: 15 * 60 * 1000, limit: 600 }));
const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true,
  error: 'Too many failed login attempts. Please try again in 15 minutes.'
});
const registerLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10, error: 'Too many sign-ups from this network. Try again later.' });
const submitLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 30, error: 'Submission limit reached. Please try again later.' });
const trackLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 60 });
const sosLimiter = limiter({ windowMs: 10 * 60 * 1000, limit: 10, error: 'Too many emergency alerts sent. If you are in danger call 112.' });

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

const authenticateToken = wrap(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Access denied. Please login first.');
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (_) {
    throw new HttpError(401, 'Invalid or expired token. Please login again.');
  }

  // Always trust the database over the token: a deactivated user or a changed
  // role takes effect immediately instead of when the token expires.
  const [rows] = await pool.query('SELECT id, username, role, is_active FROM users WHERE id = ?', [payload.id]);
  if (rows.length === 0 || !rows[0].is_active) {
    throw new HttpError(401, 'Your session is no longer valid. Please login again.');
  }
  req.user = { id: rows[0].id, username: rows[0].username, role: rows[0].role };
  next();
});

// Role-based authorization
const authorizeRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new HttpError(403, 'Access denied. Insufficient permissions.'));
  }
  next();
};

const staffOnly = [authenticateToken, authorizeRoles('admin', 'officer')];

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Register New User (always a citizen - staff accounts are created by an administrator)
app.post('/api/auth/register', registerLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  assertValid(v.firstError(
    v.username(b.username),
    v.email(b.email),
    v.password(b.password),
    v.text(b.fullName, 'Full name', { min: 2, max: 100 }),
    v.mobile(b.mobile)
  ));

  const username = v.str(b.username);
  const email = v.str(b.email).toLowerCase();
  const hashedPassword = await bcrypt.hash(b.password, BCRYPT_ROUNDS);

  let userId;
  try {
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password, full_name, mobile, role) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, hashedPassword, v.str(b.fullName), v.str(b.mobile).replace(/[\s-]/g, ''), 'citizen']
    );
    userId = result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'User with this email or username already exists');
    }
    throw err;
  }

  await auditSafe(pool, req, userId, 'USER_REGISTERED', `New citizen registered: ${username}`);

  res.status(201).json({
    success: true,
    message: 'Registration successful! Please login.',
    userId
  });
}));

// A real hash to compare against when the user does not exist, so that response
// time does not reveal which usernames are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

// Login
app.post('/api/auth/login', loginLimiter, wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    throw new HttpError(400, 'Username and password are required');
  }

  const identifier = username.trim();
  const [users] = await pool.query(
    'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1',
    [identifier, identifier.toLowerCase()]
  );
  const user = users[0];

  const validPassword = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !validPassword) {
    await auditSafe(pool, req, user && user.id, 'LOGIN_FAILED', `Failed login for "${identifier.slice(0, 60)}"`);
    throw new HttpError(401, 'Invalid username or password');
  }

  if (!user.is_active) {
    throw new HttpError(403, 'Your account has been deactivated');
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' }
  );

  await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
  await auditSafe(pool, req, user.id, 'USER_LOGIN', `User ${user.username} logged in successfully`);

  res.json({
    success: true,
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      mobile: user.mobile,
      role: user.role
    }
  });
}));

// Get Current User Info
app.get('/api/auth/me', authenticateToken, wrap(async (req, res) => {
  const [users] = await pool.query(
    'SELECT id, username, email, full_name, mobile, role, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  if (users.length === 0) throw new HttpError(404, 'User not found');

  const u = users[0];
  res.json({
    success: true,
    user: { id: u.id, username: u.username, email: u.email, fullName: u.full_name, mobile: u.mobile, role: u.role, createdAt: u.created_at }
  });
}));

// ============================================
// FIR ROUTES
// ============================================

// Create FIR
app.post('/api/firs', authenticateToken, submitLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  assertValid(v.firstError(
    v.text(b.complainantName, 'Complainant name', { min: 2, max: 100 }),
    v.mobile(b.mobile),
    v.email(b.email, { required: false }),
    v.text(b.address, 'Address', { min: 5, max: 500 }),
    v.oneOf(b.crimeType, v.CRIME_TYPES, 'Crime type'),
    v.text(b.details, 'Incident details', { min: 10, max: 5000 }),
    v.isoDate(b.incidentDate, 'Incident date'),
    v.text(b.location, 'Location', { min: 2, max: 255 })
  ));

  const data = await withTransaction(async (conn) => {
    // Insert first, then derive the public number from the auto-increment id.
    // (Reading "the last number + 1" lets two simultaneous users collide.)
    const [result] = await conn.query(
      `INSERT INTO firs (fir_number, user_id, complainant_name, mobile, email,
       address, crime_type, incident_details, incident_date, location, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [`TMP${crypto.randomBytes(8).toString('hex')}`, req.user.id, v.str(b.complainantName),
        v.str(b.mobile).replace(/[\s-]/g, ''), v.str(b.email) || null, v.str(b.address),
        b.crimeType, v.str(b.details), v.str(b.incidentDate), v.str(b.location)]
    );
    const firNumber = `FIR${1000 + result.insertId}`;
    await conn.query('UPDATE firs SET fir_number = ? WHERE id = ?', [firNumber, result.insertId]);

    await notify(conn, req.user.id, 'FIR_SUBMITTED', `Your FIR ${firNumber} has been submitted successfully`);
    // Notify all active officers
    await conn.query(
      `INSERT INTO notifications (user_id, type, message)
       SELECT id, 'NEW_FIR', ? FROM users WHERE role IN ('admin', 'officer') AND is_active = 1`,
      [`New FIR ${firNumber} submitted - ${b.crimeType}`]
    );
    await audit(conn, req, req.user.id, 'FIR_CREATED', `FIR ${firNumber} created for ${b.crimeType}`);

    return { firNumber, firId: result.insertId, status: 'Pending' };
  });

  res.status(201).json({ success: true, message: 'FIR submitted successfully', data });
}));

// Get All FIRs (with filters)
app.get('/api/firs', authenticateToken, wrap(async (req, res) => {
  const { status, crimeType, search } = req.query;
  const { page, limit, offset } = paging(req.query);

  const where = ['1=1'];
  const params = [];

  // Role-based filtering: citizens only ever see their own FIRs
  if (!staff(req.user)) {
    where.push('f.user_id = ?');
    params.push(req.user.id);
  }
  if (status) {
    assertValid(v.oneOf(status, v.STATUSES, 'Status'));
    where.push('f.status = ?');
    params.push(status);
  }
  if (crimeType) {
    assertValid(v.oneOf(crimeType, v.CRIME_TYPES, 'Crime type'));
    where.push('f.crime_type = ?');
    params.push(crimeType);
  }
  if (search) {
    const p = likePattern(String(search).slice(0, 100));
    where.push('(f.fir_number LIKE ? OR f.complainant_name LIKE ? OR f.location LIKE ?)');
    params.push(p, p, p);
  }
  const whereSql = where.join(' AND ');

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM firs f WHERE ${whereSql}`, params);
  const [firs] = await pool.query(
    `SELECT ${firCols(req.user)} FROM firs f
     LEFT JOIN users o ON o.id = f.assigned_officer
     WHERE ${whereSql} ORDER BY f.created_at DESC, f.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({
    success: true,
    data: firs,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      recordsPerPage: limit
    }
  });
}));

// Get Single FIR (by numeric id or FIR number), with its status history
app.get('/api/firs/:id', authenticateToken, wrap(async (req, res) => {
  const { clause, value } = lookupBy(req.params.id, 'fir_number');
  const [firs] = await pool.query(
    `SELECT ${firCols(req.user)} FROM firs f LEFT JOIN users o ON o.id = f.assigned_officer WHERE f.${clause} LIMIT 1`,
    [value]
  );
  if (firs.length === 0) throw new HttpError(404, 'FIR not found');

  const fir = firs[0];
  if (!staff(req.user) && fir.user_id !== req.user.id) {
    throw new HttpError(403, 'Access denied');
  }

  const [timeline] = await pool.query(
    `SELECT cu.update_type, cu.description, cu.created_at, u.full_name AS updated_by_name
     FROM case_updates cu LEFT JOIN users u ON u.id = cu.updated_by
     WHERE cu.fir_id = ? ORDER BY cu.created_at DESC, cu.id DESC`,
    [fir.id]
  );
  // Citizens see what changed, but not which officer made the change.
  const history = staff(req.user) ? timeline : timeline.map(({ updated_by_name, ...rest }) => rest);

  res.json({ success: true, data: { ...fir, timeline: history } });
}));

// Update FIR (Admin/Officer only): status, internal notes, assigned officer
app.patch('/api/firs/:id', ...staffOnly, wrap(async (req, res) => {
  const b = req.body || {};
  const sets = [];
  const params = [];

  if (b.status !== undefined) {
    assertValid(v.oneOf(b.status, v.STATUSES, 'Status'));
    sets.push('status = ?'); params.push(b.status);
  }
  if (b.notes !== undefined) {
    assertValid(v.text(b.notes, 'Notes', { max: 5000, required: false }));
    sets.push('notes = ?'); params.push(v.str(b.notes) || null);
  }
  let assignTo;
  if (b.assignedOfficer !== undefined) {
    if (b.assignedOfficer === null || b.assignedOfficer === '') {
      assignTo = null;
    } else {
      assignTo = Number(b.assignedOfficer);
      if (!Number.isInteger(assignTo) || assignTo < 1) throw new HttpError(400, 'Invalid officer');
    }
    sets.push('assigned_officer = ?'); params.push(assignTo);
  }
  if (sets.length === 0) throw new HttpError(400, 'Nothing to update');

  await withTransaction(async (conn) => {
    const { clause, value } = lookupBy(req.params.id, 'fir_number');
    const [firs] = await conn.query(`SELECT * FROM firs WHERE ${clause} LIMIT 1 FOR UPDATE`, [value]);
    if (firs.length === 0) throw new HttpError(404, 'FIR not found');
    const fir = firs[0];

    if (assignTo) {
      const [officers] = await conn.query(
        "SELECT id FROM users WHERE id = ? AND role IN ('officer','admin') AND is_active = 1", [assignTo]
      );
      if (officers.length === 0) throw new HttpError(400, 'Assigned user is not an active officer');
    }

    await conn.query(`UPDATE firs SET ${sets.join(', ')} WHERE id = ?`, [...params, fir.id]);

    if (b.status !== undefined && b.status !== fir.status) {
      await conn.query(
        'INSERT INTO case_updates (fir_id, updated_by, update_type, description) VALUES (?, ?, ?, ?)',
        [fir.id, req.user.id, 'STATUS_CHANGE', `Status changed from ${fir.status} to ${b.status}`]
      );
      await notify(conn, fir.user_id, 'FIR_UPDATED', `Your FIR ${fir.fir_number} status has been updated to: ${b.status}`);
      await audit(conn, req, req.user.id, 'FIR_UPDATED', `FIR ${fir.fir_number} updated to ${b.status}`);
    }
    if (b.assignedOfficer !== undefined && assignTo !== fir.assigned_officer) {
      await conn.query(
        'INSERT INTO case_updates (fir_id, updated_by, update_type, description) VALUES (?, ?, ?, ?)',
        [fir.id, req.user.id, 'ASSIGNED', assignTo ? 'Case assigned to an investigating officer' : 'Case unassigned']
      );
      await audit(conn, req, req.user.id, 'FIR_ASSIGNED', `FIR ${fir.fir_number} assigned to user ${assignTo}`);
    }
    if (b.notes !== undefined) {
      await audit(conn, req, req.user.id, 'FIR_NOTES', `Internal notes edited on FIR ${fir.fir_number}`);
    }
  });

  res.json({ success: true, message: 'FIR updated successfully' });
}));

// ============================================
// COMPLAINT ROUTES
// ============================================

// Create Complaint
app.post('/api/complaints', authenticateToken, submitLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  assertValid(v.firstError(
    v.text(b.name, 'Name', { min: 2, max: 100 }),
    v.mobile(b.contact, 'Contact number'),
    v.oneOf(b.type, v.COMPLAINT_TYPES, 'Complaint type'),
    v.text(b.details, 'Complaint details', { min: 10, max: 5000 })
  ));

  const data = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      `INSERT INTO complaints (complaint_number, user_id, complainant_name, contact,
       complaint_type, details, status) VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [`TMP${crypto.randomBytes(8).toString('hex')}`, req.user.id, v.str(b.name),
        v.str(b.contact).replace(/[\s-]/g, ''), b.type, v.str(b.details)]
    );
    const complaintNumber = `CMP${2000 + result.insertId}`;
    await conn.query('UPDATE complaints SET complaint_number = ? WHERE id = ?', [complaintNumber, result.insertId]);

    await notify(conn, req.user.id, 'COMPLAINT_SUBMITTED', `Your complaint ${complaintNumber} has been submitted`);
    await audit(conn, req, req.user.id, 'COMPLAINT_CREATED', `Complaint ${complaintNumber} created`);

    return { complaintNumber, complaintId: result.insertId };
  });

  res.status(201).json({ success: true, message: 'Complaint submitted successfully', data });
}));

// Get All Complaints
app.get('/api/complaints', authenticateToken, wrap(async (req, res) => {
  const { status, search } = req.query;
  const { page, limit, offset } = paging(req.query);

  const where = ['1=1'];
  const params = [];
  if (!staff(req.user)) {
    where.push('user_id = ?');
    params.push(req.user.id);
  }
  if (status) {
    assertValid(v.oneOf(status, v.STATUSES, 'Status'));
    where.push('status = ?');
    params.push(status);
  }
  if (search) {
    const p = likePattern(String(search).slice(0, 100));
    where.push('(complaint_number LIKE ? OR complainant_name LIKE ?)');
    params.push(p, p);
  }
  const whereSql = where.join(' AND ');

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM complaints WHERE ${whereSql}`, params);
  const [complaints] = await pool.query(
    `SELECT * FROM complaints WHERE ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({
    success: true,
    data: complaints,
    pagination: { currentPage: page, totalPages: Math.ceil(total / limit), totalRecords: total, recordsPerPage: limit }
  });
}));

// Update Complaint (Admin/Officer only)
app.patch('/api/complaints/:id', ...staffOnly, wrap(async (req, res) => {
  const b = req.body || {};
  const sets = [];
  const params = [];

  if (b.status !== undefined) {
    assertValid(v.oneOf(b.status, v.STATUSES, 'Status'));
    sets.push('status = ?'); params.push(b.status);
  }
  if (b.resolution !== undefined) {
    assertValid(v.text(b.resolution, 'Resolution', { max: 5000, required: false }));
    sets.push('resolution = ?'); params.push(v.str(b.resolution) || null);
  }
  if (sets.length === 0) throw new HttpError(400, 'Nothing to update');

  await withTransaction(async (conn) => {
    const { clause, value } = lookupBy(req.params.id, 'complaint_number');
    const [rows] = await conn.query(`SELECT * FROM complaints WHERE ${clause} LIMIT 1 FOR UPDATE`, [value]);
    if (rows.length === 0) throw new HttpError(404, 'Complaint not found');
    const c = rows[0];

    await conn.query(`UPDATE complaints SET ${sets.join(', ')} WHERE id = ?`, [...params, c.id]);

    const statusChanged = b.status !== undefined && b.status !== c.status;
    if (statusChanged || b.resolution !== undefined) {
      await notify(conn, c.user_id, 'COMPLAINT_UPDATED',
        `Your complaint ${c.complaint_number} was updated${statusChanged ? `: status is now ${b.status}` : ''}`);
      await audit(conn, req, req.user.id, 'COMPLAINT_UPDATED',
        `Complaint ${c.complaint_number} updated${statusChanged ? ` to ${b.status}` : ''}`);
    }
  });

  res.json({ success: true, message: 'Complaint updated successfully' });
}));

// ============================================
// DASHBOARD STATS (staff)
// ============================================

app.get('/api/dashboard/stats', ...staffOnly, wrap(async (req, res) => {
  const [[firStats]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'Active'), 0)  AS active,
            COALESCE(SUM(status = 'Pending'), 0) AS pending
     FROM firs`
  );
  const [[complaintStats]] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'Pending'), 0) AS pending FROM complaints`
  );
  const [[emergencyStats]] = await pool.query(
    "SELECT COUNT(*) AS total FROM emergency_alerts WHERE status = 'Active'"
  );

  res.json({
    success: true,
    data: {
      totalFirs: Number(firStats.total),
      activeFirs: Number(firStats.active),
      pendingFirs: Number(firStats.pending),
      totalComplaints: Number(complaintStats.total),
      pendingComplaints: Number(complaintStats.pending),
      emergencyAlerts: Number(emergencyStats.total)
    }
  });
}));

// Real analytics computed from the database (staff)
app.get('/api/dashboard/analytics', ...staffOnly, wrap(async (req, res) => {
  const [byType] = await pool.query(
    'SELECT crime_type AS label, COUNT(*) AS count FROM firs GROUP BY crime_type ORDER BY count DESC'
  );
  const [byStatus] = await pool.query('SELECT status AS label, COUNT(*) AS count FROM firs GROUP BY status');
  const [byMonth] = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS label, COUNT(*) AS count FROM firs
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
     GROUP BY label ORDER BY label`
  );

  const total = byStatus.reduce((n, r) => n + Number(r.count), 0);
  const closed = Number((byStatus.find((r) => r.label === 'Closed') || {}).count || 0);
  const num = (rows) => rows.map((r) => ({ label: r.label, count: Number(r.count) }));

  res.json({
    success: true,
    data: {
      byType: num(byType),
      byStatus: num(byStatus),
      byMonth: num(byMonth),
      totalFirs: total,
      resolutionRate: total ? Math.round((closed / total) * 100) : 0
    }
  });
}));

// Officers (staff) - used for assignment and the Officers dashboard tab
app.get('/api/officers', ...staffOnly, wrap(async (req, res) => {
  const [officers] = await pool.query(
    `SELECT u.id, u.full_name, u.username, u.role, u.mobile, u.last_login,
            (SELECT COUNT(*) FROM firs f WHERE f.assigned_officer = u.id AND f.status <> 'Closed') AS open_cases
     FROM users u WHERE u.role IN ('officer', 'admin') AND u.is_active = 1
     ORDER BY u.full_name`
  );
  res.json({ success: true, data: officers.map((o) => ({ ...o, open_cases: Number(o.open_cases) })) });
}));

// ============================================
// EMERGENCY ROUTES
// ============================================

app.post('/api/emergency', authenticateToken, sosLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  const hasLocation = b.latitude !== undefined && b.latitude !== null && b.longitude !== undefined && b.longitude !== null;
  let lat = null;
  let lon = null;
  if (hasLocation) {
    lat = Number(b.latitude);
    lon = Number(b.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new HttpError(400, 'Invalid location coordinates');
    }
  }
  assertValid(v.text(b.details, 'Details', { max: 1000, required: false }));

  const emergencyNumber = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      `INSERT INTO emergency_alerts (alert_number, user_id, latitude, longitude, details, status)
       VALUES (?, ?, ?, ?, ?, 'Active')`,
      [`TMP${crypto.randomBytes(8).toString('hex')}`, req.user.id, lat, lon, v.str(b.details) || null]
    );
    const number = `EMG${10000 + result.insertId}`;
    await conn.query('UPDATE emergency_alerts SET alert_number = ? WHERE id = ?', [number, result.insertId]);

    await conn.query(
      `INSERT INTO notifications (user_id, type, message)
       SELECT id, 'EMERGENCY_ALERT', ? FROM users WHERE role IN ('admin', 'officer') AND is_active = 1`,
      [`EMERGENCY: ${number} - Immediate response required`]
    );
    await audit(conn, req, req.user.id, 'EMERGENCY_ALERT', `Emergency alert ${number} raised`);
    return number;
  });

  res.status(201).json({
    success: true,
    message: 'Emergency alert recorded',
    data: { emergencyNumber }
  });
}));

// List alerts (staff)
app.get('/api/emergency', ...staffOnly, wrap(async (req, res) => {
  const status = req.query.status;
  if (status) assertValid(v.oneOf(status, ['Active', 'Resolved'], 'Status'));
  const [alerts] = await pool.query(
    `SELECT e.id, e.alert_number, e.latitude, e.longitude, e.details, e.status, e.created_at, e.resolved_at,
            u.full_name AS reporter_name, u.mobile AS reporter_mobile
     FROM emergency_alerts e JOIN users u ON u.id = e.user_id
     ${status ? 'WHERE e.status = ?' : ''}
     ORDER BY (e.status = 'Active') DESC, e.created_at DESC LIMIT 100`,
    status ? [status] : []
  );
  res.json({ success: true, data: alerts });
}));

// Mark an alert resolved (staff)
app.patch('/api/emergency/:id', ...staffOnly, wrap(async (req, res) => {
  assertValid(v.oneOf((req.body || {}).status, ['Resolved'], 'Status'));
  await withTransaction(async (conn) => {
    const { clause, value } = lookupBy(req.params.id, 'alert_number');
    const [rows] = await conn.query(`SELECT * FROM emergency_alerts WHERE ${clause} LIMIT 1 FOR UPDATE`, [value]);
    if (rows.length === 0) throw new HttpError(404, 'Alert not found');
    const alert = rows[0];
    if (alert.status === 'Resolved') return;

    await conn.query(
      "UPDATE emergency_alerts SET status = 'Resolved', resolved_by = ?, resolved_at = NOW() WHERE id = ?",
      [req.user.id, alert.id]
    );
    await notify(conn, alert.user_id, 'EMERGENCY_RESOLVED', `Your emergency alert ${alert.alert_number} has been marked resolved`);
    await audit(conn, req, req.user.id, 'EMERGENCY_RESOLVED', `Alert ${alert.alert_number} resolved`);
  });
  res.json({ success: true, message: 'Alert marked as resolved' });
}));

// ============================================
// NOTIFICATIONS
// ============================================

app.get('/api/notifications', authenticateToken, wrap(async (req, res) => {
  const [notifications] = await pool.query(
    'SELECT id, type, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20',
    [req.user.id]
  );
  res.json({ success: true, data: notifications });
}));

app.patch('/api/notifications/:id/read', authenticateToken, wrap(async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ success: true, message: 'Notification marked as read' });
}));

// ============================================
// TRACKING (public)
// ============================================
// Anyone with a reference number can check progress, so this deliberately returns
// status information only - never names, phone numbers, addresses or case details.

app.get('/api/track/:referenceNumber', trackLimiter, wrap(async (req, res) => {
  const ref = String(req.params.referenceNumber).trim().toUpperCase();
  if (!/^(FIR|CMP)\d{3,10}$/.test(ref)) {
    throw new HttpError(400, 'Reference numbers look like FIR1001 or CMP2001');
  }

  if (ref.startsWith('FIR')) {
    const [rows] = await pool.query(
      'SELECT fir_number, crime_type, status, created_at, updated_at FROM firs WHERE fir_number = ?', [ref]
    );
    if (rows.length > 0) {
      const r = rows[0];
      return res.json({
        success: true,
        type: 'FIR',
        data: { reference: r.fir_number, category: r.crime_type, status: r.status, submittedOn: r.created_at, lastUpdated: r.updated_at }
      });
    }
  } else {
    const [rows] = await pool.query(
      'SELECT complaint_number, complaint_type, status, created_at, updated_at FROM complaints WHERE complaint_number = ?', [ref]
    );
    if (rows.length > 0) {
      const r = rows[0];
      return res.json({
        success: true,
        type: 'COMPLAINT',
        data: { reference: r.complaint_number, category: r.complaint_type, status: r.status, submittedOn: r.created_at, lastUpdated: r.updated_at }
      });
    }
  }

  throw new HttpError(404, 'No record found with this reference number');
}));

// ============================================
// HEALTH CHECK (used by Docker / hosting platforms)
// ============================================

app.get('/api/health', wrap(async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, message: 'Rakshak Portal API is running', database: 'up', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Health check: database unreachable:', err.message);
    res.status(503).json({ success: false, message: 'Database unavailable', database: 'down', timestamp: new Date().toISOString() });
  }
}));

// ============================================
// FRONTEND + ERROR HANDLING
// ============================================

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found' });
});

app.use(express.static(path.join(__dirname, 'frontend'), {
  maxAge: isProd ? '1h' : 0,
  index: 'index.html'
}));

app.use((req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ success: false, error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Request body is not valid JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Request body is too large' });
  }
  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
});

// ============================================
// START SERVER
// ============================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hosting platforms often start the app before the database accepts connections.
async function prepareDatabase(attempts = 10, delayMs = 3000) {
  for (let i = 1; ; i++) {
    try {
      if (DB_AUTO_INIT) await applySchema();
      const conn = await pool.getConnection();
      conn.release();
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      console.warn(`Database not ready (${err.code || err.message}). Retry ${i}/${attempts - 1} in ${delayMs / 1000}s...`);
      await sleep(delayMs);
    }
  }
}

let server;

async function start() {
  try {
    await prepareDatabase();
    console.log('Database connected successfully');
    await bootstrapAdminFromEnv(pool);
  } catch (err) {
    console.error('Database connection failed:', err.message);
    console.error('Check DB_HOST / DB_USER / DB_PASSWORD / DB_NAME (or DATABASE_URL) and that MySQL is running.');
    process.exit(1);
  }

  server = app.listen(PORT, () => {
    console.log(`Rakshak Portal running in ${NODE_ENV} mode on port ${PORT}`);
    console.log(`Open http://localhost:${PORT}`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received - shutting down gracefully`);
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => console.error('Unhandled promise rejection:', reason));

if (require.main === module) {
  start();
}

module.exports = app;
