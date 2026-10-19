# MCP connection

The running application exposes `/mcp` using stateless Streamable HTTP. Requests need `Authorization: Bearer <YOUR_TOKEN>`. Browser cookies alone do not authenticate MCP. The **MCP connection** dialog reveals the owner's token after browser sign-in and tests the actual endpoint.

## HTTP clients

For clients using an `mcpServers` JSON configuration:

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

Use your HTTPS origin instead of localhost for remote clients. An AI service running in the cloud cannot reach your computer's localhost. This server uses a static owner token, not OAuth; clients must support custom Bearer headers. The JSON field names depend on the client.

## Stdio clients

The adapter forwards requests to the running application so browser updates, compilation limits and persistence stay in the same process. It does not open another database.

With the default Compose project, use the absolute path to your checkout:

```json
{
  "mcpServers": {
    "paper-studio": {
      "command": "docker",
      "args": [
        "compose", "-f", "/absolute/path/paper-studio-mcp/compose.yaml",
        "exec", "-T", "app", "node", "scripts/mcp-stdio.mjs"
      ]
    }
  }
}
```

The adapter reads the credentials inside the data volume. Start the application first. If you selected a custom Compose project name with `-p`, include the same `-p` value here. Windows paths in JSON need escaped backslashes or forward slashes.

For a native Node installation, use `node /absolute/path/paper-studio-mcp/scripts/mcp-stdio.mjs`. Set `PRIVATE_DIR` to that installation's data directory. `MCP_URL` and `MCP_TOKEN` can instead connect the adapter to another instance. Do not use `npm run mcp` as the stdio command: npm's banner can pollute the protocol stream.

## Tools

| Area | Tools |
| --- | --- |
| Projects | `list_projects`, `create_project`, `get_project`, `update_project`, `delete_project` |
| Files | `list_files`, `read_file`, `write_file`, `replace_text`, `rename_file`, `delete_file`, `search_files` |
| History | `file_history`, `restore_file` |
| Compilation | `compile_project`, `latest_build`, `read_pdf` |
| Transfer | `export_project`, `import_project` |

Read a file before changing it. Pass its returned `revision` as `expectedRevision` when writing, replacing, renaming, deleting or restoring it. Use `expectedRevision: null` only when creating a new file. A stale revision produces a tool error with status 409; read the current version and reconcile your change before retrying.

`replace_text` requires exactly one matching occurrence. Use `dryRun: true` to preview the replacement without changing the file. Binary files, PDFs and ZIPs use base64. Compilation records the input revisions, root file and engine, so a PDF remains tied to the snapshot that produced it.

Examples of requests to your agent:

> List my papers, read the introduction, propose a shorter version, then apply it using the current file revision and compile the project.

> Find every citation of a given key, update the affected sentences, and report any compile errors.

No model is bundled or called automatically. Your MCP client decides which model to use and which operations to approve.
