module.exports = {
  apps: [
    {
      name: 'pr_review_api',
      script: 'node dist/app.js',
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        PORT: 4005,
        HOST: '0.0.0.0',
      },
    },
  ],
};
