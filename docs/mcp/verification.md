# Перевірка (Task A, Task B, бонус E)

- **Інструмент і версія, модель:** Claude Code 2.1.92 · Claude Opus 5.5
- **ОС і термінал, Node:** macOS 27.0.1 · zsh (команди Inspector'а й `curl` запускались через `bash`) ·
  Node 24.15.0 (nvm) для Inspector'а; системний Node 20.10.0 нижчий за 22.19, яких вимагає
  Inspector 2.8.0, тож для Inspector'а його не брали. Сам сервер перевірено й на 20.10.0, див. нижче

## Task A — сервер в Inspector

- **Команди**, якими зроблено чотири файли в `docs/mcp/`, — дослівно з walkthrough (Task A, крок 4),
  з кореня репозиторію, з `PATH`, де першим стоїть Node 24.15.0:

  ```bash
  npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
    --method tools/list > docs/mcp/tools-list.json                                          # exit=0
  npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
    --method tools/call --tool-name leaddesk_set_lead_status \
    --tool-arg leadId=lead_0002 --tool-arg status=contacted --tool-arg "reason=перевірка в Inspector" > docs/mcp/set-status.json   # exit=0
  npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
    --method tools/call --tool-name leaddesk_set_lead_status \
    --tool-arg leadId=nope --tool-arg status=won --tool-arg reason=ok > docs/mcp/bad-input.json   # exit=5
  npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
    --method resources/read --uri leaddesk://reference/statuses > docs/mcp/resource-read.json   # exit=0
  ```

- **`tools-list.json`:** рівно два інструменти. `leaddesk_find_leads` — `{"readOnlyHint":true,"openWorldHint":false}`;
  `leaddesk_set_lead_status` — `{"readOnlyHint":false,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false}`.
  У кожного параметра є `description` (текст із `.describe(…)`): модель бачить, що `status` у пошуку
  приймає `any`, що `limit` — від 1 до 50 і за замовчуванням 10, що `leadId` має формат `lead_0001`
  і що робити, коли id невідомий, що `reason` потрапляє в аудит. У схемі видно `enum` статусів,
  `pattern` `^lead_\d{4}$`, `minLength`/`maxLength` для `reason`. Обов'язкові поля:
  `status` у пошуку; `leadId`, `status`, `reason` у зміні.
- **`bad-input.json`:** зламано `leadId=nope`. SDK відхилив вхід ще до обробника і повернув
  `"isError": true` з текстом валідації: `leadId: Ідентифікатор ліда має формат lead_0001: lead_ і
  чотири цифри` (повідомлення з нашої схеми). Друга помилка в тій самій відповіді —
  `reason: Too small: expected string to have >=3 characters`: `reason=ok` з walkthrough має 2
  символи, а схема вимагає 3–500. Inspector завершився з кодом **5** і надрукував у stderr
  `{"error":{"code":"tool_is_error","message":"Tool 'leaddesk_set_lead_status' returned isError:true."}}`.
- **`set-status.json`:** `lead_0002` (Rynok Books) `new` → `contacted`. У `structuredContent` —
  новий стан ліда (лише `id`, `company`, `status`, `source`, `budget`, `createdAt`) і запис аудиту:

  ```json
  { "action": "lead.status_changed", "leadId": "lead_0002", "at": "2026-10-13T06:47:17.144Z",
    "from": "new", "to": "contacted", "reason": "перевірка в Inspector" }
  ```

  `action` названо за зразком застосунку (`logAudit("lead.created", …)` в `app/actions.ts`); поля
  `from`, `to`, `reason` — понад мінімум `{ action, leadId, at }` з `AuditEntry`. У stderr сервер
  пише лише `leaddesk: lead_0002 new -> contacted`, без персональних даних.
- **`resource-read.json`:** `leaddesk://reference/statuses`, `"mimeType": "text/markdown"`, таблиця
  п'яти статусів: що означає, коли ставимо, хто ставить.
- **Інші виклики** (окремі запуски Inspector'а, у файли не збережено), усі з `isError: true` і кодом 5:
  - невідомий лід `lead_9999` → `Лід lead_9999 не знайдено, нічого не змінено. Знайди правильний
    ідентифікатор через leaddesk_find_leads (status: "any") і повтори виклик.`
  - той самий статус (`lead_0002` → `new`) → `Лід lead_0002 (Rynok Books) уже має статус new,
    нічого не змінено. Уточни в людини, який статус потрібен.`
  - `limit=51` → `limit: Too big: expected number to be <=50`; `status=hot` →
    `status: Invalid option: expected one of "new"|"contacted"|"qualified"|"won"|"lost"|"any"`.
- **Відповіді на запити 1–3 з A/B через `leaddesk_find_leads`** збігаються з ключем у
  `materials/ab-prompts.md`: `qualified` — 3 (`lead_0001`, `lead_0013`, `lead_0015`); п'ять найновіших
  `new` — `lead_0002`, `lead_0005`, `lead_0004`, `lead_0018`, `lead_0012` (`total` = 6); `won` — 5 лідів,
  сума бюджетів 9000, без бюджету один (`lead_0006`).
- **Самоперевірки з walkthrough:** `grep -c '"isError": true' docs/mcp/bad-input.json` → 1;
  `"action"`, `"at"`, `"leadId"` у `set-status.json` є; `grep -rc 'console\.log' mcp/leaddesk-server/src`
  → 0 у кожному файлі; `cmp materials/leads.json mcp/leaddesk-server/fixtures/leads.json` →
  `fixture = materials/leads.json` (і до, і після всіх викликів зі зміною статусу).
- **Node 20:** той самий `tools/call leaddesk_find_leads status=qualified` із сервером під
  `/usr/local/bin/node` (v20.10.0) → exit 0, правильні 3 ліди. SDK вимагає Node ≥ 20, тож у
  `package.json` сервера `engines` — `>=20`; Node ≥ 22.19 потрібен лише Inspector'у.
- **Що було найважче в описах інструментів і параметрів:**
  - **Питання «скільки» проти `limit`.** З `limit` за замовчуванням 10 відповідь на «скільки лідів у
    статусі X» могла б мовчки обрізатися. Тому відповідь пошуку має `total`, і опис інструмента про
    це каже: агенту не треба вгадувати, чи бачить він усе.
  - **Помилка має казати, що робити далі.** «Не знайдено» без підказки змушує модель вигадувати
    наступний крок. Тому текст помилки прямо називає `leaddesk_find_leads` зі `status: "any"`, а
    помилка «той самий статус» відправляє до людини, а не пропонує спробувати інший статус.
  - **«Змінює дані» — словами, а не лише анотацією.** `readOnlyHint: false` бачить клієнт, але не
    обов'язково модель. Тому в описі `leaddesk_set_lead_status` є «ЗМІНЮЄ ДАНІ» і вимога спершу
    назвати людині лід, зміну й причину та дочекатися підтвердження.
  - **Значення статусів у базі не записані.** Для ресурсу довелось сформулювати правила команди:
    `contacted` — лише після живого контакту, `won` — лише після підпису чи оплати й ставить його
    власник акаунта.
  - **Коментар у коді спрацював як `console.log`.** Перша версія `server.mjs` мала коментар зі словами
    «no console.log», і самоперевірка `grep` показала 1. Коментар переписано: статична перевірка не
    розрізняє код і коментар.

## Task B — що зробили агенти з серверами

_Заповнюється після кроків Task B (сесії з одним сервером: Supabase, Vercel, Playwright)._

## Task E (бонус)

- **Варіант:** E1, HTTP-сервер із захистом Host/Origin.
- **Файли:** `mcp/leaddesk-server/src/http.mjs` імпортує ту саму `factory`, що й `src/server.mjs`
  (обидва беруть її з `src/leaddesk.mjs`). У `mcp/leaddesk-server/package.json` додано
  `"@modelcontextprotocol/node": "2.1.0"` (точна версія).
  `createMcpHandler(factory)` → `toNodeHandler(…)`; гварди `localhostHostValidation()` і
  `localhostOriginValidation()` **викликано в обробнику запиту** до `mcp(req, res)`, а не передано
  опцією; `listen(3333, "127.0.0.1")`. Дані й аудит живуть на рівні модуля `leaddesk.mjs`, а не
  всередині фабрики, тож HTTP-вхід бачить той самий стан незалежно від того, скільки разів створено
  `McpServer`.
- **Запуск:** `node mcp/leaddesk-server/src/http.mjs` → у stderr `leaddesk: http://127.0.0.1:3333/mcp`.
- **Перевірка:** чотири `curl` дослівно з walkthrough. `body.json` створено в тимчасовій теці поза
  репозиторієм, у git його немає.

```text
$ curl … http://127.0.0.1:3333/mcp                                   # valid request
{"result":{"tools":[{"name":"leaddesk_find_leads","title":"Знайти ліди за статусом","description":"Шукає ліди LeadDesk за статусом і повертає найновіші першими: id, компанія, статус, джерело, бюджет, дата заявки. Імені, email і тексту заявки не повертає. total у відповіді — скільки всього лідів у цьому статусі, навіть якщо limit менший. Застосовуй, щоб побачити, хто в роботі, порахувати ліди чи знайти id перед зміною статусу. Тільки читає, нічого не змінює. Що означає кожен статус — ресурс leaddesk://reference/statuses.","inputSchema":{"type":"object","$schema":"https://json-schema.org/draft/2020-12/schema","properties":{"status":{"type":"string","enum":["new","contacted","qualified","won","lost","any"],"description":"Який статус шукати: new, contacted, qualified, won або lost; any — ліди всіх статусів"},"limit":{"default":10,"description":"Скільки лідів повернути, від 1 до 50; за замовчуванням 10","type":"integer","minimum":1,"maximum":50}},"required":["status"]},"annotations":{"readOnlyHint":true,"openWorldHint":false}},{"name":"leaddesk_set_lead_status","title":"Змінити статус ліда","description":"Змінює статус одного ліда LeadDesk і пише запис в аудит: дія lead.status_changed, час, попередній і новий статус, причина. ЗМІНЮЄ ДАНІ: перед викликом скажи людині, який лід, з якого статусу на який і чому, і дочекайся її підтвердження. Статус — лише один із п'яти; що кожен означає — ресурс leaddesk://reference/statuses. Невідомий лід або статус, який у ліда вже є, — помилка, нічого не змінюється.","inputSchema":{"type":"object","$schema":"https://json-schema.org/draft/2020-12/schema","properties":{"leadId":{"type":"string","pattern":"^lead_\\d{4}$","description":"Ідентифікатор ліда у форматі lead_0001, напр. lead_0002. Не знаєш id — знайди лід через leaddesk_find_leads"},"status":{"type":"string","enum":["new","contacted","qualified","won","lost"],"description":"Новий статус ліда: new, contacted, qualified, won або lost"},"reason":{"type":"string","minLength":3,"maxLength":500,"description":"Чому змінюємо статус, 3–500 символів: що сталося (дзвінок, відмова, підписаний договір). Потрапляє в запис аудиту"}},"required":["leadId","status","reason"]},"annotations":{"readOnlyHint":false,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false}}],"resultType":"complete","ttlMs":0,"cacheScope":"private","_meta":{"io.modelcontextprotocol/serverInfo":{"name":"leaddesk","version":"0.1.0"}}},"jsonrpc":"2.0","id":1}
HTTP 200

$ curl … -H "Host: evil.example" http://127.0.0.1:3333/mcp           # forged Host
{"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Host: evil.example"},"id":null}
HTTP 403

$ curl … -H "Origin: https://evil.example" http://127.0.0.1:3333/mcp # forged Origin
{"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Origin: evil.example"},"id":null}
HTTP 403

$ curl … (no MCP-Protocol-Version) http://127.0.0.1:3333/mcp          # missing protocol version
{"jsonrpc":"2.0","error":{"code":-32020,"message":"Bad Request: the request headers and body disagree: the body envelope names protocol version 2026-07-28 but the required MCP-Protocol-Version header is absent","data":{"mismatch":{"header":"(missing)","body":"the body envelope names protocol version 2026-07-28 but the required MCP-Protocol-Version header is absent"}}},"id":1}
HTTP 400
```

- **Спостереження:**
  - 200 — ті самі два інструменти з тими самими описами й анотаціями, що в `docs/mcp/tools-list.json`:
    одна фабрика, два транспорти.
  - Обидві 403 приходять від гвардів ще до MCP-обробника: JSON-RPC `-32000` з `id: null`, тобто
    тіло запиту навіть не розбиралося.
  - 400 з `-32020` дає вже MCP-обробник: заголовок `MCP-Protocol-Version` відсутній, а в
    `_meta` тіла версія є, і сервер відмовляє через розбіжність, а не вгадує версію.
  - Сервер слухає лише `127.0.0.1`, тож з мережі його не видно. Гварди захищають від DNS rebinding:
    сторінка в браузері, чий домен вказує на 127.0.0.1, приходить із чужим `Host`/`Origin`.
