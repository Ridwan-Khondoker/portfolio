// Tests always run against the dedicated test database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres@localhost:5433/finance_test?host=/tmp';
process.env.SESSION_SECRET ??= 'test-only-secret-0123456789abcdef0123456789abcdef';
process.env.APP_URL ??= 'http://localhost:3999';
