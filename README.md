```bash
wrangler d1 create e2ee_db_dev
```

then Apply Schema:

Run this locally using: `wrangler d1 execute e2ee_db_dev --local --file=schema.sql`
Run this in prod using: `wrangler d1 execute e2ee_db_dev --remote --file=schema.sql`