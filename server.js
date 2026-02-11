// server.js - Main Backend Server for Rakshak Portal
// Run: npm install express mysql2 bcryptjs jsonwebtoken cors dotenv body-parser

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Akshita_123',
  database: process.env.DB_NAME || 'rakshak_portal',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ==================== MIDDLEWARE ====================

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Admin Authorization Middleware
const requireAdmin = (req, res, next) => {
  if (req.user.user_type !== 'admin' && req.user.user_type !== 'officer') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ==================== AUTH ROUTES ====================

// User Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, full_name, mobile, address } = req.body;

    // Validate input
    if (!username || !email || !password || !full_name || !mobile) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user exists
    const [existing] = await pool.query(
      'SELECT user_id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert user
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash, full_name, mobile, address, user_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [username, email, password_hash, full_name, mobile, address || '', 'citizen']
    );

    res.status(201).json({
      message: 'Registration successful',
      user_id: result.insertId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user
    const [users] = await pool.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id]);

    // Generate token
    const token = jwt.sign(
      { user_id: user.user_id, username: user.username, user_type: user.user_type },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        user_type: user.user_type
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ==================== FIR ROUTES ====================

// Generate FIR Number
function generateFirNumber() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `FIR${timestamp}${random}`;
}

// File New FIR
app.post('/api/fir/create', authenticateToken, async (req, res) => {
  try {
    const {
      complainant_name, mobile, email, address,
      crime_type, incident_details, incident_date, incident_location
    } = req.body;

    // Validate required fields
    if (!complainant_name || !mobile || !address || !crime_type || !incident_details || !incident_date || !incident_location) {
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    const fir_number = generateFirNumber();

    const [result] = await pool.query(
      `INSERT INTO fir (fir_number, user_id, complainant_name, mobile, email, address, 
       crime_type, incident_details, incident_date, incident_location, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [fir_number, req.user.user_id, complainant_name, mobile, email || '', address,
       crime_type, incident_details, incident_date, incident_location]
    );

    // Create notification
    await pool.query(
      `INSERT INTO notifications (user_id, notification_type, title, message, reference_id, reference_type) 
       VALUES (?, 'fir_update', 'FIR Filed Successfully', ?, ?, 'fir')`,
      [req.user.user_id, `Your FIR ${fir_number} has been filed successfully`, result.insertId]
    );

    res.status(201).json({
      message: 'FIR filed successfully',
      fir_number,
      fir_id: result.insertId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to file FIR' });
  }
});

// Get All FIRs (Admin)
app.get('/api/fir/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, crime_type, limit = 50, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM fir WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (crime_type) {
      query += ' AND crime_type = ?';
      params.push(crime_type);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [firs] = await pool.query(query, params);
    
    res.json({ firs, count: firs.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch FIRs' });
  }
});

// Get User's FIRs
app.get('/api/fir/my-firs', authenticateToken, async (req, res) => {
  try {
    const [firs] = await pool.query(
      'SELECT * FROM fir WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.user_id]
    );
    
    res.json({ firs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch FIRs' });
  }
});

// Get FIR by Number
app.get('/api/fir/track/:fir_number', authenticateToken, async (req, res) => {
  try {
    const { fir_number } = req.params;

    const [firs] = await pool.query(
      'SELECT * FROM fir WHERE fir_number = ?',
      [fir_number]
    );

    if (firs.length === 0) {
      return res.status(404).json({ error: 'FIR not found' });
    }

    const fir = firs[0];

    // Check authorization
    if (req.user.user_type === 'citizen' && fir.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get status history
    const [history] = await pool.query(
      'SELECT * FROM fir_status_history WHERE fir_id = ? ORDER BY changed_at DESC',
      [fir.fir_id]
    );

    res.json({ fir, history });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch FIR' });
  }
});

// Update FIR Status (Admin)
app.put('/api/fir/update-status/:fir_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { fir_id } = req.params;
    const { status, remarks } = req.body;

    // Get current FIR
    const [firs] = await pool.query('SELECT * FROM fir WHERE fir_id = ?', [fir_id]);
    
    if (firs.length === 0) {
      return res.status(404).json({ error: 'FIR not found' });
    }

    const old_status = firs[0].status;

    // Update status
    await pool.query(
      'UPDATE fir SET status = ?, updated_at = NOW() WHERE fir_id = ?',
      [status, fir_id]
    );

    // Add to history
    await pool.query(
      'INSERT INTO fir_status_history (fir_id, old_status, new_status, changed_by, remarks) VALUES (?, ?, ?, ?, ?)',
      [fir_id, old_status, status, req.user.user_id, remarks || '']
    );

    // Notify user
    await pool.query(
      `INSERT INTO notifications (user_id, notification_type, title, message, reference_id, reference_type) 
       VALUES (?, 'fir_update', 'FIR Status Updated', ?, ?, 'fir')`,
      [firs[0].user_id, `Your FIR ${firs[0].fir_number} status changed to ${status}`, fir_id]
    );

    res.json({ message: 'FIR status updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update FIR status' });
  }
});

// ==================== COMPLAINT ROUTES ====================

// Generate Complaint Number
function generateComplaintNumber() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `CMP${timestamp}${random}`;
}

// File Complaint
app.post('/api/complaint/create', authenticateToken, async (req, res) => {
  try {
    const { complainant_name, contact, complaint_type, complaint_details } = req.body;

    if (!complainant_name || !contact || !complaint_type || !complaint_details) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const complaint_number = generateComplaintNumber();

    const [result] = await pool.query(
      `INSERT INTO complaints (complaint_number, user_id, complainant_name, contact, 
       complaint_type, complaint_details, status) VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [complaint_number, req.user.user_id, complainant_name, contact, complaint_type, complaint_details]
    );

    res.status(201).json({
      message: 'Complaint submitted successfully',
      complaint_number,
      complaint_id: result.insertId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit complaint' });
  }
});

// Get All Complaints (Admin)
app.get('/api/complaint/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [complaints] = await pool.query(
      'SELECT * FROM complaints ORDER BY created_at DESC LIMIT 100'
    );
    
    res.json({ complaints });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
});

// Get User's Complaints
app.get('/api/complaint/my-complaints', authenticateToken, async (req, res) => {
  try {
    const [complaints] = await pool.query(
      'SELECT * FROM complaints WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.user_id]
    );
    
    res.json({ complaints });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
});

// Track Complaint
app.get('/api/complaint/track/:complaint_number', authenticateToken, async (req, res) => {
  try {
    const { complaint_number } = req.params;

    const [complaints] = await pool.query(
      'SELECT * FROM complaints WHERE complaint_number = ?',
      [complaint_number]
    );

    if (complaints.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    res.json({ complaint: complaints[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch complaint' });
  }
});

// Update Complaint Status (Admin)
app.put('/api/complaint/update-status/:complaint_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { complaint_id } = req.params;
    const { status, resolution_details } = req.body;

    await pool.query(
      'UPDATE complaints SET status = ?, resolution_details = ?, updated_at = NOW() WHERE complaint_id = ?',
      [status, resolution_details || '', complaint_id]
    );

    res.json({ message: 'Complaint status updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update complaint status' });
  }
});

// ==================== EMERGENCY ROUTES ====================

// Create Emergency Alert
app.post('/api/emergency/alert', authenticateToken, async (req, res) => {
  try {
    const { alert_type, latitude, longitude, location_description } = req.body;

    const [result] = await pool.query(
      `INSERT INTO emergency_alerts (user_id, alert_type, latitude, longitude, location_description, status) 
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [req.user.user_id, alert_type, latitude, longitude, location_description || '']
    );

    res.status(201).json({
      message: 'Emergency alert sent successfully',
      alert_id: result.insertId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send emergency alert' });
  }
});

// ==================== STATISTICS ROUTES ====================

// Get Dashboard Statistics (Admin)
app.get('/api/stats/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Total FIRs
    const [firCount] = await pool.query('SELECT COUNT(*) as count FROM fir');
    
    // Active FIRs
    const [activeFirs] = await pool.query(
      "SELECT COUNT(*) as count FROM fir WHERE status IN ('Pending', 'Active', 'Under Investigation')"
    );
    
    // Pending Complaints
    const [pendingComplaints] = await pool.query(
      "SELECT COUNT(*) as count FROM complaints WHERE status = 'Pending'"
    );
    
    // Emergency Alerts
    const [emergencyAlerts] = await pool.query(
      "SELECT COUNT(*) as count FROM emergency_alerts WHERE status = 'active'"
    );

    res.json({
      total_firs: firCount[0].count,
      active_firs: activeFirs[0].count,
      pending_complaints: pendingComplaints[0].count,
      emergency_alerts: emergencyAlerts[0].count
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🚀 Rakshak Portal API running on port ${PORT}`);
  console.log(`📍 API Base URL: http://localhost:${PORT}/api`);
});

// Test database connection
pool.getConnection()
  .then(connection => {
    console.log('✅ Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });