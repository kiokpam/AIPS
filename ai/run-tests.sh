#!/bin/bash
# Test runner for AI service (Linux/Mac)

set -e

echo "=================================="
echo "AIPS AI Service Test Suite"
echo "=================================="

RUN_UNIT=true
RUN_INTEGRATION=true
RUN_E2E=true
COVERAGE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --unit-only)
            RUN_INTEGRATION=false
            RUN_E2E=false
            shift
            ;;
        --integration-only)
            RUN_UNIT=false
            RUN_E2E=false
            shift
            ;;
        --e2e-only)
            RUN_UNIT=false
            RUN_INTEGRATION=false
            shift
            ;;
        --coverage)
            COVERAGE=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --unit-only         Run only unit tests"
            echo "  --integration-only  Run only integration tests"
            echo "  --e2e-only         Run only e2e tests"
            echo "  --coverage         Generate coverage report"
            echo "  --help             Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

cd "$(dirname "$0")"

echo ""
echo "Setting up test environment..."

if ! python -c "import pytest" 2>/dev/null; then
    echo "Installing test dependencies..."
    pip install pytest pytest-cov pytest-mock
fi

COVERAGE_OPTS=""
if [ "$COVERAGE" = true ]; then
    COVERAGE_OPTS="--cov=. --cov-report=html --cov-report=term-missing"
fi

FAILED=0

if [ "$RUN_UNIT" = true ]; then
    echo ""
    echo "Running unit tests..."
    pytest tests/ -m "unit" -v $COVERAGE_OPTS || FAILED=1
fi

if [ "$RUN_INTEGRATION" = true ]; then
    echo ""
    echo "Running integration tests..."
    pytest tests/ -m "integration" -v $COVERAGE_OPTS || FAILED=1
fi

if [ "$RUN_E2E" = true ]; then
    echo ""
    echo "Running E2E tests..."
    pytest tests/ -m "e2e" -v $COVERAGE_OPTS || FAILED=1
fi

echo ""
echo "=================================="
if [ $FAILED -eq 0 ]; then
    echo "All tests passed!"
    if [ "$COVERAGE" = true ]; then
        echo "Coverage report: htmlcov/index.html"
    fi
else
    echo "Some tests failed"
fi
echo "=================================="

exit $FAILED
