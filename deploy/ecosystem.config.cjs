// pm2 process definition for the backend. The Vultr Inference key is NOT here:
// it is read from /home/deploy/.vkey (chmod 600) by server/src/config.js.
module.exports = {
  apps: [
    {
      name: "archaeologist-api",
      cwd: __dirname + "/../server",
      script: "src/index.js",
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        VKEY_FILE: "/home/deploy/.vkey",
        MODEL_PRIMARY: "glm-5.3",
        MODEL_FALLBACK: "glm-5.3-flash",
        SUPABASE_URL: "https://lyeymsvnsfoofddqqpws.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ONLQzewGE64TLlnCJsM0Yw_-ka5eJgN",
        AUTH_REQUIRED: "true",
        WORK_ROOT: "/tmp/archaeologist-jobs",
      },
    },
  ],
};
