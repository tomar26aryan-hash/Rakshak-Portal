'use strict';
// Creates tables (idempotent) and optionally bootstraps the first admin account.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { createAdminConnection, baseConfig } = require('./db');
const v = require('./validate');

const SCHEMA_FILE = path.join(__dirname, '..', 'database', 'schema.sql');

async function applySchema() {
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  let conn;
  try {
    conn = await createAdminConnection();
  } catch (err) {
    // Database does not exist yet - try to create it (needs CREATE privilege).
    if (err.code !== 'ER_BAD_DB_ERROR') throw err;
    const dbName = baseConfig().database;
    if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`Refusing to auto-create database with unusual name "${dbName}"`);
    const boot = await createAdminConnection({ withDatabase: false });
    await boot.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await boot.end();
    conn = await createAdminConnection();
  }
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

// Inserts a user with a bcrypt-hashed password. Throws on invalid input.
async function createUser(pool, { username, email, password, fullName, mobile, role }) {
  const problem = v.firstError(
    v.username(username), v.email(email), v.password(password),
    v.text(fullName, 'Full name', { min: 2, max: 100 }), v.mobile(mobile),
    v.oneOf(role, ['citizen', 'officer', 'admin'], 'Role')
  );
  if (problem) throw new Error(problem);
  const rounds = Number(process.env.BCRYPT_ROUNDS) || 12;
  const hash = await bcrypt.hash(password, rounds);
  const [res] = await pool.query(
    'INSERT INTO users (username, email, password, full_name, mobile, role) VALUES (?, ?, ?, ?, ?, ?)',
    [v.str(username), v.str(email).toLowerCase(), hash, v.str(fullName), v.str(mobile).replace(/[\s-]/g, ''), role]
  );
  return res.insertId;
}

// If ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD are set and no admin exists yet,
// create one. This lets you deploy to hosts that give you no shell access.
async function bootstrapAdminFromEnv(pool, log = console) {
  const { ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) return false;

  const [rows] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (rows.length > 0) return false;

  await createUser(pool, {
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    fullName: process.env.ADMIN_FULL_NAME || 'Portal Administrator',
    mobile: process.env.ADMIN_MOBILE || '0000000000',
    role: 'admin'
  });
  log.log(`Created initial admin account "${ADMIN_USERNAME}". Remove ADMIN_PASSWORD from your environment now.`);
  return true;
}

module.exports = { applySchema, createUser, bootstrapAdminFromEnv };
