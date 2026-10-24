# 共享类型副本

本目录是仓库根目录 `packages/shared/src` 的副本，让 `frontend/` 可以脱离 monorepo 独立安装与构建。

- 仓库内契约以 `packages/shared` 为准；修改后运行 `npm run sync:frontend-shared`。
- 独立接手本目录后，可直接在这里维护前端所需类型。
