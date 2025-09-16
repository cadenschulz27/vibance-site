module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/netlify/functions/__tests__'],
  collectCoverageFrom: [
    'netlify/functions/**/*.js',
    '!netlify/functions/__tests__/**',
  ],
};
