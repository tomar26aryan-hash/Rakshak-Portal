'use strict';
// Create an admin / officer / citizen account from the command line.
//
//   npm run create-user -- --role officer --username inspector.rao \
//        --email rao@example.com --name "Inspector Rao" --mobile 9876543210
//
// If --password is omitted you will be asked for it (input is hidden).
require('dotenv').config();
const readline = require('readline');
const { createPool } = require('../lib/db');
const { createUser } = require('../lib/init');

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
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  const a = parseArgs(process.argv.slice(2));
  const pool = createPool();
  try {
    const role = a.role || await ask('Role (admin/officer/citizen): ');
    const username = a.username || await ask('Username: ');
    const email = a.email || await ask('Email: ');
    const fullName = a.name || await ask('Full name: ');
    const mobile = a.mobile || await ask('Mobile: ');
    const password = a.password || await ask('Password (min 8 chars, letters + numbers): ', { hidden: true });

    const id = await createUser(pool, { username, email, password, fullName, mobile, role });
    console.log(`Created ${role} "${username}" (id ${id}).`);
  } catch (err) {
    console.error(err.code === 'ER_DUP_ENTRY' ? 'That username or email already exists.' : `Failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
