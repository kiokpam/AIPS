#!/bin/bash
# Setup script for AIPS testing environment

set -e

echo "=========================================="
echo "AIPS Testing Environment Setup"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python 3 is not installed. Please install Python 3.10 or higher.${NC}"
    exit 1
fi

# Check if venv module is available
if ! python3 -m venv --help &> /dev/null; then
    echo -e "${RED}python3-venv package is not installed.${NC}"
    echo ""
    echo "On Debian/Ubuntu systems, install it with:"
    echo "  sudo apt install python3.10-venv"
    echo ""
    echo "Or for other Python versions:"
    echo "  sudo apt install python3-venv"
    echo ""
    echo "After installing, run this script again."
    exit 1
fi

# Check if venv exists and is valid
if [ -d "venv" ]; then
    # Check if it's a valid virtual environment
    if [ ! -f "venv/bin/activate" ] && [ ! -f "venv/Scripts/activate" ]; then
        echo -e "${YELLOW}Invalid virtual environment detected. Removing and recreating...${NC}"
        rm -rf venv
        CREATE_VENV=true
    else
        echo -e "${YELLOW}Virtual environment already exists.${NC}"
        CREATE_VENV=false
    fi
else
    CREATE_VENV=true
fi

# Create virtual environment if needed
if [ "$CREATE_VENV" = true ]; then
    echo -e "${BLUE}Creating virtual environment...${NC}"
    python3 -m venv venv || {
        echo -e "${RED}Failed to create virtual environment.${NC}"
        echo ""
        echo "If you see 'ensurepip is not available', install python3-venv:"
        echo "  sudo apt install python3.10-venv"
        echo ""
        exit 1
    }
    echo -e "${GREEN}Virtual environment created.${NC}"
fi

# Activate virtual environment
echo -e "${BLUE}Activating virtual environment...${NC}"
source venv/bin/activate

# Upgrade pip
echo -e "${BLUE}Upgrading pip...${NC}"
pip install --upgrade pip > /dev/null 2>&1

# Install backend test dependencies
echo -e "${BLUE}Installing backend test dependencies...${NC}"
cd backend
pip install -e ".[test]" || {
    echo -e "${RED}Failed to install backend test dependencies.${NC}"
    exit 1
}
cd ..
echo -e "${GREEN}Backend test dependencies installed.${NC}"

# Install AI test dependencies
echo -e "${BLUE}Installing AI service test dependencies...${NC}"
cd ai
# Install onnxruntime (CPU version for tests - smaller and faster than GPU version)
pip install pytest numpy onnxruntime opencv-python || {
    echo -e "${RED}Failed to install AI test dependencies.${NC}"
    echo -e "${YELLOW}Note: onnxruntime is required for AI tests.${NC}"
    exit 1
}
cd ..
echo -e "${GREEN}AI service test dependencies installed.${NC}"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js is not installed. Skipping frontend setup.${NC}"
    echo -e "${YELLOW}Install Node.js to run frontend tests.${NC}"
else
    # Install frontend dependencies
    echo -e "${BLUE}Installing frontend dependencies...${NC}"
    cd frontend
    if [ ! -d "node_modules" ]; then
        npm install || {
            echo -e "${RED}Failed to install frontend dependencies.${NC}"
            exit 1
        }
    else
        echo -e "${YELLOW}Frontend dependencies already installed.${NC}"
        # Still run npm install to ensure jest is available
        npm install || {
            echo -e "${YELLOW}Warning: npm install had issues, but continuing...${NC}"
        }
    fi
    cd ..
    echo -e "${GREEN}Frontend dependencies installed.${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "To activate the virtual environment:"
echo "  source venv/bin/activate"
echo ""
echo "To run all tests:"
echo "  ./run-all-tests.sh"
echo ""
echo "To deactivate virtual environment:"
echo "  deactivate"
