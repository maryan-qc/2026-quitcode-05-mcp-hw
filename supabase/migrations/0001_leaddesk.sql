-- LeadDesk: leads table, fields mirror materials/leads.json (camelCase -> snake_case).

create table public.leads (
  id         text primary key,
  full_name  text not null,
  company    text not null,
  email      text not null,
  source     text not null,
  status     text not null default 'new'
             constraint leads_status_check
             check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  budget     integer,
  message    text not null,
  created_at timestamptz not null default now()
);

-- Synthetic lead data still holds names and emails: no access through the public
-- API (anon / authenticated) until explicit policies are added.
alter table public.leads enable row level security;
