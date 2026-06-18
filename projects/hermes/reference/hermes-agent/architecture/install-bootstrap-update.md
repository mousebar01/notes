# Install / Bootstrap / Startup / Update

本文记录 Hermes 从安装到启动再到更新的工程链路。重点不是每个命令行参数，而是那些“用户环境很乱时仍能启动”的细节：Windows 编码、Termux 快路径、TUI/Node bootstrap、pip/git/docker/update 分支、Dashboard build、postinstall、非 Python 依赖保证。

## 主要入口

入口文件：

- `hermes_cli/main.py`：`hermes` CLI 主入口。
- `hermes_bootstrap.py`：Windows UTF-8 bootstrap，必须最早 import。
- `hermes_cli/dep_ensure.py`：非 Python runtime dependency 的懒检测/安装入口。
- `scripts/install.sh`：POSIX/Termux 主安装器。
- `scripts/install.ps1`：Windows PowerShell 安装器。
- `scripts/install.cmd`：CMD wrapper，启动 PowerShell 安装器。
- `scripts/lib/node-bootstrap.sh`：Node.js bootstrap helper。
- `scripts/install_psutil_android.py`：Termux/Android psutil 兼容安装 shim。

运行入口由 `pyproject.toml` 暴露：

```toml
[project.scripts]
hermes = "hermes_cli.main:main"
hermes-agent = "run_agent:main"
hermes-acp = "acp_adapter.entry:main"
```

## Windows UTF-8 bootstrap

`hermes_bootstrap.py` 是一个非常明确的“必须最早执行”的模块。

它解决 Windows 两个老坑：

- `stdout/stderr` 默认绑定控制台 code page，例如 US locale 的 `cp1252`，打印非 ASCII 可能 `UnicodeEncodeError`。
- 子进程不知道要用 UTF-8，导致 execute_code、delegation、linter 等 Python 子进程继承同样问题。

它在 Windows 上做：

- `os.environ.setdefault("PYTHONUTF8", "1")`
- `os.environ.setdefault("PYTHONIOENCODING", "utf-8")`
- `sys.stdout` / `sys.stderr` / `sys.stdin` 调用 `reconfigure(encoding="utf-8", errors="replace")`

POSIX 不做任何事，避免改用户 locale。

`main.py` 顶部有 guarded import：

```python
try:
    import hermes_bootstrap
except ModuleNotFoundError:
    pass
```

为什么要 guard？因为用户可能 `git pull` 或 `hermes update` 半途中，代码已引用新 top-level module，但 editable install 的 `.pth` 还没更新。没有 guard 会导致 Hermes 连 `update` 都打不开。缺 bootstrap 在 Windows 只是降级，不应该使 CLI 完全不可用。

## 进程标题与早期 TUI 判断

`main.py` 的 `main()` 里会尝试设置进程标题为 `hermes`：

- 优先 `setproctitle`。
- Linux fallback：`prctl(PR_SET_NAME)`，15 字符限制。
- macOS fallback：`pthread_setname_np`。
- Windows no-op。

这不是功能必需，但让 `ps/top/htop` 中更好识别。

更重要的是早期 TUI 判断：

- `_config_default_interface_early()` 用最小 YAML read 读取 `display.interface`。
- `_wants_tui_early()` 的优先级：`--cli` 强制 classic，`--tui` / `HERMES_TUI=1`，最后 config。

这些函数在完整 config/parser import 前运行，用于启动优化。

## TUI 鼠标残留清理

`_suppress_mouse_residue_early()` 是一个很细的终端 UX 修复。

问题：TUI 上一次退出后 terminal 可能还处在 mouse tracking 模式；下一次 `hermes --tui` 启动时，Python launcher 在 import 阶段还没把 stdin 切 raw mode。如果用户此时移动鼠标，终端会把 SGR/X10 mouse reports 作为文本回显到 scrollback，看到一堆 `^[[<...M`。

解决：

- 在所有重 import 前判断是否要进入 TUI。
- stdout 是 TTY 时，直接写 CSI 序列关闭多种 mouse tracking mode。
- Node TUI 自己后面还会再 reset 一次；这里是更早的防线。
- `HERMES_TUI_NO_EARLY_DISABLE=1` 可关闭用于诊断。

这是一个典型“不是大功能，但极大改善真实终端体验”的细节。

## Profile override 必须早

`_apply_profile_override()` 会在大量 Hermes 模块 import 前处理 `--profile/-p`。

原因：很多模块会在 import 时缓存 `HERMES_HOME` 相关路径。如果等 argparse 完整解析后再设置 profile，已经太晚。

逻辑：

- 从 `sys.argv` 预解析 `--profile NAME` 或 `--profile=NAME`。
- 校验 profile name 格式，避免 pytest 的 `-p no:xdist` 被误读。
- 如果 `HERMES_HOME` 已经指向 `profiles/<name>`，尊重它。
- 否则读取默认 root 下的 `active_profile`。
- 设置环境变量，让后续所有模块看到正确 `HERMES_HOME`。
- 从 `sys.argv` 中剥离 profile 参数，避免 argparse 重复处理。

## Termux 快路径

Termux 启动慢，`main.py` 做了两个 fast path。

`_try_termux_ultrafast_version()`：

- 只处理 `hermes --version`、`hermes -V`、`hermes version`。
- 不 import 完整 config/logging/parser。
- 直接打印版本、项目路径、Python、OpenAI SDK 版本。

`_try_termux_fast_tui_launch()`：

- 只在 Termux。
- 只处理明显的 `hermes --tui` / TUI chat 路径。
- 避免构建所有 subparser 和导入 model/fallback/migrate/kanban/plugins 等模块。
- 最终 handoff 到 `cmd_chat()`。

还有 classic CLI fast path：裸 `hermes` chat 时可以设置 `HERMES_DEFER_AGENT_STARTUP=1`，把 agent-heavy discovery 延迟到用户提交第一条消息。

这体现了一个取舍：大 CLI 有很多子命令，但移动端热路径不能为所有子命令付启动成本。

## TUI build / run 逻辑

TUI 相关函数在 `main.py`：

- `_tui_need_npm_install()`
- `_tui_need_rebuild()`
- `_ensure_tui_node()`
- `_find_bundled_tui()`
- `_make_tui_argv()`

运行模式：

- `HERMES_TUI_DIR` 指向外部预构建 bundle 时，直接运行 `dist/entry.js`。
- wheel/pip 安装时，可使用 `hermes_cli/tui_dist/entry.js` bundled TUI。
- 源码 checkout 下，必要时 `npm install`，再 build 到 `ui-tui/dist/entry.js`。
- `--dev` 走 `tsx src/entry.tsx`，但不能和 `HERMES_TUI_DIR` prebuilt bundle 混用。

`_tui_need_npm_install()` 不只看 mtime，而是比较 root `package-lock.json` 与 `node_modules/.package-lock.json` 内容。它忽略 npm runtime annotation，例如 `ideallyInert`、`peer`，避免 npm 在不同平台重写 lockfile 导致每次启动都 reinstall。

workspace 处理：

- `ui-tui/` 没有自己的 lockfile，而父目录有 `package-lock.json` 时，父目录视为 npm workspace root。
- Termux 下可用 workspace args 只安装 `ui-tui` 相关 workspace，避免热路径拉 desktop/web deps。

`_tui_need_rebuild()`：

- 看 `dist/entry.js` 是否缺失。
- 比较 source/config inputs mtime。
- `HERMES_TUI_FORCE_BUILD=1` 可强制 rebuild。
- Termux 默认尽量跳过不必要 esbuild，降低冷启动成本。

## Node bootstrap

Node 是 TUI、browser tools、WhatsApp bridge 的基础依赖。

`hermes_cli/dep_ensure.py` 负责 Python 侧快速检测和 UX：

- `node`
- `browser`
- `ripgrep`
- `ffmpeg`

但真正安装仍交给 `scripts/install.sh` / `install.ps1`，因为 shell 安装器已经有大量 OS/package-manager 逻辑。

`scripts/lib/node-bootstrap.sh` 是 sourceable helper，策略：

1. PATH 上已有现代 Node。
2. `~/.hermes/node/` 中已有 Hermes-managed Node。
3. 用户已有 version manager：`fnm`、`proto`、`nvm`。
4. Termux `pkg`。
5. macOS Homebrew。
6. 下载 pinned major 的 nodejs.org tarball 到 `~/.hermes/node/`。

安装后会创建 `node/npm/npx` symlink：

- root Linux：`/usr/local/bin`
- Termux：`$PREFIX/bin`
- 普通用户：`~/.local/bin`

`_ensure_tui_node()` 在 Python 里 source 这个 helper，然后通过 stdout 捕获 `command -v node`，把 node 所在目录 prepend 到当前 Python 进程的 `PATH`。这是因为 shell subshell 的 PATH 修改不会自动回传给 Python。

## dep_ensure

`ensure_dependency(dep, interactive=True)` 的设计：

- 用 `shutil.which()` 等快速检查，不生成 shell。
- 找 install script 时同时支持 wheel bundled path 和 git checkout path。
- Windows 优先 `install.ps1`，POSIX 优先 `install.sh`。
- interactive TTY 下询问用户是否安装。
- 非交互时不 prompt，直接尝试安装。
- Windows 用 PowerShell `-Ensure <dep> -HermesHome <path>`。
- POSIX 用 `bash install.sh --ensure <dep>`。

只有 hard-fail 依赖需要接入 ensure，例如 TUI 需要 node、browser tool 需要 agent-browser。像 ripgrep/ffmpeg 这种可降级能力不一定强制。

## install.sh 布局

`scripts/install.sh` 的职责很大：

- guard inherited `PYTHONPATH` / `PYTHONHOME`，避免安装过程被外部 Python path 污染。
- 防止 uv 读取父目录配置。
- 解析 `--no-venv`、`--skip-setup`、`--skip-browser`、`--branch`、`--commit`、`--ensure`、`--postinstall` 等。
- 选择 install layout。
- 安装/使用 uv。
- 安装 Python。
- 自动安装 Git。
- 安装 Node/browser/ripgrep/ffmpeg。
- clone/update repo。
- 创建 venv。
- 安装 Python deps。
- 安装命令 wrapper。
- sync bundled skills。
- 运行 setup wizard。

root Linux 新安装使用 FHS 风格：

- code under `/usr/local/lib/hermes-agent`
- wrapper under `/usr/local/bin/hermes`
- uv Python 放到 `/usr/local/share/uv/...`，避免 root home 下的 venv interpreter 对普通用户不可执行。

如果检测到 legacy install，则保留 legacy layout，不强制迁移。

Termux 特殊：

- 使用 Python stdlib `venv + pip`，而不是 uv。
- 走 `pkg` 安装 Python/Git/Node。

## install.ps1 / install.cmd

`scripts/install.cmd` 是 Windows CMD wrapper，主要做：

```cmd
powershell -ExecutionPolicy ByPass -NoProfile -Command "iex (irm https://hermes-agent.nousresearch.com/install.ps1)"
```

真正 Windows 安装逻辑在 `install.ps1`。它和 POSIX 安装器对应，支持桌面 bootstrap stage protocol，用于 Hermes-Setup GUI 安装器逐阶段执行。

`install.sh --manifest` 会输出 desktop bootstrap stage manifest JSON，包括 prerequisites、repository、venv、python-deps、node-deps、path、config、setup、gateway、desktop、complete 等阶段。这让 GUI 安装器可以展示阶段进度，而不是把 shell 输出当纯文本。

## postinstall

`hermes postinstall` 面向 pip 用户。

`cmd_postinstall()` 做：

- `stamp_install_method("pip")`
- 依次 `ensure_dependency("node")`
- `ensure_dependency("browser")`
- `ensure_dependency("ripgrep")`
- `ensure_dependency("ffmpeg")`
- 如果没有 provider configured，运行 setup wizard。
- 否则提示 complete。

pip 安装只能安装 Python 包，不能自动确保 Node/Chromium/rg/ffmpeg/system services。postinstall 是补齐这些 runtime 依赖的桥。

## Dashboard startup

`cmd_dashboard()` 负责：

- `--status`：扫描运行中的 dashboard process。
- `--stop`：杀掉运行中的 dashboard process。
- setup `gui.log` logging。
- 检查 `fastapi` / `uvicorn`。
- quiet sync bundled skills。
- 如果没有 `HERMES_WEB_DIST` 且未 `--skip-build`，构建 `web/`。
- `--skip-build` 时检查 dist 真的存在，否则 fail with hint。
- 显式 `discover_plugins()`，确保 dashboard auth provider / image_gen / web provider 等插件在 server 启动前注册。
- 调用 `hermes_cli.web_server.start_server()`。

为什么 dashboard 要显式 discover plugins？顶层 argparse 对内置 subcommand 会跳过 plugin discovery，省约 500ms；但 Dashboard runtime 需要 plugin-registered dashboard auth providers。如果不手动 discover，auth gate 可能 fail-closed 或插件 API 不可用。

## Update 命令

`cmd_update()` 是薄 wrapper：

- 检查 managed install，managed 环境不允许这样更新。
- Docker install 给出 docker pull 说明，不尝试 git pull。
- `--check` 只检查是否有更新。
- 安装 hangup protection，避免 SSH/SIGHUP 中断更新导致半状态。
- 调 `_cmd_update_impl()`。
- finally 恢复 stdio。

`_cmd_update_impl()` 做：

- gateway mode 下用 file-based IPC prompt。
- 非交互更新可读取 `updates.non_interactive_local_changes` 决定 stash 还是 discard。
- Windows 下检查并发 `hermes.exe`，避免 WinError 32。
- 可做 pre-update backup。
- 如果不是 git repo：
  - Windows 可走 ZIP update。
  - pip install 走 `_cmd_update_pip()`。
  - 其他提示重装。
- Windows git 设置 `windows.appendAtomically=false`，规避 loose object 写入问题。
- 先 `_discard_lockfile_churn()`，把 npm 非确定性改动的 tracked `package-lock.json` 还原。
- 检测 fork remote。
- fetch origin。
- 解析目标 branch，必要时切 branch。
- 处理 local changes/stash。
- pull/checkout 后重装依赖、sync skills 等。

`_cmd_update_pip()` 支持：

- uv tool install：`uv tool upgrade hermes-agent`
- pipx：`pipx upgrade hermes-agent`
- venv 内 uv pip：需要补 `VIRTUAL_ENV=sys.prefix`
- 无 uv fallback：`python -m pip install --upgrade hermes-agent`

## Pre-update backup

Update 可在变更前做 backup。相关函数会打包当前状态，成功后提示：

- saved path。
- restore command：`hermes import <backup>`。
- 如何禁用。

这体现了一个安全策略：自动更新前先给用户可回滚点，尤其是 agent 项目里用户数据、skills、config 都很重要。

## Lockfile churn cleanup

`_discard_lockfile_churn()` 只处理 tracked `package-lock.json`。

原因：

- npm install/build 会非确定性重写 lockfile，例如 platform optional deps、runtime annotations。
- managed install 中这些 diff 通常不是用户意图。
- 如果不清理，`hermes update` 每次都会 autostash，branch switch 也更脆。

它只 checkout package-lock，不碰其他文件，是一个窄范围的“清理噪声”动作。

## Uninstall

`cmd_uninstall()` 负责卸载 Hermes。参数：

- `--full`：删除 config/data。
- `--yes`：跳过确认。

文档里不展开全部实现，但要注意原则：默认可以保留 `~/.hermes` 配置和数据，full 才删除用户状态。

## Desktop 命令

`hermes desktop` / deprecated alias `hermes gui`：

- 默认安装 workspace Node deps。
- 构建当前 OS 的 unpacked Electron app。
- 启动 packaged artifact。

参数：

- `--source`：直接 `electron .` against `apps/desktop/dist`。
- `--build-only`：只 build 不启动，安装器 update flow 用。
- `--fake-boot`：确定性 boot delay，用于验证启动 UI。
- `--ignore-existing`：忽略 PATH 上已有 hermes CLI。
- `--hermes-root`：设置 `HERMES_DESKTOP_HERMES_ROOT`。
- `--cwd`：设置 desktop 初始项目目录。
- `--skip-build`：用已有 unpacked app。
- `--force-build`：即使 content stamp 匹配也强制重建。

这和 Dashboard 不同：Desktop 是独立 Electron app，不嵌入 `hermes --tui`。

## 内置 subcommand 快速判断

`_BUILTIN_SUBCOMMANDS` 列出所有内置顶层命令。

用途：当用户运行明显的 built-in subcommand 时，跳过昂贵的 plugin discovery。注释里提到插件 discovery 可能拉入 google.cloud.pubsub、aiohttp、grpc 等，耗时 500ms+。

但如果少列一个内置命令，只是多花一次 discovery；如果多列一个实际应由插件提供的命令，可能让插件命令解析失败。因此这个集合需要和 argparse subparser 维护同步。

## 值得学习的工程点

- Windows 编码 bootstrap 必须在所有 import 前，且缺失时降级不崩。
- Profile override 必须早于任何缓存路径的模块 import。
- TUI 启动前主动关闭 mouse tracking，解决 import 阶段 escape 回显。
- Termux 上为 hot path 做轻量 parser，避免大 CLI 子命令导入成本。
- TUI/npm install 判断比较 lockfile 内容而不是 mtime，避免每次启动 reinstall。
- Node bootstrap 尊重用户现有 fnm/proto/nvm，再 fallback 到 Hermes-managed tarball。
- 非 Python 依赖检测放 Python，安装交给 shell，避免重复实现包管理器逻辑。
- Dashboard 内置命令跳过插件 discovery，但 runtime 需要时手动 discover。
- Update 先处理 install method：managed/docker/pip/git/zip 各走不同安全路径。
- 只清理 package-lock churn，不做泛化 reset，避免误删用户改动。

## 阅读源码建议

建议按这个顺序看：

1. `hermes_bootstrap.py`：理解 Windows UTF-8 bootstrap。
2. `hermes_cli/main.py` 文件顶部：早期 TUI/profile/Termux 逻辑。
3. `hermes_cli/main.py` 的 `_make_tui_argv()`、`_tui_need_npm_install()`、`_tui_need_rebuild()`。
4. `scripts/lib/node-bootstrap.sh`：Node 发现/安装策略。
5. `hermes_cli/dep_ensure.py`：非 Python dependency ensure。
6. `scripts/install.sh`：POSIX/Termux install layout 和 ensure/postinstall。
7. `cmd_postinstall()`：pip 用户补 bootstrap。
8. `cmd_dashboard()`：web dist build、plugin discovery、server start。
9. `cmd_update()` / `_cmd_update_impl()`：git/pip/docker/zip update 分支。
10. `scripts/install.ps1`：Windows 安装和 desktop stage protocol。
