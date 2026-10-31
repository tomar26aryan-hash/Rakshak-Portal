'use strict';
// LOCAL DEVELOPMENT ONLY: creates the demo accounts from the original README
// (admin / admin123, officer / officer123, citizen / citizen123) plus a few sample records.
// Refuses to run when NODE_ENV=production so these weak passwords can never go live.
require('dotenv').config();
const { createPool } = require('../lib/db');
const { applySchema, createUser } = require('../lib/init');

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo accounts with NODE_ENV=production.');
  process.exit(1);
}

const DEMO = [
  { username: 'admin',   email: 'admin@rakshak.local',   password: 'admin123',   fullName: 'Admin User',      mobile: '9000000001', role: 'admin' },
  { username: 'officer', email: 'officer@rakshak.local', password: 'officer123', fullName: 'Inspector Sharma', mobile: '9000000002', role: 'officer' },
  { username: 'citizen', email: 'citizen@rakshak.local', password: 'citizen123', fullName: 'Citizen User',    mobile: '9000000003', role: 'citizen' }
];

(async () => {
  process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '10';
  const pool = createPool();
  try {
    await applySchema();
    const ids = {};
    for (const u of DEMO) {
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [u.username]);
      if (existing.length) { ids[u.username] = existing[0].id; console.log(`exists : ${u.username}`); continue; }
      ids[u.username] = await createUser(pool, u);
      console.log(`created: ${u.username} / ${u.password}  (${u.role})`);
    }

    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM firs');
    if (n === 0) {
      const samples = [
        ['Theft',      'theft',      'Active',  'Mobile phone snatched near the bus stand.',          '2024-01-15'],
        ['Fraud',      'fraud',      'Pending', 'Online payment fraud of Rs. 12,000 via a fake link.', '2024-01-14'],
        ['Cybercrime', 'cybercrime', 'Closed',  'Social media account was hacked and misused.',        '2024-01-13']
      ];
      for (const [, type, status, details, date] of samples) {
        const [r] = await pool.query(
          `INSERT INTO firs (fir_number, user_id, complainant_name, mobile, address, crime_type,
           incident_details, incident_date, location, status) VALUES (?, ?, 'Citizen User', '9000000003',
           'Demo address, Meerut', ?, ?, ?, 'Demo location', ?)`,
          [`TMP${Date.now()}${Math.random()}`.slice(0, 29), ids.citizen, type, details, date, status]
        );
        await pool.query('UPDATE firs SET fir_number = ? WHERE id = ?', [`FIR${1000 + r.insertId}`, r.insertId]);
      }
      console.log('created: 3 sample FIRs');
    }
    console.log('\nDemo data ready. Do NOT use these accounts in production.');
  } catch (err) {
    console.error('seed:demo failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
