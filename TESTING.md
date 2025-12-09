# Testing Guide

This document describes the testing strategy and how to run tests for the AIPS system.

## Test Structure

The project uses a multi-layered testing approach:

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test interactions between components
- **End-to-End Tests**: Test complete workflows

## Backend Tests

### Setup

Backend tests use `pytest` with async support. Install test dependencies:

```bash
cd backend
pip install -e ".[test]"
```

### Running Tests

```bash
# Run all tests
pytest

# Run only unit tests
pytest -m unit

# Run only integration tests
pytest -m integration

# Run only e2e tests
pytest -m e2e

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/unit/test_auth_service.py

# Run specific test
pytest tests/unit/test_auth_service.py::TestPasswordHashing::test_hash_password
```

### Test Structure

```
backend/tests/
├── conftest.py              # Shared fixtures
├── unit/                    # Unit tests
│   ├── test_auth_service.py
│   └── test_camera_manager.py
├── integration/             # Integration tests
│   ├── test_auth_api.py
│   ├── test_cameras_api.py
│   ├── test_events_api.py
│   └── test_websocket.py
└── e2e/                     # End-to-end tests
    ├── test_camera_workflow.py
    └── test_alert_workflow.py
```

### Test Fixtures

Common fixtures available in `conftest.py`:

- `db`: Database session (fresh for each test)
- `client`: FastAPI test client
- `test_user`: Test user instance
- `test_organization`: Test organization
- `test_manager_membership`: Manager membership
- `test_member_membership`: Member membership
- `test_store`: Test store
- `auth_token`: Authentication token
- `auth_headers`: Authorization headers

## AI Service Tests

### Setup

```bash
cd ai
pip install pytest numpy
```

### Running Tests

```bash
# Run all AI tests
pytest tests/

# Run specific test
pytest tests/test_yolo_detector.py
```

### Test Structure

```
ai/tests/
├── conftest.py              # Shared fixtures
├── test_yolo_detector.py
├── test_deepsort_tracker.py
├── test_mobilenet.py
└── test_inout_counter.py
```

## Frontend Tests

### Setup

Frontend tests use Jest with React Testing Library. Install dependencies:

```bash
cd frontend
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Test Structure

```
frontend/
├── jest.config.js           # Jest configuration
├── jest.setup.js           # Test setup
└── __tests__/              # Test files
    ├── utils/
    │   └── format.test.ts
    └── lib/
        └── api.test.ts
```

## Test Coverage Goals

- **Unit Tests**: >80% coverage for core services
- **Integration Tests**: Cover all API endpoints
- **E2E Tests**: Cover critical user workflows

## Writing New Tests

### Backend Unit Test Example

```python
@pytest.mark.unit
class TestMyService:
    def test_my_function(self):
        result = my_function(input)
        assert result == expected_output
```

### Backend Integration Test Example

```python
@pytest.mark.integration
def test_api_endpoint(client, auth_headers):
    response = client.get("/api/endpoint", headers=auth_headers)
    assert response.status_code == 200
```

### Frontend Test Example

```typescript
describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Expected Text')).toBeInTheDocument()
  })
})
```

## Continuous Integration

Tests should be run automatically in CI/CD pipelines:

1. Run unit tests
2. Run integration tests
3. Run linting
4. Generate coverage reports
5. Fail build if coverage drops below threshold

## Test Data

- Tests use in-memory SQLite database (backend)
- Tests use mocked dependencies where appropriate
- No real external services are called during tests

## Best Practices

1. **Isolation**: Each test should be independent
2. **Naming**: Use descriptive test names
3. **Arrange-Act-Assert**: Structure tests clearly
4. **Fixtures**: Reuse common setup via fixtures
5. **Mocking**: Mock external dependencies
6. **Coverage**: Aim for high coverage but focus on critical paths

## Troubleshooting

### Backend Tests

- **Database errors**: Ensure test database is properly isolated
- **Import errors**: Check PYTHONPATH includes backend directory
- **Async errors**: Ensure `pytest-asyncio` is installed

### Frontend Tests

- **Module not found**: Check `jest.config.js` moduleNameMapper
- **DOM errors**: Ensure `jest-environment-jsdom` is configured
- **Next.js errors**: Check `jest.setup.js` for Next.js mocks
