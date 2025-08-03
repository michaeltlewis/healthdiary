const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

const DATABASE_PATH = process.env.DATABASE_PATH || './data/healthdiary.db';

async function initializeDatabase() {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(DATABASE_PATH);
    await fs.mkdir(dataDir, { recursive: true });
    
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(DATABASE_PATH, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
          return;
        }
        
        console.log('Connected to SQLite database');
        
        // Create tables
        db.serialize(() => {
          // Users table
          db.run(`
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              username TEXT UNIQUE NOT NULL,
              email TEXT UNIQUE NOT NULL,
              password_hash TEXT NOT NULL,
              interaction_style TEXT DEFAULT 'friendly',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);
          
          // Subject tracking preferences
          db.run(`
            CREATE TABLE IF NOT EXISTS user_subjects (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              subject TEXT NOT NULL,
              enabled BOOLEAN DEFAULT 1,
              settings TEXT, -- JSON string for subject-specific settings
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
              UNIQUE(user_id, subject)
            )
          `);
          
          // Diary entries
          db.run(`
            CREATE TABLE IF NOT EXISTS diary_entries (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              entry_date DATETIME NOT NULL,
              audio_s3_key TEXT,
              raw_transcript_s3_key TEXT,
              structured_summary_s3_key TEXT,
              transcription_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
              analysis_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
          `);
          
          // Processing jobs table for async operations
          db.run(`
            CREATE TABLE IF NOT EXISTS processing_jobs (
              id TEXT PRIMARY KEY,
              entry_id TEXT NOT NULL,
              job_type TEXT NOT NULL, -- transcription, analysis
              status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
              aws_job_id TEXT, -- For Amazon Transcribe job tracking
              error_message TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (entry_id) REFERENCES diary_entries (id) ON DELETE CASCADE
            )
          `);
          
          // Create indexes for better performance
          db.run(`CREATE INDEX IF NOT EXISTS idx_diary_entries_user_date ON diary_entries(user_id, entry_date DESC)`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status)`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_user_subjects_user ON user_subjects(user_id)`);
          
          console.log('Database tables created/verified successfully');
          resolve(db);
        });
      });
    });
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

function getDatabase() {
  return new sqlite3.Database(DATABASE_PATH);
}

module.exports = {
  initializeDatabase,
  getDatabase
};