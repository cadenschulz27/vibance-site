module.exports = {
  testEnvironment: 'node',
  roots: [
    '<rootDir>/netlify/functions/__tests__',
    '<rootDir>/public/Net/__tests__',
  ],
  collectCoverageFrom: [
    'netlify/functions/**/*.js',
    'public/Net/**/*.js',
    '!netlify/functions/__tests__/**',
    '!public/Net/__tests__/**',
  ],
};
