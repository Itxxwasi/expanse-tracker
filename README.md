# Ledgerly

Ledgerly is a small expense tracker built to practice three things together:

- **Node.js + Express** for a thin API layer.
- **Supabase Auth** for email/password accounts.
- **Postgres SQL** for a real table, constraints, indexes, Row Level Security, and an aggregate function.

## Run it

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Open your Supabase project SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql).
4. In Supabase Auth settings, either disable **Confirm email** for local learning or keep it enabled and confirm the signup email.
5. Run `npm start`, then open <http://localhost:3000>.

The project uses only the publishable key. Never add a `service_role` or secret key to this app.

## How the request flows

1. The browser signs in with Supabase Auth and receives a session JWT.
2. The browser sends that JWT as `Authorization: Bearer ...` to Express.
3. Express creates a Supabase client with the same JWT and queries Postgres through the Data API.
4. Postgres evaluates `auth.uid()` in the RLS policies. A user can only see or change their own rows.

## SQL exercises

After the app works, try these in the SQL Editor:

```sql
select category, sum(amount) as total
from public.expenses
where user_id = auth.uid()
group by category
order by total desc;
```

Then modify `monthly_expense_summary` to add an average expense, or add a `payment_method` column with a check constraint. Re-run the schema only after understanding what each statement does.# expanse-tracker
