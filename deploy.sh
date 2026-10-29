#!/usr/bin/env bash
# 银龄守护 · 一键部署（systemd + MySQL 8 + Node 22.5+，推荐 24）
# 适用：Alibaba Cloud Linux 3 / RHEL 8+ / Debian 12+，root 执行
set -Eeuo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
INSTALL_DIR="${INSTALL_DIR:-/opt/yinling-shouhu}"
ENV_DIR="/etc/yinling"
ENV_FILE="$ENV_DIR/yinling.env"
DATA_ROOT="/var/lib/yinling"
BACKUP_DIR="/var/backups/yinling"
SERVICE_NAME="yinling"
SERVICE_USER="yinling"

MYSQL_SERVICE=""
MYSQL_FLAVOR="mysql"
MYSQL_FRESH=0
ROOT_MODE=""
MYSQL_ROOT_TCP=0
MYSQL_TEMP_PASS=""
NODE_BIN=""
PKG_MANAGER=""
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
NODE_MIRROR="${NODE_MIRROR:-https://npmmirror.com/mirrors/node}"

COMMAND="deploy"
COMMAND_SET=0
NO_BUILD=0
SKIP_BACKUP=0
FORCE_DEPS=0
LAST_BACKUP=""

usage() {
  cat <<'EOF'
用法: bash deploy.sh [命令] [选项]

命令:
  deploy, up   安装依赖并部署（默认）：Node 24 + MySQL 8 + systemd 服务，等待 /ready
  check        只做环境检查（系统、内存、磁盘、Node、MySQL、端口），不修改任何东西
  status       查看 systemd 服务状态与 /ready 就绪信息
  logs         持续查看应用日志（journalctl）
  backup       立即备份 MySQL、数据目录与 /etc/yinling/yinling.env
  restart      重启服务并等待就绪
  stop         停止应用（MySQL 继续运行，数据保留）

选项:
  --no-build   跳过 npm 安装与构建，直接用现有 dist 重启
  --no-backup  deploy 时不自动备份
  --force-deps 强制重新安装系统依赖
  -h, --help   显示本帮助

可覆盖的环境变量（写在命令前）:
  APP_BASE_URL=http://1.2.3.4:3100   # 不填则自动探测公网 IP
  APP_PORT=3100
  MYSQL_DATABASE=yinling
  MYSQL_USER=yinling
  MYSQL_PASSWORD=...                 # 只允许字母、数字和 ._~-
  MYSQL_ROOT_PASSWORD=...            # 可选；已有 MySQL 且 root 有密码时，终端会提示输入，不会写入配置
  DEEPSEEK_API_KEY=... QWEN_API_KEY=... ARK_API_KEY=... AMAP_WEB_KEY=...
  DEMO_MODE=1                        # 正式环境改 0 关闭演示账号与种子数据
  INSTALL_DIR=/opt/yinling-shouhu
  NPM_REGISTRY=https://registry.npmmirror.com

首次部署:
  bash deploy.sh

HTTPS / 域名:
  改 /etc/yinling/yinling.env 里的 APP_BASE_URL，再执行 bash deploy.sh
EOF
}

log() { printf '[deploy] %s\n' "$*"; }
warn() { printf '[deploy] 警告: %s\n' "$*" >&2; }
die() { printf '[deploy] 错误: %s\n' "$*" >&2; exit 1; }

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "请用 root 执行：sudo bash deploy.sh $COMMAND"
}

gen_hex() {
  local bytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    od -An -N"$bytes" -tx1 /dev/urandom | tr -d ' \n'
  fi
}

gen_master_key() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr -d '\n'
  else
    head -c 32 /dev/urandom | base64 | tr -d '\n'
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
  ' "$ENV_FILE" 2>/dev/null || true
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

put_default() {
  local key="$1"
  local value="$2"
  [[ -n "$(get_env "$key")" ]] || set_env "$key" "$value"
}

is_valid_master_key() {
  local value="$1"
  [[ -n "$value" ]] || return 1
  local bytes
  bytes="$(printf '%s' "$value" | base64 -d 2>/dev/null | wc -c)" || return 1
  [[ "$bytes" -eq 32 ]]
}

is_private_ipv4() {
  local ip="$1"
  [[ "$ip" =~ ^10\. ]] && return 0
  [[ "$ip" =~ ^192\.168\. ]] && return 0
  [[ "$ip" =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\. ]] && return 0
  [[ "$ip" == "127.0.0.1" ]] && return 0
  return 1
}

detect_base_url() {
  local port="${1:-3100}"
  local host=""
  if command -v curl >/dev/null 2>&1; then
    host="$(curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null | tr -d '[:space:]' || true)"
    # 阿里云 ECS 元数据服务：无外网或 ipify 不可达时仍能拿到公网 IP
    if [[ -z "$host" ]]; then
      host="$(curl -fsS --max-time 2 http://100.100.100.200/latest/meta-data/eipv4 2>/dev/null | tr -d '[:space:]' || true)"
    fi
    if [[ -z "$host" ]]; then
      host="$(curl -fsS --max-time 2 http://100.100.100.200/latest/meta-data/public-ipv4 2>/dev/null | tr -d '[:space:]' || true)"
    fi
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

detect_pkg_manager() {
  if command -v dnf >/dev/null 2>&1; then
    PKG_MANAGER="dnf"
  elif command -v yum >/dev/null 2>&1; then
    PKG_MANAGER="yum"
  elif command -v apt-get >/dev/null 2>&1; then
    PKG_MANAGER="apt"
  else
    die "未识别包管理器（需要 dnf / yum / apt-get）"
  fi
}

pkg_install() {
  case "$PKG_MANAGER" in
    dnf) dnf -y install "$@" ;;
    yum) yum -y install "$@" ;;
    apt) DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" ;;
  esac
}

ensure_service_user() {
  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    groupadd -r "$SERVICE_USER" 2>/dev/null || true
    useradd -r -g "$SERVICE_USER" -d "$DATA_ROOT" -s /sbin/nologin "$SERVICE_USER" 2>/dev/null || true
  fi
  id -u "$SERVICE_USER" >/dev/null 2>&1 || die "无法创建系统用户 $SERVICE_USER"
}

ensure_dirs() {
  mkdir -p "$DATA_ROOT/data" "$DATA_ROOT/public/uploads" "$BACKUP_DIR" "$ENV_DIR" "$INSTALL_DIR"
  chmod 750 "$DATA_ROOT"
  chmod 700 "$BACKUP_DIR" "$ENV_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_ROOT"
}

ensure_base_packages() {
  mkdir -p "$DATA_ROOT"
  if [[ -f "$DATA_ROOT/.deps-ok" && "$FORCE_DEPS" -eq 0 ]]; then
    return 0
  fi
  detect_pkg_manager
  log "安装基础依赖（curl tar xz openssl rsync）..."
  if [[ "$PKG_MANAGER" == "apt" ]]; then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    pkg_install curl ca-certificates tar xz-utils openssl rsync >/dev/null
  else
    pkg_install curl ca-certificates tar xz openssl rsync
  fi
  touch "$DATA_ROOT/.deps-ok"
}

ensure_swap() {
  local swap_kb
  swap_kb="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
  (( swap_kb >= 1048576 )) && return 0
  [[ -f /swapfile ]] && { swapon /swapfile 2>/dev/null || true; return 0; }

  local free_kb
  free_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
  (( free_kb >= 4194304 )) || { warn "磁盘剩余不足 4GB，跳过 swap 创建（构建可能内存不足）"; return 0; }

  log "创建 2GB swap（构建前端时防止内存不足）"
  if ! fallocate -l 2G /swapfile 2>/dev/null; then
    dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  fi
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab 2>/dev/null || printf '/swapfile none swap sw 0 0\n' >>/etc/fstab
}

node_requirement_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 5) ? 0 : 1)' >/dev/null 2>&1
}

install_node() {
  local arch
  case "$(uname -m)" in
    x86_64|amd64) arch="linux-x64" ;;
    aarch64|arm64) arch="linux-arm64" ;;
    *) die "不支持的 CPU 架构: $(uname -m)" ;;
  esac

  local mirror sums file expected
  sums=""
  for mirror in "$NODE_MIRROR" "https://nodejs.org/dist"; do
    sums="$(curl -fsSL --retry 2 --connect-timeout 10 --max-time 30 "$mirror/latest-v24.x/SHASUMS256.txt" 2>/dev/null || true)"
    [[ -n "$sums" ]] && break
  done
  [[ -n "$sums" ]] || die "无法获取 Node 24 下载信息，请检查外网连接，或设置 NODE_MIRROR"

  file="$(printf '%s\n' "$sums" | awk -v suffix="-$arch.tar.xz" '$2 ~ suffix"$" {print $2; exit}')"
  [[ -n "$file" ]] || die "未找到 Node 24 的 $arch 安装包"

  expected="$(printf '%s\n' "$sums" | awk -v f="$file" '$2 == f {print $1; exit}')"
  [[ -n "$expected" ]] || die "未找到 $file 的校验值"

  log "下载 Node 24（$file）..."
  local tarball="/tmp/$file"
  curl -fL --retry 2 --connect-timeout 10 --max-time 300 "$mirror/latest-v24.x/$file" -o "$tarball" \
    || die "Node 下载失败：$mirror/latest-v24.x/$file"
  printf '%s  %s\n' "$expected" "$tarball" | sha256sum -c - >/dev/null 2>&1 \
    || die "Node 安装包校验失败，请重试"

  mkdir -p /usr/local/lib/nodejs
  local dir="/usr/local/lib/nodejs/${file%.tar.xz}"
  rm -rf -- "$dir"
  tar -xJf "$tarball" -C /usr/local/lib/nodejs
  [[ -x "$dir/bin/node" ]] || die "Node 解压失败：$dir"

  ln -sf "$dir/bin/node" /usr/local/bin/node
  ln -sf "$dir/bin/npm" /usr/local/bin/npm
  ln -sf "$dir/bin/npx" /usr/local/bin/npx
  [[ -x "$dir/bin/corepack" ]] && ln -sf "$dir/bin/corepack" /usr/local/bin/corepack
  rm -f "$tarball"
  hash -r
  log "已安装 Node $(node -v) 到 $dir"
}

ensure_node() {
  local current=""
  current="$(command -v node 2>/dev/null || true)"
  if node_requirement_ok && [[ -n "$current" && "$current" != /root/* && "$current" != /home/* ]]; then
    log "Node 已满足: $(node -v)（$current）"
  else
    if [[ -n "$current" ]]; then
      log "现有 Node（$current）不满足要求或位于受限目录，安装系统级 Node 24"
    fi
    install_node
  fi
  node_requirement_ok || die "Node 版本仍不满足要求（需要 22.5+，推荐 24）"
  NODE_BIN="$(command -v node)"
}

detect_mysql_service() {
  local candidate
  for candidate in mysqld mysql mariadb; do
    if systemctl cat "$candidate.service" >/dev/null 2>&1; then
      MYSQL_SERVICE="$candidate"
      return 0
    fi
  done
  return 1
}

wait_mysql() {
  local i
  for ((i = 1; i <= 30; i += 1)); do
    if mysqladmin ping --silent >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

install_mysql() {
  command -v mysqld >/dev/null 2>&1 || [[ -x /usr/sbin/mysqld ]] || command -v mariadbd >/dev/null 2>&1 || [[ -x /usr/sbin/mariadbd ]] || return 1
}

ensure_mysql() {
  if ! install_mysql; then
    detect_pkg_manager
    log "安装 MySQL 8 Server ..."
    MYSQL_FRESH=1
    if ! pkg_install mysql-server; then
      warn "mysql-server 安装失败，尝试 MariaDB（协议兼容，但建议改用 MySQL 8）"
      pkg_install mariadb-server || die "MySQL 安装失败；请确认软件源可用后重试（dnf search mysql）"
    fi
    systemctl daemon-reload || true
  fi

  if [[ -x /usr/sbin/mysqld ]] && /usr/sbin/mysqld --version 2>/dev/null | grep -qi mariadb; then
    MYSQL_FLAVOR="mariadb"
  elif command -v mysqld >/dev/null 2>&1 && mysqld --version 2>/dev/null | grep -qi mariadb; then
    MYSQL_FLAVOR="mariadb"
  fi

  detect_mysql_service || die "未找到 MySQL/MariaDB 的 systemd 服务，请手动安装 MySQL 8 后重试"
  systemctl enable "$MYSQL_SERVICE" >/dev/null 2>&1 || true
  if ! systemctl is-active --quiet "$MYSQL_SERVICE"; then
    log "启动 MySQL 服务（$MYSQL_SERVICE）..."
    systemctl start "$MYSQL_SERVICE"
  fi
  wait_mysql || die "MySQL 未能在 60 秒内启动，请执行 journalctl -u $MYSQL_SERVICE -n 100 查看原因"

  if [[ "$MYSQL_FRESH" -eq 1 && "$MYSQL_FLAVOR" == "mysql" ]]; then
    configure_mysql_small_server
  fi
}

configure_mysql_small_server() {
  local dir=""
  if [[ -d /etc/my.cnf.d ]]; then
    dir="/etc/my.cnf.d"
  elif [[ -d /etc/mysql/mysql.conf.d ]]; then
    dir="/etc/mysql/mysql.conf.d"
  elif [[ -d /etc/mysql/conf.d ]]; then
    dir="/etc/mysql/conf.d"
  fi
  [[ -n "$dir" ]] || return 0
  local file="$dir/99-yinling.cnf"
  [[ -f "$file" ]] && return 0

  log "写入 MySQL 小内存配置（仅监听 127.0.0.1）"
  cat >"$file" <<'EOF'
[mysqld]
bind-address = 127.0.0.1
mysqlx-bind-address = 127.0.0.1
innodb_buffer_pool_size = 256M
performance_schema = OFF
max_connections = 50
EOF
  systemctl restart "$MYSQL_SERVICE"
  wait_mysql || die "MySQL 重启失败，请检查 $file 与 journalctl -u $MYSQL_SERVICE"
}

mysql_root_try() {
  local pass="$1"
  local tcp="$2"
  local args=(-uroot)
  (( tcp == 1 )) && args+=(-h127.0.0.1)
  if [[ -z "$pass" ]]; then
    env -u MYSQL_PWD mysql "${args[@]}" -e 'SELECT 1' >/dev/null 2>&1
  else
    MYSQL_PWD="$pass" mysql "${args[@]}" -e 'SELECT 1' >/dev/null 2>&1
  fi
}

try_mysql_root_password() {
  local pass="$1"
  if mysql_root_try "$pass" 0; then
    MYSQL_ROOT_TCP=0
    return 0
  fi
  if mysql_root_try "$pass" 1; then
    MYSQL_ROOT_TCP=1
    return 0
  fi
  return 1
}

mysql_root() {
  local args=(-uroot)
  (( MYSQL_ROOT_TCP == 1 )) && args+=(-h127.0.0.1)
  case "$ROOT_MODE" in
    password) MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql "${args[@]}" "$@" ;;
    temp) MYSQL_PWD="$MYSQL_TEMP_PASS" mysql "${args[@]}" "$@" ;;
    *) env -u MYSQL_PWD mysql "${args[@]}" "$@" ;;
  esac
}

detect_mysql_root() {
  command -v mysql >/dev/null 2>&1 || die "未找到 mysql 客户端；请先安装（dnf install -y mysql）"
  if [[ -n "${MYSQL_ROOT_PASSWORD:-}" ]]; then
    if try_mysql_root_password "$MYSQL_ROOT_PASSWORD"; then
      ROOT_MODE="password"
      return 0
    fi
    warn "环境变量 MYSQL_ROOT_PASSWORD 验证失败"
  fi
  if try_mysql_root_password ""; then
    ROOT_MODE="empty"
    return 0
  fi
  local temp=""
  temp="$(grep -hoE 'temporary password[^:]*: .*' /var/log/mysqld.log 2>/dev/null | tail -1 | awk '{print $NF}' || true)"
  if [[ -n "$temp" ]] && try_mysql_root_password "$temp"; then
    MYSQL_TEMP_PASS="$temp"
    ROOT_MODE="temp"
    warn "使用 MySQL 初始化临时密码完成建库；请尽快执行 mysql_secure_installation"
    return 0
  fi

  if [[ -t 0 ]]; then
    local attempt input
    for attempt in 1 2 3; do
      printf '[deploy] 请输入 MySQL root 密码（输入不回显，直接回车跳过）: ' >&2
      if ! IFS= read -r -s -p '' input; then
        printf '\n' >&2
        return 1
      fi
      printf '\n' >&2
      [[ -n "$input" ]] || return 1
      if try_mysql_root_password "$input"; then
        MYSQL_ROOT_PASSWORD="$input"
        ROOT_MODE="password"
        return 0
      fi
      warn "MySQL root 密码不正确，请重试（$attempt/3）"
    done
  fi
  return 1
}

ensure_mysql_db() {
  local db="$MYSQL_DATABASE"
  local user="$MYSQL_USER"
  local pass="$MYSQL_PASSWORD"

  if MYSQL_PWD="$pass" mysql -h127.0.0.1 -P3306 -u"$user" -e 'SELECT 1' "$db" >/dev/null 2>&1; then
    log "应用数据库账号已可用，跳过 root 建库"
    return 0
  fi

  detect_mysql_root || die "无法以 root 登录 MySQL；请确认 root 密码，或在非交互环境设置 MYSQL_ROOT_PASSWORD=... 后重试"

  mysql_root <<SQL
CREATE DATABASE IF NOT EXISTS \`$db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$user'@'localhost' IDENTIFIED BY '$pass';
ALTER USER '$user'@'localhost' IDENTIFIED BY '$pass';
CREATE USER IF NOT EXISTS '$user'@'127.0.0.1' IDENTIFIED BY '$pass';
ALTER USER '$user'@'127.0.0.1' IDENTIFIED BY '$pass';
GRANT ALL PRIVILEGES ON \`$db\`.* TO '$user'@'localhost';
GRANT ALL PRIVILEGES ON \`$db\`.* TO '$user'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

  local i
  for ((i = 1; i <= 10; i += 1)); do
    if MYSQL_PWD="$pass" mysql -h127.0.0.1 -P3306 -u"$user" -e 'SELECT 1' "$db" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  die "应用数据库账号无法通过 127.0.0.1 连接；请检查 MySQL bind-address 与账号权限"
}

ensure_env() {
  mkdir -p "$ENV_DIR"
  if [[ ! -s "$ENV_FILE" ]]; then
    cat >"$ENV_FILE" <<'EOF'
# 银龄守护生产环境配置（deploy.sh 生成）
# 修改后执行 systemctl restart yinling 生效；本文件含密钥，权限必须保持 600
EOF
    chmod 600 "$ENV_FILE"
    log "已创建 $ENV_FILE"
  fi
  if grep -q $'\r' "$ENV_FILE" 2>/dev/null; then
    sed -i 's/\r$//' "$ENV_FILE"
  fi

  local override_key
  for override_key in APP_PORT MYSQL_DATABASE MYSQL_USER MYSQL_PASSWORD DEMO_MODE; do
    if [[ -n "${!override_key:-}" ]]; then
      set_env "$override_key" "${!override_key}"
    fi
  done

  put_default APP_PORT 3100
  local port
  port="$(get_env APP_PORT)"
  case "$port" in
    ''|*[!0-9]*) port=3100 ;;
  esac
  set_env APP_PORT "$port"
  set_env PORT "$port"
  put_default HOST 0.0.0.0
  put_default LOG_LEVEL info
  set_env NODE_ENV production
  set_env DATA_DIR "$DATA_ROOT/data"
  set_env PUBLIC_DIR "$DATA_ROOT/public"
  set_env WEB_DIST_DIR "$INSTALL_DIR/frontend/dist"
  set_env DB_DRIVER mysql
  put_default DB_POOL_MAX 10
  put_default DB_SSL 0
  put_default RATE_LIMIT_ENABLED 1
  put_default DEMO_MODE 1

  if is_placeholder "$(get_env SESSION_SECRET)"; then
    set_env SESSION_SECRET "$(gen_hex 32)"
    log "已生成 SESSION_SECRET"
  fi
  if is_placeholder "$(get_env DEMO_RESET_TOKEN)"; then
    set_env DEMO_RESET_TOKEN "$(gen_hex 16)"
  fi

  local master
  master="$(get_env MASTER_KEY)"
  if is_placeholder "$master"; then
    set_env MASTER_KEY "$(gen_master_key)"
    log "已生成 MASTER_KEY（用于加密敏感字段，务必备份）"
  elif ! is_valid_master_key "$master"; then
    die "MASTER_KEY 不是 32 字节 base64；为避免历史数据无法解密，未自动覆盖。确认无需解密后可删除该行再重试"
  fi

  put_default MYSQL_DATABASE yinling
  put_default MYSQL_USER yinling
  local mysql_pass
  mysql_pass="$(get_env MYSQL_PASSWORD)"
  if is_placeholder "$mysql_pass"; then
    set_env MYSQL_PASSWORD "$(gen_hex 16)"
    log "已生成 MYSQL_PASSWORD"
  fi

  local base_url base_host=""
  if [[ -n "${APP_BASE_URL:-}" ]]; then
    base_url="$APP_BASE_URL"
  else
    base_url="$(get_env APP_BASE_URL)"
    if [[ "$base_url" =~ ^https?://([^/:]+) ]]; then
      base_host="${BASH_REMATCH[1]}"
    fi
    case "$base_url" in
      ""|*localhost*|*127.0.0.1*)
        base_url="$(detect_base_url "$port")"
        log "已推断访问地址: $base_url（如有域名可在 $ENV_FILE 修改 APP_BASE_URL）"
        ;;
      *)
        if [[ -n "$base_host" ]] && is_private_ipv4 "$base_host"; then
          base_url="$(detect_base_url "$port")"
          log "配置文件中的 $base_host 是内网地址，已改为: $base_url"
        fi
        ;;
    esac
  fi
  # 以 IP 访问时跟随 APP_PORT，避免改了端口后地址仍是旧端口
  if [[ "$base_url" =~ ^http://([0-9]{1,3}(\.[0-9]{1,3}){3}):[0-9]+$ ]]; then
    base_url="http://${BASH_REMATCH[1]}:${port}"
  fi
  set_env APP_BASE_URL "$base_url"
  case "$base_url" in
    https://*)
      set_env COOKIE_SECURE 1
      set_env TRUST_PROXY 1
      ;;
    *)
      set_env COOKIE_SECURE 0
      put_default TRUST_PROXY 0
      ;;
  esac
  put_default CORS_ORIGINS ""

  local key
  for key in DEEPSEEK_API_KEY QWEN_API_KEY ARK_API_KEY ARK_BASE_URL ARK_MODEL AMAP_WEB_KEY LLM_API_KEY LLM_BASE_URL LLM_MODEL; do
    if [[ -n "${!key:-}" && -z "$(get_env "$key")" ]]; then
      set_env "$key" "${!key}"
    fi
  done

  chmod 600 "$ENV_FILE"
  chown root:root "$ENV_FILE" 2>/dev/null || true
}

load_settings() {
  APP_PORT="$(get_env APP_PORT)"
  APP_PORT="${APP_PORT:-3100}"
  APP_BASE_URL="$(get_env APP_BASE_URL)"
  MYSQL_DATABASE="$(get_env MYSQL_DATABASE)"
  MYSQL_USER="$(get_env MYSQL_USER)"
  MYSQL_PASSWORD="$(get_env MYSQL_PASSWORD)"
  DEMO_MODE="$(get_env DEMO_MODE)"
  SESSION_SECRET_VALUE="$(get_env SESSION_SECRET)"
}

validate_env() {
  [[ "$APP_PORT" =~ ^[0-9]+$ ]] || die "APP_PORT 必须是数字"
  (( APP_PORT >= 1 && APP_PORT <= 65535 )) || die "APP_PORT 必须在 1-65535 之间"
  [[ -n "${SESSION_SECRET_VALUE:-}" && ${#SESSION_SECRET_VALUE} -ge 32 ]] || die "SESSION_SECRET 至少需要 32 个字符"
  [[ "${MYSQL_PASSWORD:-}" =~ ^[A-Za-z0-9._~-]+$ ]] || die "MYSQL_PASSWORD 只能包含字母、数字和 ._~-（会被拼进 DATABASE_URL）"
  [[ "${MYSQL_DATABASE:-}" =~ ^[A-Za-z0-9_]+$ ]] || die "MYSQL_DATABASE 只能包含字母、数字和下划线"
  [[ "${MYSQL_USER:-}" =~ ^[A-Za-z0-9_]+$ ]] || die "MYSQL_USER 只能包含字母、数字和下划线"
  [[ "${APP_BASE_URL:-}" =~ ^https?:// ]] || die "APP_BASE_URL 必须以 http:// 或 https:// 开头"
  [[ "${DEMO_MODE:-1}" == "0" || "${DEMO_MODE:-1}" == "1" ]] || die "DEMO_MODE 只能是 0 或 1"
}

set_database_url() {
  local url="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@127.0.0.1:3306/${MYSQL_DATABASE}"
  set_env DATABASE_URL "$url"
}

container_port_mapping() {
  local tool output
  for tool in podman docker; do
    command -v "$tool" >/dev/null 2>&1 || continue
    output="$("$tool" ps --format '{{.Names}} {{.Ports}}' 2>/dev/null || true)"
    [[ -n "$output" ]] || continue
    if printf '%s\n' "$output" | grep -Eq "(^|[^0-9])${APP_PORT}([^0-9]|$)"; then
      printf '%s\n' "$output" | grep -E "(^|[^0-9])${APP_PORT}([^0-9]|$)" | head -1
      return 0
    fi
  done
  return 1
}

check_port() {
  local mapping
  mapping="$(container_port_mapping || true)"
  if [[ -n "$mapping" ]]; then
    die "端口 ${APP_PORT} 已被容器占用：$mapping；请改 $ENV_FILE 中的 APP_PORT 后重试"
  fi
  command -v ss >/dev/null 2>&1 || return 0
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${APP_PORT}$" || return 0
  if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    return 0
  fi
  die "端口 ${APP_PORT} 已被占用；请改 $ENV_FILE 中的 APP_PORT 后重试"
}

sync_source() {
  if [[ "$SOURCE_DIR" == "$INSTALL_DIR" ]]; then
    return 0
  fi
  log "同步代码到 $INSTALL_DIR"
  command -v rsync >/dev/null 2>&1 || die "缺少 rsync"
  mkdir -p "$INSTALL_DIR"
  rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude 'dist' \
    --exclude 'backups' \
    --exclude '*.log' \
    --exclude 'apps/api/data' \
    --exclude 'apps/api/public/uploads' \
    "$SOURCE_DIR"/ "$INSTALL_DIR"/
}

native_pkg_ok() {
  local name="$1"
  local version="$2"
  local file="node_modules/${name}/package.json"
  [[ -n "$version" && -f "$file" ]] || return 1
  [[ "$(node -p "require('./${file}').version" 2>/dev/null)" == "$version" ]]
}

ensure_native_deps() {
  [[ "$(uname -s)" == "Linux" ]] || return 0

  local rollup_pkg esbuild_pkg sharp_pkg libvips_pkg
  case "$(uname -m)" in
    x86_64|amd64)
      rollup_pkg="@rollup/rollup-linux-x64-gnu"
      esbuild_pkg="@esbuild/linux-x64"
      sharp_pkg="@img/sharp-linux-x64"
      libvips_pkg="@img/sharp-libvips-linux-x64"
      ;;
    aarch64|arm64)
      rollup_pkg="@rollup/rollup-linux-arm64-gnu"
      esbuild_pkg="@esbuild/linux-arm64"
      sharp_pkg="@img/sharp-linux-arm64"
      libvips_pkg="@img/sharp-libvips-linux-arm64"
      ;;
    *)
      return 0
      ;;
  esac

  local rollup_ver esbuild_ver sharp_ver libvips_ver
  rollup_ver="$(node -p "require('rollup/package.json').optionalDependencies['$rollup_pkg'] || ''" 2>/dev/null || true)"
  esbuild_ver="$(node -e "const p=require('path');const v=require.resolve('vite/package.json');const e=require.resolve('esbuild/package.json',{paths:[p.dirname(v)]});console.log(require(e).version)" 2>/dev/null || true)"
  sharp_ver="$(node -p "require('sharp/package.json').optionalDependencies['$sharp_pkg'] || ''" 2>/dev/null || true)"
  libvips_ver="$(node -p "require('sharp/package.json').optionalDependencies['$libvips_pkg'] || ''" 2>/dev/null || true)"

  local missing=()
  if [[ -n "$rollup_ver" ]] && ! native_pkg_ok "$rollup_pkg" "$rollup_ver"; then
    missing+=("$rollup_pkg@$rollup_ver")
  fi
  if [[ -n "$esbuild_ver" ]]; then
    if ! native_pkg_ok "$esbuild_pkg" "$esbuild_ver" \
      && ! native_pkg_ok "vite/node_modules/esbuild/node_modules/$esbuild_pkg" "$esbuild_ver"; then
      missing+=("$esbuild_pkg@$esbuild_ver")
    fi
  fi
  if [[ -n "$sharp_ver" ]] && ! native_pkg_ok "$sharp_pkg" "$sharp_ver"; then
    missing+=("$sharp_pkg@$sharp_ver")
  fi
  if [[ -n "$libvips_ver" ]] && ! native_pkg_ok "$libvips_pkg" "$libvips_ver"; then
    missing+=("$libvips_pkg@$libvips_ver")
  fi

  (( ${#missing[@]} > 0 )) || return 0

  log "补齐 Linux 原生依赖：${missing[*]}"
  npm install --no-save --no-package-lock --no-audit --no-fund --registry "$NPM_REGISTRY" "${missing[@]}" \
    || die "Linux 原生依赖安装失败"

  node -e "require('rollup'); require('sharp'); const p=require('path'); const v=require.resolve('vite/package.json'); require(require.resolve('esbuild',{paths:[p.dirname(v)]}));" >/dev/null 2>&1 \
    || die "Linux 原生依赖补齐后仍无法加载 rollup/sharp/esbuild"
}

build_app() {
  cd "$INSTALL_DIR"
  export PATH="/usr/local/bin:$PATH"
  export NODE_OPTIONS="--max-old-space-size=1024"
  export npm_config_update_notifier=false
  hash -r

  log "安装 npm 依赖（首次约 2-5 分钟）..."
  npm ci --include=dev --no-audit --no-fund --registry "$NPM_REGISTRY" \
    || die "npm ci 失败；可设置 NPM_REGISTRY 后重试"

  ensure_native_deps

  log "构建共享包与 API ..."
  npm run build:packages || die "共享包构建失败"
  npm run build -w apps/api || die "API 构建失败"

  log "构建前端 ..."
  npm run build -w frontend || die "前端构建失败"
  [[ -f "$INSTALL_DIR/apps/api/dist/index.js" ]] || die "未找到 apps/api/dist/index.js"
  [[ -f "$INSTALL_DIR/frontend/dist/index.html" ]] || die "未找到 frontend/dist/index.html"
}

write_service() {
  local mysql_after=""
  [[ -n "$MYSQL_SERVICE" ]] && mysql_after=" ${MYSQL_SERVICE}.service"

  log "写入 systemd 服务 /etc/systemd/system/${SERVICE_NAME}.service"
  cat >"/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Yinling Shouhu AI companion API
After=network-online.target${mysql_after}
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}/apps/api
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} dist/index.js
Restart=always
RestartSec=3
TimeoutStopSec=20
LimitNOFILE=65535
Environment=NODE_OPTIONS=--max-old-space-size=768
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${DATA_ROOT}
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
}

start_service() {
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
  systemctl restart "$SERVICE_NAME"
}

probe_ready() {
  curl --noproxy '*' -fsS --max-time 3 "http://127.0.0.1:${APP_PORT}/ready" >/dev/null 2>&1
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
  curl --noproxy '*' -fsS "http://127.0.0.1:${APP_PORT}/ready"
}

open_firewall() {
  if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
    firewall-cmd --permanent --add-port="${APP_PORT}/tcp" >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
  fi
}

backup_once() {
  local dir="$BACKUP_DIR/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$dir"
  chmod 700 "$dir"
  log "备份数据到 $dir"

  cp "$ENV_FILE" "$dir/env.backup"
  chmod 600 "$dir/env.backup"

  if command -v mysqld >/dev/null 2>&1 && mysqld --version 2>/dev/null | grep -qi mariadb; then
    MYSQL_FLAVOR="mariadb"
  elif [[ -x /usr/sbin/mysqld ]] && /usr/sbin/mysqld --version 2>/dev/null | grep -qi mariadb; then
    MYSQL_FLAVOR="mariadb"
  fi

  local dump_opts=(--single-transaction --quick --default-character-set=utf8mb4)
  if [[ "$MYSQL_FLAVOR" != "mariadb" ]]; then
    dump_opts+=(--no-tablespaces --set-gtid-purged=OFF)
  fi
  if ! MYSQL_PWD="$MYSQL_PASSWORD" mysqldump -h127.0.0.1 -P3306 -u"$MYSQL_USER" "${dump_opts[@]}" "$MYSQL_DATABASE" 2>"$dir/dump.err" | gzip >"$dir/db.sql.gz"; then
    warn "mysqldump 失败：$(cat "$dir/dump.err" 2>/dev/null | tail -3)"
    rm -rf -- "$dir"
    return 1
  fi
  rm -f "$dir/dump.err"

  local items=()
  [[ -d "$DATA_ROOT/data" ]] && items+=(data)
  [[ -d "$DATA_ROOT/public" ]] && items+=(public)
  if (( ${#items[@]} > 0 )); then
    tar -czf "$dir/files.tar.gz" -C "$DATA_ROOT" "${items[@]}" 2>/dev/null || warn "数据目录打包失败"
  fi

  cat >"$dir/README.txt" <<EOF
备份时间: $(date '+%Y-%m-%d %H:%M:%S')
数据库: ${MYSQL_DATABASE} / ${MYSQL_USER}
文件: db.sql.gz、files.tar.gz、env.backup（含密钥，注意保管）

恢复步骤:
1. systemctl stop ${SERVICE_NAME}
2. gunzip < db.sql.gz | mysql -h127.0.0.1 -u${MYSQL_USER} -p ${MYSQL_DATABASE}
3. tar -xzf files.tar.gz -C ${DATA_ROOT}
4. cp env.backup ${ENV_FILE} && chmod 600 ${ENV_FILE}
5. systemctl start ${SERVICE_NAME}
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

print_summary() {
  local flavor_label="MySQL 8"
  [[ "$MYSQL_FLAVOR" == "mariadb" ]] && flavor_label="MariaDB"
  printf '\n'
  log "部署完成"
  printf '  访问地址: %s\n' "$APP_BASE_URL"
  printf '  本机就绪: http://127.0.0.1:%s/ready\n' "$APP_PORT"
  printf '  安装目录: %s\n' "$INSTALL_DIR"
  printf '  配置文件: %s（600）\n' "$ENV_FILE"
  printf '  数据目录: %s\n' "$DATA_ROOT"
  printf '  备份目录: %s（保留最近 5 份）\n' "$BACKUP_DIR"
  printf '  数据库: %s / 库 %s / 用户 %s（应用连接 127.0.0.1）\n' "$flavor_label" "$MYSQL_DATABASE" "$MYSQL_USER"
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
  printf '  ./deploy.sh restart   重启服务\n'
  printf '  ./deploy.sh stop      停止服务\n'
  printf '\n注意: 阿里云安全组需放行 TCP %s，否则公网无法访问\n' "$APP_PORT"
}

do_deploy() {
  require_root
  ensure_base_packages
  ensure_swap
  ensure_node
  ensure_service_user
  ensure_dirs
  ensure_env
  load_settings
  validate_env
  check_port
  ensure_mysql
  ensure_mysql_db
  set_database_url

  local first_deploy=0
  [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]] || first_deploy=1

  if [[ "$first_deploy" -eq 0 && "$SKIP_BACKUP" -eq 0 ]]; then
    backup_once || die "自动备份失败，已停止部署；修复后重试，或加 --no-backup 跳过"
  fi

  sync_source

  if [[ "$NO_BUILD" -eq 0 ]]; then
    build_app
  else
    log "跳过依赖安装与构建"
    [[ -f "$INSTALL_DIR/apps/api/dist/index.js" ]] || die "未找到已构建的 apps/api/dist/index.js，不能使用 --no-build"
    [[ -f "$INSTALL_DIR/frontend/dist/index.html" ]] || die "未找到已构建的 frontend/dist/index.html，不能使用 --no-build"
  fi

  write_service
  open_firewall
  start_service

  if ! wait_ready; then
    warn "服务未在 180 秒内就绪，本机 /ready 响应如下："
    curl --noproxy '*' -i --max-time 3 "http://127.0.0.1:${APP_PORT}/ready" || true
    printf '\n'
    warn "最近日志如下："
    systemctl --no-pager -l status "$SERVICE_NAME" || true
    journalctl -u "$SERVICE_NAME" -n 120 --no-pager || true
    die "部署失败；修复后重新执行 bash deploy.sh"
  fi

  print_summary
}

do_check() {
  local os_name
  os_name="$(awk -F= '/^PRETTY_NAME=/ {gsub(/"/, "", $2); print $2; exit}' /etc/os-release 2>/dev/null || true)"
  log "系统: ${os_name:-unknown}（内核 $(uname -r)）"
  log "架构: $(uname -m)"
  if command -v nproc >/dev/null 2>&1; then
    log "CPU: $(nproc) 核"
  fi
  if command -v free >/dev/null 2>&1; then
    log "内存: $(free -h | awk 'NR==2 {print $2" 总 / "$7" 可用"}')"
    log "Swap: $(free -h | awk 'NR==3 {print $2}')"
  fi
  log "磁盘: $(df -h / | awk 'NR==2 {print $4" 可用 / "$2" 总"}')"

  if node_requirement_ok; then
    log "Node: $(node -v)（$(command -v node)）"
  else
    warn "Node: 未安装或低于 22.5（deploy 会自动安装 Node 24）"
  fi

  if command -v mysqld >/dev/null 2>&1 || [[ -x /usr/sbin/mysqld ]]; then
    local mysql_ver="unknown"
    if command -v mysqld >/dev/null 2>&1; then
      mysql_ver="$(mysqld --version 2>/dev/null | head -1)"
    else
      mysql_ver="$(/usr/sbin/mysqld --version 2>/dev/null | head -1)"
    fi
    log "MySQL: $mysql_ver"
    if detect_mysql_service; then
      log "MySQL 服务: $MYSQL_SERVICE（$(systemctl is-active "$MYSQL_SERVICE" 2>/dev/null || true)）"
      log "MySQL 监听: $(ss -ltn 2>/dev/null | awk '$4 ~ /:3306$/ {print $4}' | paste -sd, - || true)"
    else
      warn "MySQL: 已安装但未找到 systemd 服务"
    fi
  else
    warn "MySQL: 未安装（deploy 会自动安装）"
  fi

  if [[ -f "$ENV_FILE" ]]; then
    load_settings
    log "配置文件: $ENV_FILE（600）"
    log "APP_BASE_URL: ${APP_BASE_URL:-未设置}"
    log "APP_PORT: ${APP_PORT:-未设置}"
    log "数据库: ${MYSQL_DATABASE:-未设置} / ${MYSQL_USER:-未设置}"
    log "SESSION_SECRET: ${#SESSION_SECRET_VALUE} 字符"
    log "DEMO_MODE: ${DEMO_MODE:-未设置}"
  else
    warn "配置文件尚不存在（首次执行 deploy 时生成）"
  fi

  if systemctl cat "$SERVICE_NAME.service" >/dev/null 2>&1; then
    log "应用服务: $(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)（开机自启：$(systemctl is-enabled "$SERVICE_NAME" 2>/dev/null || true)）"
  else
    log "应用服务: 尚未安装"
  fi

  if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${APP_PORT:-3100}$"; then
    log "端口 ${APP_PORT:-3100}: 已被监听"
  else
    log "端口 ${APP_PORT:-3100}: 空闲"
  fi

  if systemctl is-active --quiet firewalld 2>/dev/null; then
    log "firewalld: 运行中"
  else
    log "firewalld: 未运行（仍需在阿里云安全组放行端口）"
  fi
}

do_status() {
  systemctl --no-pager -l status "$SERVICE_NAME" || true
  printf '\n'
  load_settings
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
  exec journalctl -u "$SERVICE_NAME" -f -n 200 --no-pager
}

do_backup() {
  require_root
  load_settings
  validate_env
  command -v mysqldump >/dev/null 2>&1 || die "未找到 mysqldump"
  backup_once || die "备份失败"
  log "备份完成: $LAST_BACKUP"
}

do_restart() {
  require_root
  load_settings
  validate_env
  systemctl restart "$SERVICE_NAME"
  wait_ready || die "服务重启后未就绪，请执行 ./deploy.sh logs 查看日志"
  print_summary
}

do_stop() {
  require_root
  systemctl stop "$SERVICE_NAME"
  log "应用已停止；MySQL 与数据目录保留"
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
    --force-deps)
      FORCE_DEPS=1
      ;;
    deploy|up|check|status|logs|backup|restart|stop)
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

case "$COMMAND" in
  deploy|up) do_deploy ;;
  check) do_check ;;
  status) do_status ;;
  logs) do_logs ;;
  backup) do_backup ;;
  restart) do_restart ;;
  stop) do_stop ;;
esac
