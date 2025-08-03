const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const { getDatabase } = require('../database/init');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  interactionStyle: Joi.string().valid('minimal', 'friendly', 'reassuring').default('friendly'),
  subjects: Joi.array().items(Joi.string().valid('sleep', 'food', 'exercise', 'wellness', 'mood', 'symptoms')).default(['wellness', 'mood'])
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }
    
    const { username, email, password, interactionStyle, subjects } = value;
    const db = getDatabase();
    
    // Check if user already exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id FROM users WHERE email = ? OR username = ?',
        [email, username],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (existingUser) {
      db.close();
      return res.status(409).json({ error: 'User already exists with this email or username' });
    }
    
    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Create user
    const userId = uuidv4();
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (id, username, email, password_hash, interaction_style) VALUES (?, ?, ?, ?, ?)',
        [userId, username, email, passwordHash, interactionStyle],
        function(err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });
    
    // Add subject preferences
    for (const subject of subjects) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO user_subjects (user_id, subject, enabled) VALUES (?, ?, 1)',
          [userId, subject],
          function(err) {
            if (err) reject(err);
            else resolve(this);
          }
        );
      });
    }
    
    db.close();
    
    // Generate token
    const user = { id: userId, username, email };
    const token = generateToken(user);
    
    res.status(201).json({
      message: 'User registered successfully',
      user: { id: userId, username, email, interactionStyle },
      token
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }
    
    const { email, password } = value;
    const db = getDatabase();
    
    // Find user
    const user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, username, email, password_hash, interaction_style FROM users WHERE email = ?',
        [email],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!user) {
      db.close();
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      db.close();
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    db.close();
    
    // Generate token
    const tokenUser = { id: user.id, username: user.username, email: user.email };
    const token = generateToken(tokenUser);
    
    res.json({
      message: 'Login successful',
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        interactionStyle: user.interaction_style 
      },
      token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user info (requires authentication)
router.get('/me', require('../middleware/auth').authenticate, (req, res) => {
  const db = getDatabase();
  
  db.get(
    'SELECT id, username, email, interaction_style, created_at FROM users WHERE id = ?',
    [req.user.id],
    (err, user) => {
      if (err) {
        console.error('Database error:', err);
        db.close();
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!user) {
        db.close();
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Get user subjects
      db.all(
        'SELECT subject, enabled, settings FROM user_subjects WHERE user_id = ?',
        [req.user.id],
        (err, subjects) => {
          db.close();
          
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          res.json({
            user: {
              ...user,
              subjects: subjects || []
            }
          });
        }
      );
    }
  );
});

module.exports = router;