# 🚔 Rakshak Portal - Digital Police & Citizen Service Platform

[![Node.js](https://img.shields.io/badge/Node.js-14.x+-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-blue.svg)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.x-orange.svg)](https://www.mysql.com/)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

**Rakshak Portal** is a comprehensive digital platform designed to bridge the gap between law enforcement and citizens. It provides online services for filing FIRs, registering complaints, tracking case status, and emergency alerts.

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [System Architecture](#-system-architecture)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Database Setup](#-database-setup)
- [Configuration](#-configuration)
- [API Documentation](#-api-documentation)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [Security Features](#-security-features)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### For Citizens
- 👤 **User Registration & Authentication** - Secure JWT-based authentication
- 📝 **Online FIR Filing** - File First Information Reports from anywhere
- 🗣️ **Complaint Management** - Register and track general complaints
- 🔍 **Case Tracking** - Real-time status updates on FIRs and complaints
- 🚨 **Emergency Alerts** - SOS feature with location sharing
- 🔔 **Notifications** - Get updates on your cases

### For Police Officers/Admin
- 📊 **Dashboard Statistics** - View comprehensive crime statistics
- 🔄 **Status Management** - Update FIR and complaint statuses
- 📍 **Station Management** - Manage police station information
- 👮 **Officer Assignment** - Assign cases to officers
- 📈 **Analytics** - Track crime trends and patterns
- ⚡ **Emergency Response** - Monitor and respond to emergency alerts

### Technical Features
- 🔐 **JWT Authentication** - Secure token-based authentication
- 🗃️ **Normalized Database** - 3NF database design with ACID properties
- 🎯 **RESTful API** - Clean and consistent API endpoints
- 📜 **Status History** - Complete audit trail for all status changes
- 🔒 **Role-Based Access Control** - Admin, Officer, and Citizen roles
- 🚀 **Scalable Architecture** - Connection pooling and optimized queries

---

## 🛠 Tech Stack

### Backend
- **Runtime:** Node.js (v14+)
- **Framework:** Express.js 4.21.2
- **Database:** MySQL 8.x
- **Authentication:** JWT (JSON Web Tokens)
- **Password Hashing:** bcryptjs
- **Database Driver:** mysql2 (with Promises)

### Frontend
- HTML5, CSS3, JavaScript (vanilla)
- Responsive design

### Development Tools
- **nodemon** - Auto-restart during development
- **dotenv** - Environment variable management

---

## 🏗 System Architecture

```
┌─────────────────┐
│   Frontend      │
│  (HTML/CSS/JS)  │
└────────┬────────┘
         │
         │ HTTP/HTTPS
         │
┌────────▼────────┐
│  Express.js     │
│   REST API      │
│  ┌──────────┐   │
│  │  Auth    │   │
│  │  JWT     │   │
│  └──────────┘   │
└────────┬────────┘
         │
         │ mysql2
         │
┌────────▼────────┐
│   MySQL DB      │
│  ┌──────────┐   │
│  │  Users   │   │
│  │  FIR     │   │
│  │  Cases   │   │
│  │  Alerts  │   │
│  └──────────┘   │
└─────────────────┘
```

---

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14.0.0 or higher)
- **npm** (v6.0.0 or higher)
- **MySQL** (v8.0 or higher)
- **Git** (for version control)

Check your installations:
```bash
node --version
npm --version
mysql --version
```

---

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/rakshak-portal.git
cd rakshak-portal
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages:
- express
- mysql2
- bcryptjs
- jsonwebtoken
- cors
- dotenv
- body-parser

---

## 🗄️ Database Setup

### 1. Create Database

Login to MySQL:
```bash
mysql -u root -p
```

Create the database:
```sql
CREATE DATABASE rakshak_portal;
```

### 2. Import Schema

Exit MySQL shell and run:
```bash
mysql -u root -p rakshak_portal < schema.sql
```

This will create all tables, indexes, triggers, stored procedures, and sample data.

### Database Structure

The database includes the following main tables:
- **users** - User accounts (citizens, officers, admins)
- **fir** - First Information Reports
- **complaints** - General complaints
- **crime_types** - Crime category lookup
- **police_stations** - Station information
- **emergency_alerts** - Emergency SOS alerts
- **notifications** - User notifications
- **fir_status_history** - FIR status audit trail

---

## ⚙️ Configuration

### 1. Environment Variables

Create a `.env` file in the root directory:

```bash
cp _env .env
```

Edit `.env` with your configuration:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=rakshak_portal

# Server Configuration
PORT=3000

# JWT Secret (IMPORTANT: Change this in production!)
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
```

### 2. Security Configuration

⚠️ **Important for Production:**

1. **Change JWT Secret:** Generate a strong random string
2. **Database Credentials:** Use secure passwords
3. **Enable HTTPS:** Use SSL/TLS certificates
4. **Set CORS Origins:** Restrict to your domain only
5. **Rate Limiting:** Implement rate limiting for API endpoints

---

## 📡 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "full_name": "John Doe",
  "mobile": "9876543210",
  "address": "123 Main St, City"
}
```

**Response:**
```json
{
  "message": "Registration successful",
  "user_id": 1
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "john_doe",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "user_id": 1,
    "username": "john_doe",
    "full_name": "John Doe",
    "email": "john@example.com",
    "user_type": "citizen"
  }
}
```

### FIR Endpoints

#### File New FIR
```http
POST /api/fir/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "complainant_name": "John Doe",
  "mobile": "9876543210",
  "email": "john@example.com",
  "address": "123 Main St",
  "crime_type": "Theft",
  "incident_details": "My bike was stolen from the parking lot",
  "incident_date": "2024-02-10",
  "incident_location": "Central Mall Parking"
}
```

**Response:**
```json
{
  "message": "FIR filed successfully",
  "fir_number": "FIR123456789",
  "fir_id": 1
}
```

#### Track FIR
```http
GET /api/fir/track/FIR123456789
Authorization: Bearer <token>
```

#### Get My FIRs
```http
GET /api/fir/my-firs
Authorization: Bearer <token>
```

#### Update FIR Status (Admin Only)
```http
PUT /api/fir/update-status/1
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "Under Investigation",
  "remarks": "Investigation started, evidence being collected"
}
```

### Complaint Endpoints

#### File Complaint
```http
POST /api/complaint/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "complainant_name": "John Doe",
  "contact": "9876543210",
  "complaint_type": "Noise Pollution",
  "complaint_details": "Loud music after 10 PM"
}
```

#### Track Complaint
```http
GET /api/complaint/track/CMP123456789
Authorization: Bearer <token>
```

#### Get My Complaints
```http
GET /api/complaint/my-complaints
Authorization: Bearer <token>
```

### Emergency Endpoints

#### Send Emergency Alert
```http
POST /api/emergency/alert
Authorization: Bearer <token>
Content-Type: application/json

{
  "alert_type": "medical_emergency",
  "latitude": 28.7041,
  "longitude": 77.1025,
  "location_description": "Near Central Park Gate 2"
}
```

### Statistics Endpoints (Admin Only)

#### Get Dashboard Stats
```http
GET /api/stats/dashboard
Authorization: Bearer <token>
```

**Response:**
```json
{
  "total_firs": 150,
  "active_firs": 45,
  "pending_complaints": 23,
  "emergency_alerts": 2
}
```

---

## 💻 Usage

### Development Mode

Start the server with auto-reload:

```bash
npm run dev
```

### Production Mode

Start the server:

```bash
npm start
```

The server will start on `http://localhost:3000`

### Testing the API

You can test the API using:
- **Postman** - Import the API endpoints
- **cURL** - Command line testing
- **Thunder Client** - VS Code extension
- **Frontend** - Use the included HTML interface

Example cURL request:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"john_doe","password":"password123"}'
```

---

## 📁 Project Structure

```
rakshak-portal/
├── server.js              # Main Express server
├── package.json           # Dependencies and scripts
├── package-lock.json      # Locked dependency versions
├── schema.sql            # Database schema and setup
├── index.html            # Frontend interface
├── .env                  # Environment variables (create this)
├── _env                  # Environment template
├── README.md             # This file
└── node_modules/         # Dependencies (auto-generated)
```

### Key Files

- **server.js** - Main application entry point with all API routes
- **schema.sql** - Complete database schema with tables, triggers, and procedures
- **index.html** - Web interface for users
- **.env** - Configuration file (not in git)

---

## 🔒 Security Features

### Implemented Security Measures

1. **Password Security**
   - Passwords hashed using bcrypt (10 salt rounds)
   - Never store plain text passwords

2. **Authentication**
   - JWT tokens with 24-hour expiry
   - Token validation on protected routes

3. **Authorization**
   - Role-based access control (RBAC)
   - Admin-only endpoints protected

4. **SQL Injection Prevention**
   - Parameterized queries
   - mysql2 prepared statements

5. **CORS Protection**
   - Configurable CORS headers
   - Origin validation

6. **Input Validation**
   - Required field validation
   - Type checking on inputs

### Recommended Additional Security

For production deployment, consider adding:
- **Rate Limiting** - Prevent brute force attacks
- **Helmet.js** - Security headers
- **HTTPS/TLS** - Encrypt data in transit
- **Input Sanitization** - XSS prevention
- **CSRF Protection** - Cross-site request forgery prevention
- **Session Management** - Secure session handling
- **Logging & Monitoring** - Track suspicious activities

---

## 🔧 Troubleshooting

### Common Issues

#### Database Connection Failed
```
Error: ER_ACCESS_DENIED_ERROR
```
**Solution:** Check your database credentials in `.env` file

#### Port Already in Use
```
Error: EADDRINUSE
```
**Solution:** Change port in `.env` or kill process using port 3000:
```bash
# Find process
lsof -i :3000
# Kill process
kill -9 <PID>
```

#### JWT Secret Warning
```
Warning: Using default JWT secret
```
**Solution:** Set a strong JWT_SECRET in your `.env` file

---

## 🧪 Testing

### Manual Testing Checklist

- [ ] User registration works
- [ ] User login returns JWT token
- [ ] FIR creation successful
- [ ] FIR tracking shows correct data
- [ ] Complaint filing works
- [ ] Admin can update FIR status
- [ ] Emergency alerts send successfully
- [ ] Dashboard stats display correctly

### Sample Test User

After running schema.sql, use this test account:
```
Username: admin
Password: admin123
User Type: admin
```

---

## 🤝 Contributing

We welcome contributions to make Rakshak Portal better!

### How to Contribute

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Contribution Guidelines

- Follow existing code style
- Write meaningful commit messages
- Add comments for complex logic
- Update documentation as needed
- Test your changes thoroughly

---

## 📝 Roadmap

### Upcoming Features

- [ ] File upload for FIR evidence
- [ ] Real-time chat with officers
- [ ] Mobile app (React Native)
- [ ] SMS notifications
- [ ] Payment gateway integration
- [ ] Multi-language support
- [ ] Advanced analytics dashboard
- [ ] AI-powered crime prediction
- [ ] Integration with government databases

---
