// Jest configuration for the web (Next.js) package.
// Uses next/jest to wire up the SWC transform, CSS/asset mocks, and
// @/ path aliases derived from tsconfig.json automatically.
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  // Default environment for React component tests.
  // API route tests override this per-file with @jest-environment node.
  testEnvironment: 'jsdom',

  // Import @testing-library/jest-dom matchers in every test file.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // Explicit @/ alias — next/jest reads tsconfig.json paths too, but
  // stating it here makes the mapping visible and guarantees it is present.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

// createJestConfig merges Next.js defaults (SWC transforms, CSS/image mocks,
// next/font stubs, …) on top of our config.
module.exports = createJestConfig(config);
