#!/bin/bash
# Run all tests for AIPS system
# Note: Make sure virtual environment is activated and dependencies are installed
# See SETUP_TESTING.md for setup instructions

# Don't exit on error - we want to run all tests and report results

echo "=========================================="
echo "AIPS Test Suite"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Backend Tests
echo -e "${BLUE}Running Backend Tests...${NC}"
cd backend
if [ -f "pyproject.toml" ]; then
    # Check if pytest is available
    if ! command -v pytest &> /dev/null; then
        echo -e "${RED}pytest not found. Installing test dependencies...${NC}"
        echo "Run: cd backend && pip install -e '.[test]'"
        pip install -e ".[test]" 2>&1 || {
            echo -e "${RED}Failed to install test dependencies.${NC}"
            echo -e "${RED}Please run: cd backend && pip install -e '.[test]'${NC}"
            echo -e "${RED}Or activate your virtual environment first.${NC}"
            BACKEND_RESULT=1
            cd ..
            continue
        }
    fi
    
    # Run tests
    pytest -v
    BACKEND_RESULT=$?
else
    echo -e "${RED}Backend directory not found or pyproject.toml missing${NC}"
    BACKEND_RESULT=1
fi
cd ..

echo ""

# Frontend Tests
echo -e "${BLUE}Running Frontend Tests...${NC}"
cd frontend
if [ -f "package.json" ]; then
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        echo "Installing frontend dependencies..."
        npm install
    fi
    npm test -- --passWithNoTests
    FRONTEND_RESULT=$?
else
    echo -e "${RED}Frontend directory not found or package.json missing${NC}"
    FRONTEND_RESULT=1
fi
cd ..

echo ""

# AI Service Tests
echo -e "${BLUE}Running AI Service Tests...${NC}"
cd ai
if [ -d "tests" ]; then
    # Check if pytest is available
    if ! command -v pytest &> /dev/null; then
        echo -e "${RED}pytest not found. Installing pytest and numpy...${NC}"
        pip install pytest numpy 2>&1 || {
            echo -e "${RED}Failed to install pytest.${NC}"
            echo -e "${RED}Please run: pip install pytest numpy${NC}"
            echo -e "${RED}Or activate your virtual environment first.${NC}"
            AI_RESULT=1
            cd ..
            continue
        }
    fi
    pytest tests/ -v
    AI_RESULT=$?
else
    echo -e "${RED}AI tests directory not found${NC}"
    AI_RESULT=1
fi
cd ..

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="

if [ $BACKEND_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ Backend Tests: PASSED${NC}"
else
    echo -e "${RED}✗ Backend Tests: FAILED${NC}"
fi

if [ $FRONTEND_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ Frontend Tests: PASSED${NC}"
else
    echo -e "${RED}✗ Frontend Tests: FAILED${NC}"
fi

if [ $AI_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ AI Service Tests: PASSED${NC}"
else
    echo -e "${RED}✗ AI Service Tests: FAILED${NC}"
fi

echo "=========================================="

# Exit with error if any tests failed
if [ $BACKEND_RESULT -ne 0 ] || [ $FRONTEND_RESULT -ne 0 ] || [ $AI_RESULT -ne 0 ]; then
    exit 1
fi

exit 0
