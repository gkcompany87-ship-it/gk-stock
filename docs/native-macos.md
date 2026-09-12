# Run AS TINO Stock on macOS without Docker

This is a native **local-development** setup, not a production deployment.
Use your existing project and `.env`; do not regenerate your passwords.
The targeted runtime is Node 24 and pnpm 10.28.2.

## Dependency repair

The patch changes `pnpm-workspace.yaml`: `@nestjs/config` becomes exactly `12.0.0`.
It also changes root `package.json`: `typescript-eslint` becomes exactly `8.70.0`.
The former has Nest 11/12 peer support; the latter supports ESLint 10 and TypeScript 5.9.
Keep strict peer checking. No lockfile is fabricated or deleted by this patch.

```sh
cd "$HOME/Desktop/as-tino-stock"
pnpm install --no-frozen-lockfile
```

Stop if this fails and retain the error. Do not use `--force`, install random latest
majors, or disable strict peer checking. Once installation has succeeded and produced
a reviewed `pnpm-lock.yaml`, subsequent installs use `pnpm install --frozen-lockfile`.
An unavailable package version is unrelated to Docker.

## Install and start native services

Install Homebrew from its official instructions if `brew --version` is unavailable.
The installer prints the required shell setup for Apple Silicon or Intel.

```sh
brew install postgresql@18 redis mailpit
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
brew services start postgresql@18
brew services start redis
pg_isready -h 127.0.0.1 -p 5432
redis-cli -h 127.0.0.1 ping
```

PostgreSQL should report accepting connections; Redis should return PONG. Do not start
a second PostgreSQL/Redis service on a port already occupied by Docker, Postgres.app,
or another installation. The helper accepts PostgreSQL 17 too, when already configured.
Do not replace or upgrade an existing data directory to change major versions.

## Configure this project

If `.env` does not yet exist, first run `pnpm setup:env`. Otherwise keep it.

```sh
pnpm setup:native
pnpm db:native
pnpm exec playwright install chromium
node scripts/configure-chromium.mjs
pnpm db:validate && pnpm db:generate && pnpm db:deploy
```

`setup:native` backs up `.env` to a private `.env.before-native-*` file, enables local
storage, uses local SMTP, and moves the separate test database connection onto the native
PostgreSQL port. It preserves database, login, session, and S3 secrets. It refuses production,
remote databases and inconsistent credentials. Existing real SMTP credentials are cleared
from the active development configuration (preserved in the backup) to prevent test mail
from going through a real provider.

`db:native` connects to localhost as your macOS user (the usual Homebrew administrator),
creates the application login and the development/test databases only when missing, and
verifies connections using your existing `.env` password. It never drops databases,
changes their existing owner, or resets an existing role password. A database with a different
owner or an existing role with a different password is an error, not silently overwritten.

For a custom local PostgreSQL installation set `NATIVE_PG_ADMIN`, and provide its password
privately in `NATIVE_PG_ADMIN_PASSWORD` if required. Do not put passwords in commands shared
in chat. The database owner used here is for local development; follow the non-owner API
role instructions for production. `migrate dev` may need a separately configured shadow
database; the initial setup uses `migrate deploy`, which does not need one.

## Start the email catcher (Terminal 1)

```sh
cd "$HOME/Desktop/as-tino-stock"
pnpm mail:native
```

Keep this terminal open. Mailpit is bound only to `127.0.0.1` on SMTP port 1025 and web
port 8025; inherited Mailpit relay settings are removed. Test messages are retained locally
in `.local/mailpit.sqlite`. This does not send genuine client email.

## Seed and start the application (Terminal 2)

```sh
cd "$HOME/Desktop/as-tino-stock"
pnpm db:seed
pnpm demo:credentials
pnpm dev
```

Open `http://localhost:3000/connexion` in your browser. Log in with the generated Admin
or Worker credentials printed by `demo:credentials`. Do not post those passwords in chat.
The local test-email inbox is `http://localhost:8025`.

PDFs and uploaded images are private files under `.local/uploads/<bucket>`. Their filenames
are hashed keys; the existing API still handles authorization, file metadata and checksums.
The local adapter publishes files atomically without overwriting issued originals. Do not
place this directory in `public/` or expose it through a static file server. Back up both
the database and these bytes to retain local test data. No MinIO service or S3 account is
needed in this mode.

Switching an existing populated Docker/S3 installation to local storage is **not** a data
migration: references would remain in PostgreSQL but their original files stay in S3. Use
fresh demonstration data here, or explicitly migrate both metadata and file bytes.

## Stop and restart

Press Control-C in both terminals. To stop background services, provided other projects
are not using them:

```sh
brew services stop postgresql@18
brew services stop redis
```

Restart the two Homebrew services and the two terminal commands `pnpm mail:native` /
`pnpm dev` next time. Do not rerun setup, migrations or seed for an ordinary restart.
Homebrew's `services start` also registers startup at login. No data is deleted by stop.

## Validation

```sh
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
pnpm doctor:native
pnpm test:native
pnpm build && pnpm lint && pnpm typecheck && pnpm test:unit
pnpm test:integration
pnpm test:e2e:prepare && pnpm test:e2e
```

The existing test runner keeps tests on the separate `_test` database, separate Redis
index and `.local/uploads-test` directory. Under `STORAGE_DRIVER=local`, those tests check
the local adapter, **not real S3 compatibility**. Production acceptance still needs the
S3 variant and the entire existing release gate. Camera scanning needs a secure browser
context; first test manual input on localhost.

## Reference versions and native commands

Verified upstream documentation for this patch:
- https://github.com/nestjs/config/releases/tag/12.0.0
- https://raw.githubusercontent.com/typescript-eslint/typescript-eslint/v8.70.0/packages/typescript-eslint/package.json
- https://pnpm.io/10.x/cli/install
- https://formulae.brew.sh/formula/postgresql@18
- https://formulae.brew.sh/formula/redis
- https://formulae.brew.sh/formula/mailpit
- https://mailpit.axllent.org/docs/configuration/runtime-options/
- https://brew.sh/

See `docs/native-patch-qa.md` for what was actually tested versus blocked.
