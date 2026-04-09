require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const IPN_KEY = process.env.CASHMAAL_IPN_KEY;
const WEB_ID  = process.env.CASHMAAL_WEB_ID;

// Temporary in-memory storage
// Replace with real database later
const userBalances = {};

// ✅ Health check
app.get('/', (req, res) => {
  res.json({ message: 'Game Backend is running ✅' });
});

// ✅ Create payment (deposit)
app.post('/create-payment', (req, res) => {
  const { userId, amount, email } = req.body;

  if (!userId || !amount || !email) {
    return res.status(400).json({ 
      error: 'userId, amount and email are required' 
    });
  }

  const orderId = `${userId}_${Date.now()}`;

  res.json({
    action: 'https://cmaal.com/Pay/',
    fields: {
      pay_method: '',
      amount: amount,
      currency: 'PKR',
      succes_url: `${process.env.BASE_URL}/payment-success`,
      cancel_url: `${process.env.BASE_URL}/payment-cancel`,
      client_email: email,
      web_id: WEB_ID,
      order_id: orderId,
      addi_info: `Deposit for user ${userId}`
    }
  });
});

// ✅ IPN - Cashmaal calls this after payment
app.post('/ipn', (req, res) => {
  const { ipn_key, status, Amount, order_id, CM_TID, currency } = req.body;

  console.log('📩 IPN received:', req.body);

  if (ipn_key !== IPN_KEY) {
    console.log('❌ Invalid IPN key');
    return res.send('Invalid key');
  }

  if (status == 1) {
    const userId = order_id.split('_')[0];
    const amount = parseFloat(Amount);

    if (!userBalances[userId]) userBalances[userId] = 0;
    userBalances[userId] += amount;

    console.log(`✅ Credited ${amount} PKR to user ${userId}`);
    console.log(`💰 New balance: ${userBalances[userId]} PKR`);
    console.log(`🔖 Transaction ID: ${CM_TID}`);

    return res.send('**OK**');

  } else if (status == 2) {
    console.log('⏳ Payment pending');
    return res.send('Pending');
  } else {
    console.log('❌ Payment failed');
    return res.send('Failed');
  }
});

// ✅ Payment success redirect
app.get('/payment-success', (req, res) => {
  res.json({ 
    message: 'Payment successful! Your coins have been credited.' 
  });
});

// ✅ Payment cancel redirect
app.get('/payment-cancel', (req, res) => {
  res.json({ message: 'Payment was cancelled.' });
});

// ✅ Check user balance
app.get('/balance/:userId', (req, res) => {
  const { userId } = req.params;
  const balance = userBalances[userId] || 0;
  res.json({ userId, balance, currency: 'PKR' });
});

// ✅ Withdraw
app.post('/withdraw', (req, res) => {
  const { userId, amount, accountNumber, method } = req.body;

  if (!userId || !amount || !accountNumber || !method) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const balance = userBalances[userId] || 0;

  if (balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  userBalances[userId] -= amount;

  console.log(`💸 Withdrawal: ${amount} PKR to ${accountNumber} via ${method}`);

  res.json({
    success: true,
    message: `Withdrawal of ${amount} PKR initiated`,
    remainingBalance: userBalances[userId]
  });
});

module.exports = app;