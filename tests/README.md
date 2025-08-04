# Health Diary Integration Tests

This directory contains system integration tests to verify the deployed Health Diary application is functioning correctly.

## Overview

These tests verify:
- ✅ System health and availability
- ✅ User registration functionality  
- ✅ User authentication (login/logout)
- ✅ Authenticated API endpoints
- ✅ Audio file upload and processing  
- ✅ Diary entry management
- ✅ Background processing status

## Quick Start

### Install Dependencies
```bash
cd tests/
npm install
```

### Run Tests Against Production
```bash
# Test the live system at healthdiary-app.duckdns.org
npm test

# Or run directly
node system-integration-tests.js
```

### Run Tests Against Backup URL
```bash
# Test the backup IP address (self-signed certificate)
npm run test-backup
```

### Run Tests Against Local Development
```bash
# Test a local development server
npm run test-local
```

## Test Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_BASE_URL` | `https://healthdiary-app.duckdns.org` | Primary URL to test |
| `TEST_BACKUP_URL` | `https://18.130.249.186` | Backup URL if primary fails |

### Example Usage
```bash
# Test specific URL
TEST_BASE_URL=https://your-domain.com node system-integration-tests.js

# Test with custom backup
TEST_BACKUP_URL=https://backup-server.com npm test
```

## Test Features

### Automatic Failover
- Tests primary URL first (trusted SSL certificate)
- Automatically switches to backup URL if primary fails
- Handles self-signed certificates on backup servers

### Comprehensive Testing
- **Health Check**: Verifies server is responding
- **User Registration**: Creates test user account
- **Authentication**: Tests login and JWT token handling
- **API Security**: Verifies protected endpoints require authentication
- **File Upload**: Tests audio file upload with realistic WAV file
- **Data Retrieval**: Verifies diary entries and processing status

### Test Data Management
- Creates unique test users for each test run
- Uses timestamp-based usernames/emails to avoid conflicts
- Generates minimal valid WAV files for upload testing
- Cleans up by not persisting sensitive test data

## Output and Results

### Console Output
Tests provide real-time feedback with colored output:
- ✅ Green checkmarks for passed tests
- ❌ Red X marks for failed tests  
- ℹ️ Blue info messages for details
- ⚠️ Yellow warnings for non-critical issues

### Test Results File
Results are automatically saved to timestamped JSON files:
```
test-results-2024-01-01T12-00-00-000Z.json
```

Contains:
- Test execution timestamp
- Target URL tested
- Test user details (non-sensitive)
- Complete log of all test steps and results

## Expected Results

### Successful Test Run
```
🚀 Starting Health Diary System Integration Tests
Base URL: https://healthdiary-app.duckdns.org
============================================================

[2024-01-01T12:00:00.000Z] INFO: Testing health check endpoint...
[2024-01-01T12:00:01.000Z] SUCCESS: ✅ Health check passed - Status: healthy, Version: 1.0.0

[2024-01-01T12:00:01.000Z] INFO: Testing user registration...
[2024-01-01T12:00:02.000Z] SUCCESS: ✅ User registration successful - User ID: abc123...

[2024-01-01T12:00:02.000Z] INFO: Testing user login...
[2024-01-01T12:00:03.000Z] SUCCESS: ✅ User login successful - User ID: abc123...

[2024-01-01T12:00:03.000Z] INFO: Testing authenticated endpoint (/api/auth/me)...
[2024-01-01T12:00:04.000Z] SUCCESS: ✅ Authentication check passed - User: testuser_1234567890

[2024-01-01T12:00:04.000Z] INFO: Testing audio upload...
[2024-01-01T12:00:06.000Z] SUCCESS: ✅ Audio upload successful - Entry ID: def456...

[2024-01-01T12:00:06.000Z] INFO: Testing diary entries retrieval...
[2024-01-01T12:00:07.000Z] SUCCESS: ✅ Diary entries retrieved - Count: 1

[2024-01-01T12:00:07.000Z] INFO: Testing processing status endpoint...
[2024-01-01T12:00:08.000Z] SUCCESS: ✅ Processing status retrieved - Stats count: 1

============================================================
📊 Test Results: 7 passed, 0 failed
🎉 All tests passed! System is functioning correctly.
```

## Troubleshooting

### SSL Certificate Issues
If testing fails with SSL errors:
```bash
# Use backup URL with self-signed certificate handling
npm run test-backup
```

### Network Connectivity
If tests fail to connect:
1. Verify the server is running: `curl https://healthdiary-app.duckdns.org/api/health`
2. Check DNS resolution: `nslookup healthdiary-app.duckdns.org`
3. Test with IP address: `TEST_BASE_URL=https://18.130.249.186 npm test`

### Rate Limiting
If tests fail with 429 errors:
- Wait a few minutes for rate limits to reset
- The application has a 15-minute rate limit window

### API Key Issues
Some functionality (transcription/analysis) requires valid API keys:
- These tests focus on core functionality that doesn't require external APIs
- Background processing may show as "pending" without proper API key configuration

## Integration with CI/CD

### GitHub Actions Example
```yaml
- name: Run Integration Tests
  run: |
    cd tests/
    npm install
    npm test
  env:
    TEST_BASE_URL: ${{ secrets.PRODUCTION_URL }}
```

### Health Check Monitoring
Use this test suite for automated health monitoring:
```bash
# Run tests every 5 minutes
*/5 * * * * cd /path/to/tests && npm test >> /var/log/healthdiary-tests.log 2>&1
```

The tests provide a comprehensive verification that the Health Diary system is deployed correctly and all core user workflows are functional.