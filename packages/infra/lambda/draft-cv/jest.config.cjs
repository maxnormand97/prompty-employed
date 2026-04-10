/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          esModuleInterop: true,
          moduleResolution: "node",
        },
      },
    ],
  },
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
};
