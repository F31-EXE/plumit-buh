import { openDb } from './db.js';
import { ensureAdmin } from './auth.js';
import { createApp } from './app.js';

const db = openDb();
ensureAdmin(db);
const port = Number(process.env.PORT || 3000);
createApp(db).listen(port, () => console.log(`Plumit · Бухгалтерия: http://localhost:${port}`));
