const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data.json');
const PASSWORD_FILE = path.join(__dirname, 'INITIAL_PASSWORD.txt');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { users: [], rooms: {}, sessions: {} };
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(d) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function generatePassword() {
  // 18 chars: a-z A-Z 0-9 (no ambiguous chars)
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(18);
  let out = '';
  for (let i = 0; i < 18; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

const email = process.argv[2] || 'jrom@silverjrom.app';
const forcedPassword = process.argv[3] || null;

const data = loadData();
const existing = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());

const password = forcedPassword || generatePassword();
const passwordHash = hashPassword(password);

if (existing) {
  existing.passwordHash = passwordHash;
  existing.updatedAt = Date.now();
  console.log(`Updated password for existing user: ${email}`);
} else {
  data.users.push({
    email,
    passwordHash,
    createdAt: Date.now(),
  });
  console.log(`Created new user: ${email}`);
}

saveData(data);
fs.writeFileSync(PASSWORD_FILE, `${email}\n${password}\n`, { mode: 0o600 });

console.log('---');
console.log(`Email:    ${email}`);
console.log(`Password: ${password}`);
console.log('---');
console.log(`Password also written to: ${PASSWORD_FILE}`);
