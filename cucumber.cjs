const fs = require('node:fs');
fs.mkdirSync('artifacts', { recursive: true });
module.exports = {
  default: {
    paths: ['features/**/*.feature'],
    import: ['features/steps/**/*.js'],
    format: ['progress', 'junit:artifacts/bdd.xml']
  }
};
