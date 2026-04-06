# 🌾 Rice Warehouse Management System
### அரிசி கிடங்கு மேலாண்மை அமைப்பு

A full-stack PWA for managing multi-warehouse rice stock with Tamil/English support, 2FA admin auth, real-time inventory tracking, and APK generation capability.

---

## 🗂 Project Structure

```
rice-warehouse/
├── backend/                  # Python FastAPI
│   ├── main.py               # App entry point
│   ├── database.py           # SQLite connection
│   ├── models.py             # SQLAlchemy ORM models
│   ├── schemas.py            # Pydantic request/response schemas
│   ├── routers/
│   │   ├── auth.py           # Login, OTP, JWT
│   │   ├── users.py          # User CRUD (admin only)
│   │   ├── warehouses.py     # Warehouse management
│   │   ├── stocks.py         # Stock/brand management
│   │   ├── transactions.py   # Inbound/outbound + ledger
│   │   └── dashboard.py      # Summary statistics
│   └── utils/
│       ├── security.py       # JWT, bcrypt, OTP generation
│       ├── deps.py           # FastAPI auth dependencies
│       └── otp.py            # SMS via Twilio (dev: console)
│
├── frontend/                 # React PWA
│   ├── public/
│   │   ├── manifest.json     # PWA manifest
│   │   └── sw.js             # Service worker (offline)
│   └── src/
│       ├── App.js            # Routes + providers
│       ├── i18n/             # English + Tamil translations
│       ├── hooks/            # useAuth, useTheme
│       ├── utils/api.js      # Axios client + all API calls
│       ├── components/
│       │   └── common/       # Layout, Modal, StatCard, etc.
│       └── pages/
│           ├── LoginPage.jsx
│           ├── DashboardPage.jsx
│           ├── WarehousesPage.jsx
│           ├── StocksPage.jsx
│           ├── TransactionsPage.jsx
│           ├── ReportsPage.jsx (ledger + charts)
│           └── UsersPage.jsx
│
├── docker-compose.yml        # Local dev
└── README.md
```

---

## 🚀 Quick Start (Local Development)

### Option A: Docker Compose (Recommended)
```bash
docker compose up --build
# Backend: http://localhost:8000
# Frontend: http://localhost:3000
```

### Option B: Manual

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # Edit as needed
uvicorn main:app --reload --port 8000
```

**Seed Admin (first run only):**
```bash
curl -X POST http://localhost:8000/api/auth/seed-admin
# Creates: username=admin, password=Admin@1234
# ⚠️ Change the password immediately after first login!
```

**Frontend:**
```bash
cd frontend
cp .env.example .env
npm install
npm start
# Opens: http://localhost:3000
```

---

## 🔐 Authentication Flow

### Regular User
1. Enter username + password → get JWT → access granted

### Admin (2FA)
1. Enter username + password
2. OTP sent via SMS to registered phone (console log in dev mode)
3. Enter OTP → get JWT → access granted

**Dev Mode OTP:** Check your backend terminal console for the OTP code.

---

## 📱 PWA → APK Conversion (Capacitor)

```bash
cd frontend
npm run build                     # Build React app
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init                      # Initialize Capacitor
npx cap add android               # Add Android platform
npx cap sync                      # Sync web build
npx cap open android              # Open in Android Studio
# Then: Build > Generate Signed Bundle/APK
```

---

## ☁️ Railway Deployment

### Backend
1. Push `backend/` folder to GitHub
2. Create new Railway project → Deploy from GitHub
3. Set environment variables:
   ```
   SECRET_KEY=your-production-secret
   ADMIN_PHONE=+91XXXXXXXXXX
   TWILIO_ACCOUNT_SID=...
   TWILIO_AUTH_TOKEN=...
   TWILIO_PHONE_NUMBER=+1...
   ```

### Frontend
1. Push `frontend/` to GitHub
2. Create new Railway service
3. Set: `REACT_APP_API_URL=https://your-backend.up.railway.app`

---

## 🗃 Database Schema

| Table | Key Fields |
|-------|------------|
| `users` | id, username, password_hash, role, phone_1, phone_2 |
| `warehouses` | id, location_name, location_name_ta, capacity |
| `stocks` | id, brand_name, brand_name_ta, rice_type, production_company, bag_weight_kg |
| `transactions` | id, stock_id, warehouse_id, type (in/out), quantity_bags, source, destination, vehicle_number, quality_grade |
| `otp_logs` | id, user_id, otp_code, expires_at, is_used |

---

## 🎨 Features

| Feature | Details |
|---------|---------|
| **Languages** | English ↔ Tamil toggle (header button) |
| **Theme** | Light / Dark mode |
| **Roles** | Admin (full access + 2FA) / User (view + record transactions) |
| **Stock Tracking** | Per-warehouse, per-brand real-time remaining stock |
| **Ledger** | Full audit trail — date, source/dest, vehicle, quality |
| **Low Stock Alerts** | Dashboard highlights items < 50 bags |
| **Reports** | Daily movement charts, stock breakdown, ledger export |
| **PWA** | Installable, offline-capable via service worker |
| **APK Ready** | Capacitor config included for Android wrapping |

---

## 🔧 API Endpoints

```
POST   /api/auth/login          Login (user or admin step 1)
POST   /api/auth/verify-otp     Admin OTP verification
GET    /api/auth/me             Current user
POST   /api/auth/seed-admin     Create initial admin (once)

GET    /api/dashboard/summary   Dashboard statistics

GET    /api/warehouses          List warehouses with stock levels
POST   /api/warehouses          Create warehouse (admin)
PUT    /api/warehouses/:id      Update warehouse (admin)

GET    /api/stocks              List stocks with inventory
POST   /api/stocks              Create stock (admin)
PUT    /api/stocks/:id          Update stock (admin)

GET    /api/transactions        List transactions (with filters)
POST   /api/transactions        Record transaction (inbound/outbound)
GET    /api/transactions/ledger Stock ledger for date range

GET    /api/users               List users (admin)
POST   /api/users               Create user (admin)
PUT    /api/users/:id           Update user (admin)
DELETE /api/users/:id           Delete user (admin)
```

Interactive docs: `http://localhost:8000/docs`

---

## ⚙️ Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SECRET_KEY` | JWT signing secret | ✅ |
| `DATABASE_URL` | SQLite or PostgreSQL URL | Optional (defaults to SQLite) |
| `TWILIO_ACCOUNT_SID` | Twilio SID for SMS OTP | Optional (dev: console) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Optional |
| `TWILIO_PHONE_NUMBER` | Sender phone number | Optional |
| `ADMIN_PHONE` | Default admin phone | Optional |

---

*Built for Tamil Nadu rice warehouse operations — Simple, Fast, Bilingual.*
