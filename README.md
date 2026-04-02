```bash
wrangler d1 create e2ee_db_dev
```

then Apply Schema:

Run this locally using: `wrangler d1 execute e2ee_db_dev --local --file=schema.sql`
Run this in prod using: `wrangler d1 execute e2ee_db_dev --remote --file=schema.sql`


# To perform migration

## Option 1: The "Clean Slate" (Recommended for Local Dev)

### 1. Drop the existing tables
```
wrangler d1 execute e2ee_db_dev --local --command "DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS messages;"
```

### 2. Re-run your schema file
```
wrangler d1 execute e2ee_db_dev --local --file=schema.sql
```

## Option 2: The Migration (Keep your data)

```
wrangler d1 execute e2ee_db_dev --local --command "ALTER TABLE users ADD COLUMN githubUrl TEXT UNIQUE;"
```