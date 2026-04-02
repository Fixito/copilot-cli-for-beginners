---
name: node-test-gen
description: Generate comprehensive Node.js tests with fixtures and edge cases
---

# Node.js Test Generation

Generate Node.js tests that include:

## Test Structure

- Use Node.js Test conventions (describe/test or it blocks)
- One assertion per test when possible
- Clear test names describing expected behavior
- Use fixtures for setup/teardown

## Coverage

- Happy path scenarios
- Edge cases: None, empty strings, empty lists
- Boundary values
- Error scenarios with assert.throws()

## Fixtures

- Use reusable test data via setup/teardown functions
- Use tmpdir/tmp_path for file operations
- Mock external dependencies with node:test's mock functionality

## Output

Provide complete, runnable test file with proper imports.
