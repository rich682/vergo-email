# Test Suite

## Running Tests

```bash
# Run all tests
npm test

# Run API tests only
npm run test:api

# Run UI tests only
npm run test:ui

# Watch mode
npm run test:watch
```

## Test Setup

Tests use Vitest with:
- Node environment for API tests
- jsdom for UI tests (if needed)
- Test database via `TEST_DATABASE_URL` (falls back to `DATABASE_URL`)

## Test Structure

- `tests/api/` - API endpoint tests
- `tests/ui/` - UI component tests
- `tests/setup.ts` - Global test setup/teardown

## Requirements

- `TEST_DATABASE_URL` or `DATABASE_URL` environment variable
- Test database should be separate from development database



