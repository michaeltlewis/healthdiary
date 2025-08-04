#!/usr/bin/env node

/**
 * Health Diary System Integration Tests
 * Tests the deployed application to ensure core functionality works
 */

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// Configuration
const BASE_URL = process.env.TEST_BASE_URL || 'https://healthdiary-app.duckdns.org';
const BACKUP_URL = process.env.TEST_BACKUP_URL || 'https://18.130.249.186';

class HealthDiarySystemTests {
  constructor() {
    this.baseUrl = BASE_URL;
    this.testUser = {
      username: `testuser${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'TestPassword123',
      interactionStyle: 'friendly',
      subjects: ['wellness', 'mood']
    };
    this.authToken = null;
    this.testResults = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    console.log(logMessage);
    this.testResults.push({ timestamp, type, message });
  }

  async makeRequest(method, endpoint, data = null, headers = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 30000, // 30 second timeout
      validateStatus: () => true // Don't throw on HTTP errors
    };

    if (data) {
      config.data = data;
    }

    try {
      return await axios(config);
    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        this.log(`Primary URL failed, trying backup: ${BACKUP_URL}`, 'warn');
        this.baseUrl = BACKUP_URL;
        config.url = `${this.baseUrl}${endpoint}`;
        // Disable SSL verification for self-signed cert
        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
        return await axios(config);
      }
      throw error;
    }
  }

  async testHealthCheck() {
    this.log('Testing health check endpoint...');
    try {
      const response = await this.makeRequest('GET', '/api/health');
      
      if (response.status === 200) {
        const data = response.data;
        this.log(`✅ Health check passed - Status: ${data.status}, Version: ${data.version}`, 'success');
        return true;
      } else {
        this.log(`❌ Health check failed - Status: ${response.status}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Health check error: ${error.message}`, 'error');
      return false;
    }
  }

  async testUserRegistration() {
    this.log('Testing user registration...');
    this.log(`Registration data: ${JSON.stringify(this.testUser)}`, 'info');
    try {
      const response = await this.makeRequest('POST', '/api/auth/register', this.testUser);
      
      if (response.status === 201) {
        const data = response.data;
        this.authToken = data.token;
        this.log(`✅ User registration successful - User ID: ${data.user.id}`, 'success');
        this.log(`   Username: ${data.user.username}, Email: ${data.user.email}`, 'info');
        return true;
      } else {
        this.log(`❌ User registration failed - Status: ${response.status}, Error: ${response.data?.error}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ User registration error: ${error.message}`, 'error');
      return false;
    }
  }

  async testUserLogin() {
    this.log('Testing user login...');
    try {
      const loginData = {
        email: this.testUser.email,
        password: this.testUser.password
      };
      
      const response = await this.makeRequest('POST', '/api/auth/login', loginData);
      
      if (response.status === 200) {
        const data = response.data;
        this.authToken = data.token;
        this.log(`✅ User login successful - User ID: ${data.user.id}`, 'success');
        return true;
      } else {
        this.log(`❌ User login failed - Status: ${response.status}, Error: ${response.data?.error}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ User login error: ${error.message}`, 'error');
      return false;
    }
  }

  async testAuthenticatedEndpoint() {
    this.log('Testing authenticated endpoint (/api/auth/me)...');
    try {
      const response = await this.makeRequest('GET', '/api/auth/me', null, {
        'Authorization': `Bearer ${this.authToken}`
      });
      
      if (response.status === 200) {
        const data = response.data;
        this.log(`✅ Authentication check passed - User: ${data.user.username}`, 'success');
        this.log(`   Subjects tracked: ${data.user.subjects?.map(s => s.subject).join(', ') || 'none'}`, 'info');
        return true;
      } else {
        this.log(`❌ Authentication check failed - Status: ${response.status}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Authentication check error: ${error.message}`, 'error');
      return false;
    }
  }

  async createTestAudioFile() {
    // Create a minimal WAV file for testing (1 second of silence)
    const wavHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x24, 0x08, 0x00, 0x00, // File size - 8
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6D, 0x74, 0x20, // "fmt "
      0x10, 0x00, 0x00, 0x00, // Subchunk1Size (16 for PCM)
      0x01, 0x00,             // AudioFormat (1 for PCM)
      0x01, 0x00,             // NumChannels (1 = mono)
      0x44, 0xAC, 0x00, 0x00, // SampleRate (44100)
      0x88, 0x58, 0x01, 0x00, // ByteRate (44100 * 1 * 16/8)
      0x02, 0x00,             // BlockAlign (1 * 16/8)
      0x10, 0x00,             // BitsPerSample (16)
      0x64, 0x61, 0x74, 0x61, // "data"
      0x00, 0x08, 0x00, 0x00  // Subchunk2Size (2048 bytes of data)
    ]);
    
    // Add 2048 bytes of silence (zeros)
    const audioData = Buffer.alloc(2048, 0);
    
    return Buffer.concat([wavHeader, audioData]);
  }

  async testAudioUpload() {
    this.log('Testing audio upload...');
    if (!this.authToken) {
      this.log('❌ Audio upload test skipped - no auth token available', 'error');
      return false;
    }

    try {
      const audioBuffer = await this.createTestAudioFile();
      const form = new FormData();
      form.append('audio', audioBuffer, {
        filename: 'test-audio.wav',
        contentType: 'audio/wav'
      });
      form.append('entryDate', new Date().toISOString());

      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/api/diary/upload`,
        data: form,
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${this.authToken}`
        },
        timeout: 60000, // 60 second timeout for file upload
        validateStatus: () => true
      });

      if (response.status === 201) {
        const data = response.data;
        this.log(`✅ Audio upload successful - Entry ID: ${data.entry.id}`, 'success');
        this.log(`   Transcription Status: ${data.entry.transcriptionStatus}`, 'info');
        this.log(`   Analysis Status: ${data.entry.analysisStatus}`, 'info');
        return { success: true, entryId: data.entry.id };
      } else {
        this.log(`❌ Audio upload failed - Status: ${response.status}, Error: ${response.data?.error}`, 'error');
        return { success: false };
      }
    } catch (error) {
      this.log(`❌ Audio upload error: ${error.message}`, 'error');
      return { success: false };
    }
  }

  async testDiaryEntries() {
    this.log('Testing diary entries retrieval...');
    if (!this.authToken) {
      this.log('❌ Diary entries test skipped - no auth token available', 'error');
      return false;
    }

    try {
      const response = await this.makeRequest('GET', '/api/diary/entries', null, {
        'Authorization': `Bearer ${this.authToken}`
      });

      if (response.status === 200) {
        const data = response.data;
        this.log(`✅ Diary entries retrieved - Count: ${data.entries.length}`, 'success');
        this.log(`   Total entries: ${data.pagination.total}`, 'info');
        return true;
      } else {
        this.log(`❌ Diary entries retrieval failed - Status: ${response.status}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Diary entries error: ${error.message}`, 'error');
      return false;
    }
  }

  async testProcessingStatus() {
    this.log('Testing processing status endpoint...');
    if (!this.authToken) {
      this.log('❌ Processing status test skipped - no auth token available', 'error');
      return false;
    }

    try {
      const response = await this.makeRequest('GET', '/api/diary/processing-status', null, {
        'Authorization': `Bearer ${this.authToken}`
      });

      if (response.status === 200) {
        const data = response.data;
        this.log(`✅ Processing status retrieved - Stats count: ${data.stats.length}`, 'success');
        this.log(`   Recent jobs: ${data.recentJobs.length}`, 'info');
        return true;
      } else {
        this.log(`❌ Processing status failed - Status: ${response.status}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Processing status error: ${error.message}`, 'error');
      return false;
    }
  }

  async runAllTests() {
    this.log('🚀 Starting Health Diary System Integration Tests');
    this.log(`Base URL: ${this.baseUrl}`);
    this.log('='.repeat(60));

    const tests = [
      { name: 'Health Check', fn: () => this.testHealthCheck() },
      { name: 'User Registration', fn: () => this.testUserRegistration() },
      { name: 'User Login', fn: () => this.testUserLogin() },
      { name: 'Authenticated Endpoint', fn: () => this.testAuthenticatedEndpoint() },
      { name: 'Audio Upload', fn: () => this.testAudioUpload() },
      { name: 'Diary Entries', fn: () => this.testDiaryEntries() },
      { name: 'Processing Status', fn: () => this.testProcessingStatus() }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        const result = await test.fn();
        if (result) {
          passed++;
        } else {
          failed++;
        }
      } catch (error) {
        this.log(`❌ Test "${test.name}" threw an error: ${error.message}`, 'error');
        failed++;
      }
      this.log(''); // Empty line for readability
    }

    this.log('='.repeat(60));
    this.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
      this.log('🎉 All tests passed! System is functioning correctly.', 'success');
    } else {
      this.log(`⚠️  ${failed} test(s) failed. Please review the errors above.`, 'warn');
    }

    return { passed, failed, total: tests.length };
  }

  async saveResults(filename = null) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFilename = `test-results-${timestamp}.json`;
    const outputFile = filename || defaultFilename;

    const results = {
      timestamp: new Date().toISOString(),
      baseUrl: this.baseUrl,
      testUser: {
        username: this.testUser.username,
        email: this.testUser.email
      },
      results: this.testResults
    };

    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    this.log(`📄 Test results saved to: ${outputFile}`);
    return outputFile;
  }
}

// Run tests if called directly
if (require.main === module) {
  const tests = new HealthDiarySystemTests();
  
  tests.runAllTests()
    .then(async (summary) => {
      await tests.saveResults();
      process.exit(summary.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = HealthDiarySystemTests;