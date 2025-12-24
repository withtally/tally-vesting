import { createApp } from './app';

const app = createApp();
const port = parseInt(process.env.PORT || '3000', 10);

console.log(`Starting Merkle Tree Server on port ${port}...`);

export default {
  port,
  fetch: app.fetch,
};
