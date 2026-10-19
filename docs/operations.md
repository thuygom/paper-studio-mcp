# Hosting and operations

## Configuration

Copy `.env.example` to `.env`. Docker Compose reads it automatically; native npm scripts use Node's env-file support.

| Variable | Default | Meaning |
| --- | --- | --- |
| `OWNER_EMAIL` | `owner@example.com` | Login identifier, only used when creating the account |
| `PORT` | `17882` | Host port; the Compose app always uses 17882 internally |
| `PUBLIC_URL` | empty | External origin, e.g. `https://tex.example.org`, without a path |
| `TRUST_PROXY` | `loopback` | Express trusted proxy addresses; never blindly trust every sender |
| `PRIVATE_DIR` | `private` natively, `/data` in Compose | Credentials and persistent data; Compose fixes it to `/data` |
| `HOST` | `127.0.0.1` natively, `0.0.0.0` inside Compose | Application bind address |
| `TEX_IMAGE` | `paper-studio-mcp-tex:local` | Compiler image; Compose sets the bundled image |

Changing `.env` requires `docker compose up -d` to recreate the app. Password/token reset commands require `docker compose restart app`. Every restart invalidates browser sessions.

```sh
docker compose logs --tail 100 app
docker compose ps
docker compose exec app node scripts/account.mjs --reset-password
docker compose exec app node scripts/account.mjs --reset-token
docker compose restart app
```

Each reset prints the new private account configuration. Changing `OWNER_EMAIL` after setup does not modify the existing account; to change it, stop the app and edit `access.json` inside the data volume or your native `PRIVATE_DIR`, then start again. Preserve its restrictive permissions and valid JSON.

## HTTPS and Cloudflare Tunnel

Keep the app bound to localhost and terminate HTTPS at your reverse proxy or tunnel. Set `PUBLIC_URL=https://tex.example.org` so cookies are Secure and the MCP dialog advertises the correct URL. Access the app at that HTTPS origin afterwards; Secure cookies will not work through a plain HTTP origin.

For `cloudflared` running on the host, create a named tunnel using [Cloudflare's instructions](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/). After login and tunnel creation, a minimal local configuration is:

```yaml
tunnel: YOUR_TUNNEL_UUID
credentials-file: /absolute/private/path/YOUR_TUNNEL_UUID.json
ingress:
  - hostname: tex.example.org
    service: http://127.0.0.1:17882
  - service: http_status:404
```

Route your hostname to the tunnel and run it:

```sh
cloudflared tunnel route dns YOUR_TUNNEL_UUID tex.example.org
cloudflared tunnel --config /absolute/private/path/config.yml run YOUR_TUNNEL_UUID
```

Use your own hostname and credentials, stored outside this checkout. Install the tunnel as a service following Cloudflare's platform-specific documentation. This repository does not alter DNS or create a Cloudflare account. If Cloudflare Access also protects the hostname, MCP clients must satisfy that additional authentication layer.

For another reverse proxy, preserve the Host header and allow long requests and unbuffered `/api/events` responses. Compile requests can last about 100 seconds. Trust forwarded headers only from your actual proxy addresses; Docker bridge addresses are not necessarily loopback. TLS terminates at the proxy, and login/MCP authentication still runs in the app.

## Backup and restore

Sources, assets, file history and build metadata live in SQLite. PDFs and compilation manifests are separate files. Account credentials live in `access.json`.

An online, transaction-consistent **database-only** backup:

```sh
docker compose exec app node scripts/backup.mjs
```

This writes `/data/backups/<timestamp>.sqlite`. Copy backups out of the volume; they are lost if you delete that volume. Database-only backups exclude credentials and PDFs.

For a **full backup**, use an empty directory and briefly stop the app:

```sh
docker compose stop app
mkdir -p backups/full
docker compose cp app:/data/. ./backups/full/
docker compose start app
```

Store this directory securely: it contains the owner password and token. Choose a new empty backup directory for each run. The repository ignores `backups/` by default.

To restore into a **new, empty installation**, create the containers without starting the app, copy the full backup, and start:

```sh
docker compose build
docker compose create app
docker compose cp ./backups/full/. app:/data/
docker compose up -d
```

Do not overlay a backup onto a running database or a populated volume. For native installations, stop the process and copy the entire `PRIVATE_DIR` while it is offline.

`docker compose down` preserves data. **`docker compose down -v` deletes the data volume.** The server does not prune history or PDFs automatically; monitor disk usage and export/delete projects you no longer need.

## Updates and separate installations

Back up first, then:

```sh
git pull --ff-only
docker compose up -d --build
```

Use a different Compose project name and host port for each independent owner. For example, set `PORT=17883` in that installation's `.env` and run `docker compose -p writer-two up -d --build`. Use the same project name for all later commands. Named volumes are scoped by the Compose project; do not share a data volume across app processes.

## Compiler packages and limits

The TeX image includes common LaTeX, scientific and bibliography packages, Biber, XeTeX/LuaTeX and Korean support. It is not the full TeX Live distribution. Missing packages must be added to `deploy/Dockerfile.tex` and the image rebuilt; compiles cannot download packages. Upload publisher-specific `.cls` and `.sty` files with your project.

Defaults: 20 MiB per source file; 100 MiB and 1,000 files per project; 40 MiB compressed ZIP imports; two concurrent compiles; 90 seconds, one CPU and 768 MiB RAM per compile. A compiler gets 256 MiB of `/work` and 128 MiB of `/tmp`. Large font caches, figures or bibliographies can exceed these limits. Review `server/compiler.mjs` before changing them.

Shell escape and project `.latexmkrc` files are disabled. Packages requiring shell execution need pre-generated assets or a different workflow. A failed build retains its log and does not present an old PDF as a successful new build.

## Verification

```sh
docker compose exec -T app npm test
docker compose exec -T app node tests/live-mcp.mjs
docker compose exec -T -e MCP_TRANSPORT=stdio app node tests/live-mcp.mjs
```

Integration checks use temporary projects and delete them after completion. Do not run another app process against the same SQLite directory; the stdio adapter connects to the existing server.
