// Jest Configuration File
// Jest is a testing framework that lets us write automated tests to verify our code works correctly
// Think of it like a robot that runs through scenarios to make sure everything works as expected

module.exports = {
  // Tell Jest to use ts-jest to handle TypeScript files
  // TypeScript is like JavaScript with extra safety features (type checking)
  preset: 'ts-jest',
  
  // We're running tests in Node.js (server environment), not in a browser
  testEnvironment: 'node',
  
  // Where to find our test files
  // Any file ending in .test.ts or .spec.ts will be recognized as a test
  testMatch: [
    '**/__tests__/**/*.ts',  // Tests in a __tests__ folder
    '**/*.test.ts',          // Files ending with .test.ts
    '**/*.spec.ts'           // Files ending with .spec.ts
  ],
  
  // Don't look for tests in these folders
  testPathIgnorePatterns: [
    '/node_modules/',  // External packages we installed
    '/dist/'           // Compiled output folder
  ],
  
  // How much of our code is tested (shown as percentages)
  // This helps us know if we're testing enough of our code
  collectCoverageFrom: [
    '**/*.ts',              // Check all TypeScript files
    '!**/*.test.ts',        // But don't check test files themselves
    '!**/*.spec.ts',        // Or spec files
    '!**/node_modules/**',  // Or external packages
    '!**/dist/**'           // Or compiled output
  ]
};

