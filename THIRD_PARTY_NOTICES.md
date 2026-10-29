# Third-party notices

The MIT license at the repository root covers this application's original code. It does not replace the licenses of dependencies, system packages, fonts or documents you import.

## JavaScript

Dependencies are installed from the versions and integrity hashes in `package-lock.json`; their copyright and license files remain in `node_modules` inside the application image.

| Component | Upstream | License |
| --- | --- | --- |
| React and React DOM | https://github.com/facebook/react | MIT |
| CodeMirror and its packages | https://github.com/codemirror | MIT |
| Express | https://github.com/expressjs/express | MIT |
| MCP TypeScript SDK | https://github.com/modelcontextprotocol/typescript-sdk | MIT |
| Zod | https://github.com/colinhacks/zod | MIT |
| yazl and yauzl | https://github.com/thejoshwolfe | MIT |
| Lucide icons | https://github.com/lucide-icons/lucide | ISC |
| Vite | https://github.com/vitejs/vite | MIT |

Transitive JavaScript packages in the initial lockfile declare MIT, ISC, BSD-2-Clause or BSD-3-Clause licenses. Retain their notices when redistributing bundled dependencies; inspect the lockfile and installed license files after updates.

## Runtime and compiler images

Node.js, the Docker CLI, Debian packages, TeX Live, Biber, Noto and Tinos/Croscore fonts have their own upstream licenses. The compiler image installs Debian's unmodified packages; installed package copyright files are available under `/usr/share/doc/*/copyright`. TeX packages and fonts may carry LPPL, GPL, OFL or other licenses, and are not relicensed as MIT by this project.

This repository distributes Docker build recipes rather than vendored TeX binaries. If you redistribute built images, review and satisfy the included packages' redistribution and source-availability requirements. You can list installed packages with `dpkg-query -W` inside the image.

No Overleaf server code, Overleaf container image, branding assets or private reference captures are included. Overleaf and REA are acknowledged as workflow references in the README.
