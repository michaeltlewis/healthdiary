#!/bin/bash

set -e

echo "Health Diary System Integration Tests"
echo "===================================="
echo ""

# Change to tests directory
cd "$(dirname "$0")/tests"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing test dependencies..."
    npm install
    echo ""
fi

# Default to production URL unless specified
if [ -z "$TEST_BASE_URL" ]; then
    export TEST_BASE_URL="https://healthdiary-app.duckdns.org"
fi

echo "🎯 Target URL: $TEST_BASE_URL"
echo ""

# Run the tests
echo "🚀 Starting integration tests..."
node system-integration-tests.js

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All tests completed successfully!"
    echo "The Health Diary system is functioning correctly."
else
    echo ""
    echo "❌ Some tests failed!"
    echo "Please review the output above for details."
    exit 1
fi