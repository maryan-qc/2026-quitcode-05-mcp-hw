// LeadDesk as an MCP server: two business verbs and one reference resource instead of SQL over
// the whole database. The factory is shared by the stdio entry (server.mjs) and the HTTP entry
// of bonus E1 (http.mjs).
//
// Data: fixtures/leads.json — an unchanged copy of materials/leads.json, read once at start.
// Status changes and audit entries live in process memory; the fixture file is never written,
// so every restart begins from the same 20 leads.
import { McpServer } from "@modelcontextprotocol/server";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const FIXTURE = process.env.LEADDESK_FIXTURE ?? fileURLToPath(new URL("../fixtures/leads.json", import.meta.url));

// The app's vocabulary, not invented: LEAD_STATUSES in lib/types.ts, leadId() in lib/db.ts.
const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"];
const LEAD_ID = /^lead_\d{4}$/;

// The only lead fields that leave this server. Name, email and the request text stay inside:
// neither verb needs them.
const publicLead = ({ id, company, status, source, budget, createdAt }) => ({ id, company, status, source, budget, createdAt });

const leads = new Map(JSON.parse(await readFile(FIXTURE, "utf8")).map((lead) => [lead.id, { ...lead }]));
const audit = [];

const STATUSES_MD = `# Статуси лідів LeadDesk

Як команда Studio Nova веде лід. Звичайний шлях: \`new\` → \`contacted\` → \`qualified\` → \`won\`;
у \`lost\` лід може піти з будь-якого статусу. Статус змінює лише \`leaddesk_set_lead_status\`, і
кожна зміна лишає запис в аудиті з причиною. Агент змінює статус тільки на прохання людини й
після її підтвердження.

| Статус | Що означає для команди | Коли ставимо | Хто ставить |
|---|---|---|---|
| \`new\` | Заявка надійшла, живого контакту з клієнтом ще не було | Автоматично, коли лід створено з форми чи імпорту | Система |
| \`contacted\` | Була жива розмова: дзвінок, зустріч або відповідь клієнта на наш лист | Одразу після першого контакту. Лист без відповіді — ще не \`contacted\` | Менеджер, що веде лід |
| \`qualified\` | Задача наша, бюджет відомий і в межах, з якими ми працюємо, є людина, що ухвалює рішення, і реальні терміни | Після розмови, де ці чотири пункти підтверджено; далі готуємо кошторис | Менеджер, що веде лід |
| \`won\` | Клієнт підписав договір або сплатив передоплату | Лише після підпису чи оплати, не «клієнт усно погодився» | Власник акаунта (роль owner) |
| \`lost\` | Угоди не буде: відмова, обрали іншу агенцію, задача чи бюджет не наші, або 30 днів тиші після трьох спроб контакту | Щойно це стало відомо; причину записуємо завжди | Менеджер, що веде лід |

Повернення назад (наприклад, \`qualified\` → \`contacted\`) можливе, але лише з причиною.
`;

const fail = (text) => ({ isError: true, content: [{ type: "text", text }] });
const budgetText = (budget) => (budget == null ? "бюджет не вказано" : `бюджет ${budget}`);
const leadLine = (l) => `- ${l.id} · ${l.company} · ${l.status} · ${l.source} · ${budgetText(l.budget)} · ${l.createdAt}`;

export const factory = () => {
  const server = new McpServer({ name: "leaddesk", version: "0.1.0" });

  server.registerTool(
    "leaddesk_find_leads",
    {
      title: "Знайти ліди за статусом",
      description:
        "Шукає ліди LeadDesk за статусом і повертає найновіші першими: id, компанія, статус, джерело, бюджет, дата заявки. Імені, email і тексту заявки не повертає. total у відповіді — скільки всього лідів у цьому статусі, навіть якщо limit менший. Застосовуй, щоб побачити, хто в роботі, порахувати ліди чи знайти id перед зміною статусу. Тільки читає, нічого не змінює. Що означає кожен статус — ресурс leaddesk://reference/statuses.",
      inputSchema: {
        status: z
          .enum([...LEAD_STATUSES, "any"])
          .describe("Який статус шукати: new, contacted, qualified, won або lost; any — ліди всіх статусів"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Скільки лідів повернути, від 1 до 50; за замовчуванням 10"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ status, limit }) => {
      const found = [...leads.values()]
        .filter((lead) => status === "any" || lead.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const shown = found.slice(0, limit).map(publicLead);
      const scope = status === "any" ? "Усього лідів" : `Лідів зі статусом ${status}`;
      const head = `${scope}: ${found.length}; показано ${shown.length}, найновіші першими.`;
      return {
        content: [{ type: "text", text: [head, ...shown.map(leadLine)].join("\n") }],
        structuredContent: { status, total: found.length, returned: shown.length, leads: shown },
      };
    },
  );

  server.registerTool(
    "leaddesk_set_lead_status",
    {
      title: "Змінити статус ліда",
      description:
        "Змінює статус одного ліда LeadDesk і пише запис в аудит: дія lead.status_changed, час, попередній і новий статус, причина. ЗМІНЮЄ ДАНІ: перед викликом скажи людині, який лід, з якого статусу на який і чому, і дочекайся її підтвердження. Статус — лише один із п'яти; що кожен означає — ресурс leaddesk://reference/statuses. Невідомий лід або статус, який у ліда вже є, — помилка, нічого не змінюється.",
      inputSchema: {
        leadId: z
          .string()
          .regex(LEAD_ID, "Ідентифікатор ліда має формат lead_0001: lead_ і чотири цифри")
          .describe("Ідентифікатор ліда у форматі lead_0001, напр. lead_0002. Не знаєш id — знайди лід через leaddesk_find_leads"),
        status: z
          .enum(LEAD_STATUSES)
          .describe("Новий статус ліда: new, contacted, qualified, won або lost"),
        reason: z
          .string()
          .min(3)
          .max(500)
          .describe("Чому змінюємо статус, 3–500 символів: що сталося (дзвінок, відмова, підписаний договір). Потрапляє в запис аудиту"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ leadId, status, reason }) => {
      const lead = leads.get(leadId);
      if (!lead) {
        return fail(`Лід ${leadId} не знайдено, нічого не змінено. Знайди правильний ідентифікатор через leaddesk_find_leads (status: "any") і повтори виклик.`);
      }
      if (lead.status === status) {
        return fail(`Лід ${leadId} (${lead.company}) уже має статус ${status}, нічого не змінено. Уточни в людини, який статус потрібен.`);
      }
      const from = lead.status;
      lead.status = status;
      const entry = { action: "lead.status_changed", leadId, at: new Date().toISOString(), from, to: status, reason };
      audit.push(entry);
      console.error(`leaddesk: ${leadId} ${from} -> ${status}`);
      return {
        content: [{ type: "text", text: `Статус ${leadId} (${lead.company}) змінено: ${from} → ${status}. Запис аудиту ${entry.action} о ${entry.at}.` }],
        structuredContent: { lead: publicLead(lead), audit: entry },
      };
    },
  );

  server.registerResource(
    "leaddesk-statuses",
    "leaddesk://reference/statuses",
    {
      title: "Статуси лідів LeadDesk",
      description: "П'ять статусів ліда і що кожен означає для команди: коли ставимо і хто ставить",
      mimeType: "text/markdown",
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: STATUSES_MD }] }),
  );

  return server;
};
