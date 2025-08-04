#!/usr/bin/env node

/**
 * Health Diary Data Export Script
 * 
 * Exports all user data, diary entries, and transcribed text to JSON format
 * Usage: node export-data.js [output-file.json]
 */

const sqlite3 = require('sqlite3').verbose();
const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const DATABASE_PATH = process.env.DATABASE_PATH || './server/data/healthdiary.db';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'healthdiary--audio';
const AWS_REGION = process.env.AWS_REGION || 'eu-west-2';

// Configure AWS
AWS.config.update({
  region: AWS_REGION
});
const s3 = new AWS.S3();

class DataExporter {
  constructor() {
    this.exportData = {
      exportInfo: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        description: 'Health Diary complete data export'
      },
      users: [],
      summary: {
        totalUsers: 0,
        totalEntries: 0,
        entriesWithTranscripts: 0,
        entriesWithAnalysis: 0
      }
    };
  }

  /**
   * Open database connection
   */
  async openDatabase() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DATABASE_PATH, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          resolve();
        }
      });
    });
  }

  /**
   * Close database connection
   */
  closeDatabase() {
    if (this.db) {
      this.db.close();
    }
  }

  /**
   * Get all users from database
   */
  async getUsers() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, username, email, interaction_style, created_at, updated_at 
         FROM users ORDER BY created_at ASC`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get user subjects for a specific user
   */
  async getUserSubjects(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT subject, enabled, settings, created_at 
         FROM user_subjects 
         WHERE user_id = ? 
         ORDER BY subject ASC`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get diary entries for a specific user
   */
  async getDiaryEntries(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, entry_date, audio_s3_key, raw_transcript_s3_key, 
                structured_summary_s3_key, transcription_status, analysis_status,
                created_at, updated_at
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
  }

  /**
   * Get processing jobs for a specific entry
   */
  async getProcessingJobs(entryId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, job_type, status, aws_job_id, error_message, created_at, updated_at
         FROM processing_jobs 
         WHERE entry_id = ? 
         ORDER BY created_at ASC`,
        [entryId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get file content from S3
   */
  async getS3FileContent(s3Key) {
    try {
      console.log(`Retrieving S3 file: ${s3Key}`);
      const params = {
        Bucket: S3_BUCKET_NAME,
        Key: s3Key
      };
      
      const result = await s3.getObject(params).promise();
      return result.Body.toString('utf-8');
    } catch (error) {
      console.warn(`Failed to retrieve S3 file ${s3Key}:`, error.message);
      return null;
    }
  }

  /**
   * Parse transcript content
   */
  parseTranscript(transcriptContent) {
    if (!transcriptContent) return null;
    
    try {
      // Check if it's JSON (AWS Transcribe format)
      if (transcriptContent.trim().startsWith('{')) {
        const json = JSON.parse(transcriptContent);
        return {
          format: 'json',
          text: json.results?.transcripts?.[0]?.transcript || '',
          confidence: this.calculateAverageConfidence(json.results?.items || []),
          wordCount: json.results?.transcripts?.[0]?.transcript?.split(' ').length || 0,
          fullResult: json
        };
      } else {
        // Markdown format
        const lines = transcriptContent.split('\n');
        const transcriptStart = lines.findIndex(line => line.includes('## Transcript'));
        const metadataStart = lines.findIndex(line => line.includes('## Metadata'));
        
        let text = '';
        if (transcriptStart !== -1) {
          const endIndex = metadataStart !== -1 ? metadataStart : lines.length;
          text = lines.slice(transcriptStart + 1, endIndex).join('\n').trim();
        }
        
        return {
          format: 'markdown',
          text: text,
          wordCount: text.split(' ').length,
          fullContent: transcriptContent
        };
      }
    } catch (error) {
      console.warn('Error parsing transcript:', error.message);
      return {
        format: 'raw',
        text: transcriptContent,
        wordCount: transcriptContent.split(' ').length
      };
    }
  }

  /**
   * Calculate average confidence from AWS Transcribe items
   */
  calculateAverageConfidence(items) {
    if (!items || items.length === 0) return 0;
    
    const confidenceValues = items
      .filter(item => item.alternatives && item.alternatives[0])
      .map(item => parseFloat(item.alternatives[0].confidence) || 0);
    
    if (confidenceValues.length === 0) return 0;
    
    const sum = confidenceValues.reduce((acc, val) => acc + val, 0);
    return Math.round((sum / confidenceValues.length) * 100 * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Parse analysis content
   */
  parseAnalysis(analysisContent) {
    if (!analysisContent) return null;
    
    try {
      return JSON.parse(analysisContent);
    } catch (error) {
      console.warn('Error parsing analysis:', error.message);
      return {
        format: 'raw',
        content: analysisContent
      };
    }
  }

  /**
   * Process a single diary entry
   */
  async processDiaryEntry(entry) {
    console.log(`Processing diary entry: ${entry.id}`);
    
    const processedEntry = {
      id: entry.id,
      entryDate: entry.entry_date,
      status: {
        transcription: entry.transcription_status,
        analysis: entry.analysis_status
      },
      timestamps: {
        created: entry.created_at,
        updated: entry.updated_at
      },
      s3Keys: {
        audio: entry.audio_s3_key,
        rawTranscript: entry.raw_transcript_s3_key,
        structuredSummary: entry.structured_summary_s3_key
      },
      content: {
        transcript: null,
        analysis: null
      },
      processingJobs: await this.getProcessingJobs(entry.id)
    };

    // Get transcript content
    if (entry.raw_transcript_s3_key) {
      const transcriptContent = await this.getS3FileContent(entry.raw_transcript_s3_key);
      processedEntry.content.transcript = this.parseTranscript(transcriptContent);
    }

    // Get analysis content
    if (entry.structured_summary_s3_key) {
      const analysisContent = await this.getS3FileContent(entry.structured_summary_s3_key);
      processedEntry.content.analysis = this.parseAnalysis(analysisContent);
    }

    return processedEntry;
  }

  /**
   * Process a single user
   */
  async processUser(user) {
    console.log(`Processing user: ${user.username} (${user.id})`);
    
    const processedUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      interactionStyle: user.interaction_style,
      timestamps: {
        created: user.created_at,
        updated: user.updated_at
      },
      subjects: await this.getUserSubjects(user.id),
      diaryEntries: []
    };

    // Get and process diary entries
    const entries = await this.getDiaryEntries(user.id);
    for (const entry of entries) {
      const processedEntry = await this.processDiaryEntry(entry);
      processedUser.diaryEntries.push(processedEntry);
    }

    return processedUser;
  }

  /**
   * Generate export summary
   */
  generateSummary() {
    let totalEntries = 0;
    let entriesWithTranscripts = 0;
    let entriesWithAnalysis = 0;

    for (const user of this.exportData.users) {
      totalEntries += user.diaryEntries.length;
      
      for (const entry of user.diaryEntries) {
        if (entry.content.transcript && entry.content.transcript.text) {
          entriesWithTranscripts++;
        }
        if (entry.content.analysis) {
          entriesWithAnalysis++;
        }
      }
    }

    this.exportData.summary = {
      totalUsers: this.exportData.users.length,
      totalEntries,
      entriesWithTranscripts,
      entriesWithAnalysis,
      completionRate: {
        transcription: totalEntries > 0 ? Math.round((entriesWithTranscripts / totalEntries) * 100) : 0,
        analysis: totalEntries > 0 ? Math.round((entriesWithAnalysis / totalEntries) * 100) : 0
      }
    };
  }

  /**
   * Export all data
   */
  async exportAll() {
    try {
      console.log('Starting Health Diary data export...');
      
      await this.openDatabase();
      
      // Get all users
      const users = await this.getUsers();
      console.log(`Found ${users.length} users`);

      // Process each user
      for (const user of users) {
        const processedUser = await this.processUser(user);
        this.exportData.users.push(processedUser);
      }

      // Generate summary
      this.generateSummary();

      this.closeDatabase();
      
      console.log('Export completed successfully');
      console.log(`Summary: ${this.exportData.summary.totalUsers} users, ${this.exportData.summary.totalEntries} entries`);
      console.log(`Transcription rate: ${this.exportData.summary.completionRate.transcription}%`);
      console.log(`Analysis rate: ${this.exportData.summary.completionRate.analysis}%`);
      
      return this.exportData;
      
    } catch (error) {
      console.error('Export failed:', error);
      this.closeDatabase();
      throw error;
    }
  }

  /**
   * Save export to file
   */
  async saveToFile(filename) {
    const jsonOutput = JSON.stringify(this.exportData, null, 2);
    await fs.writeFile(filename, jsonOutput, 'utf8');
    console.log(`Export saved to: ${filename}`);
  }
}

// Main execution
async function main() {
  const outputFile = process.argv[2] || `health-diary-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
  
  try {
    const exporter = new DataExporter();
    await exporter.exportAll();
    await exporter.saveToFile(outputFile);
    
    console.log('\n✅ Export completed successfully!');
    console.log(`📄 Output file: ${outputFile}`);
    
  } catch (error) {
    console.error('\n❌ Export failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = DataExporter;