'use strict';

/**
 * Static legal content served to the app. Bump `version` and `effectiveDate`
 * whenever the wording changes so the frontend can prompt re-acceptance.
 * This is placeholder demo copy, not legal advice.
 */

const EFFECTIVE_DATE = '2026-06-18';
const VERSION = '1.0';

const TERMS = {
  title: 'Terms and Conditions',
  version: VERSION,
  effectiveDate: EFFECTIVE_DATE,
  sections: [
    {
      heading: 'Acceptance of Terms',
      body: 'By creating an account or using SpendPilot, you agree to these Terms and Conditions. If you do not agree, do not use the service.',
    },
    {
      heading: 'The Service',
      body: 'SpendPilot helps you track credit and debit cards, review statements, and view suggested payment plans. Payment suggestions are informational only and are not financial advice.',
    },
    {
      heading: 'Your Account',
      body: 'You are responsible for keeping your login credentials secure and for all activity under your account. Notify us immediately of any unauthorized use.',
    },
    {
      heading: 'Bank Connections',
      body: 'Bank and card connections are handled through Plaid. We never ask for or store your bank username or password. You may disconnect a linked account at any time.',
    },
    {
      heading: 'Acceptable Use',
      body: 'You agree not to misuse the service, attempt to access other users\' data, or interfere with the platform\'s operation or security.',
    },
    {
      heading: 'Limitation of Liability',
      body: 'SpendPilot is provided "as is" without warranties. We are not liable for financial decisions made based on suggestions shown in the app.',
    },
    {
      heading: 'Changes to These Terms',
      body: 'We may update these terms from time to time. Continued use after an update constitutes acceptance of the revised terms.',
    },
  ],
};

const PRIVACY = {
  title: 'Privacy Policy',
  version: VERSION,
  effectiveDate: EFFECTIVE_DATE,
  sections: [
    {
      heading: 'Information We Collect',
      body: 'We collect the account details you provide (name, email, mobile) and the card and transaction data you add manually, upload, or connect via Plaid.',
    },
    {
      heading: 'How We Use Your Data',
      body: 'Your data is used to provide the service: showing your dashboard, parsing statements, and generating payment suggestions. We do not sell your personal data.',
    },
    {
      heading: 'Data Security',
      body: 'Passwords are stored only as salted hashes, never in plain text. Access to your data requires authentication, and sensitive tokens are kept out of API responses.',
    },
    {
      heading: 'Third-Party Services',
      body: 'We use Plaid for bank connectivity and an AI provider to generate plain-language explanations of plans we calculate. We share only the minimum data required for these features.',
    },
    {
      heading: 'Data Retention and Deletion',
      body: 'You may delete your account at any time from the profile screen. Deleting your account permanently removes your cards, transactions, recommendations, and support tickets.',
    },
    {
      heading: 'Contact',
      body: 'For privacy questions or data requests, contact support through the in-app Help center.',
    },
  ],
};

module.exports = { TERMS, PRIVACY };
