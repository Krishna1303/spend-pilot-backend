'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');

const { env } = require('./config/env');
const requestLogger = require('./middleware/requestLogger');
const { apiLimiter } = require('./middleware/rateLimiter');
const { notFound, errorHandler } = require('./middleware/error');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const contentRoutes = require('./routes/content.routes');
const cardRoutes = require('./routes/card.routes');
const statementRoutes = require('./routes/statement.routes');
const optimizerRoutes = require('./routes/optimizer.routes');
const aiRoutes = require('./routes/ai.routes');
const plaidRoutes = require('./routes/plaid.routes');
const chatbotRoutes = require('./routes/chatbot.routes');
const supportRoutes = require('./routes/support.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Trust the first proxy so req.ip reflects the real client (for logging + rate limiting).
app.set('trust proxy', 1);
app.disable('x-powered-by');

// --- Security headers ---
app.use(helmet());

// --- CORS ---
const corsOptions = {
  origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
  credentials: true,
};
app.use(cors(corsOptions));

// --- Body parsing (with size caps to limit injection / DoS surface) ---
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// --- Injection hardening ---
// Strip Mongo operators ($, .) from request payloads (NoSQL injection).
app.use(mongoSanitize());
// Guard against HTTP parameter pollution.
app.use(hpp());

// --- Performance ---
app.use(compression());

// --- Observability: log every request with IP + response timer ---
app.use(requestLogger);

// --- Landing/status page + static assets (served at /) ---
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Health (no rate limit so monitors aren't throttled) ---
app.use('/api/health', healthRoutes);

// --- Broad rate limit for the rest of the API ---
app.use('/api', apiLimiter);

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api', contentRoutes); // /api/legal/terms, /api/legal/privacy, /api/help
app.use('/api/cards', cardRoutes);
app.use('/api/statements', statementRoutes);
app.use('/api/optimizer', optimizerRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/plaid', plaidRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/admin', adminRoutes);

// `/` is served by the static landing page (public/index.html) above.

// --- 404 + error handling (must be last) ---
app.use(notFound);
app.use(errorHandler);

module.exports = app;
