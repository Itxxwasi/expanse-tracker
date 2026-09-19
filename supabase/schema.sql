-- Run this file in Supabase Dashboard > SQL Editor.
-- It creates the table, security policies, indexes, and an aggregate function.

create table if not exists public.expenses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null default 'Other',
  spent_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists expenses_user_spent_on_idx
  on public.expenses (user_id, spent_on desc);

alter table public.expenses enable row level security;

drop policy if exists "Users can view their own expenses" on public.expenses;
create policy "Users can view their own expenses"
  on public.expenses for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own expenses" on public.expenses;
create policy "Users can create their own expenses"
  on public.expenses for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own expenses" on public.expenses;
create policy "Users can update their own expenses"
  on public.expenses for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own expenses" on public.expenses;
create policy "Users can delete their own expenses"
  on public.expenses for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.expenses to authenticated;
grant usage, select on sequence public.expenses_id_seq to authenticated;

create or replace function public.monthly_expense_summary(month_start date)
returns table (category text, total numeric, expense_count bigint)
language sql
stable
as $$
  select
    e.category,
    sum(e.amount)::numeric as total,
    count(*)::bigint as expense_count
  from public.expenses e
  where e.user_id = (select auth.uid())
    and e.spent_on >= month_start
    and e.spent_on < (month_start + interval '1 month')::date
  group by e.category
  order by total desc;
$$;

grant execute on function public.monthly_expense_summary(date) to authenticated;

-- Custom categories belong to one user and are protected by the same RLS boundary.
create table if not exists public.categories (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 32),
  color text not null default '#d9f27a' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists categories_user_idx on public.categories (user_id, name);
alter table public.categories enable row level security;

drop policy if exists "Users can view their own categories" on public.categories;
create policy "Users can view their own categories"
  on public.categories for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own categories" on public.categories;
create policy "Users can create their own categories"
  on public.categories for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own categories" on public.categories;
create policy "Users can delete their own categories"
  on public.categories for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.categories to authenticated;
grant usage, select on sequence public.categories_id_seq to authenticated;

create or replace function public.expense_report(month_start date)
returns table (category text, total numeric, expense_count bigint, percentage numeric)
language sql
stable
as $$
  with category_totals as (
    select e.category, sum(e.amount)::numeric as total, count(*)::bigint as expense_count
    from public.expenses e
    where e.user_id = (select auth.uid())
      and e.spent_on >= month_start
      and e.spent_on < (month_start + interval '1 month')::date
    group by e.category
  )
  select category, total, expense_count,
    round((total / nullif(sum(total) over (), 0) * 100)::numeric, 1) as percentage
  from category_totals
  order by total desc;
$$;

create or replace function public.monthly_expense_trend(months_back integer default 6)
returns table (month_start date, total numeric, expense_count bigint)
language sql
stable
as $$
  select month_bucket::date,
    coalesce(sum(e.amount), 0)::numeric,
    count(e.id)::bigint
  from generate_series(
    date_trunc('month', current_date) - ((greatest(months_back, 1) - 1) * interval '1 month'),
    date_trunc('month', current_date),
    interval '1 month'
  ) as buckets(month_bucket)
  left join public.expenses e on e.spent_on >= month_bucket::date
    and e.spent_on < (month_bucket + interval '1 month')::date
    and e.user_id = (select auth.uid())
  group by month_bucket
  order by month_bucket;
$$;

grant execute on function public.expense_report(date) to authenticated;
grant execute on function public.monthly_expense_trend(integer) to authenticated;