# LeadDesk MCP server

Доменний MCP-сервер LeadDesk (Task A): агенту — два бізнес-дієслова замість SQL на всю базу.
Працює офлайн на `fixtures/leads.json` (незмінна копія `materials/leads.json`, 20 лідів
`lead_0001`–`lead_0020`). Зміни статусів і записи аудиту живуть у пам'яті процесу, файл фікстури
сервер ніколи не переписує: після перезапуску дані знову ті самі.

| Що | Тип | Що робить |
|---|---|---|
| `leaddesk_find_leads` | інструмент, `readOnlyHint: true` | ліди за статусом (`new`…`lost` або `any`), найновіші першими; лише `id`, `company`, `status`, `source`, `budget`, `createdAt` і `total` |
| `leaddesk_set_lead_status` | інструмент, `readOnlyHint: false` | змінює статус одного ліда й повертає запис аудиту `{ action, leadId, at, from, to, reason }`; невідомий лід і той самий статус — `isError: true` |
| `leaddesk://reference/statuses` | ресурс, `text/markdown` | п'ять статусів і що кожен означає для команди: коли ставимо, хто ставить |

| Файл | Що в ньому |
|---|---|
| `src/leaddesk.mjs` | фабрика сервера: дані, два інструменти, ресурс |
| `src/server.mjs` | вхід stdio: `serveStdio(factory)` — його запускають Claude Code й Inspector |
| `src/http.mjs` | вхід HTTP (бонус E1): та сама фабрика, гварди Host і Origin, лише `127.0.0.1:3333` |

## Запуск

Сервер — Node.js ≥ 20 (вимога SDK); Inspector 2.8.0 — Node.js ≥ 22.19.

```bash
cd mcp/leaddesk-server
npm ci                    # точні версії з package-lock.json
npm start                 # stdio: чекає клієнта на stdin, зупинка — Ctrl+C
```

Змінна оточення одна, необов'язкова: `LEADDESK_FIXTURE` — шлях до іншої копії фікстури. Без неї
шлях рахується від самого модуля (`../fixtures/leads.json`), тож сервер працює з будь-якої теки.

## Перевірка Inspector'ом

З кореня репозиторію (кожен виклик запускає сервер заново, стан щоразу чистий):

```bash
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs --method tools/list
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method tools/call --tool-name leaddesk_find_leads --tool-arg status=qualified
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method tools/call --tool-name leaddesk_set_lead_status \
  --tool-arg leadId=lead_0002 --tool-arg status=contacted --tool-arg "reason=перевірка в Inspector"
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method resources/read --uri leaddesk://reference/statuses
```

`isError: true` у відповіді — Inspector виходить з кодом 5; для поганого входу це очікувано.
Збережений вивід — у `docs/mcp/*.json`.

## Підключення до Claude Code

Скоуп `local` (за замовчуванням): сервер бачите лише ви і лише в цій теці, у git нічого не
потрапляє. Шлях — абсолютний:

```bash
claude mcp add leaddesk -- node "/абсолютний/шлях/до/репо/mcp/leaddesk-server/src/server.mjs"
```

У новій сесії `/mcp` покаже `leaddesk` із двома інструментами. Прибрати — `claude mcp remove leaddesk`.
`leaddesk_set_lead_status` змінює дані: в `allow` його не додаємо, кожен виклик людина схвалює вручну.

## HTTP (бонус E1)

```bash
npm run start:http        # http://127.0.0.1:3333/mcp
```

Гварди `localhostHostValidation()` і `localhostOriginValidation()` викликано в обробнику запиту до
MCP-обробника: підроблений `Host` чи `Origin` отримує 403. Перевірка `curl` — у
`docs/mcp/verification.md`, розділ «Task E».
