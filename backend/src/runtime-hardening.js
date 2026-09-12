import http from 'node:http';

// Render documents intermittent Node.js 502s/timeouts and recommends increasing
// keepAliveTimeout and headersTimeout. Patch createServer before Express calls
// app.listen(), while preserving the existing server architecture and routes.
const originalCreateServer = http.createServer.bind(http);
http.createServer = (...args) => {
  const server = originalCreateServer(...args);
  server.keepAliveTimeout = 120000;
  server.headersTimeout = 125000;
  server.requestTimeout = 120000;
  server.timeout = 120000;
  return server;
};
