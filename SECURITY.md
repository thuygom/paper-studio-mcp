# Security model

Paper Studio is a single-owner application. A browser session or MCP Bearer token grants access to all projects in that installation. There are no per-project permissions or tenant boundaries. Only connect clients you authorize to read, modify and delete your papers.

Credentials are generated per installation and stored in the private data directory, in `access.json`. They are recoverable plaintext for the owner account command; filesystem access to that directory is therefore privileged. The directory uses mode 0700 and the account file 0600 on Linux. Backups contain secrets and manuscript content. Passwords and tokens are not printed in server startup logs.

Browser sessions are HTTP-only and SameSite=Strict, use Secure cookies for HTTPS, and disappear after a restart. Mutating browser requests with a foreign Origin are rejected; login attempts are rate limited. MCP needs the owner Bearer token. Use HTTPS for remote access and rotate credentials with `scripts/account.mjs` if exposed.

## Docker authority

The app mounts the Docker socket. Anyone who compromises the app process can control that daemon, potentially including its host. A restricted TeX container does not remove this application-level authority. Keep the default localhost binding behind an authenticated HTTPS deployment, and use a host or VM appropriate for your private work. This is not a deployment for untrusted tenants.

Each TeX job gets only one project snapshot through standard input, no host filesystem bind mount, no network, no shell escape and no project latexmk configuration. It uses a non-root UID, a read-only root filesystem, dropped capabilities, temporary directories and resource/time limits. The app accepts a bounded ZIP result containing only a compile log, exit status and PDF. Docker/kernel isolation is not a formal guarantee against malicious TeX or container escapes.

Uploads and archive entries are checked for relative paths, size limits and ZIP symlinks. Edits use revision preconditions to avoid silent overwrite. File history and PDFs have no automatic retention limit, so the owner must monitor disk usage.

## Reporting

Use this repository's GitHub **Security → Report a vulnerability** feature for sensitive reports. Do not attach passwords, tokens, private papers or exploitable details to a public issue. General bugs can use regular issues with a minimal, non-sensitive example.
