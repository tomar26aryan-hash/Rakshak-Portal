# 🚔 Rakshak Portal – Digital Police & Citizen Service Platform

> A unified digital platform bridging the gap between **citizens and police authorities**, enabling online FIR filing, complaint tracking, emergency SOS alerts and staff case management — all in one place.

---

## 📌 Current status

| Feature | Status |
| --- | --- |
| Citizen registration & login (JWT, bcrypt) | ✅ Working |
| File an FIR online, get a reference number | ✅ Working |
| Lodge a complaint, get a reference number | ✅ Working |
| Public status tracking by reference number (no personal data exposed) | ✅ Working |
| "My Records" – citizens see their FIRs, complaints and notifications | ✅ Working |
| Staff dashboard – FIR & complaint management, status updates, officer assignment | ✅ Working |
| Emergency SOS with GPS location → staff dashboard | ✅ Working (see limitations) |
| Audit log, notifications, case history timeline | ✅ Working |
| Analytics (crime type / status / monthly trend, resolution rate) | ✅ Working (real data) |
| Certificates, NOC, tenant verification, character certificates | 🔜 Planned |
| Traffic challan payment, lost & found, anonymous tips | 🔜 Planned |
| Evidence uploads, CCTV / judiciary integration, mobile app | 🔜 Future scope |

---

## 🚀 Quick start (local development)

**Requirements:** Node.js 20+ and MySQL 8 (or MariaDB 10.5+).

```bash
git clone https://github.com/aksh-ita757/Rakshak-Portal.git
cd Rakshak-Portal
npm install

cp .env.example .env        # then edit .env: set DB_USER / DB_PASSWORD / DB_NAME
npm run db:init             # creates the database tables
npm run seed:demo           # OPTIONAL: demo accounts + sample FIRs (development only)
npm run dev                 # http://localhost:5000
```

Demo accounts created by `seed:demo` (never available in production): `admin / admin123`, `officer / officer123`, `citizen / citizen123`.

The backend serves the website too – there is **no separate frontend server** to start.

---

## ⚙️ Configuration

All settings are environment variables (see [`.env.example`](.env.example)).

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | – | Set to `production` when deployed. |
| `PORT` | – | Default `5000`. Hosting platforms usually set this for you. |
| `JWT_SECRET` | **Yes (prod)** | 32+ random characters. The server refuses to start in production without it. |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | Yes* | MySQL connection. |
| `DATABASE_URL` | Yes* | Alternative to the five variables above: `mysql://user:pass@host:3306/db`. |
| `DB_SSL` | – | `true` for managed databases that require TLS. |
| `DB_AUTO_INIT` | – | Default `true`: create missing tables on start-up. |
| `ADMIN_USERNAME` `ADMIN_EMAIL` `ADMIN_PASSWORD` | – | Creates the first admin on start-up if none exists. |
| `TRUST_PROXY` | – | `1` behind a reverse proxy / PaaS (default in production); `false` if exposed directly. |
| `FORCE_HTTPS` | – | `true` to redirect HTTP → HTTPS (when TLS is terminated by a proxy). |
| `CORS_ORIGIN` | – | Only if the frontend lives on a different domain. |
| `JWT_EXPIRES_IN` | – | Login lifetime, default `8h`. |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

---

## 🌐 Deployment

### Option A – Docker Compose (any VPS / server)

```bash
cp .env.example .env
# edit .env: set JWT_SECRET, DB_PASSWORD, DB_ROOT_PASSWORD,
#            and ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD for your first admin
docker compose up -d --build
curl http://localhost:5000/api/health
```

This starts MySQL 8.4 (data kept in a Docker volume) and the portal. Tables and the first admin are created automatically.
For HTTPS, put a reverse proxy in front – for example [Caddy](https://caddyserver.com) with this whole `Caddyfile`:

```
portal.example.com {
    reverse_proxy localhost:5000
}
```

then set `TRUST_PROXY=1` and `FORCE_HTTPS=true` in `.env` and run `docker compose up -d` again.

### Option B – Platform-as-a-Service (Render, Railway, Fly.io, …)

1. Create a **MySQL database** with any provider (your PaaS, Aiven, TiDB Cloud, …) and copy its connection URL.
2. Create a **Web Service** from this GitHub repo:
   * Build command: `npm ci`
   * Start command: `npm start`
   * Health check path: `/api/health`
3. Add environment variables: `NODE_ENV=production`, `JWT_SECRET`, `DATABASE_URL`, `DB_SSL=true` (if the provider needs TLS), `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
4. Deploy. On first start the tables and the first admin are created automatically.
5. **Remove `ADMIN_PASSWORD`** from the environment once you've logged in.

### Option C – Plain server (no Docker)

```bash
npm ci --omit=dev
cp .env.example .env && nano .env
npm run db:init
NODE_ENV=production node server.js     # run it under systemd or pm2 so it restarts automatically
```

### After deploying – checklist

- [ ] `https://your-site/api/health` returns `"database":"up"`
- [ ] Log in as the admin, then remove `ADMIN_PASSWORD` from the environment
- [ ] Register a test citizen, file a test FIR, and check it on the dashboard
- [ ] Set up regular database backups (e.g. a nightly `mysqldump`)
- [ ] Never reuse the old hard-coded secret `rakshak_secret_2024_thunderbolts` – it is visible in the Git history of earlier versions

---

## 👮 Staff accounts

Citizens can register themselves. **Officer and admin accounts can only be created by an administrator** (self-registration always creates a citizen):

```bash
npm run create-user -- --role officer --username inspector.rao \
     --email rao@example.com --name "Inspector Rao" --mobile 9876543210
# (you will be asked for the password; use --role admin for another admin)

npm run reset-password -- --username inspector.rao
```

With Docker: `docker compose exec app node scripts/create-user.js --role officer ...`

---

## 🔌 API reference

All endpoints are under `/api`. Responses look like `{ "success": true, "data": ... }` or `{ "success": false, "error": "..." }`.
Authenticated endpoints need the header `Authorization: Bearer <token>`.

| Method & path | Who | Purpose |
| --- | --- | --- |
| `POST /auth/register` | public | Create a citizen account |
| `POST /auth/login` | public | Log in with username **or** email → token |
| `GET /auth/me` | any user | Current user |
| `POST /firs` | any user | File an FIR |
| `GET /firs?status&crimeType&search&page&limit` | any user | List FIRs (citizens: their own only) |
| `GET /firs/:id` | owner / staff | One FIR (id or `FIR1001`) with history |
| `PATCH /firs/:id` | staff | Update status, internal notes, assigned officer |
| `POST /complaints` · `GET /complaints` | any user | File / list complaints |
| `PATCH /complaints/:id` | staff | Update status & resolution |
| `POST /emergency` | any user | Raise an SOS alert (optional lat/lon) |
| `GET /emergency` · `PATCH /emergency/:id` | staff | List / resolve alerts |
| `GET /notifications` · `PATCH /notifications/:id/read` | any user | Own notifications |
| `GET /track/:reference` | public | Status of `FIR…` / `CMP…` (status only, no personal data) |
| `GET /dashboard/stats` · `/dashboard/analytics` · `/officers` | staff | Dashboard data |
| `GET /health` | public | Liveness + database check |

---

## 🔐 Security notes

What the deployed version does:

* Passwords hashed with bcrypt; login by username or email; a failed login takes the same path whether or not the username exists, so usernames can't be probed.
* Users **cannot choose their own role**; roles are always checked against the database, so deactivating an account takes effect immediately.
* Rate limiting on login, registration, submissions, tracking and SOS. Audit log (with IP address) for logins, failed logins, FIRs, complaints, updates and alerts.
* Input validation on every write endpoint, parameterised SQL everywhere, request-size limit.
* `helmet` security headers and a strict Content-Security-Policy (no inline scripts); all server data is HTML-escaped in the UI.
* Public tracking returns status only. Citizens never see internal officer notes or which officer handled a case.
* Sessions use `sessionStorage` – you are logged out when the tab closes (important on shared computers).

Known limitations (good next steps):

* **SOS alerts are not connected to 112 or any dispatch system.** They appear on the staff dashboard (auto-refreshing every 30 s) and the UI tells users to call **112** in a real emergency. Do not present this as a replacement for emergency services.
* No e-mail / SMS verification and no self-service "forgot password" (use `npm run reset-password`).
* Rate-limit counters are kept in memory, which is fine for one server instance; use a shared store (e.g. Redis) if you scale to several.
* The portal stores personal data about victims and complainants. Before real-world use, get appropriate approvals, add a privacy policy, and keep HTTPS and backups in place.

---

## 🗂️ Project structure

```
server.js            Express app: API routes + static hosting of /frontend
frontend/            index.html, styles.css, app.js (no build step)
database/schema.sql  Tables (MySQL 8 / MariaDB)
lib/                 DB config, input validation, schema/admin initialisation
scripts/             init-db, create-user, reset-password, seed-demo
Dockerfile, docker-compose.yml, .env.example
```

---

## 💡 Motivation

Citizens often have to **visit police stations physically** for simple tasks like filing FIRs, tracking complaints, or requesting verification certificates.
This process is **time-consuming**, **manual**, and **lacks transparency**.

The **Rakshak Portal** aims to revolutionize this by providing a **digital one-stop solution** where:

- Citizens can **file FIRs, register complaints**, and **request services** online.
- Police can **manage cases, records, evidence**, and **officer data** efficiently.
- Both sides experience **faster, transparent, and accountable communication**.

---

## 🔍 State of the Art / Current Scenario

Existing e-police systems in India are **limited and fragmented** — often restricted to FIR registration or challan payments.
There's **no complete end-to-end integration** or **real-time status tracking**.

The **Rakshak Portal** enhances this by offering:
- A **centralized system** for all police–citizen interactions.
- **Real-time updates**, **audit logs**, and **role-based access**.
- **Data analytics** for better decision-making and **crime prevention insights**.

---

## 🎯 Project Goals

- ✅ Create an online system for **FIR filing** and **complaint tracking**.
- ✅ Build police dashboards for **case & record management**.
- 🔜 Provide **tenant verification**, **NOCs**, and **character certificate** services.
- ✅ Add **audit logs**, **notifications**, and **transparency features**.
- ✅ Enable **data analytics** for authorities (basic analytics implemented).

---

## 🧱 System Architecture (High-Level Overview)

```
+-------------------------------------------------------------+
|                        RAKSHAK PORTAL                       |
+-------------------------------------------------------------+
|                        FRONTEND (WEB UI)                    |
|   Citizen Dashboard         |     Police Dashboard          |
|   - FIR Filing              |     - Case Management         |
|   - Complaint Tracking      |     - Officer Management      |
|   - SOS / My Records        |     - Emergency Alerts        |
+-------------------------------------------------------------+
|                     BACKEND (API SERVER)                    |
| - Authentication & Roles                                    |
| - Business Logic (FIRs, Complaints, Alerts)                 |
| - Logging & Notifications                                   |
+-------------------------------------------------------------+
|                     DATABASE (MySQL)                        |
| - Users, FIRs, Case Updates, Complaints, Emergency Alerts   |
| - Notifications, Audit Logs                                 |
+-------------------------------------------------------------+
```

---

## 🧾 Expected Outcomes / Deliverables

- ✅ Working **citizen dashboard** for FIRs, complaints and SOS
- ✅ **Police dashboard** for case, complaint and officer management
- 🔜 Integrated **challan payment** system
- ✅ **Analytics** for authorities
- ✅ **Audit logs** for transparency and accountability
- ✅ User and admin documentation (this README)

---

## 🧩 Assumptions

- Citizens have **internet access** and basic digital literacy.
- Police staff are **trained for digital record management**.
- The system will be hosted on **secure government infrastructure**.
- Payment gateway integration will be done via **authorized service providers**.

---

## 📚 References

- Elmasri, R., & Navathe, S. B. (2016). *Fundamentals of Database Systems (7th ed.).* Pearson.
  → Core reference for relational database design and implementation.

---

## 🧠 Future Scope

- 🔗 Integration with **CCTV and surveillance feeds**
- ⚖️ Connection with **judiciary portals** for case updates
- 📱 Development of a **mobile app** for faster access
- 🧮 Advanced **AI-based crime prediction analytics**
- 🚑 Integration of SOS alerts with the national emergency response system (112)

---

## 🛡️ Tech Stack

| Layer             | Technology                                   |
| ----------------- | -------------------------------------------- |
| 🎨 Frontend       | HTML, CSS, vanilla JavaScript (no build step) |
| ⚙️ Backend        | Node.js, Express                             |
| 🗄️ Database       | MySQL 8 / MariaDB                            |
| 🔐 Authentication | JWT + bcrypt, role-based access              |
| 📦 Deployment     | Docker / Docker Compose, or any Node host    |

---

## 🏁 Conclusion

The **Rakshak Portal** aims to transform traditional policing by bringing **efficiency**, **transparency**, and **citizen empowerment** through technology.
It marks a step toward a **Digitally Empowered, Secure, and Connected India** 🇮🇳.

*Built by Team ABT – Akshita Bhardwaj and Aryan Tomar.*
