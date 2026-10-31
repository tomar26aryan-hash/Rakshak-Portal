'use strict';
// Usage: npm run db:init
// Creates all tables (and the database itself if your DB user is allowed to).
// Also creates the first admin if ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD are set.
require('dotenv').config();
const { createPool } = require('../lib/db');
const { applySchema, bootstrapAdminFromEnv } = require('../lib/init');

(async () => {
  const pool = createPool();
  try {
    await applySchema();
    console.log('Database schema is up to date.');
    const created = await bootstrapAdminFromEnv(pool);
    if (!created) console.log('Admin bootstrap skipped (ADMIN_* not set, or an admin already exists).');
  } catch (err) {
    console.error('db:init failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
