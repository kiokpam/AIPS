@echo off
REM Test runner for AI service (Windows)

echo ==================================
echo AIPS AI Service Test Suite
echo ==================================

REM Parse arguments
set RUN_UNIT=true
set RUN_INTEGRATION=true
set RUN_E2E=true
set COVERAGE=false

:parse_args
if "%1"=="" goto end_parse
if "%1"=="--unit-only" (
    set RUN_INTEGRATION=false
    set RUN_E2E=false
    shift
    goto parse_args
)
if "%1"=="--integration-only" (
    set RUN_UNIT=false
    set RUN_E2E=false
    shift
    goto parse_args
)
if "%1"=="--e2e-only" (
    set RUN_UNIT=false
    set RUN_INTEGRATION=false
    shift
    goto parse_args
)
if "%1"=="--coverage" (
    set COVERAGE=true
    shift
    goto parse_args
)
if "%1"=="--help" (
    echo Usage: run-tests.bat [OPTIONS]
    echo.
    echo Options:
    echo   --unit-only         Run only unit tests
    echo   --integration-only  Run only integration tests
    echo   --e2e-only         Run only e2e tests
    echo   --coverage         Generate coverage report
    echo   --help             Show this help message
    exit /b 0
)
echo Unknown option: %1
exit /b 1

:end_parse

cd /d "%~dp0"

echo.
echo Setting up test environment...

python -c "import pytest" 2>nul
if errorlevel 1 (
    echo Installing test dependencies...
    pip install pytest pytest-cov pytest-mock
)

set COVERAGE_OPTS=
if "%COVERAGE%"=="true" (
    set COVERAGE_OPTS=--cov=. --cov-report=html --cov-report=term-missing
)

set FAILED=0

if "%RUN_UNIT%"=="true" (
    echo.
    echo Running unit tests...
    pytest tests\ -m "unit" -v %COVERAGE_OPTS%
    if errorlevel 1 set FAILED=1
)

if "%RUN_INTEGRATION%"=="true" (
    echo.
    echo Running integration tests...
    pytest tests\ -m "integration" -v %COVERAGE_OPTS%
    if errorlevel 1 set FAILED=1
)

if "%RUN_E2E%"=="true" (
    echo.
    echo Running E2E tests...
    pytest tests\ -m "e2e" -v %COVERAGE_OPTS%
    if errorlevel 1 set FAILED=1
)

echo.
echo ==================================
if "%FAILED%"=="0" (
    echo All tests passed!
    if "%COVERAGE%"=="true" (
        echo Coverage report: htmlcov\index.html
    )
) else (
    echo Some tests failed
)
echo ==================================

exit /b %FAILED%
