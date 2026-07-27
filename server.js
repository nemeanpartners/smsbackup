import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 8080;
const distDir = path.join(__dirname, 'dist');

app.use(
  express.static(distDir, {
    index: false,
    maxAge: '1h',
  })
);

app.get('*', (_request, response) => {
  response.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Message Backup web dashboard listening on ${port}`);
});
