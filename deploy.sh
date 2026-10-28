#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
umask 077

ENV_FILE="$ROOT_DIR/.env"
BACKUP_DIR="$ROOT_DIR/backups"
COMPOSE=()
COMMAND="deploy"
COMMAND_SET=0
NO_BUILD=0
SKIP_BACKUP=0
LAST_BACKUP=""

usage() {
  cat <<'EOF'
用法: ./deploy.sh [命令] [选项]

命令:
  deploy, up   生成/校验 .env，构建并启动，等待 /ready（默认；已有容器时先自动备份）
  check        只检查 Docker、配置和 .env，不启动服务
  status       查看容器状态与 /ready 就绪信息
  logs         跟踪 app 与 db 日志
  backup       立即备份 PostgreSQL、master.key、上传文件与 .env
  restart      重启现有容器并等待就绪
  down         停止并删除容器（保留数据卷）

选项:
  --no-build   跳过镜像构建，直接用现有镜像启动
  --no-backup  deploy 时不自动备份
  -h, --help   显示本帮助

首次部署:
  bash deploy.sh

HTTPS / 域名:
  修改 .env 中的 APP_BASE_URL、COOKIE_SECURE、TRUST_PROXY 后重新执行：
  bash deploy.sh
EOF
}

log() { printf '[deploy] %s\n' "$*"; }
warn() { printf '[deploy] 警告: %s\n' "$*" >&2; }
die() { printf '[deploy] 错误: %s\n' "$*" >&2; exit 1; }

gen_hex() {
  local bytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    od -An -N"$bytes" -tx1 /dev/urandom | tr -d ' \n'
  fi
}

is_placeholder() {
  case "${1:-}" in
    ""|replace-with-*|change-me|change-this-password|please-change-this-in-production|dev-insecure-session-secret)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

get_env() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  awk -v key="$key" '
    index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }
  ' "$ENV_FILE"
}

set_env() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { done = 0 }
    index($0, key "=") == 1 { print key "=" value; done = 1; next }
    { print }
    END { if (!done) print key "=" value }
  ' "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

detect_base_url() {
  local port="${1:-3100}"
  local host=""
  if command -v curl >/dev/null 2>&1; then
    host="$(curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null || true)"
  fi
  if [[ -z "$host" ]] && command -v hostname >/dev/null 2>&1; then
    host="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  [[ -n "$host" ]] || host="127.0.0.1"
  if [[ "$host" == *:* ]]; then
    host="[$host]"
  fi
  printf 'http://%s:%s' "$host" "$port"
}

ensure_env() {
  local created=0
  if [[ ! -f "$ENV_FILE" ]]; then
    [[ -f "$ROOT_DIR/.env.example" ]] || die ".env.example 不存在，无法生成配置"
    cp "$ROOT_DIR/.env.example" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    created=1
    log "已从 .env.example 创建 $ENV_FILE"
  fi

  if grep -q $'\r' "$ENV_FILE" 2>/dev/null; then
    sed -i 's/\r$//' "$ENV_FILE"
  fi

  if is_placeholder "$(get_env SESSION_SECRET)"; then
    set_env SESSION_SECRET "$(gen_hex 32)"
    log "已生成 SESSION_SECRET"
  fi
  if is_placeholder "$(get_env POSTGRES_PASSWORD)"; then
    set_env POSTGRES_PASSWORD "$(gen_hex 16)"
    log "已生成 POSTGRES_PASSWORD"
  fi

  [[ -n "$(get_env POSTGRES_DB)" ]] || set_env POSTGRES_DB yinling
  [[ -n "$(get_env POSTGRES_USER)" ]] || set_env POSTGRES_USER yinling
  [[ -n "$(get_env DB_POOL_MAX)" ]] || set_env DB_POOL_MAX 10
  [[ -n "$(get_env APP_PORT)" ]] || set_env APP_PORT 3100
  [[ -n "$(get_env DEMO_MODE)" ]] || set_env DEMO_MODE 1
  [[ -n "$(get_env TRUST_PROXY)" ]] || set_env TRUST_PROXY 0
  [[ -n "$(get_env RATE_LIMIT_ENABLED)" ]] || set_env RATE_LIMIT_ENABLED 1

  local base_url
  if [[ -n "${APP_BASE_URL:-}" ]]; then
    base_url="$APP_BASE_URL"
    set_env APP_BASE_URL "$base_url"
  else
    base_url="$(get_env APP_BASE_URL)"
    case "$base_url" in
      ""|*localhost*|*127.0.0.1*)
        base_url="$(detect_base_url "$(get_env APP_PORT)")"
        set_env APP_BASE_URL "$base_url"
        log "已推断访问地址: $base_url"
        ;;
    esac
  fi
  case "$base_url" in
    https://*)
      set_env COOKIE_SECURE 1
      # HTTPS 通常由 Nginx/Caddy 终止，需要读取 X-Forwarded-For
      set_env TRUST_PROXY 1
      ;;
    *)
      set_env COOKIE_SECURE 0
      ;;
  esac

  if [[ "$created" -eq 1 ]]; then
    local key
    for key in DEEPSEEK_API_KEY QWEN_API_KEY ARK_API_KEY ARK_BASE_URL ARK_MODEL AMAP_WEB_KEY; do
      if [[ -n "${!key:-}" ]]; then
        set_env "$key" "${!key}"
      fi
    done
  fi

  chmod 600 "$ENV_FILE"
  log "配置文件: $ENV_FILE"
}

load_env() {
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

check_docker() {
  command -v docker >/dev/null 2>&1 || die "未安装 Docker。请先安装 Docker Engine 24+ 与 Compose v2"
  docker info >/dev/null 2>&1 || die "Docker 未运行，或当前用户没有 Docker 权限（可尝试 sudo 或加入 docker 组）"
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    die "未安装 Docker Compose v2（docker compose）"
  fi
}

check_port() {
  command -v ss >/dev/null 2>&1 || return 0
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${APP_PORT}$" || return 0
  if docker ps --filter 'name=yinling-shouhu' --format '{{.Ports}}' 2>/dev/null | grep -q ":${APP_PORT}->"; then
    return 0
  fi
  die "端口 ${APP_PORT} 已被占用；请修改 .env 中的 APP_PORT 后重试"
}

validate_env() {
  [[ "$APP_PORT" =~ ^[0-9]+$ ]] || die "APP_PORT 必须是数字"
  (( APP_PORT >= 1 && APP_PORT <= 65535 )) || die "APP_PORT 必须在 1-65535 之间"
  [[ -n "${SESSION_SECRET:-}" && ${#SESSION_SECRET} -ge 32 ]] || die "SESSION_SECRET 至少需要 32 个字符"
  [[ "${POSTGRES_PASSWORD:-}" =~ ^[A-Za-z0-9._~-]+$ ]] || die "POSTGRES_PASSWORD 只能包含字母、数字和 ._~-（会被拼进 DATABASE_URL）"
  [[ "${POSTGRES_DB:-}" =~ ^[A-Za-z0-9._~-]+$ ]] || die "POSTGRES_DB 只能包含字母、数字和 ._~-"
  [[ "${POSTGRES_USER:-}" =~ ^[A-Za-z0-9._~-]+$ ]] || die "POSTGRES_USER 只能包含字母、数字和 ._~-"
  [[ "${APP_BASE_URL:-}" =~ ^https?:// ]] || die "APP_BASE_URL 必须以 http:// 或 https:// 开头"
  [[ "${DEMO_MODE:-1}" == "0" || "${DEMO_MODE:-1}" == "1" ]] || die "DEMO_MODE 只能是 0 或 1"
  [[ "${TRUST_PROXY:-0}" == "0" || "${TRUST_PROXY:-0}" == "1" ]] || die "TRUST_PROXY 只能是 0 或 1"
}

compose_config() {
  "${COMPOSE[@]}" config -q
}

compose_running() {
  [[ -n "$("${COMPOSE[@]}" ps -q app 2>/dev/null || true)" && -n "$("${COMPOSE[@]}" ps -q db 2>/dev/null || true)" ]]
}

backup_once() {
  if ! compose_running; then
    log "容器未运行，跳过备份"
    return 0
  fi

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  local dir="$BACKUP_DIR/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$dir"
  chmod 700 "$dir"

  log "备份数据到 $dir"
  cp "$ENV_FILE" "$dir/env.backup"

  if ! "${COMPOSE[@]}" exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" >"$dir/postgres.sql"; then
    warn "pg_dump 失败，已中止本次备份"
    rm -rf "$dir"
    return 1
  fi

  if ! "${COMPOSE[@]}" cp app:/app/data/master.key "$dir/master.key" >/dev/null 2>&1; then
    warn "未能复制 master.key；若使用 MASTER_KEY 环境变量，请确认已另行保存"
  fi
  if ! "${COMPOSE[@]}" cp app:/app/apps/api/public/uploads "$dir/uploads" >/dev/null 2>&1; then
    warn "未能复制上传文件，继续执行"
  fi

  cat >"$dir/README.txt" <<EOF
备份时间: $(date '+%Y-%m-%d %H:%M:%S')
数据库: $POSTGRES_DB / $POSTGRES_USER
数据文件: postgres.sql、master.key、uploads/、env.backup

恢复提示:
1. 使用同一版本镜像与 .env 启动 db 与 app。
2. 恢复数据库:
   docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB < postgres.sql
3. 恢复主密钥:
   docker compose cp master.key app:/app/data/master.key
4. 恢复上传文件:
   docker compose cp uploads/. app:/app/apps/api/public/uploads/
5. 重启:
   docker compose restart app
EOF

  LAST_BACKUP="$dir"

  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null \
    | sort -nr \
    | tail -n +6 \
    | cut -d' ' -f2- \
    | while read -r old; do
        [[ -n "$old" ]] && rm -rf -- "$old"
      done || true
}

probe_ready() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 3 "http://127.0.0.1:${APP_PORT}/ready" >/dev/null 2>&1
    return
  fi
  "${COMPOSE[@]}" exec -T app node -e \
    "fetch('http://127.0.0.1:3100/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" \
    >/dev/null 2>&1
}

wait_ready() {
  local attempts=90
  local i
  log "等待服务就绪（最长 180 秒）"
  for ((i = 1; i <= attempts; i += 1)); do
    if probe_ready; then
      printf '\n'
      return 0
    fi
    if (( i % 10 == 0 )); then
      printf '.'
    fi
    sleep 2
  done
  printf '\n'
  return 1
}

show_ready() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "http://127.0.0.1:${APP_PORT}/ready"
  else
    "${COMPOSE[@]}" exec -T app node -e \
      "fetch('http://127.0.0.1:3100/ready').then(r => r.text()).then(t => console.log(t))"
  fi
}

print_summary() {
  printf '\n'
  log "部署完成"
  printf '  访问地址: %s\n' "$APP_BASE_URL"
  printf '  本机就绪: http://127.0.0.1:%s/ready\n' "$APP_PORT"
  printf '  数据目录: pg-data / app-data / app-public（Docker 具名卷）\n'
  printf '  备份目录: %s（保留最近 5 份）\n' "$BACKUP_DIR"
  if [[ -n "$LAST_BACKUP" ]]; then
    printf '  本次备份: %s\n' "$LAST_BACKUP"
  fi
  if [[ "${DEMO_MODE:-1}" == "1" ]]; then
    printf '  演示登录: 长者 elder / 家属 family（DEMO_MODE=1）\n'
  else
    printf '  正式模式: DEMO_MODE=0，演示登录已关闭\n'
  fi
  printf '\n常用命令:\n'
  printf '  ./deploy.sh status    查看状态\n'
  printf '  ./deploy.sh logs      查看日志\n'
  printf '  ./deploy.sh backup    立即备份\n'
  printf '  ./deploy.sh down      停止容器（保留数据卷）\n'
}

do_deploy() {
  check_port
  if compose_running && [[ "$SKIP_BACKUP" -eq 0 ]]; then
    backup_once || die "自动备份失败，已停止部署；可修复后重试，或加 --no-backup 跳过"
  fi

  log "拉取数据库镜像（失败时使用本地缓存）"
  "${COMPOSE[@]}" pull db || warn "数据库镜像拉取失败，尝试使用本地缓存"

  if [[ "$NO_BUILD" -eq 0 ]]; then
    log "构建应用镜像"
    "${COMPOSE[@]}" build app
  else
    log "跳过镜像构建"
  fi

  log "启动服务"
  "${COMPOSE[@]}" up -d --remove-orphans

  if ! wait_ready; then
    warn "服务未在 180 秒内就绪，以下是最近日志："
    "${COMPOSE[@]}" ps || true
    "${COMPOSE[@]}" logs --tail=120 app db || true
    die "部署失败；修复后重新执行 ./deploy.sh"
  fi

  print_summary
}

do_check() {
  check_port
  log "Docker: $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)"
  log "Compose: $("${COMPOSE[@]}" version --short 2>/dev/null || echo unknown)"
  log "APP_BASE_URL: $APP_BASE_URL"
  log "监听端口: 0.0.0.0:$APP_PORT"
  log "数据库: $POSTGRES_DB / $POSTGRES_USER"
  log "SESSION_SECRET: 已设置（${#SESSION_SECRET} 字符）"
  log "POSTGRES_PASSWORD: 已设置"
  if compose_running; then
    log "当前容器: 运行中"
  else
    log "当前容器: 未运行"
  fi
  log "配置检查通过"
}

do_status() {
  "${COMPOSE[@]}" ps
  printf '\n'
  if probe_ready; then
    printf '就绪信息:\n'
    show_ready
    printf '\n'
  else
    warn "服务未就绪"
    return 1
  fi
}

do_logs() {
  exec "${COMPOSE[@]}" logs -f --tail=200 app db
}

do_down() {
  "${COMPOSE[@]}" down
  log "容器已停止；pg-data、app-data、app-public 数据卷已保留"
}

do_restart() {
  check_port
  "${COMPOSE[@]}" up -d --remove-orphans
  wait_ready || die "服务重启后未就绪，请执行 ./deploy.sh logs 查看日志"
  print_summary
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help|help)
      usage
      exit 0
      ;;
    --no-build)
      NO_BUILD=1
      ;;
    --no-backup)
      SKIP_BACKUP=1
      ;;
    deploy|up|check|status|logs|backup|restart|down)
      [[ "$COMMAND_SET" -eq 0 ]] || die "只能指定一个命令"
      COMMAND="$1"
      COMMAND_SET=1
      ;;
    *)
      die "未知命令或参数: $1（使用 --help 查看用法）"
      ;;
  esac
  shift
done

check_docker
ensure_env
load_env
validate_env
compose_config

case "$COMMAND" in
  deploy|up) do_deploy ;;
  check) do_check ;;
  status) do_status ;;
  logs) do_logs ;;
  backup)
    compose_running || die "容器未运行，无法备份"
    backup_once || die "备份失败"
    ;;
  restart) do_restart ;;
  down) do_down ;;
esac
