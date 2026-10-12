const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { initialize } = require('./server/db/init');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Session middleware (shared between Express and Socket.io)
const sessionMiddleware = session({
  secret: 'bananaet-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// Share session with Socket.io
io.engine.use(sessionMiddleware);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/packs', require('./server/routes/packs'));
app.use('/api/inventory', require('./server/routes/inventory'));
app.use('/api/trades', require('./server/routes/trades'));
app.use('/api/crafting', require('./server/routes/crafting'));
app.use('/api/admin', require('./server/routes/admin'));
app.use('/api/leaderboard', require('./server/routes/leaderboard'));
app.use('/api/superadmin', require('./server/routes/superadmin'));
app.use('/api/roulette', require('./server/routes/roulette'));
app.use('/api/war', require('./server/routes/war').warRouter);

// Make io available to admin routes for boost broadcasts
app.set('io', io);

// Serve bananaboss page at secret URL
app.get('/bananaboss', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bananaboss.html'));
});

// Serve index for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database, setup chat, start server
initialize().then(() => {
  const { setupChat } = require('./server/routes/chat');
  const { setupWar } = require('./server/routes/war');
  setupChat(io);
  setupWar(io);

  server.listen(PORT, () => {
    console.log(`Bananalet running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
