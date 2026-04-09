require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const IPN_KEY = process.env.CASHMAAL_IPN_KEY;
const WEB_ID  = process.env.CASHMAAL_WEB_ID;

// ─────────────────────────────────────────
// In-memory user balances (temporary)
// Later you will replace this with a real database
// ─────────────────────────────────────────
const userBalances = {};

// ─────────────────────────────────────────
// ROUTE 1 — Health check
// ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Game Backend is running ✅' });
});

// ─────────────────────────────────────────
// ROUTE 2 — Create payment link (deposit)
// Frontend calls this to get payment details
// ─────────────────────────────────────────
app.post('/create-payment', (req, res) => {
  const { userId, amount, email } = req.body;

  if (!userId || !amount || !email) {
    return res.status(400).json({ error: 'userId, amount and email are required' });
  }

  // order_id links the payment back to your user
  const orderId = `${userId}_${Date.now()}`;

  // These are the details your frontend needs to
  // build the Cashmaal payment form
  res.json({
    action: 'https://cmaal.com/Pay/',
    fields: {
      pay_method: '',         // blank = user chooses JazzCash or EasyPaisa
      amount: amount,
      currency: 'PKR',
      succes_url: 'https://game-backend.onrender.com/payment-success',
      cancel_url: 'https://game-backend.onrender.com/payment-cancel',
      client_email: email,
      web_id: WEB_ID,
      order_id: orderId,
      addi_info: `Deposit for user ${userId}`
    }
  });
});

// ─────────────────────────────────────────
// ROUTE 3 — IPN (Cashmaal calls this automatically)
// ─────────────────────────────────────────
app.post('/ipn', (req, res) => {
  const {
    ipn_key,
    status,
    Amount,
    order_id,
    CM_TID,
    currency,
    fee
  } = req.body;

  console.log('📩 IPN received:', req.body);

  // Security check — verify it's really from Cashmaal
  if (ipn_key !== IPN_KEY) {
    console.log('❌ Invalid IPN key');
    return res.send('Invalid key');
  }

  if (status == 1) {
    // Payment successful ✅
    // Extract userId from order_id (we set it as userId_timestamp)
    const userId = order_id.split('_')[0];
    const amount = parseFloat(Amount);

    // Credit user balance
    if (!userBalances[userId]) userBalances[userId] = 0;
    userBalances[userId] += amount;

    console.log(`✅ Credited ${amount} PKR to user ${userId}`);
    console.log(`💰 New balance: ${userBalances[userId]} PKR`);
    console.log(`🔖 Transaction ID: ${CM_TID}`);

    // MUST respond with **OK** or Cashmaal keeps retrying
    return res.send('**OK**');

  } else if (status == 2) {
    console.log('⏳ Payment pending');
    return res.send('Pending');
  } else {
    console.log('❌ Payment failed or cancelled');
    return res.send('Failed');
  }
});

// ─────────────────────────────────────────
// ROUTE 4 — Payment success redirect
// ─────────────────────────────────────────
app.get('/payment-success', (req, res) => {
  res.json({ message: 'Payment successful! Your coins have been credited.' });
});

// ─────────────────────────────────────────
// ROUTE 5 — Payment cancel redirect
// ─────────────────────────────────────────
app.get('/payment-cancel', (req, res) => {
  res.json({ message: 'Payment was cancelled.' });
});

// ─────────────────────────────────────────
// ROUTE 6 — Check user balance
// ─────────────────────────────────────────
app.get('/balance/:userId', (req, res) => {
  const { userId } = req.params;
  const balance = userBalances[userId] || 0;
  res.json({ userId, balance, currency: 'PKR' });
});

// ─────────────────────────────────────────
// ROUTE 7 — Withdraw (send money to user)
// ─────────────────────────────────────────
app.post('/withdraw', async (req, res) => {
  const { userId, amount, accountNumber, method } = req.body;
  // method: 'jca' for JazzCash, 'epa' for EasyPaisa

  if (!userId || !amount || !accountNumber || !method) {
    return res.status(400).json({ error: 'userId, amount, accountNumber and method are required' });
  }

  const balance = userBalances[userId] || 0;

  if (balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // Deduct balance first
  userBalances[userId] -= amount;

  // TODO: Call Cashmaal Send Money API here
  // For now we log it
  console.log(`💸 Withdrawal request:`);
  console.log(`   User: ${userId}`);
  console.log(`   Amount: ${amount} PKR`);
  console.log(`   To: ${accountNumber} via ${method}`);

  res.json({
    success: true,
    message: `Withdrawal of ${amount} PKR initiated to ${accountNumber}`,
    remainingBalance: userBalances[userId]
  });
});

// ─────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});