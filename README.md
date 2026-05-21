# 🧺 FreshPress Laundry — Telegram Bot

A full-featured Telegram bot for managing a laundry business, built with **Node.js**, **Express**, **Telegraf.js**, **MongoDB**, and **Flutterwave** for payment processing.

---

## ✨ Features

### Customer Features
- 🤝 **Conversational Onboarding** — Step-by-step registration (name, email)
- 💳 **Dedicated Payment Account** — Automatic Flutterwave virtual account per user
- 🧺 **Service Menu** — Browse laundry items with prices, select multiple items
- 🛒 **Smart Cart** — Dynamic quantity entry, subtotal calculation
- 🚚 **Delivery Options** — Pickup (₦3,000) or Self-delivery (free)
- 📋 **Order Summary** — Complete breakdown before payment
- 🔢 **Order Numbers** — Unique, human-readable (LDRY-2025-0001)
- 🧾 **Auto Receipts** — Markdown receipt + PDF with QR code
- 📦 **Order Tracking** — Check status using order number
- 📱 **Status Notifications** — Real-time updates when status changes

### Admin Features
- `/orders` — View all orders (last 20)
- `/pending` — View unpaid orders
- `/paid` — View paid orders
- `/customers` — View all customers
- `/stats` — Revenue, order count, breakdowns
- `/track ORDER_NUMBER` — Full order details
- `/update ORDER_NUMBER STATUS` — Update order status
- 📊 **Daily Summary** — Automated 9 PM report to admin
- 🔔 **Worker Notifications** — Auto-forward paid orders to workers

### Payment
- 🏦 Flutterwave Virtual Accounts (Nigerian bank transfer)
- 🔐 Webhook signature verification
- ✅ Automatic payment matching & confirmation
- 🧾 PDF receipts with QR codes

---

## 🏗️ Architecture

```
laundry-bot/
├── src/
│   ├── bot/
│   │   ├── index.js          # Bot setup & general handlers
│   │   ├── onboarding.js     # User registration flow
│   │   ├── ordering.js       # Order creation flow
│   │   ├── admin.js          # Admin commands
│   │   └── keyboards.js      # Inline & reply keyboards
│   ├── controllers/
│   │   └── webhookController.js  # Flutterwave webhook handler
│   ├── middlewares/
│   │   └── verifyFlutterwaveWebhook.js
│   ├── models/
│   │   ├── index.js
│   │   ├── User.js
│   │   ├── Order.js
│   │   ├── Payment.js
│   │   ├── DeliveryDetail.js
│   │   └── Counter.js
│   ├── routes/
│   │   └── webhook.js
│   ├── services/
│   │   ├── flutterwave.js    # Flutterwave API integration
│   │   ├── receipt.js        # Receipt generation (Markdown + PDF)
│   │   └── notifications.js  # Customer, admin, worker notifications
│   ├── utils/
│   │   ├── constants.js      # Service catalogue, config
│   │   └── helpers.js        # Utility functions
│   └── server.js             # Entry point
├── .env.example
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+
- **MongoDB** (local or Atlas)
- **Telegram Bot Token** — from [@BotFather](https://t.me/BotFather)
- **Flutterwave Account** — [flutterwave.com](https://flutterwave.com)

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd laundry-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Telegram
BOT_TOKEN=your_bot_token_here

# MongoDB
MONGODB_URI=mongodb://localhost:27017/laundry_bot

# Flutterwave (get from dashboard.flutterwave.com)
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-xxxx
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST-xxxx
FLUTTERWAVE_WEBHOOK_HASH=your_webhook_hash

# Server
PORT=3000
BASE_URL=https://your-domain.com   # Leave empty for local polling

# Admin Telegram IDs (comma-separated)
ADMIN_CHAT_IDS=123456789
WORKER_CHAT_IDS=111111111,222222222

# Business
BUSINESS_NAME=FreshPress Laundry
BUSINESS_WHATSAPP=+2348012345678
```

### 3. Run

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

---

## 🔧 Flutterwave Setup

### 1. Create Webhook

1. Go to **Flutterwave Dashboard** → **Settings** → **Webhooks**
2. Set Webhook URL: `https://your-domain.com/flutterwave/webhook`
3. Copy the **Secret Hash** and set it as `FLUTTERWAVE_WEBHOOK_HASH` in `.env`

### 2. Virtual Accounts

The bot automatically creates a **permanent virtual bank account** for each new user. This account is used for all their future payments.

> ⚠️ **Note:** In production, Flutterwave requires a valid BVN for Nigerian virtual accounts. The code uses a test BVN (`22222222222`) for sandbox mode. Update the BVN flow for production.

---

## 📱 Bot Flow

```
/start
  ├── New User → Onboarding
  │   ├── Ask First Name
  │   ├── Ask Last Name
  │   ├── Ask Email (validated)
  │   ├── Create Virtual Account
  │   └── Show Main Menu
  │
  └── Returning User → Main Menu
      ├── 🧺 New Order
      │   ├── Select Items (inline keyboard)
      │   ├── Enter Quantities
      │   ├── Choose Delivery
      │   │   ├── Pickup → Collect Address
      │   │   └── Self → Skip
      │   ├── Order Summary
      │   └── Confirm → Payment Instructions
      │
      ├── 📋 My Orders → List recent orders
      ├── 💳 My Account → Account & payment details
      ├── 📦 Track Order → Enter order number
      └── ℹ️ Help → Usage instructions
```

---

## 🧺 Service Catalogue

| Item | Price |
|------|-------|
| 👔 Shirt | ₦500 |
| 👖 Jean Trouser | ₦800 |
| 👕 T-Shirt | ₦400 |
| 🥻 Native Wear | ₦1,200 |
| 🤵 Suit | ₦2,500 |
| 🧥 Hoodie | ₦1,500 |
| 🛏️ Bedsheet | ₦2,000 |
| 🪟 Curtain | ₦3,500 |

> Edit `src/utils/constants.js` to modify the catalogue.

---

## 📦 Order Statuses

| Status | Emoji | Description |
|--------|-------|-------------|
| Pending | 🟡 | Order placed, awaiting processing |
| Washing | 🔵 | Currently being washed |
| Drying | 🟠 | In the dryer |
| Ready | 🟢 | Ready for pickup/delivery |
| Delivered | ✅ | Completed |
| Cancelled | 🔴 | Order cancelled |

---

## 🔐 Security

- ✅ Flutterwave webhook signature verification (`verif-hash` header)
- ✅ Admin commands restricted by Telegram user ID
- ✅ Input sanitization on all user text
- ✅ Environment variables for all secrets
- ✅ MongoDB injection prevention via Mongoose

---

## 🚀 Deployment

### Option A: Render

1. Create a new **Web Service** on [render.com](https://render.com)
2. Connect your GitHub repo
3. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. Add all env variables from `.env.example`
5. Set `BASE_URL` to your Render URL (e.g., `https://laundry-bot.onrender.com`)
6. Deploy!

### Option B: VPS (Ubuntu)

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB
# See: https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/

# Clone and setup
git clone <your-repo> /opt/laundry-bot
cd /opt/laundry-bot
npm install --production
cp .env.example .env
nano .env  # Fill in your values

# Use PM2 for process management
sudo npm install -g pm2
pm2 start src/server.js --name laundry-bot
pm2 save
pm2 startup

# Nginx reverse proxy (optional)
sudo apt install nginx
# Configure /etc/nginx/sites-available/laundry-bot:
#   proxy_pass http://localhost:3000;
```

### Option C: Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

```bash
docker build -t laundry-bot .
docker run -d --env-file .env -p 3000:3000 laundry-bot
```

---

## 📊 Database Collections

### users
| Field | Type | Description |
|-------|------|-------------|
| telegram_id | Number | Unique Telegram user ID |
| first_name | String | First name |
| last_name | String | Last name |
| email | String | Email address |
| virtual_account | Object | Flutterwave account details |

### orders
| Field | Type | Description |
|-------|------|-------------|
| order_number | String | e.g., LDRY-2025-0001 |
| customer_id | ObjectId | Ref to users |
| items | Array | Cart items with quantities |
| subtotal | Number | Items total |
| delivery_type | String | 'pickup' or 'self' |
| delivery_fee | Number | ₦3000 or ₦0 |
| total_amount | Number | Final amount |
| payment_status | String | unpaid/paid/refunded |
| order_status | String | pending/washing/drying/ready/delivered |

### payments
| Field | Type | Description |
|-------|------|-------------|
| order_id | ObjectId | Ref to orders |
| flutterwave_tx_id | Number | Flutterwave transaction ID |
| amount | Number | Paid amount |
| status | String | successful/failed/pending |

### delivery_details
| Field | Type | Description |
|-------|------|-------------|
| order_id | ObjectId | Ref to orders |
| lodge_name | String | Lodge/hostel name |
| lodge_address | String | Full address |
| landmark | String | Nearby landmark |
| phone_number | String | Contact phone |

---

## 🛠️ Customization

### Add New Services
Edit `src/utils/constants.js`:
```javascript
const SERVICES = [
  { id: 'duvet', name: 'Duvet', emoji: '🛏️', price: 5000 },
  // ... add more
];
```

### Change Delivery Fee
Edit `src/utils/constants.js`:
```javascript
const DELIVERY = {
  PICKUP_FEE: 3000, // Change this
  SELF_FEE: 0,
};
```

### Add More Admins
Update `ADMIN_CHAT_IDS` in `.env`:
```env
ADMIN_CHAT_IDS=123456789,987654321,555555555
```

> To find your Telegram ID, send a message to [@userinfobot](https://t.me/userinfobot)

---

## 📄 License

ISC

---

## 🤝 Support

For issues or feature requests, please open a GitHub issue or contact the development team.
