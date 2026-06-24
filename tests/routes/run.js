'use strict';

const { startServer, stopServer } = require('./helpers/setup');
const { createClient } = require('./helpers/http');
const { buildContext } = require('./helpers/context');

const publicAuthSuite = require('./suites/public-auth');
const profileCardsSuite = require('./suites/profile-cards');
const financeFlowsSuite = require('./suites/finance-flows');
const supportAdminCronSuite = require('./suites/support-admin-cron');

const suites = [
  { name: 'Public And Auth', cases: publicAuthSuite },
  { name: 'Profile And Cards', cases: profileCardsSuite },
  { name: 'Finance Flows', cases: financeFlowsSuite },
  { name: 'Support Admin And Cron', cases: supportAdminCronSuite },
];

async function run() {
  const server = await startServer();
  const port = server.address().port;
  const client = createClient(`http://127.0.0.1:${port}`);
  const context = await buildContext(client);
  const results = [];

  try {
    for (const suite of suites) {
      console.log(`\n== ${suite.name} ==`);
      for (const testCase of suite.cases) {
        try {
          await testCase.run(context);
          results.push({ suite: suite.name, name: testCase.name, status: 'PASS' });
          console.log(`PASS ${testCase.name}`);
        } catch (error) {
          results.push({ suite: suite.name, name: testCase.name, status: 'FAIL', error });
          console.error(`FAIL ${testCase.name}`);
          console.error(error.stack || error.message);
        }
      }
    }
  } finally {
    await stopServer(server);
  }

  const passed = results.filter((result) => result.status === 'PASS').length;
  const total = results.length;
  const failed = total - passed;
  const score = total === 0 ? 0 : (passed / total) * 100;

  console.log(`\nRoute test score: ${passed}/${total} (${score.toFixed(1)}%)`);
  console.log(`Failures: ${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
