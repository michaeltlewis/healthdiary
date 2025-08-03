const express = require('express');
const Joi = require('joi');
const { getDatabase } = require('../database/init');
const { attachUserDetails } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const updatePreferencesSchema = Joi.object({
  interactionStyle: Joi.string().valid('minimal', 'friendly', 'reassuring'),
  subjects: Joi.array().items(Joi.string().valid('sleep', 'food', 'exercise', 'wellness', 'mood', 'symptoms'))
});

// Get user profile and preferences
router.get('/profile', attachUserDetails, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();
    
    // Get user details
    const user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, username, email, interaction_style, created_at FROM users WHERE id = ?',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!user) {
      db.close();
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user subjects
    const subjects = await new Promise((resolve, reject) => {
      db.all(
        'SELECT subject, enabled, settings FROM user_subjects WHERE user_id = ?',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    // Get diary entry statistics
    const stats = await new Promise((resolve, reject) => {
      db.get(
        `SELECT 
           COUNT(*) as total_entries,
           COUNT(CASE WHEN transcription_status = 'completed' THEN 1 END) as transcribed_entries,
           COUNT(CASE WHEN analysis_status = 'completed' THEN 1 END) as analyzed_entries,
           MIN(entry_date) as first_entry_date,
           MAX(entry_date) as last_entry_date
         FROM diary_entries 
         WHERE user_id = ?`,
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    db.close();
    
    res.json({
      user: {
        ...user,
        subjects,
        stats
      }
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to retrieve user profile' });
  }
});

// Update user preferences
router.put('/preferences', attachUserDetails, async (req, res) => {
  try {
    const { error, value } = updatePreferencesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }
    
    const userId = req.user.id;
    const { interactionStyle, subjects } = value;
    const db = getDatabase();
    
    // Update user interaction style if provided
    if (interactionStyle) {
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE users SET interaction_style = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [interactionStyle, userId],
          function(err) {
            if (err) reject(err);
            else resolve(this);
          }
        );
      });
    }
    
    // Update subject preferences if provided
    if (subjects && Array.isArray(subjects)) {
      // First, disable all subjects
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE user_subjects SET enabled = 0 WHERE user_id = ?',
          [userId],
          function(err) {
            if (err) reject(err);
            else resolve(this);
          }
        );
      });
      
      // Then enable/add selected subjects
      for (const subject of subjects) {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT OR REPLACE INTO user_subjects (user_id, subject, enabled) 
             VALUES (?, ?, 1)`,
            [userId, subject],
            function(err) {
              if (err) reject(err);
              else resolve(this);
            }
          );
        });
      }
    }
    
    db.close();
    
    res.json({ message: 'Preferences updated successfully' });
    
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Get user's health insights and trends
router.get('/insights', attachUserDetails, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;
    const db = getDatabase();
    
    // Get recent entries with analysis
    const entries = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, entry_date, structured_summary_s3_key, analysis_status
         FROM diary_entries 
         WHERE user_id = ? 
         AND analysis_status = 'completed'
         AND entry_date >= datetime('now', '-${days} days')
         ORDER BY entry_date DESC`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    db.close();
    
    if (entries.length === 0) {
      return res.json({
        message: 'No analyzed entries found for the specified period',
        insights: {
          totalEntries: 0,
          period: days,
          trends: {}
        }
      });
    }
    
    // Aggregate insights from S3 data
    const s3Service = require('../services/s3');
    const insights = {
      totalEntries: entries.length,
      period: days,
      trends: {},
      healthFlags: {
        concerning: [],
        positive: []
      },
      subjectCoverage: {}
    };
    
    let processedEntries = 0;
    
    for (const entry of entries.slice(0, 10)) { // Limit to 10 most recent for performance
      try {
        const summaryContent = await s3Service.getFileContent(entry.structured_summary_s3_key);
        const analysis = JSON.parse(summaryContent);
        
        // Aggregate subject mentions
        Object.keys(analysis.subjects || {}).forEach(subject => {
          const subjectData = analysis.subjects[subject];
          if (subjectData.mentioned) {
            insights.subjectCoverage[subject] = (insights.subjectCoverage[subject] || 0) + 1;
          }
        });
        
        // Collect health flags
        if (analysis.health_flags) {
          insights.healthFlags.concerning.push(...(analysis.health_flags.concerning_symptoms || []));
          insights.healthFlags.positive.push(...(analysis.health_flags.positive_trends || []));
        }
        
        processedEntries++;
        
      } catch (s3Error) {
        console.error(`Error processing entry ${entry.id}:`, s3Error);
        // Continue with other entries
      }
    }
    
    // Calculate subject coverage percentages
    Object.keys(insights.subjectCoverage).forEach(subject => {
      insights.subjectCoverage[subject] = {
        count: insights.subjectCoverage[subject],
        percentage: Math.round((insights.subjectCoverage[subject] / processedEntries) * 100)
      };
    });
    
    // Remove duplicates from health flags
    insights.healthFlags.concerning = [...new Set(insights.healthFlags.concerning)];
    insights.healthFlags.positive = [...new Set(insights.healthFlags.positive)];
    
    res.json({ insights });
    
  } catch (error) {
    console.error('Get insights error:', error);
    res.status(500).json({ error: 'Failed to retrieve insights' });
  }
});

// Export user data
router.get('/export', attachUserDetails, async (req, res) => {
  try {
    const userId = req.user.id;
    const format = req.query.format || 'json';
    const db = getDatabase();
    
    // Get user data
    const user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, username, email, interaction_style, created_at FROM users WHERE id = ?',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    // Get subjects
    const subjects = await new Promise((resolve, reject) => {
      db.all(
        'SELECT subject, enabled, settings FROM user_subjects WHERE user_id = ?',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    // Get all entries
    const entries = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, entry_date, transcription_status, analysis_status, 
                raw_transcript_s3_key, structured_summary_s3_key, created_at
         FROM diary_entries 
         WHERE user_id = ?
         ORDER BY entry_date DESC`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    db.close();
    
    const exportData = {
      user: { ...user, subjects },
      entries,
      exportedAt: new Date().toISOString(),
      totalEntries: entries.length
    };
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="healthdiary-export-${user.username}-${new Date().toISOString().split('T')[0]}.json"`);
      res.json(exportData);
    } else {
      res.status(400).json({ error: 'Unsupported export format. Only JSON is currently supported.' });
    }
    
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Failed to export user data' });
  }
});

// Delete user account and all associated data
router.delete('/account', attachUserDetails, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();
    
    // Get all entries to delete S3 files
    const entries = await new Promise((resolve, reject) => {
      db.all(
        'SELECT audio_s3_key, raw_transcript_s3_key, structured_summary_s3_key FROM diary_entries WHERE user_id = ?',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    // Delete user (cascade will handle related tables)
    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM users WHERE id = ?',
        [userId],
        function(err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });
    
    db.close();
    
    // Delete S3 files (don't fail if S3 deletion fails)
    const s3Service = require('../services/s3');
    for (const entry of entries) {
      try {
        if (entry.audio_s3_key) {
          await s3Service.deleteFile(entry.audio_s3_key);
        }
        if (entry.raw_transcript_s3_key) {
          await s3Service.deleteFile(entry.raw_transcript_s3_key);
        }
        if (entry.structured_summary_s3_key) {
          await s3Service.deleteFile(entry.structured_summary_s3_key);
        }
      } catch (s3Error) {
        console.error(`Error deleting S3 files for entry:`, s3Error);
        // Continue with other entries
      }
    }
    
    res.json({ message: 'Account deleted successfully' });
    
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;