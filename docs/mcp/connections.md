# Підключення MCP-серверів LeadDesk (Task B)

- **Акаунти** (особисті чи одноразові, без клієнтських організацій і команд): Supabase — особистий
  акаунт, одноразовий проєкт `exnqosobpbvxnocfabaw` лише для цієї домашки · Vercel — особистий
  акаунт на плані Hobby, без команд (`list_teams` повернув порожній список) · Figma — не
  використовували
- **Третій сервер:** Playwright. Він не потребує акаунта й квоти (у Figma на Starter 20 викликів на
  місяць), а перевіряє сам застосунок — форму заявки на `localhost:3000`. Для Figma довелось би
  заводити власний файл із макетом, якого в проєкті немає.
- **Vercel CLI на цій машині:** не встановлено (`command -v vercel` нічого не знаходить), тож
  `vercel whoami` виконати нічим. Гілки «`use_vercel_cli` → `Bash` → `vercel …` під токеном CLI»
  тут немає. Сам `Bash` лишається відкритим, див. `docs/mcp/threat-model.md`.
- **Як проводились сесії:** кожен крок — нова сесія Claude Code (2.1.296 через Agent SDK) з рівно
  одним сервером із `.mcp.json` (`strictMcpConfig`, конектори claude.ai вимкнено). Кожен запит на
  схвалення читав і вирішував окремо агент-оператор, без «Always allow». Деталі — у
  `docs/mcp/verification.md`, розділ Task B.

## Сервери

| Сервер | Який доступ | Навіщо нам | Що станеться при компрометації | Чим саме звужено |
|---|---|---|---|---|
| `supabase` | 9 інструментів одного проєкту. `database`: `list_tables`, `list_extensions`, `list_migrations`, `apply_migration`, `execute_sql`. `development`: `get_project_url`, `get_publishable_keys`, `generate_typescript_types`. `docs`: `search_docs`. `execute_sql` читає й пише будь-яку таблицю проєкту під роллю `postgres` (не суперкористувач, але власник `leads`, тож RLS її не обмежує — перевірено запитом `select current_user…`) | Міграція схеми й сид 20 лідів для Task C. У самому Task C прогін A йде через окремий URL `read_only=true&features=database,docs` (5 інструментів) | OAuth-токен — це розробник Supabase. З іншим URL він дістає всі організації й проєкти акаунта. З цим URL — прочитати, змінити чи видалити всі дані проєкту, зокрема імена, email і тексти заявок, і змінити схему | `project_ref=` — зі схем інструментів зникає `project_id`, інших проєктів агент не дістане. `features=database,development,docs` — немає `account` (`list_organizations`, `list_projects`, `create_project`…), `functions` (канал назовні), `branching` (платне), `storage`, `debugging`. `read_only=true` тут свідомо не стоїть, бо прибрав би `apply_migration`. `execute_sql` і `apply_migration` не в `allow`: кожен виклик схвалюється окремо. В `allow` — лише `search_docs`, `list_tables`, `list_migrations` |
| `vercel` | Увесь користувач Vercel: OAuth-скоуп один (`openid`). У сесії після deny — **229 інструментів**, з них приблизно 82 змінюють стан: `create_deployment`, `request_promote`, `request_rollback`, `pause_project`, `create_project_env`, `edit_project_env`, `create_or_transfer_domain`, `patch_url_protection_bypass`, `update_firewall_config`, `run_session_command`, `upload_file`… І ще читання секретів: `get_project_env`, `get_shared_env_var`. На практиці наш токен отримав 403 на деталі деплою й події білду в скоупі особистого акаунта, а перелік деплоїв читав | Лог білду деплою LeadDesk (`docs/mcp/evidence/vercel-build-log.txt`) | Деплой, промоут чи відкат продакшну, читання й заміна змінних оточення (секрети), купівля чи перенесення домену з картки, обхід Deployment Protection, зміна firewall — від імені власника акаунта | Звузити в URL нічим: є лише `https://mcp.vercel.com`. **deny на 11 інструментів з walkthrough** (`buy_*`, `deploy_to_vercel`, `get_access_to_vercel_url`, `import-claude-design-from-url`, 4 toolbar) — жодного з цих імен у сесії вже немає: Vercel змінив набір. Тому **додали 34 шаблони deny за дієсловом** (`create_*`, `update_*`, `edit_*`, `patch_*`, `put_*`, `request_*`, `run_*`, `upload_*`, `pause_*`…) і 7 точних імен, що віддають секрети чи посилання на видалення (`get_project_env`, `get_shared_env_var`, `filter_project_envs`, `get_edge_config_token(s)`, `list_feature_flag_sdk_keys`, `get_project_deletion_link`). Шаблони перевірено на списку з сесії: 229 → **141** інструмент, усі лише читають (нова сесія підтвердила). В `allow` — лише `list_deployments`, `get_deployment`, `get_deployment_build_logs`. Vercel CLI не встановлено |
| `playwright` | Браузер Chrome на цій машині: відкрити сторінку, клікати, вводити, знімок сторінки, консоль, перелік запитів і (з питанням) заголовки й тіла запитів. Після deny — 21 інструмент | Перевірка форми заявки на `http://localhost:3000` (`docs/mcp/evidence/playwright-form-check.md`) | Токена немає. Але хто керує сесією (зокрема текст на сторінці, тобто prompt injection), може відкрити будь-яку адресу з даними в query (`--allowed-origins` — не межа безпеки), відправити дані в чужу форму, прочитати cookie поточної сесії. З `browser_run_code_unsafe` — довільний код у процесі сервера (закрито deny) | `@playwright/mcp@0.0.82` (точна версія), `--isolated` (профіль лише в пам'яті), `--no-webmcp`, `--allowed-origins http://localhost:3000`. deny: `browser_run_code_unsafe`, `webmcp_*`, `browser_file_upload`, `browser_drop`, `browser_evaluate`. `allow` — лише 10 точних імен для перевірки форми. `browser_network_request` — ні в allow, ні в deny: щоразу питає |
| `leaddesk` (Task A, скоуп `local`, не в `.mcp.json`) | Два дієслова над 20 лідами фікстури: `leaddesk_find_leads` (6 полів, без імені, email і тексту) і `leaddesk_set_lead_status` (статус лише з переліку, запис аудиту); ресурс статусів | Прогін B у Task C; надалі — доступ команди клієнта до лідів без SQL | Змінити статус будь-якого ліда в пам'яті процесу (з записом аудиту). Персональних даних сервер не віддає, а в мережу не ходить | Сервер сам по собі вузький контракт. Підключено лише в теці прогону B; `leaddesk_set_lead_status` не в `allow`, кожна зміна з апрувом |

## Supabase: схема й сид

- Міграція `supabase/migrations/0001_leaddesk.sql` створює таблицю `public.leads`: `id` (text, PK),
  `full_name`, `company`, `email`, `source`, `status` (`check` на `new`, `contacted`, `qualified`,
  `won`, `lost`; за замовчуванням `new`), `budget` (integer, null дозволено), `message`, `created_at`
  (timestamptz). RLS увімкнено. У Supabase застосовано як міграцію `leaddesk`, версія `20261013075524`.
- Сид `supabase/seed/leads.sql`: 20 рядків, `lead_0001`–`lead_0020`, ті самі, що в `materials/leads.json`.
  Перевірено скриптом: кожне поле кожного рядка збігається з JSON. База після сиду: 20 рядків, 3 без
  бюджету, сума бюджетів 42500, за статусами new 6, contacted 4, qualified 3, won 5, lost 2 — так
  само, як у JSON.
- Скільки інструментів Supabase видно з цим URL: **9** (у прогоні A з URL «client» — 5).
- Якими викликами створено схему й дані і що схвалювали вручну:
  - `list_tables` і `list_migrations` — без запиту, бо вони в `allow`; база була порожня.
  - `Write` файлу міграції; `Bash` з генератором сиду на Python (читає `materials/leads.json`, пише
    `supabase/seed/leads.sql`) — обидва схвалено після читання.
  - Агент сам зупинився перед зміною бази й попросив «так» у чаті, як вимагає `AGENTS.md`.
  - `apply_migration` (`leaddesk`) — схвалено: SQL збігся з файлом міграції.
  - `execute_sql` з `insert` — схвалено: текст запиту програмно звірено з `supabase/seed/leads.sql`,
    збігся до символу.
  - Ще два `execute_sql`, лише читання: перевірка кількості, сум і RLS і запит ролі. Схвалено.
  - Нічого не відхиляли.

## Сесії: що вмикаємо разом

У кожній сесії — щонайбільше один сервер із правом запису; браузерний сервер — ніколи разом із Supabase.

| Крок | Увімкнено в `/mcp` | Сервер із правом запису в цій сесії |
|---|---|---|
| Міграція й сид | `supabase` | `supabase` |
| Лог білду | `vercel` | — сесії логу йшли ще з 11 deny, і записуючі лишались відкриті, але жодного не викликали. Після розширення deny записуючих у сесії немає |
| Знімок «до» / «після» третього сервера | `playwright` | — (нічого не викликали) |
| Перевірка форми в браузері | `playwright` (Supabase вимкнено) | `playwright` |
| Task C, прогін A | `supabase` (`read_only=true&features=database,docs`) | — (лише читання) |
| Task C, прогін B | `leaddesk` | `leaddesk` |

## До і після звуження: третій сервер

- Як отримали перелік: нова сесія з одним `playwright`, запит «Перелічи всі інструменти сервера
  playwright, які тобі зараз доступні. Нічого не викликай.» Джерело — відповідь агента.
- `docs/mcp/evidence/mcp-before.txt`: **25** інструментів
- `docs/mcp/evidence/mcp-after.txt`: **21** інструмент; зникли: `browser_run_code_unsafe`,
  `browser_evaluate`, `browser_file_upload`, `browser_drop`. `webmcp_*` не було і «до»: їх вимикає
  `--no-webmcp`, а deny на `webmcp_*` — друга лінія на випадок, якщо прапорець зникне.
