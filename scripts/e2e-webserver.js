#!/usr/bin/env node
const { spawn } = require('node:child_process');

const children = [];

function start(name, command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (signal || code === 0) return;
    console.error(`[e2e-webserver] ${name} exited with code ${code}`);
    shutdown(code || 1);
  });
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 250);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start('backend', 'npx', ['tsx', 'backend/src/server.ts'], { PORT: '4720', NODE_ENV: 'development' });
start('angular', 'npm', ['run', 'start', '-w', 'frontend', '--', '--host', '127.0.0.1', '--port', '4711', '--proxy-config', 'proxy.conf.json']);
start('proxy', 'node', ['scripts/serve.js'], {
  PORT: '4710',
  NODE_ENV: 'development',
  BACKEND_ORIGIN: 'http://localhost:4720',
  FRONTEND_ORIGIN: 'http://localhost:4711',
});
