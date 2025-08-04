const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const diaryRoutes = require('./routes/diary');
const userRoutes = require('./routes/user');
const { initializeDatabase } = require('./database/init');
const { authenticate } = require('./middleware/auth');
const scheduler = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for nginx reverse proxy
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      mediaSrc: ["'self'", "https://*.s3.eu-west-2.amazonaws.com", "https://healthdiary--audio.s3.eu-west-2.amazonaws.com"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"]
    }
  }
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../app')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/diary', authenticate, diaryRoutes);
app.use('/api/user', authenticate, userRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Serve frontend for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../app/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: err.details?.map(d => d.message) || [err.message]
    });
  }
  
  if (err.name === 'UnauthorizedError' || err.message === 'Unauthorized') {
    return res.status(401).json({ error: 'Unauthorized access' });
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Initialize database and start server
initializeDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Health Diary server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Start background job scheduler
      const intervalMs = parseInt(process.env.SCHEDULER_INTERVAL_MS) || 60000; // 1 minute default
      scheduler.start(intervalMs);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;