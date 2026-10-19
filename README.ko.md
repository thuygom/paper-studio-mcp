# Paper Studio MCP

[English](README.md) · [MCP 연결](docs/mcp.md) · [서버 운영·백업](docs/operations.md)

내 서버에서 쓰는 개인용 LaTeX 편집기입니다. 브라우저에서 논문을 편집하고 PDF를 확인하며, MCP 클라이언트도 같은 프로젝트의 파일을 읽고 수정할 수 있습니다. 파일 이력과 리비전 검사를 통해 사람과 에이전트의 수정이 서로 덮어쓰지 않도록 합니다.

## 바로 실행하기

Git과 [Docker Compose](https://docs.docker.com/compose/install/)가 필요합니다.

```sh
git clone https://github.com/thuygom/paper-studio-mcp.git
cd paper-studio-mcp
docker compose up -d --build
docker compose exec app node scripts/account.mjs
```

**http://localhost:17882**에서 마지막 명령이 출력한 이메일과 비밀번호로 로그인합니다. 기본 이메일은 `owner@example.com`이며 비밀번호와 MCP 토큰은 설치마다 새로 생성됩니다. 이 출력은 외부에 공유하지 마세요.

처음에는 TeX Live와 한글 글꼴을 내려받아 빌드하므로 수 분이 걸리고 수 GB의 여유 공간이 필요합니다. `tex-image` 컨테이너가 종료 코드 0으로 끝나는 것은 정상입니다. 실제 컴파일은 요청마다 별도 컨테이너에서 실행합니다.

이메일이나 포트를 바꾸려면 첫 실행 전에 `.env.example`을 `.env`로 복사해 수정하세요. 이메일은 로그인 ID로만 쓰므로 메일 서버가 필요하지 않습니다. 이미 생성한 계정은 재시작해도 유지됩니다.

## 주요 기능

- 소스 편집, 자동 저장, 목차, 검색, PDF 미리보기와 컴파일 로그
- pdfLaTeX·XeLaTeX·LuaLaTeX, `kotex`와 Noto CJK를 통한 한글 조판
- 파일 업로드, 바이너리 다운로드, 프로젝트 ZIP 가져오기·내보내기
- 이전 파일 버전 복원과 동시 수정 충돌 감지
- 프로젝트·파일·컴파일을 다루는 **MCP 도구 19개**
- MCP 수정의 브라우저 반영과 실제 연결 테스트 버튼
- SQLite와 Docker 볼륨에 저장하는 구조로 별도 DB 서버나 유료 AI API 불필요

설치당 소유자 계정 하나를 사용합니다. 사용자별로 따로 설치하는 용도이며 다중 사용자 공동 편집, OAuth, 댓글, 변경 추적, SyncTeX는 제공하지 않습니다.

## MCP 연결

로그인 후 상단 **MCP connection**에서 연결 설정을 표시하고 **Test MCP connection**을 누릅니다. Streamable HTTP와 Bearer 헤더를 지원하는 클라이언트에 표시된 URL과 토큰을 등록하면 됩니다.

클라이언트별 설정 형식은 다를 수 있습니다. [MCP 문서](docs/mcp.md)에 HTTP·stdio 예제와 전체 도구 목록이 있습니다. 토큰에는 프로젝트 삭제를 포함한 소유자 권한이 있으므로 공유하지 마세요.

## 개인 자료와 운영

계정, 논문 소스, 파일 이력, PDF는 `studio-data` Docker 볼륨에 보관합니다. 이 저장소에는 개인 논문·계정·서버 도메인·터널 인증 정보가 포함되어 있지 않습니다.

컴파일 컨테이너에는 해당 프로젝트의 파일만 전달합니다. 네트워크와 shell escape를 끄고, 일반 사용자 권한과 CPU·메모리·시간 제한을 적용합니다.

**앱은 컴파일 컨테이너를 만들기 위해 Docker 소켓을 사용하므로 Docker 데몬을 제어할 권한을 가집니다. 본인이 관리하는 환경의 개인용 서버로 사용하세요.** 기본 접속 포트는 localhost에만 열립니다. 외부 HTTPS 주소나 Cloudflare Tunnel을 연결하려면 [운영 문서](docs/operations.md)와 [보안 설명](SECURITY.md)을 참고하세요.

```sh
# 비밀번호 재발급 후 적용
docker compose exec app node scripts/account.mjs --reset-password
docker compose restart app

# 실행 중인 DB의 일관된 백업 생성
docker compose exec app node scripts/backup.mjs
```

DB 백업만으로 계정과 PDF까지 복구되지는 않습니다. 전체 백업·복원 절차는 운영 문서에 있습니다. `docker compose down`은 자료를 보존하지만 **`docker compose down -v`는 데이터 볼륨까지 삭제**합니다.

## 개발 및 검증

앱을 직접 실행하려면 Node.js 24 이상과 Docker가 필요합니다.

```sh
docker build -f deploy/Dockerfile.tex -t paper-studio-mcp-tex:local .
npm ci
npm run build
npm start
```

다른 터미널에서 `npm run account`로 계정을 확인합니다. 기본 데이터 경로는 `./private/`입니다. `npm test`로 파일·권한·계정·백업 검사를 실행하고, 서버가 켜진 상태에서 `npm run test:integration`으로 MCP와 실제 TeX 컴파일을 검사할 수 있습니다.

Linux x86-64에서 검증했습니다. Docker Desktop을 고려해 호스트 파일 경로 의존성을 없앴지만 macOS·Windows/WSL·ARM 실기기 검증은 하지 않았습니다.

## 라이선스

앱 코드는 [MIT](LICENSE), 외부 패키지는 [각 원본 라이선스](THIRD_PARTY_NOTICES.md)를 따릅니다.

Overleaf의 브라우저 편집 흐름을 참고해 독립 구현한 앱입니다. Overleaf 포크나 공식 제품이 아니며, 컴파일 이미지도 Overleaf 서버 없이 Debian TeX Live로 구성했습니다. [REA](https://github.com/morluto/rea)를 통한 흐름 분석 자료와 개인 서버 자료는 공개판에 포함하지 않았습니다.
