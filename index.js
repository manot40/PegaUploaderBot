let app;

try {
  app = require("./dist/app");
} catch (err) {
  console.error(err.message);
  console.warn('You may need to execute "npm run build" if this is first run');
  process.exit(0);
}

app.default();
