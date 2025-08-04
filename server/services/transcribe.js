const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database/init');

// Configure AWS Transcribe
AWS.config.update({
  region: process.env.AWS_REGION || 'eu-west-2',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const transcribe = new AWS.TranscribeService();
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'healthdiary--audio';

class TranscribeService {
  /**
   * Start transcription job for audio file
   */
  async startTranscriptionJob(entryId, audioS3Key, languageCode = 'en-GB') {
    const jobName = `healthdiary-${entryId}-${Date.now()}`;
    const audioUri = `s3://${BUCKET_NAME}/${audioS3Key}`;
    const outputKey = audioS3Key.replace('/audio-files/', '/transcripts/').replace(/\.[^.]+$/, '-transcript.json');
    
    const params = {
      TranscriptionJobName: jobName,
      LanguageCode: languageCode,
      Media: {
        MediaFileUri: audioUri
      },
      OutputBucketName: BUCKET_NAME,
      OutputKey: outputKey,
      Settings: {
        ShowSpeakerLabels: false,
        ShowAlternatives: false,
        VocabularyFilterMethod: 'mask', // Mask profanity
      }
    };
    
    try {
      const result = await transcribe.startTranscriptionJob(params).promise();
      
      // Store job information in database
      const db = getDatabase();
      const jobId = uuidv4();
      
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO processing_jobs (id, entry_id, job_type, status, aws_job_id) 
           VALUES (?, ?, 'transcription', 'processing', ?)`,
          [jobId, entryId, jobName],
          function(err) {
            if (err) reject(err);
            else resolve(this);
          }
        );
      });
      
      // Update entry status
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE diary_entries SET transcription_status = ? WHERE id = ?',
          ['processing', entryId],
          function(err) {
            if (err) reject(err);
            else resolve(this);
          }
        );
      });
      
      db.close();
      
      console.log(`Transcription job started: ${jobName}`);
      return {
        jobName,
        jobId,
        status: result.TranscriptionJob.TranscriptionJobStatus,
        outputLocation: `s3://${BUCKET_NAME}/${outputKey}`
      };
      
    } catch (error) {
      console.error('Transcription job start error:', error);
      
      // Update job status to failed
      const db = getDatabase();
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE diary_entries SET transcription_status = ? WHERE id = ?',
          ['failed', entryId],
          function(err) {
            if (err) reject(err);
            else resolve(this);
          }
        );
      });
      db.close();
      
      throw new Error('Failed to start transcription job');
    }
  }
  
  /**
   * Check status of transcription job
   */
  async checkTranscriptionStatus(jobName) {
    const params = {
      TranscriptionJobName: jobName
    };
    
    try {
      const result = await transcribe.getTranscriptionJob(params).promise();
      const job = result.TranscriptionJob;
      
      return {
        jobName: job.TranscriptionJobName,
        status: job.TranscriptionJobStatus,
        creationTime: job.CreationTime,
        completionTime: job.CompletionTime,
        failureReason: job.FailureReason,
        transcript: job.Transcript,
        languageCode: job.LanguageCode
      };
      
    } catch (error) {
      console.error('Transcription status check error:', error);
      throw new Error('Failed to check transcription status');
    }
  }
  
  /**
   * Get completed transcription result
   */
  async getTranscriptionResult(transcriptUri) {
    try {
      // Extract S3 key from URI (handle both s3:// and https:// formats)
      let s3Key;
      if (transcriptUri.startsWith('s3://')) {
        s3Key = transcriptUri.replace(`s3://${BUCKET_NAME}/`, '');
      } else {
        // Handle HTTPS URL format from AWS Transcribe
        const url = new URL(transcriptUri);
        s3Key = url.pathname.substring(1); // Remove leading slash
      }
      
      console.log(`Attempting to retrieve transcript from S3 key: ${s3Key}`);
      
      // Get transcript from S3
      const s3Service = require('./s3');
      const transcriptJson = await s3Service.getFileContent(s3Key);
      const transcript = JSON.parse(transcriptJson);
      
      // Extract the transcript text
      const transcriptText = transcript.results.transcripts[0].transcript;
      
      return {
        text: transcriptText,
        confidence: this.calculateAverageConfidence(transcript.results.items),
        wordCount: transcript.results.transcripts[0].transcript.split(' ').length,
        duration: transcript.jobDetails?.duration || null,
        fullResult: transcript
      };
      
    } catch (error) {
      console.error('Get transcription result error:', error);
      throw new Error('Failed to retrieve transcription result');
    }
  }
  
  /**
   * Process completed transcription jobs (called by scheduled task)
   */
  async processCompletedJobs() {
    const db = getDatabase();
    
    // Get all processing transcription jobs
    const jobs = await new Promise((resolve, reject) => {
      db.all(
        `SELECT pj.*, de.id as entry_id, de.user_id 
         FROM processing_jobs pj 
         JOIN diary_entries de ON pj.entry_id = de.id 
         WHERE pj.job_type = 'transcription' AND pj.status = 'processing'`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    for (const job of jobs) {
      try {
        const status = await this.checkTranscriptionStatus(job.aws_job_id);
        
        if (status.status === 'COMPLETED') {
          // Get transcript result
          const result = await this.getTranscriptionResult(status.transcript.TranscriptFileUri);
          
          // Save transcript to S3
          const s3Service = require('./s3');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const transcriptKey = `users/${job.user_id}/raw-transcripts/${timestamp}-raw.md`;
          
          const markdownContent = `# Health Diary Entry - ${new Date().toLocaleDateString()}

## Transcript
${result.text}

## Metadata
- **Confidence**: ${result.confidence.toFixed(2)}%
- **Word Count**: ${result.wordCount}
- **Duration**: ${result.duration || 'Unknown'}
- **Processed**: ${new Date().toISOString()}
`;
          
          await s3Service.uploadTextFile(job.user_id, markdownContent, `raw-transcripts/${timestamp}-raw.md`, 'text/markdown');
          
          // Update database
          await new Promise((resolve, reject) => {
            db.run(
              `UPDATE diary_entries 
               SET transcription_status = 'completed', 
                   raw_transcript_s3_key = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [transcriptKey, job.entry_id],
              function(err) {
                if (err) reject(err);
                else resolve(this);
              }
            );
          });
          
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE processing_jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              ['completed', job.id],
              function(err) {
                if (err) reject(err);
                else resolve(this);
              }
            );
          });
          
          console.log(`Transcription completed for entry ${job.entry_id}`);
          
        } else if (status.status === 'FAILED') {
          // Update job as failed
          await new Promise((resolve, reject) => {
            db.run(
              `UPDATE processing_jobs 
               SET status = 'failed', 
                   error_message = ?,
                   updated_at = CURRENT_TIMESTAMP 
               WHERE id = ?`,
              [status.failureReason, job.id],
              function(err) {
                if (err) reject(err);
                else resolve(this);
              }
            );
          });
          
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE diary_entries SET transcription_status = ? WHERE id = ?',
              ['failed', job.entry_id],
              function(err) {
                if (err) reject(err);
                else resolve(this);
              }
            );
          });
          
          console.error(`Transcription failed for entry ${job.entry_id}: ${status.failureReason}`);
        }
        
      } catch (error) {
        console.error(`Error processing transcription job ${job.id}:`, error);
      }
    }
    
    db.close();
  }
  
  /**
   * Calculate average confidence from transcript items
   */
  calculateAverageConfidence(items) {
    if (!items || items.length === 0) return 0;
    
    const confidenceValues = items
      .filter(item => item.alternatives && item.alternatives[0])
      .map(item => parseFloat(item.alternatives[0].confidence) || 0);
    
    if (confidenceValues.length === 0) return 0;
    
    const sum = confidenceValues.reduce((acc, val) => acc + val, 0);
    return (sum / confidenceValues.length) * 100;
  }
}

module.exports = new TranscribeService();