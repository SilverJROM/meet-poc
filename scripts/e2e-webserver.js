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

const backendPort = process.env.E2E_BACKEND_PORT || '4720';
const frontendPort = process.env.E2E_FRONTEND_PORT || '4711';
const proxyPort = process.env.E2E_PROXY_PORT || '4710';

start('backend', 'npx', ['tsx', 'backend/src/server.ts'], { PORT: backendPort, NODE_ENV: 'development' });
start('angular', 'npm', ['run', 'start', '-w', 'frontend', '--', '--host', '127.0.0.1', '--port', frontendPort, '--proxy-config', 'proxy.conf.json']);
start('proxy', 'node', ['scripts/serve.js'], {
  PORT: proxyPort,
  NODE_ENV: 'development',
  BACKEND_ORIGIN: `http://localhost:${backendPort}`,
  FRONTEND_ORIGIN: `http://localhost:${frontendPort}`,
});
