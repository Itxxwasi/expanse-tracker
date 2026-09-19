const SUPABASE_URL = 'https://lhtcficczjpwduutgihk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_E5VulPfVf8czWLgiATSG9A_Ube7iTPv';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const authView = document.querySelector('#auth-view');
const appView = document.querySelector('#app-view');
const authForm = document.querySelector('#auth-form');
const authToggle = document.querySelector('#auth-toggle');
const authMessage = document.querySelector('#auth-message');
const authSubmitLabel = document.querySelector('#auth-submit-label');
const authSubmit = document.querySelector('#auth-submit');
const expenseForm = document.querySelector('#expense-form');
const expenseMessage = document.querySelector('#expense-message');
const expenseList = document.querySelector('#expense-list');
const monthFilter = document.querySelector('#month-filter');
const categoryFilter = document.querySelector('#category-filter');
const expenseCategory = document.querySelector('#expense-category');
const connectionStatus = document.querySelector('#connection-status');
const categoryModal = document.querySelector('#category-modal');
const categoryList = document.querySelector('#category-list');
const categoryMessage = document.querySelector('#category-message');
let isSignUp = false;
let categories = [];
let activeUserId = null;

const defaultCategories = [
  { name: 'Food', color: '#f6ae8a' }, { name: 'Transport', color: '#b8d9f5' },
  { name: 'Home', color: '#d9f27a' }, { name: 'Health', color: '#d5c8f5' },
  { name: 'Fun', color: '#f4d479' }, { name: 'Other', color: '#d6ddd7' }
];
const money = (value) => `Rs ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const selectedMonth = () => monthFilter.value || new Date().toISOString().slice(0, 7);

function showMessage(element, text, isError = false) { element.textContent = text; element.classList.toggle('error', isError); }

async function apiRequest(path, options = {}) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) throw new Error('Sign in first.');
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...options.headers } });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error || 'Request failed.');
  return body;
}

function renderCategoryOptions() {
  const allCategories = [...defaultCategories, ...categories];
  expenseCategory.innerHTML = allCategories.map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join('');
  categoryFilter.innerHTML = '<option value="all">All categories</option>' + allCategories.map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join('');
  categoryList.innerHTML = categories.length ? categories.map((category) => `<div class="category-item"><span class="category-swatch" style="background:${category.color}"></span><strong>${escapeHtml(category.name)}</strong><button class="delete-category" data-id="${category.id}" type="button" aria-label="Delete ${escapeHtml(category.name)}">x</button></div>`).join('') : '<p class="empty-state">Your custom categories will appear here.</p>';
  document.querySelectorAll('.delete-category').forEach((button) => button.addEventListener('click', () => deleteCategory(button.dataset.id)));
}

function renderExpenses(expenses) {
  document.querySelector('#row-count').textContent = expenses.length;
  if (!expenses.length) { expenseList.innerHTML = '<p class="empty-state">No expenses match this view.</p>'; return; }
  expenseList.innerHTML = expenses.map((expense) => `<article class="expense-row"><div class="expense-icon">${escapeHtml(expense.category.slice(0, 1))}</div><div class="expense-info"><strong>${escapeHtml(expense.title)}</strong><span>${escapeHtml(expense.category)} · ${expense.spent_on}</span></div><strong class="expense-amount">${money(expense.amount)}</strong><button class="delete-button" data-id="${expense.id}" title="Delete expense" aria-label="Delete ${escapeHtml(expense.title)}">x</button></article>`).join('');
  document.querySelectorAll('.delete-button').forEach((button) => button.addEventListener('click', () => deleteExpense(button.dataset.id)));
}

function renderReports(reports) {
  const total = reports.categories.reduce((sum, row) => sum + Number(row.total), 0);
  document.querySelector('#report-total').textContent = money(total);
  document.querySelector('#category-report').innerHTML = reports.categories.length ? reports.categories.map((row, index) => `<div class="report-row"><div class="report-row-heading"><span><i class="report-dot dot-${index % 5}"></i>${escapeHtml(row.category)}</span><strong>${money(row.total)}</strong></div><div class="bar-track"><div class="bar-fill fill-${index % 5}" style="width:${row.percentage}%"></div></div><small>${row.percentage}% · ${row.expense_count} transaction${row.expense_count === 1 ? '' : 's'}</small></div>`).join('') : '<p class="empty-state">No report data for this month.</p>';
  const maxTotal = Math.max(...reports.trend.map((row) => Number(row.total)), 1);
  document.querySelector('#trend-report').innerHTML = reports.trend.map((row) => `<div class="trend-row"><span>${new Date(`${row.month_start}T00:00:00`).toLocaleDateString('en', { month: 'short' })}</span><div class="trend-track"><div class="trend-fill" style="height:${Math.max(Number(row.total) / maxTotal * 100, row.total > 0 ? 8 : 2)}%"></div></div><strong>${money(row.total)}</strong></div>`).join('');
}

async function loadDashboard() {
  connectionStatus.textContent = 'SYNCING...';
  try {
    const month = selectedMonth();
    const [expenses, summary, reports] = await Promise.all([apiRequest(`/api/expenses?month=${month}&category=${encodeURIComponent(categoryFilter.value)}`), apiRequest(`/api/summary?month=${month}`), apiRequest(`/api/reports?month=${month}`)]);
    renderExpenses(expenses); renderReports(reports);
    const total = summary.reduce((sum, row) => sum + Number(row.total), 0);
    document.querySelector('#month-total').textContent = money(total);
    document.querySelector('#month-count').textContent = `${expenses.length} expense${expenses.length === 1 ? '' : 's'}`;
    document.querySelector('#top-category').textContent = summary[0]?.category || '--';
    connectionStatus.textContent = 'LIVE / RLS ON';
  } catch (error) { showMessage(expenseMessage, error.message, true); connectionStatus.textContent = 'OFFLINE'; }
}

async function loadCategories() { categories = await apiRequest('/api/categories'); renderCategoryOptions(); }
async function deleteExpense(id) { try { await apiRequest(`/api/expenses/${id}`, { method: 'DELETE' }); await loadDashboard(); } catch (error) { showMessage(expenseMessage, error.message, true); } }
async function deleteCategory(id) { try { await apiRequest(`/api/categories/${id}`, { method: 'DELETE' }); await loadCategories(); showMessage(categoryMessage, 'Category removed.'); } catch (error) { showMessage(categoryMessage, error.message, true); } }

authToggle.addEventListener('click', () => { isSignUp = !isSignUp; authSubmitLabel.textContent = isSignUp ? 'Create account' : 'Sign in'; authToggle.textContent = isSignUp ? 'Already have an account? Sign in' : 'Create a new account'; showMessage(authMessage, ''); });
authForm.addEventListener('submit', async (event) => {
  event.preventDefault(); authSubmit.disabled = true;
  const formData = new FormData(authForm); const credentials = { email: formData.get('email'), password: formData.get('password') };
  try {
    const result = isSignUp ? await supabaseClient.auth.signUp(credentials) : await supabaseClient.auth.signInWithPassword(credentials);
    if (result.error) return showMessage(authMessage, result.error.message, true);
    showMessage(authMessage, isSignUp && !result.data.session ? 'Check your email to confirm your account.' : 'Welcome back.');
    if (result.data.session) updateView(result.data.session.user);
  } finally { authSubmit.disabled = false; }
});

expenseForm.addEventListener('submit', async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(expenseForm)); try { await apiRequest('/api/expenses', { method: 'POST', body: JSON.stringify(values) }); expenseForm.reset(); expenseForm.elements.spent_on.value = new Date().toISOString().slice(0, 10); showMessage(expenseMessage, 'Added to your ledger.'); await loadDashboard(); } catch (error) { showMessage(expenseMessage, error.message, true); } });
document.querySelector('#category-form').addEventListener('submit', async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await apiRequest('/api/categories', { method: 'POST', body: JSON.stringify(values) }); event.currentTarget.reset(); await loadCategories(); showMessage(categoryMessage, 'Category created.'); } catch (error) { showMessage(categoryMessage, error.message, true); } });

document.querySelectorAll('.view-tab').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.view-tab').forEach((item) => item.classList.remove('active')); tab.classList.add('active'); const isReports = tab.dataset.view === 'reports'; document.querySelector('#overview-view').classList.toggle('hidden', isReports); document.querySelector('#reports-view').classList.toggle('hidden', !isReports); document.querySelector('#view-label').textContent = isReports ? 'REPORTS' : 'OVERVIEW'; document.querySelector('#page-title').textContent = isReports ? 'Your money, mapped.' : 'Good to see you.'; }));
monthFilter.addEventListener('change', loadDashboard); categoryFilter.addEventListener('change', loadDashboard);
document.querySelector('#add-expense-shortcut').addEventListener('click', () => document.querySelector('#entry-panel').scrollIntoView({ behavior: 'smooth' }));
document.querySelector('#manage-categories').addEventListener('click', () => categoryModal.classList.remove('hidden'));
document.querySelector('#close-category-modal').addEventListener('click', () => categoryModal.classList.add('hidden'));
categoryModal.addEventListener('click', (event) => { if (event.target === categoryModal) categoryModal.classList.add('hidden'); });
document.querySelector('#sign-out').addEventListener('click', () => supabaseClient.auth.signOut({ scope: 'local' }));

function updateView(user) {
  const signedIn = Boolean(user);
  authView.classList.toggle('hidden', signedIn); appView.classList.toggle('hidden', !signedIn); document.querySelector('#sign-out').classList.toggle('hidden', !signedIn); document.querySelector('#user-email').textContent = signedIn ? user.email : '';
  if (!signedIn) { activeUserId = null; return; }
  if (activeUserId === user.id) return;
  activeUserId = user.id;
  monthFilter.value = new Date().toISOString().slice(0, 7); expenseForm.elements.spent_on.value = new Date().toISOString().slice(0, 10); loadCategories().then(loadDashboard);
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character])); }
supabaseClient.auth.onAuthStateChange((_event, session) => updateView(session?.user));
supabaseClient.auth.getSession().then(({ data: { session } }) => updateView(session?.user));
