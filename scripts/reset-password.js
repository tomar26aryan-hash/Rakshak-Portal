'use strict';
// Reset a user's password (e.g. a locked-out admin).
//
//   npm run reset-password -- --username chief
//
// You will be asked for the new password (input is hidden), or pass --password.
require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { createPool } = require('../lib/db');
const v = require('../lib/validate');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  const a = parseArgs(process.argv.slice(2));
  const pool = createPool();
  try {
    const username = a.username || await ask('Username or email: ');
    const password = a.password || await ask('New password (min 8 chars, letters + numbers): ', { hidden: true });
    const problem = v.password(password);
    if (problem) throw new Error(problem);

    const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS) || 12);
    const [res] = await pool.query(
      'UPDATE users SET password = ?, is_active = 1 WHERE username = ? OR email = ?',
      [hash, String(username).trim(), String(username).trim().toLowerCase()]
    );
    if (res.affectedRows === 0) throw new Error('No user found with that username or email');
    console.log(`Password updated for "${username}". Existing login sessions stay valid until they expire (${process.env.JWT_EXPIRES_IN || '8h'}).`);
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
