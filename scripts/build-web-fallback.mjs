import {copyFile} from 'node:fs/promises';
// Vercel serves this with HTTP 404 for unmatched routes; shared React chrome remains accessible.
await copyFile('dist/client/index.html', 'dist/client/404.html');
