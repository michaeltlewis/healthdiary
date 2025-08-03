const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const { getDatabase } = require('../database/init');
const { attachUserDetails } = require('../middleware/auth');
const s3Service = require('../services/s3');
const transcribeService = require('../services/transcribe');
const anthropicService = require('../services/anthropic');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_AUDIO_TYPES || 'audio/wav,audio/mp3,audio/mp4,audio/webm,audio/ogg').split(',');
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: ${allowedTypes.join(', ')}`), false);
    }
  }
});

// Validation schemas
const createEntrySchema = Joi.object({
  entryDate: Joi.date().iso().default(() => new Date())
});

// Upload audio and create diary entry
router.post('/upload', attachUserDetails, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }
    
    const { error, value } = createEntrySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details.map(d => d.message) 
      });
    }
    
    const { entryDate } = value;
    const userId = req.user.id;
    const entryId = uuidv4();
    
    // Upload audio to S3
    const audioUpload = await s3Service.uploadAudioFile(
      userId,
      req.file.buffer,
      req.file.mimetype
    );
    
    // Create diary entry in database
    const db = getDatabase();
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO diary_entries (id, user_id, entry_date, audio_s3_key, transcription_status, analysis_status) 
         VALUES (?, ?, ?, ?, 'pending', 'pending')`,
        [entryId, userId, entryDate, audioUpload.key],
        function(err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });
    
    db.close();
    
    // Start transcription job
    try {
      const transcriptionJob = await transcribeService.startTranscriptionJob(entryId, audioUpload.key);
      console.log(`Transcription job started for entry ${entryId}:`, transcriptionJob.jobName);
    } catch (transcriptionError) {
      console.error('Failed to start transcription:', transcriptionError);
      // Entry is still created, transcription can be retried later
    }
    
    res.status(201).json({
      message: 'Audio uploaded successfully',
      entry: {
        id: entryId,
        entryDate,
        audioLocation: audioUpload.location,
        transcriptionStatus: 'pending',
        analysisStatus: 'pending'
      }
    });
    
  } catch (error) {
    console.error('Audio upload error:', error);
    
    if (error.message.includes('File type')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to upload audio file' });
  }
});

// Get user's diary entries
router.get('/entries', attachUserDetails, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const db = getDatabase();
    
    // Get entries with pagination
    const entries = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, entry_date, transcription_status, analysis_status, created_at, updated_at
         FROM diary_entries 
         WHERE user_id = ? 
         ORDER BY entry_date DESC, created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    // Get total count
    const totalCount = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM diary_entries WHERE user_id = ?',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
    
    db.close();
    
    res.json({
      entries,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
    
  } catch (error) {
    console.error('Get entries error:', error);
    res.status(500).json({ error: 'Failed to retrieve diary entries' });
  }
});

// Get specific diary entry with full details
router.get('/entries/:entryId', attachUserDetails, async (req, res) => {
  try {
    const userId = req.user.id;
    const entryId = req.params.entryId;
    
    const db = getDatabase();
    
    // Get entry details
    const entry = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM diary_entries 
         WHERE id = ? AND user_id = ?`,
        [entryId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!entry) {
      db.close();
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    db.close();
    
    // Get transcript and analysis from S3 if available
    const entryData = { ...entry };
    
    try {
      if (entry.raw_transcript_s3_key) {
        const transcriptContent = await s3Service.getFileContent(entry.raw_transcript_s3_key);
        entryData.transcript = transcriptContent;
      }
      
      if (entry.structured_summary_s3_key) {
        const summaryContent = await s3Service.getFileContent(entry.structured_summary_s3_key);
        entryData.analysis = JSON.parse(summaryContent);
      }
      
      // Generate presigned URL for audio download
      if (entry.audio_s3_key) {
        entryData.audioDownloadUrl = await s3Service.getPresignedUrl(entry.audio_s3_key, 3600); // 1 hour expiry
      }
      
    } catch (s3Error) {
      console.error('Error fetching S3 content:', s3Error);
      // Continue without the additional data
    }
    
    res.json({ entry: entryData });
    
  } catch (error) {
    console.error('Get entry error:', error);
    res.status(500).json({ error: 'Failed to retrieve diary entry' });
  }
});

// Generate follow-up questions for incomplete entries
router.post('/entries/:entryId/follow-up', attachUserDetails, async (req, res) => {
  try {
    const userId = req.user.id;
    const entryId = req.params.entryId;
    
    const db = getDatabase();
    
    // Get entry and check if analysis is complete
    const entry = await new Promise((resolve, reject) => {
      db.get(
        `SELECT de.*, u.interaction_style
         FROM diary_entries de
         JOIN users u ON de.user_id = u.id
         WHERE de.id = ? AND de.user_id = ?`,
        [entryId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!entry) {
      db.close();
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    if (entry.analysis_status !== 'completed' || !entry.structured_summary_s3_key) {
      db.close();
      return res.status(400).json({ error: 'Entry analysis not yet completed' });
    }
    
    // Get user's tracked subjects
    const subjects = await new Promise((resolve, reject) => {
      db.all(
        'SELECT subject FROM user_subjects WHERE user_id = ? AND enabled = 1',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve((rows || []).map(r => r.subject));
        }
      );
    });
    
    db.close();
    
    // Get analysis from S3
    const analysisContent = await s3Service.getFileContent(entry.structured_summary_s3_key);
    const analysis = JSON.parse(analysisContent);
    
    // Get transcript for context
    const transcriptContent = await s3Service.getFileContent(entry.raw_transcript_s3_key);
    const transcriptMatch = transcriptContent.match(/## Transcript\n([\s\S]*?)\n\n## Metadata/);
    const transcript = transcriptMatch ? transcriptMatch[1].trim() : transcriptContent;
    
    // Generate follow-up questions
    const missingSubjects = analysis.missing_subjects || [];
    if (missingSubjects.length === 0) {
      return res.json({ 
        message: 'All tracked subjects covered in this entry',
        questions: []
      });
    }
    
    const followUpResult = await anthropicService.generateFollowUpQuestions(
      transcript,
      missingSubjects,
      entry.interaction_style
    );
    
    if (followUpResult.success) {
      res.json({
        questions: followUpResult.questions,
        missingSubjects,
        usage: followUpResult.usage
      });
    } else {
      res.status(500).json({ error: followUpResult.error });
    }
    
  } catch (error) {
    console.error('Follow-up questions error:', error);
    res.status(500).json({ error: 'Failed to generate follow-up questions' });
  }
});

// Delete diary entry
router.delete('/entries/:entryId', attachUserDetails, async (req, res) => {
  try {
    const userId = req.user.id;
    const entryId = req.params.entryId;
    
    const db = getDatabase();
    
    // Get entry to delete associated S3 files
    const entry = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM diary_entries WHERE id = ? AND user_id = ?',
        [entryId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!entry) {
      db.close();
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    // Delete from database (cascade will handle processing_jobs)
    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM diary_entries WHERE id = ? AND user_id = ?',
        [entryId, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });
    
    db.close();
    
    // Delete S3 files (don't fail if S3 deletion fails)
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
      console.error('Error deleting S3 files:', s3Error);
      // Continue - database entry is already deleted
    }
    
    res.json({ message: 'Entry deleted successfully' });
    
  } catch (error) {
    console.error('Delete entry error:', error);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// Get processing status for entries
router.get('/processing-status', attachUserDetails, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();
    
    // Get processing statistics
    const stats = await new Promise((resolve, reject) => {
      db.all(
        `SELECT 
           transcription_status,
           analysis_status,
           COUNT(*) as count
         FROM diary_entries 
         WHERE user_id = ?
         GROUP BY transcription_status, analysis_status`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    // Get recent processing jobs
    const recentJobs = await new Promise((resolve, reject) => {
      db.all(
        `SELECT pj.*, de.entry_date
         FROM processing_jobs pj
         JOIN diary_entries de ON pj.entry_id = de.id
         WHERE de.user_id = ?
         ORDER BY pj.updated_at DESC
         LIMIT 10`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    db.close();
    
    res.json({
      stats,
      recentJobs
    });
    
  } catch (error) {
    console.error('Processing status error:', error);
    res.status(500).json({ error: 'Failed to get processing status' });
  }
});

module.exports = router;