@echo off
REM Run all tests for AIPS system

echo ==========================================
echo AIPS Test Suite
echo ==========================================
echo.

REM Backend Tests
echo Running Backend Tests...
cd backend
if exist pyproject.toml (
    pip install -e ".[test]" >nul 2>&1
    pytest -v
    set BACKEND_RESULT=%ERRORLEVEL%
) else (
    echo Backend directory not found or pyproject.toml missing
    set BACKEND_RESULT=1
)
cd ..

echo.

REM Frontend Tests
echo Running Frontend Tests...
cd frontend
if exist package.json (
    if not exist node_modules (
        echo Installing frontend dependencies...
        call npm install
    )
    call npm test -- --passWithNoTests
    set FRONTEND_RESULT=%ERRORLEVEL%
) else (
    echo Frontend directory not found or package.json missing
    set FRONTEND_RESULT=1
)
cd ..

echo.

REM AI Service Tests
echo Running AI Service Tests...
cd ai
if exist tests (
    pip install pytest numpy >nul 2>&1
    pytest tests/ -v
    set AI_RESULT=%ERRORLEVEL%
) else (
    echo AI tests directory not found
    set AI_RESULT=1
)
cd ..

echo.
echo ==========================================
echo Test Summary
echo ==========================================

if %BACKEND_RESULT%==0 (
    echo [OK] Backend Tests: PASSED
) else (
    echo [FAIL] Backend Tests: FAILED
)

if %FRONTEND_RESULT%==0 (
    echo [OK] Frontend Tests: PASSED
) else (
    echo [FAIL] Frontend Tests: FAILED
)

if %AI_RESULT%==0 (
    echo [OK] AI Service Tests: PASSED
) else (
    echo [FAIL] AI Service Tests: FAILED
)

echo ==========================================

REM Exit with error if any tests failed
if %BACKEND_RESULT% neq 0 exit /b 1
if %FRONTEND_RESULT% neq 0 exit /b 1
if %AI_RESULT% neq 0 exit /b 1

exit /b 0
