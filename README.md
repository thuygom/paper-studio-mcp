# Paper Studio MCP

[한국어](README.ko.md) · [MCP connection](docs/mcp.md) · [Hosting & backups](docs/operations.md)

A self-hosted LaTeX workspace for one writer and their AI tools. Edit in the browser, compile a PDF, and let an MCP client work on the same project with revision checks and file history.

## Start with Docker

Install Git and [Docker with Compose](https://docs.docker.com/compose/install/), then run:

```sh
git clone https://github.com/thuygom/paper-studio-mcp.git
cd paper-studio-mcp
docker compose up -d --build
docker compose exec app node scripts/account.mjs
```

Open **http://localhost:17882** and sign in using the email and password printed by the last command. The default email is `owner@example.com`; the password and MCP token are randomly generated for your installation. Keep the output private.

The first build downloads Node, TeX Live and Korean fonts and can take several minutes. Allow several GB of free disk space. Later starts reuse the images. `tex-image` exiting with status 0 is expected: it builds the compiler image, then the application launches a fresh compiler container for each job.

To choose your email or port, copy `.env.example` to `.env` and edit it **before the first start**. The email is a login identifier; no mail service is required. Account settings are preserved in the data volume on subsequent starts.

## What you get

- LaTeX source editor, autosave, outline, search, PDF preview and build logs.
- pdfLaTeX, XeLaTeX and LuaLaTeX; Korean typesetting with `kotex` and Noto CJK fonts.
- Project/file management, binary assets, ZIP import/export and downloadable PDFs.
- File history and SHA-256 revision checks. A stale browser or agent edit is rejected instead of overwriting newer work.
- **19 MCP tools** over authenticated Streamable HTTP, plus a stdio adapter for local clients.
- Browser updates when MCP changes a file; a working **MCP connection → Test MCP connection** button.
- One SQLite database, a persistent Docker volume, and no external database or paid API requirement.

There is one owner account per installation. This does not provide shared multi-user editing, OAuth, comments, tracked changes or SyncTeX. Use separate installations for separate owners.

## Connect an agent

Sign in, choose **MCP connection**, reveal the connection configuration and test it. Copy the configuration into a client that supports Streamable HTTP and Bearer headers. Client-specific configuration keys may differ.

```json
{
  "mcpServers": {
    "paper-studio": {
      "url": "http://localhost:17882/mcp",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}
```

The token grants full access to this owner's projects, including deletion. [MCP setup and all tools](docs/mcp.md) include a stdio configuration that keeps tokens out of the client configuration.

## Data and compilation

The `studio-data` named volume stores credentials, source files, history and build PDFs. No manuscripts, accounts, domains or tunnel credentials are shipped with this repository. Git and Docker build exclusions keep local data out of source commits and images by default.

Each compile receives only a ZIP of that project's snapshot. TeX runs without networking or shell escape, as a non-root user, with a read-only root filesystem, temporary working directories and resource limits. Host directory paths are not passed to the compiler.

**The application mounts the Docker socket to launch compiler containers. This gives the application Docker daemon authority. Run it for a trusted owner on a machine you control, not as a public multi-tenant service.** The default port binds only to localhost. Read [security](SECURITY.md) and [hosting](docs/operations.md) before putting it behind HTTPS.

## Develop without the application container

Install **Node.js 24+** and Docker. From this directory:

```sh
docker build -f deploy/Dockerfile.tex -t paper-studio-mcp-tex:local .
npm ci
npm run build
npm start
```

In a second terminal, run `npm run account`. Data lives in `./private/` unless `PRIVATE_DIR` is set. For frontend development, keep the API running on port 17882 and run `npm run dev`; Vite proxies `/api` and `/mcp` to it.

```sh
npm test
npm run build
# With the application running and the TeX image built:
npm run test:integration
```

The integration check creates and deletes its own temporary projects. It covers every MCP tool, conflict rejection, ZIP/history round trips, all three TeX engines, Korean output and failed compilation. CI repeats it over HTTP and stdio in Docker.

Linux x86-64 is the tested platform. The Compose setup avoids host-path assumptions for Docker Desktop, but macOS, Windows/WSL and ARM have not been verified on hardware.

## License and relationship to Overleaf

Application code: [MIT](LICENSE). Dependencies and TeX packages retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

This is an independent implementation inspired by Overleaf's browser editing workflow, not an Overleaf fork or an official Overleaf product. The compiler image uses Debian TeX Live packages and does not package the Overleaf server. [REA](https://github.com/morluto/rea) was used to study the reference workflow; private analysis captures are not distributed.
