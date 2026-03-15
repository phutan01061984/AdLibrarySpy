// === AdLibrarySpy — Server Entry Point ===
const express = require('express');
const http = require('http');
const { PORT } = require('./src/config');
const { setupRoutes } = require('./src/routes');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json({ limit: '10mb' }));

// CORS — allow frontend on any port to call backend
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Disable caching for API
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Routes
setupRoutes(app);

// Start
server.listen(PORT, () => {
  console.log('');
  console.log('  🕵️  AdLibrarySpy — Meta Ad Library Intelligence');
  console.log('  ================================================');
  console.log(`  Backend:  http://localhost:${PORT}`);
  console.log('  ================================================');
  console.log('');
});
