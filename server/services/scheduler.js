const transcribeService = require('./transcribe');
const anthropicService = require('./anthropic');
const s3Service = require('./s3');

class SchedulerService {
  constructor() {
    this.processingInterval = null;
    this.isRunning = false;
  }
  
  /**
   * Start the background processing scheduler
   */
  start(intervalMs = 60000) { // Default: check every minute
    if (this.isRunning) {
      console.log('Scheduler is already running');
      return;
    }
    
    console.log(`Starting scheduler with ${intervalMs}ms interval`);
    this.isRunning = true;
    
    // Run immediately, then on interval
    this.processJobs();
    
    this.processingInterval = setInterval(() => {
      this.processJobs();
    }, intervalMs);
  }
  
  /**
   * Stop the background processing scheduler
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.isRunning = false;
    console.log('Scheduler stopped');
  }
  
  /**
   * Process all pending jobs
   */
  async processJobs() {
    if (!this.isRunning) return;
    
    try {
      console.log('Processing background jobs...');
      
      // Ensure S3 bucket exists
      await this.ensureS3Setup();
      
      // Process completed transcription jobs
      await transcribeService.processCompletedJobs();
      
      // Process completed transcriptions for analysis
      await anthropicService.processCompletedTranscriptions();
      
      console.log('Background job processing completed');
      
    } catch (error) {
      console.error('Error during background job processing:', error);
    }
  }
  
  /**
   * Ensure S3 bucket is properly set up
   */
  async ensureS3Setup() {
    try {
      await s3Service.ensureBucketExists();
    } catch (error) {
      console.error('S3 setup error:', error);
      // Don't throw - continue with other processing
    }
  }
  
  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      hasInterval: !!this.processingInterval,
      lastRun: new Date().toISOString()
    };
  }
  
  /**
   * Force run job processing (for testing/manual triggers)
   */
  async forceRun() {
    console.log('Force running background jobs...');
    await this.processJobs();
  }
}

// Create singleton instance
const scheduler = new SchedulerService();

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('Received SIGINT, stopping scheduler...');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, stopping scheduler...');
  scheduler.stop();
  process.exit(0);
});

module.exports = scheduler;