'use strict';
// Shared MySQL configuration. Used by the server and by the scripts in /scripts.
const mysql = require('mysql2/promise');

function baseConfig() {
  let cfg;

  if (process.env.DATABASE_URL) {
    // e.g. mysql://user:pass@host:3306/dbname  (Railway, Aiven, TiDB Cloud, ...)
    const u = new URL(process.env.DATABASE_URL);
    cfg = {
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: decodeURIComponent(u.pathname.replace(/^\//, ''))
    };
  } else {
    cfg = {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'rakshak_portal'
    };
  }

  cfg.charset = 'utf8mb4';
  // Always UTC on the wire; DATE columns stay plain 'YYYY-MM-DD' strings so
  // the server's time zone can never shift an incident date by a day.
  cfg.timezone = 'Z';
  cfg.dateStrings = ['DATE'];

  // Most managed MySQL providers require TLS.
  if (String(process.env.DB_SSL).toLowerCase() === 'true') {
    cfg.ssl = { rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED).toLowerCase() !== 'false' };
  }
  return cfg;
}

function createPool() {
  const pool = mysql.createPool({
    ...baseConfig(),
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
    queueLimit: 0,
    enableKeepAlive: true
  });
  // Make NOW()/CURRENT_TIMESTAMP behave identically on every host.
  pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));
  return pool;
}

// A one-off connection that can run the multi-statement schema file.
async function createAdminConnection({ withDatabase = true } = {}) {
  const cfg = baseConfig();
  if (!withDatabase) delete cfg.database;
  return mysql.createConnection({ ...cfg, multipleStatements: true });
}

module.exports = { baseConfig, createPool, createAdminConnection };
