module.exports = {
  apps: [
    {
      name: 'bluecat-store-server',
      cwd: './apps/server',
      script: 'dist/main.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
