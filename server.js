import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
const port = process.env.PORT || 3000;
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.');
}

app.use(express.json());
app.use(express.static('public'));

function getUserClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return null;
  }

  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

async function requireUser(req, res, next) {
  const client = getUserClient(req);

  if (!client) {
    return res.status(401).json({ error: 'Sign in first.' });
  }

  const { data: { user }, error } = await client.auth.getUser();

  if (error || !user) {
    return res.status(401).json({ error: 'Your session is invalid or expired.' });
  }

  req.supabase = client;
  req.user = user;
  next();
}

app.get('/api/categories', requireUser, async (req, res) => {
  const { data, error } = await req.supabase
    .from('categories')
    .select('id, name, color, created_at')
    .order('name');

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json(data);
});

app.post('/api/categories', requireUser, async (req, res) => {
  const name = req.body.name?.trim();
  const color = req.body.color || '#d9f27a';

  if (!name || name.length > 32 || !/^#[0-9a-f]{6}$/i.test(color)) {
    return res.status(400).json({ error: 'Use a category name up to 32 characters and a valid color.' });
  }

  const { data, error } = await req.supabase
    .from('categories')
    .insert({ user_id: req.user.id, name, color })
    .select('id, name, color, created_at')
    .single();

  if (error) {
    return res.status(error.code === '23505' ? 409 : 400).json({ error: error.code === '23505' ? 'That category already exists.' : error.message });
  }

  res.status(201).json(data);
});

app.delete('/api/categories/:id', requireUser, async (req, res) => {
  const { error } = await req.supabase.from('categories').delete().eq('id', req.params.id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(204).end();
});

app.get('/api/expenses', requireUser, async (req, res) => {
  const { category, month } = req.query;
  let query = req.supabase
    .from('expenses')
    .select('id, title, amount, category, spent_on, notes, created_at')
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  if (month) {
    const monthStart = new Date(`${month}-01T00:00:00Z`);
    monthStart.setUTCMonth(monthStart.getUTCMonth() + 1);
    const nextMonth = monthStart.toISOString().slice(0, 10);
    query = query.gte('spent_on', `${month}-01`).lt('spent_on', nextMonth);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json(data);
});

app.post('/api/expenses', requireUser, async (req, res) => {
  const { title, amount, category, spent_on: spentOn, notes } = req.body;
  const numericAmount = Number(amount);

  if (!title?.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0 || !spentOn) {
    return res.status(400).json({ error: 'Title, a positive amount, and date are required.' });
  }

  const { data, error } = await req.supabase
    .from('expenses')
    .insert({
      user_id: req.user.id,
      title: title.trim(),
      amount: numericAmount,
      category: category || 'Other',
      spent_on: spentOn,
      notes: notes?.trim() || null
    })
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(201).json(data);
});

app.delete('/api/expenses/:id', requireUser, async (req, res) => {
  const { error } = await req.supabase
    .from('expenses')
    .delete()
    .eq('id', req.params.id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(204).end();
});

app.get('/api/summary', requireUser, async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const { data, error } = await req.supabase.rpc('monthly_expense_summary', { month_start: `${month}-01` });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json(data);
});

app.get('/api/reports', requireUser, async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const [{ data: categories, error: categoryError }, { data: trend, error: trendError }] = await Promise.all([
    req.supabase.rpc('expense_report', { month_start: `${month}-01` }),
    req.supabase.rpc('monthly_expense_trend', { months_back: 6 })
  ]);

  if (categoryError || trendError) {
    return res.status(400).json({ error: categoryError?.message || trendError.message });
  }

  res.json({ categories, trend });
});

app.listen(port, () => {
  console.log(`Expense tracker running at http://localhost:${port}`);
});