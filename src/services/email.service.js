'use strict';

const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const logger = require('../config/logger');

/**
 * Email delivery for support escalation + the private relay.
 * Demo-safe: when SMTP isn't configured, mail is logged (not sent) and the
 * caller gets { delivered: false, fallback: true } instead of an error.
 */
let transporter = null;

function getTransporter() {
  if (!env.MAIL_ENABLED || !env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    logger.info('SMTP transporter initialized', { host: env.SMTP_HOST, port: env.SMTP_PORT });
  }
  return transporter;
}

async function sendMail({ to, subject, text }) {
  const transport = getTransporter();
  if (!transport || !to) {
    logger.info('Email not sent (SMTP disabled — fallback log only)', { to, subject });
    return { delivered: false, fallback: true };
  }
  try {
    await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
    return { delivered: true, fallback: false };
  } catch (err) {
    logger.error('Email send failed', { to, subject, error: err.message });
    return { delivered: false, fallback: false, error: err.message };
  }
}

/** Notify the admin that a user escalated a new support request. */
function notifyAdminOfEscalation(ticket, user) {
  const first = ticket.messages && ticket.messages.length ? ticket.messages[ticket.messages.length - 1].body : '';
  return sendMail({
    to: env.ADMIN_EMAIL,
    subject: `[SpendPilot Support] New escalation: ${ticket.subject}`,
    text:
      `${user.name} <${user.email}> requested a support agent.\n\n` +
      `Ticket: ${ticket.id}\nSubject: ${ticket.subject}\n\nMessage:\n${first}\n\n` +
      'Open the CRM board to reply in the private relay.',
  });
}

/** Notify the admin that a user posted a new message on an existing ticket. */
function notifyAdminOfUserMessage(ticket, user, body) {
  return sendMail({
    to: env.ADMIN_EMAIL,
    subject: `[SpendPilot Support] New reply on: ${ticket.subject}`,
    text: `${user.name} <${user.email}> replied on ticket ${ticket.id}:\n\n${body}`,
  });
}

/** Send a user their daily alert digest (only actionable alerts). */
function sendAlertDigest(user, alerts) {
  if (!user || !user.email || !alerts || !alerts.length) {
    return Promise.resolve({ delivered: false, fallback: true });
  }
  const lines = alerts.map((a) => `- [${a.severity.toUpperCase()}] ${a.title}: ${a.message}`).join('\n');
  return sendMail({
    to: user.email,
    subject: `SpendPilot: ${alerts.length} payment alert${alerts.length === 1 ? '' : 's'} need your attention`,
    text: `Hi ${user.name || 'there'},\n\nHere are your SpendPilot alerts:\n\n${lines}\n\nOpen the app to see your full payment plan.\n\n— SpendPilot`,
  });
}

/** Notify the user that an agent replied on their ticket (the relay, user side). */
function notifyUserOfReply(ticket, user) {
  if (!user || !user.email) return Promise.resolve({ delivered: false, fallback: true });
  return sendMail({
    to: user.email,
    subject: `[SpendPilot Support] An agent replied to "${ticket.subject}"`,
    text: 'A support agent replied to your ticket. Open the app to view the conversation and continue.',
  });
}

module.exports = {
  sendMail,
  notifyAdminOfEscalation,
  notifyAdminOfUserMessage,
  notifyUserOfReply,
  sendAlertDigest,
};
