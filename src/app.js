require('dotenv').config();

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const usersRoutes = require('./routes/usersRoutes');
const venturesRoutes = require('./routes/venturesRoutes');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: '🌐 Server Message: Backend running' });
});

app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/ventures', venturesRoutes);

module.exports = app;
