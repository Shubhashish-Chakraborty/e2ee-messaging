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

<hr/>

# PROD DEPLOYMENT STEPS:

```
wrangler login
```

create the production database:

```
wrangler d1 create e2ee-convoroom-prod
```
When this command finishes, the terminal will spit out a block of text:
```
[[d1_databases]]
binding = "DB"
database_name = "e2ee-convoroom-prod"
database_id = "xxxx-xxxx-xxxx-xxxx"
```

### Open your wrangler.toml file and replace your existing `[[d1_databases]]` block with the new one provided in the terminal.

Initialize the Production Database:
We need to run your schema.sql file against the remote database to create the users and messages tables!

```
wrangler d1 execute e2ee-convoroom-prod --remote --file=schema.sql
```
> the `--remote` flag here. This tells Wrangler to hit the live servers, not your local machine.

### dont forget to upload your secrets(.dev.vars) to prod
```
wrangler secret put PEPPER
.
.
wrangler secret put JWT_SECRET
```

### Deploy the Code!

```
wrangler deploy
```