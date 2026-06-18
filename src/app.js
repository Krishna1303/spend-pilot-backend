const express = require('express');
const cors = require('cors');

const healthRoutes = require('./routes/health.routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// Core middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/health', healthRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Spend Pilot API' });
});

// Error handling (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
