export * from './net-logic.mjs';
export { default } from './net-logic.mjs';

if (typeof module !== 'undefined') {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  module.exports = require('./net-logic.mjs');
}
