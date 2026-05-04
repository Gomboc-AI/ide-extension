import type { Config } from 'jest';

const config: Config = {
  roots: ['<rootDir>/src', '<rootDir>/__mocks__'],
  testEnvironment: 'node',
  testMatch: ['**/src/__integration__/**/*.integration.test.ts'],
  testTimeout: 120_000,
  moduleNameMapper: {
    '^vscode$': '<rootDir>/__mocks__/vscode.js',
  },
  preset: 'ts-jest',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.vscode-test/'],
};

export default config;
