// Jest configuration for the shared package.
// Uses ts-jest to transform TypeScript in CommonJS mode, which avoids ESM
// interop friction caused by the package's "type": "module" declaration.
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Override module format so ts-jest emits CommonJS that Jest can load,
        // regardless of the "module": "ESNext" setting in tsconfig.base.json.
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
        },
      },
    ],
  },
  testMatch: [
    '**/__tests__/**/*.ts?(x)',
    '**/?(*.)+(spec|test).ts?(x)',
  ],
};
