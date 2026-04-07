require('dotenv').config();

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const usersRoutes = require('./routes/usersRoutes');
const venturesRoutes = require('./routes/venturesRoutes');
const walletsRoutes = require('./routes/walletsRoutes');
const investmentsRoutes = require('./routes/investmentsRoutes');
const pollsRoutes = require('./routes/pollsRoutes');
const paymentsRoutes = require('./routes/paymentsRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const referralsRoutes = require('./routes/referralsRoutes');
const ownersRoutes = require('./routes/ownersRoutes');
const resaleRoutes = require('./routes/resaleRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: '🌐 Server Message: Backend running' });
});

app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/ventures', venturesRoutes);
app.use('/wallets', walletsRoutes);
app.use('/investments', investmentsRoutes);
app.use('/polls', pollsRoutes);
app.use('/payments', paymentsRoutes);
app.use('/wishlist', wishlistRoutes);
app.use('/referrals', referralsRoutes);
app.use('/owners', ownersRoutes);
app.use('/resale-requests', resaleRoutes);
app.use('/admin', adminRoutes);

module.exports = app;
