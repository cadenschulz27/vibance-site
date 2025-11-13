import { calculateAdvancedIncomeScore } from '../public/VibeScore/income/index.js';

const payload = process.argv[2];

if (!payload) {
  console.error('No payload provided');
  process.exit(1);
}

let parsed;
try {
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  parsed = JSON.parse(json);
} catch (error) {
  console.error('Failed to parse payload', error);
  process.exit(1);
}

const result = calculateAdvancedIncomeScore(parsed.data || {}, parsed.options || {});

process.stdout.write(JSON.stringify(result));
