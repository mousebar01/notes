# Testing / CI / Release / Supply Chain

本文记录 Hermes 的测试运行器、CI 工作流、依赖固定、供应链扫描和发布脚本。相比 agent loop 这类运行时逻辑，这一层更像项目的“免疫系统”：防止跨文件状态污染、凭证泄漏、lockfile 漂移、供应链攻击、Windows 编码坑和发布版本不一致。

## 测试入口

官方测试入口是：

```bash
scripts/run_tests.sh
```

不要直接默认跑裸 `pytest`，因为 `run_tests.sh` 做了几件重要事情：

- 查找并激活虚拟环境：`.venv`、`venv`、`$HOME/.hermes/hermes-agent/venv`。
- 使用 `env -i` 启动干净环境。
- 设置 `TZ=UTC`、`LANG=C.UTF-8`、`LC_ALL=C.UTF-8`、`PYTHONHASHSEED=0`。
- 不把 API key 环境变量透传到测试进程。
- 调用 `scripts/run_tests_parallel.py` 做 per-file subprocess isolation。
- 如果 `$HOME/.hermes/pytest_live_guard.py` 存在，会通过 `PYTEST_PLUGINS` 注入 live gateway guard。

这个脚本的目标是“本地测试行为尽量等同 CI”，尤其避免本地 shell 里的真实 API key 泄进测试。

## Per-file 测试隔离

`scripts/run_tests_parallel.py` 是 pytest-xdist 的替代方案。

核心策略：

```text
发现 test_*.py 文件
  -> 每个文件单独运行 python -m pytest <file>
  -> ThreadPoolExecutor 控制并发
  -> 每个文件一个全新 Python interpreter
```

为什么不是 per-test？

- 每个 test 单独 spawn 开销太大。
- 注释里估算：约 250ms × 17k tests = 70min CPU minimum。
- per-file 是约 250ms × 850 files = 3.5min，成本可接受。

为什么不用 xdist？

- xdist worker 会在多个文件间复用进程。
- Hermes 的历史 flake 来源正是跨文件 module-level state 泄漏。
- per-file subprocess 是更强、更简单的隔离边界。

这个设计非常实用：跨文件隔离交给 runner，文件内部隔离仍由测试作者负责。

## Test discovery 和 skip 规则

默认发现根：

```text
tests
```

默认跳过：

- `tests/integration`
- `tests/e2e`
- `tests/docker`

原因：

- integration/e2e 需要外部服务或真实模型。
- docker tests 依赖 Docker daemon 和预构建镜像，放到独立 CI job。

如果用户显式指定 skipped 目录，例如：

```bash
scripts/run_tests.sh tests/docker/
```

runner 会尊重用户意图，不再跳过该目录。

## pytest collection 计数

runner 会先跑一次：

```bash
python -m pytest --co -q ...
```

目的：

- 统计每个文件的 test 数量。
- 显示进度时能显示 test-level progress，而不是只有文件数。
- 让 CI 输出更可读。

`--ignore` 会同步加入 skipped dirs，确保 collection 看到的范围和实际执行一致。

## 进程树清理

每个测试文件用 `subprocess.Popen(start_new_session=True)` 启动。

POSIX 下：

- 启动后立刻记录 `pgid`。
- timeout 或 happy path 结束后都调用 `_kill_tree()`。
- `_kill_tree()` 用 `os.killpg(pgid, SIGKILL)` 清理整个进程组。

Windows 下：

- 用 `taskkill /F /T /PID` 清理子进程树。

为什么 happy path 也 kill group？因为测试可能启动 uvicorn、async runtime、后台进程，pytest 自己退出不代表 grandchildren 都退出。清理进程组避免 orphan 进程污染后续测试。

## Timeout 层次

有两层 timeout：

- `pyproject.toml` 里 pytest-timeout：每个 test 30 秒。
- `run_tests_parallel.py` 外层 per-file timeout：默认 600 秒。

内层解决 Python test 卡住；外层解决整个文件 pathological hang 或子进程失控。

`pytest` exit code 5（no tests collected）会被当成 pass，因为可能是 marker/filter 把文件内所有测试都过滤掉了。

## CI 测试分片

`.github/workflows/tests.yml` 定义主测试 job。

特点：

- push/PR 到 main 触发，但 Markdown/docs 改动会 paths-ignore。
- concurrency group 会取消同 branch/PR 的旧 run。
- 6 个 slice 并行。
- 每个 slice 运行：

```bash
python scripts/run_tests_parallel.py --slice <i>/6
```

分片不是简单按文件数量，而是基于历史 duration cache。

`run_tests_parallel.py` 使用 LPT（Longest Processing Time first）：

- 按预计耗时从长到短排序。
- 每个文件贪心放入当前总耗时最小的 bucket。
- 没有历史数据的新文件默认估算 2 秒。

CI 主分支会把每个 slice 产生的 `test_durations.json` 上传 artifact，然后 `save-durations` job 合并并保存到 cache。后续 PR 使用这份 cache 做更均衡的分片。

## CI 安装环境

测试 workflow 中：

- checkout action 用完整 commit SHA pin。
- 安装 ripgrep 是下载固定版本 tarball，并校验 SHA256。
- 使用 `astral-sh/setup-uv`，同样 SHA pin。
- `uv python install 3.11`。
- `uv venv .venv --python 3.11`。
- `uv pip install -e ".[all,dev]"`。
- 测试 env 显式清空 `OPENROUTER_API_KEY`、`OPENAI_API_KEY`、`NOUS_API_KEY`。

这说明 CI 不依赖 runner 预装 rg，也不允许测试意外调真实 API。

## E2E job

`tests.yml` 还有单独 `e2e` job：

- 安装同样依赖。
- 先跑 packaged-wheel i18n smoke test：

```bash
python -m pytest -m integration tests/test_wheel_locales_e2e.py -v
```

- 再跑：

```bash
python -m pytest tests/e2e/ -v --tb=short
```

E2E 与普通单元测试分开，避免把慢/外部依赖测试混进 6 分片主矩阵。

## Lint 策略

`.github/workflows/lint.yml` 分三块：

第一块是 advisory diff：

- 跑 ruff + ty。
- HEAD 和 base 都跑。
- 用 `scripts/lint_diff.py` 生成 diff summary。
- 上传 artifact。
- PR 内部 fork 时会发/更新 PR comment。
- 不阻塞 merge。

第二块是 blocking ruff：

- 直接 `ruff check .`。
- 只 enforcing `pyproject.toml` 中显式启用的规则。
- 当前最关键是 `PLW1514`：未指定 encoding。

第三块是 Windows footguns：

- 跑 `scripts/check-windows-footguns.py --all`。
- 检查 Windows 不安全 primitive，比如 POSIX-only signal/process idiom、bare open encoding、脚本执行方式等。

这个组合很聪明：大范围 lint/type 先做 advisory，不让历史债务阻塞；少数 load-bearing 规则做 blocking。

## Ruff 配置

`pyproject.toml` 中：

```toml
[tool.ruff]
preview = true

[tool.ruff.lint]
select = ["PLW1514"]
```

注释解释了为什么只强制这一条：Windows 默认 locale 可能是 cp1252，裸 `open()`、`read_text()`、`write_text()` 会静默损坏非 ASCII 内容。项目曾遇到多个 Windows sandbox 回归，所以强制所有新代码显式 encoding。

忽略范围：

- `tests/**`
- `skills/**`
- `optional-skills/**`
- `plugins/**`

理由是测试会刻意覆盖 locale edge case，skills/plugins 部分用户/外部作者拥有自己的约定。

## 依赖固定策略

`pyproject.toml` 中的核心策略非常明确：

- Core dependencies 大多 exact pin：`==X.Y.Z`。
- extras 也尽量 exact pin。
- 只有少数基础构建/平台兼容项用范围，例如 `setuptools>=77.0,<83`、`fastapi>=0.104.0,<1`。
- `requires-python = ">=3.11,<3.14"`，避免 uv 自动选 Python 3.14 后 Rust-backed transitive 没 wheel，被迫 source build 失败。

注释明确提到供应链背景：Mini Shai-Hulud worm、mistralai 2.4.6。策略是不要让 PyPI 新版本在无人 review 的情况下进入用户安装。

依赖分层原则：

- 每个 Hermes session 都用到的包才进 core dependencies。
- provider-specific 包放 optional extra。
- 可延迟安装的 provider/tool 依赖走 `tools/lazy_deps.py`。
- `[all]` 只包含无法 lazy-install 或 packager 需要提前带上的能力。

这能降低“某个 opt-in backend 的 PyPI 包被污染，所有 fresh install 都炸”的风险。

## uv.lock 检查

`.github/workflows/uv-lockfile-check.yml` 运行：

```bash
uv lock --check
```

触发条件：

- `pyproject.toml`
- `uv.lock`
- workflow 自身

重要细节：PR 上 GitHub checkout 默认是 merge commit，也就是“当前 main + PR”。所以 `uv lock --check` 检查的是合并后的状态，不只是你的分支。

因此可能出现：

- 本地分支 `uv lock --check` 通过。
- CI 失败，因为 main 已经新增 dependency，而你的 lockfile 没包含。

workflow 注释和 summary 会提示：

```bash
git fetch origin main
git rebase origin/main
uv lock
git add uv.lock
git commit ...
```

这个 check 是 blocking，因为 Docker build 使用 `uv sync --frozen`，过期 lockfile 会在更晚、更贵的 build 阶段失败。

## Supply Chain Audit workflow

`.github/workflows/supply-chain-audit.yml` 是 PR diff 扫描。

它不做泛泛的低信号扫描，而只检查高危模式：

- `.pth` 文件新增/修改：Python startup 自动执行。
- 同一行 base64 decode + `exec()`/`eval()`。
- `subprocess` 调用带 base64、hex、`chr()` 等混淆命令。
- 顶层 install-hook 文件：`setup.py`、`setup.cfg`、`sitecustomize.py`、`usercustomize.py`、`__init__.pth`。

注释明确说低信号 heuristics 被移除了，因为会在几乎每个 PR 报警，让 review 训练成忽略 scanner。

还有 dependency bounds check：

- 只在 `pyproject.toml` 改动时跑。
- 检查新增 PyPI dependency 是否 `>=...` 但没有 `<...` ceiling。
- 发现后发 PR comment 并 fail。

workflow 里还有 gate job，确保没有相关文件改动时也上报 success，避免 required check 永远 pending。

## OSV Scanner

`.github/workflows/osv-scanner.yml` 扫描 lockfiles：

- `uv.lock`
- `package-lock.json`
- `website/package-lock.json`

触发：

- PR 修改 lockfile/package files。
- push main。
- 每周 schedule。
- 手动 workflow_dispatch。

它使用 Google reusable workflow，并按 SHA pin。

`fail-on-vuln: false`。也就是说它是检测/上报，不自动阻塞已有 pinned dependency 的已知漏洞。这样符合项目策略：依赖是 deliberate pins，修复也应该 deliberate，而不是自动乱 bump。

## On-demand security audit

`hermes_cli/security_audit.py` 实现 `hermes security audit`。

它会发现：

- 当前 venv 中安装的 PyPI distributions。
- 用户插件 `~/.hermes/plugins` 下声明的 Python deps。
- MCP server 配置中 pinned `npx`/`uvx` 包。

然后对 OSV.dev 做 batch query。

只解析 exact pins，例如 `name==version`。不解析 loose spec，因为 OSV query 需要具体版本，猜错比漏报更糟。

输出支持人类文本和 JSON，结果按 severity 排序。

## Dependabot 策略

`.github/dependabot.yml` 注释说明：

- 不启用 pip/npm 普通 version update。
- 原因是项目采用 exact pin + lockfile 策略，自动 bump 会破坏“人工 review 后移动 pin”的供应链姿态。
- GitHub Actions 是例外，因为 action 用 full commit SHA pin，需要 Dependabot 提醒上游 action 版本更新。
- Security alerts 仍保留，用于“当前 pinned version 被披露漏洞”的场景。

## GitHub Actions SHA pin

workflow 里 actions 基本都用完整 commit SHA，例如：

```yaml
uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6.0.2
```

这比 `@v4` 更强，避免 tag 被重写。注释保留人类可读版本号，方便 review。

同样，CI 下载 prebuilt binary（如 ripgrep）也校验 SHA256。

## Docker / Nix / Website / Skills 工作流

`.github/workflows/` 下还有多个外围工作流：

- `docker-lint.yml`
- `docker-publish.yml`
- `nix.yml`
- `nix-lockfile-fix.yml`
- `docs-site-checks.yml`
- `deploy-site.yml`
- `skills-index.yml`
- `skills-index-freshness.yml`
- `build-windows-installer.yml`
- `contributor-check.yml`
- `history-check.yml`
- `upload_to_pypi.yml`

这些说明 Hermes 不只是 Python package，还要维护 Docker 镜像、Nix 打包、网站文档、skills index、Windows installer、PyPI 发布等多个分发面。

## Release 脚本

`scripts/release.py` 负责生成 changelog、更新版本、创建 GitHub release。

能力：

- CalVer tag。
- SemVer bump：patch/minor 等。
- `--publish` 才实际创建 tag/release，默认 dry run。
- `--first-release` 支持初始发布。
- `--date` 可指定 CalVer 日期。
- 从 git commit 生成 release notes。
- 用 AUTHOR_MAP 把 git email/name 映射到 GitHub handle。
- 更新版本文件。
- 构建 sdist/wheel。
- 调用 `gh release create`。

版本更新包括：

- `hermes_cli/__init__.py` 中 `__version__`、`__release_date__`。
- `pyproject.toml` project version。
- Desktop Electron app `package.json` version。
- ACP registry manifest 和 npm launcher pin。

这避免不同分发物版本漂移。

## Contributor audit

`scripts/contributor_audit.py` 用于检查 release notes 是否漏掉贡献者。

它会：

- 从 git log 提取 author email/name。
- 用 release.py 的 `AUTHOR_MAP` 解析 GitHub handle。
- 可用 gh CLI 扫 PR 做补充。
- 可对 release notes 文件检查“贡献者是否被提及”。
- strict 模式下，新 unmapped email 会 fail CI。

这是项目治理层面的质量保障：发布不仅要代码正确，也要正确致谢。

## Packaging 元数据

`pyproject.toml` 中几个打包细节值得注意：

- `py-modules` 明确列出顶层模块。
- `package-data` 包含 `hermes_cli/web_dist/**/*`、`tui_dist/**/*`、安装脚本等。
- `plugins` package-data 包含 dashboard manifest/dist、`plugin.yaml`、README。
- `data-files` 把 `locales/*.yaml` 放进 wheel。

注释说明了真实事故：如果 wheel 没带 plugin manifests，插件扫描会找到 0 个插件；如果 locales 没进 wheel，CLI/gateway 会显示 raw i18n key。

## 值得学习的工程点

- 用 per-file subprocess 解决测试跨文件状态污染，比 xdist worker restart 更直接。
- 测试入口用 `env -i`，防止真实 API key 泄进测试。
- CI 分片按历史耗时 LPT 分配，而不是机械按文件数。
- Advisory lint 和 blocking lint 分层，既保留信号又不被历史债务绑死。
- 只启用少数 load-bearing lint rule，规则少但真的有事故背景。
- 精确 pin 依赖，provider-specific 包 lazy-install，降低供应链 blast radius。
- Required check 使用 gate job 上报 skipped success，避免 path filter 造成 pending。
- 供应链扫描保持高信号，不用低质量正则淹没 reviewer。
- Actions 和下载二进制都 pin SHA，注释保留版本号给人读。
- release 脚本更新多个分发面的版本，避免 Python/Desktop/ACP 不一致。

## 阅读源码建议

建议按这个顺序看：

1. `scripts/run_tests.sh`：理解本地测试入口和环境清洗。
2. `scripts/run_tests_parallel.py`：理解 per-file isolation、process-tree cleanup、slice。
3. `.github/workflows/tests.yml`：理解 CI 分片和 duration cache。
4. `.github/workflows/lint.yml`：理解 advisory vs blocking。
5. `pyproject.toml`：理解依赖 pin、extras、pytest/ruff 配置、package-data。
6. `.github/workflows/uv-lockfile-check.yml`：理解 merged-state lock check。
7. `.github/workflows/supply-chain-audit.yml`：理解高信号 PR diff scanner。
8. `.github/workflows/osv-scanner.yml` 和 `hermes_cli/security_audit.py`：理解已知漏洞扫描。
9. `scripts/release.py` 和 `scripts/contributor_audit.py`：理解发布自动化和贡献者审计。
