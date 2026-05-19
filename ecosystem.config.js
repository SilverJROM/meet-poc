module.exports = {
  apps: [
    {
      name: 'meet-poc',
      script: 'server.js',
      cwd: __dirname,
      env: {
        PORT: 4700,
        NODE_ENV: 'production',
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
