'use strict';
const app = require('./index').app;
if (!app || typeof app.listen !== 'function') throw new Error('Express app export is missing');
const port = Number(process.env.PORT || 8080);
const server = app.listen(port, '0.0.0.0', () => console.log('[sten] backend listening on port ' + port));
function shutdown(signal) { console.log('[sten] ' + signal + ', shutting down...'); server.close((error) => { if (error) { console.error('[sten] shutdown failed:', error.message); process.exitCode = 1; } process.exit(); }); }
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
