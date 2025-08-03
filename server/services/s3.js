const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'eu-west-2',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'healthdiary-audio-files';

class S3Service {
  /**
   * Upload audio file to S3
   */
  async uploadAudioFile(userId, audioBuffer, contentType) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = this.getExtensionFromContentType(contentType);
    const key = `users/${userId}/audio-files/${timestamp}-${uuidv4()}.${extension}`;
    
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: audioBuffer,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'user-id': userId,
        'upload-timestamp': timestamp,
        'content-type': contentType
      }
    };
    
    try {
      const result = await s3.upload(params).promise();
      return {
        key: key,
        location: result.Location,
        etag: result.ETag
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error('Failed to upload audio file to S3');
    }
  }
  
  /**
   * Upload text content (transcripts, summaries) to S3
   */
  async uploadTextFile(userId, content, filename, contentType = 'text/plain') {
    const key = `users/${userId}/${filename}`;
    
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: content,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'user-id': userId,
        'upload-timestamp': new Date().toISOString()
      }
    };
    
    try {
      const result = await s3.upload(params).promise();
      return {
        key: key,
        location: result.Location,
        etag: result.ETag
      };
    } catch (error) {
      console.error('S3 text upload error:', error);
      throw new Error('Failed to upload text file to S3');
    }
  }
  
  /**
   * Get presigned URL for file download
   */
  async getPresignedUrl(key, expiresIn = 3600) {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Expires: expiresIn
    };
    
    try {
      return await s3.getSignedUrlPromise('getObject', params);
    } catch (error) {
      console.error('S3 presigned URL error:', error);
      throw new Error('Failed to generate download URL');
    }
  }
  
  /**
   * Get file content from S3
   */
  async getFileContent(key) {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };
    
    try {
      const result = await s3.getObject(params).promise();
      return result.Body.toString('utf-8');
    } catch (error) {
      console.error('S3 get file error:', error);
      throw new Error('Failed to retrieve file from S3');
    }
  }
  
  /**
   * Delete file from S3
   */
  async deleteFile(key) {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };
    
    try {
      await s3.deleteObject(params).promise();
      return true;
    } catch (error) {
      console.error('S3 delete error:', error);
      throw new Error('Failed to delete file from S3');
    }
  }
  
  /**
   * Helper method to get file extension from content type
   */
  getExtensionFromContentType(contentType) {
    const typeMap = {
      'audio/wav': 'wav',
      'audio/mp3': 'mp3',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'mp4',
      'audio/webm': 'webm',
      'audio/ogg': 'ogg'
    };
    
    return typeMap[contentType] || 'bin';
  }
  
  /**
   * Ensure S3 bucket exists and is properly configured
   */
  async ensureBucketExists() {
    try {
      // Check if bucket exists
      await s3.headBucket({ Bucket: BUCKET_NAME }).promise();
      console.log(`S3 bucket ${BUCKET_NAME} exists and is accessible`);
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        // Bucket doesn't exist, create it
        console.log(`Creating S3 bucket: ${BUCKET_NAME}`);
        try {
          await s3.createBucket({
            Bucket: BUCKET_NAME,
            CreateBucketConfiguration: {
              LocationConstraint: process.env.AWS_REGION || 'eu-west-2'
            }
          }).promise();
          
          // Set bucket encryption
          await s3.putBucketEncryption({
            Bucket: BUCKET_NAME,
            ServerSideEncryptionConfiguration: {
              Rules: [{
                ApplyServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'AES256'
                }
              }]
            }
          }).promise();
          
          console.log(`S3 bucket ${BUCKET_NAME} created successfully`);
          return true;
        } catch (createError) {
          console.error('Failed to create S3 bucket:', createError);
          throw new Error('Failed to create S3 bucket');
        }
      } else {
        console.error('S3 bucket access error:', error);
        throw new Error('Failed to access S3 bucket');
      }
    }
  }
}

module.exports = new S3Service();