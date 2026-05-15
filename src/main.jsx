import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

const STORAGE = {
  backupMeta: "ledgerly:backupMeta",
  ownerReminder: "ledgerly:ownerReminder",
  theme: "ledgerly:theme",
  month: "ledgerly:month",
  savings: "ledgerly:savings",
  expenses: "ledgerly:expenses",
  creditLoans: "ledgerly:creditLoans",
};

const DB_NAME = "daily-damage-local";
const DB_VERSION = 1;
const DB_STORE = "settings";
const BACKUP_STALE_DAYS = 14;

const institutionTypes = [
  { value: "bank", label: "Traditional bank" },
  { value: "creditCard", label: "Credit card account" },
  { value: "ewallet", label: "E-wallet" },
];

const institutions = {
  bank: ["MariBank", "UnionBank", "BDO Unibank", "BPI", "Metrobank", "Security Bank", "SeaBank", "Maya Bank", "GoTyme Bank", "CIMB Bank Philippines", "RCBC", "China Banking Corporation"],
  ewallet: ["GCash", "Maya", "ShopeePay", "GrabPay", "Coins.ph", "PalawanPay", "PayMongo"],
  creditCard: ["UnionBank Credit Cards", "BDO Credit Cards", "BPI Credit Cards", "Metrobank Credit Cards", "Security Bank Credit Cards", "RCBC Credit Cards", "HSBC Credit Cards"],
};

const expenseIcons = [
  ["🧾", "Bills"], ["📱", "Subscriptions"], ["🌐", "Internet"], ["💡", "Utilities"], ["💧", "Water"], ["🔥", "Gas"], ["🍔", "Food"], ["☕", "Coffee"], ["🧺", "Groceries"], ["🚗", "Transport"], ["⛽", "Fuel"], ["🛒", "Shopping"], ["🏠", "Home"], ["🎬", "Entertainment"], ["🏥", "Health"], ["💊", "Medicine"], ["🎓", "School"], ["🎁", "Gifts"], ["✈️", "Travel"], ["💼", "Work"], ["✨", "Other"],
].map(([value, label]) => ({ value, label }));

const creditTypes = ["Credit Card", "SPayLater", "LazPayLater", "GLoan", "GCredit"];
const creditProviders = ["UnionBank", "BDO", "BPI", "Metrobank", "Security Bank", "GCash", "Shopee", "Lazada", "Maya", "AUB", "RCBC"];

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage can fail in private browsing or restricted browsers.
  }
}

function openLocalDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function idbGet(key, fallback) {
  return openLocalDb().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? fallback);
  }));
}

function idbSet(key, value) {
  return openLocalDb().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(value, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  }));
}

function saveDurable(key, value) {
  save(key, value);
  return idbSet(key, value).catch(() => {});
}

function fallbackSnapshot() {
  return {
    theme: load(STORAGE.theme, "black"),
    month: load(STORAGE.month, new Date().toISOString().slice(0, 7)),
    savings: load(STORAGE.savings, []),
    expenses: load(STORAGE.expenses, []),
    creditLoans: load(STORAGE.creditLoans, []),
    backupMeta: load(STORAGE.backupMeta, { lastBackupAt: "" }),
    ownerReminder: load(STORAGE.ownerReminder, { acknowledgedAt: "" }),
  };
}

function cleanExpanded(items) {
  return items.map(({ expanded, ...item }) => item);
}

function datedFileStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function daysSince(value) {
  if (!value) return Infinity;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(amount || 0));
}

function parseMoney(value) {
  return Number(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, "")) || 0;
}

function formatMoneyInput(value) {
  const raw = String(value || "").replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!raw) return "";
  const [whole, decimal] = raw.split(".");
  const formatted = Number(whole || 0).toLocaleString("en-US");
  return decimal !== undefined ? `${formatted}.${decimal.slice(0, 2)}` : formatted;
}

function formatDate(value) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function daysUntil(value) {
  if (!value) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(`${value}T00:00:00`) - today) / 86400000);
}

function addMonths(dateValue, months) {
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() !== day) date.setDate(0);
  return date.toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function addRecurringInterval(date, frequency) {
  if (frequency === "daily") return addDays(date, 1);
  if (frequency === "weekly") return addDays(date, 7);
  if (frequency === "biweekly") return addDays(date, 14);
  if (frequency === "annually") return addMonths(date, 12);
  return addMonths(date, 1);
}

function recurringDueDate(expense) {
  let due = expense.date;
  const paidDates = new Set(expense.paidDates || []);
  while (due && paidDates.has(due)) due = addRecurringInterval(due, expense.frequency || "monthly");
  return due;
}

function recurringFrequencyLabel(value) {
  return { daily: "Daily", weekly: "Weekly", biweekly: "Bi-weekly", monthly: "Monthly", annually: "Annually" }[value] || "Monthly";
}

function availabilityLabel(expense) {
  const dueIn = daysUntil(recurringDueDate(expense));
  if (dueIn === "") return "";
  if (dueIn <= 0) return "Now";
  return dueIn === 1 ? "1 day" : `${dueIn} days`;
}

function normalizeCreditType(type) {
  const key = String(type || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return { creditcard: "creditCard", spaylater: "spaylater", lazpaylater: "lazpaylater", gloan: "gloan", gcredit: "gcredit" }[key] || type || "creditCard";
}

function creditTypeLabel(type) {
  return { creditCard: "Credit Card", spaylater: "SPayLater", lazpaylater: "LazPayLater", gloan: "GLoan", gcredit: "GCredit" }[type] || type || "Credit";
}

function isCreditType(type) {
  const normalized = normalizeCreditType(type);
  return normalized === "creditCard" || normalized === "gcredit" || /credit/i.test(String(type || ""));
}

function defaultProvider(type) {
  return { spaylater: "Shopee", lazpaylater: "Lazada", gloan: "GCash", gcredit: "GCash" }[normalizeCreditType(type)] || "";
}

function logoKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function logoPath(name) {
  if (!name) return "";
  if (name === "MariBank") return "assets/icons/Maribank.png";
  if (name === "GCash") return "assets/icons/GCash.png";
  if (/unionbank/i.test(name)) return "assets/icons/UnionBank.png";
  return `assets/icons/${name}.png`;
}

function fallbackLogo(name) {
  return `assets/logos/${logoKey(name)}.png`;
}

function sumBy(items, getter) {
  return items.reduce((total, item) => total + Number(getter(item) || 0), 0);
}

function accountLabel(account) {
  const type = account.accountType === "creditCard" ? "Card" : account.accountType === "ewallet" ? "Wallet" : "Bank";
  return `${account.bank}${account.accountNumber ? ` - ${account.accountNumber}` : ""} (${type})`;
}

function reorder(items, draggedId, targetId, filter) {
  if (!draggedId || !targetId || draggedId === targetId) return items;
  const group = items.filter(filter);
  const dragged = group.find((item) => item.id === draggedId);
  const targetIndex = group.findIndex((item) => item.id === targetId);
  if (!dragged || targetIndex < 0) return items;
  const ordered = group.filter((item) => item.id !== draggedId);
  ordered.splice(targetIndex, 0, dragged);
  const queue = [...ordered];
  return items.map((item) => (filter(item) ? queue.shift() : item));
}

function App() {
  const initial = fallbackSnapshot();
  const importInputRef = useRef(null);
  const [view, setView] = useState("dashboard");
  const [theme, setTheme] = useState(initial.theme);
  const [month, setMonth] = useState(initial.month);
  const [savings, setSavings] = useState(initial.savings.map((item) => ({ ...item, expanded: false })));
  const [expenses, setExpenses] = useState(initial.expenses.map((item) => ({ ...item, expanded: false })));
  const [creditLoans, setCreditLoans] = useState(initial.creditLoans.map((item) => ({ ...item, expanded: false })));
  const [backupMeta, setBackupMeta] = useState(initial.backupMeta);
  const [ownerReminder, setOwnerReminder] = useState(initial.ownerReminder);
  const [storageReady, setStorageReady] = useState(false);
  const [storageNotice, setStorageNotice] = useState("");
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const [forms, setForms] = useState({ money: false, expense: false, credit: false });
  const [modes, setModes] = useState({
    moneyDelete: {}, moneyEdit: {}, expenseDelete: {}, expenseEdit: {}, creditDelete: {}, creditEdit: {},
  });
  const [editing, setEditing] = useState({ money: "", expense: "", credit: "" });
  const [modal, setModal] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      idbGet(STORAGE.theme, initial.theme),
      idbGet(STORAGE.month, initial.month),
      idbGet(STORAGE.savings, initial.savings),
      idbGet(STORAGE.expenses, initial.expenses),
      idbGet(STORAGE.creditLoans, initial.creditLoans),
      idbGet(STORAGE.backupMeta, initial.backupMeta),
      idbGet(STORAGE.ownerReminder, initial.ownerReminder),
    ]).then(([nextTheme, nextMonth, nextSavings, nextExpenses, nextCreditLoans, nextBackupMeta, nextOwnerReminder]) => {
      if (!active) return;
      setTheme(nextTheme);
      setMonth(nextMonth);
      setSavings(nextSavings.map((item) => ({ ...item, expanded: false })));
      setExpenses(nextExpenses.map((item) => ({ ...item, expanded: false })));
      setCreditLoans(nextCreditLoans.map((item) => ({ ...item, expanded: false })));
      setBackupMeta(nextBackupMeta);
      setOwnerReminder(nextOwnerReminder);
      setStorageReady(true);
    }).catch(() => {
      if (!active) return;
      setStorageReady(true);
      setStorageNotice("Using browser fallback storage. Export backups regularly.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => { if (storageReady) saveDurable(STORAGE.theme, theme); }, [theme, storageReady]);
  useEffect(() => { if (storageReady) saveDurable(STORAGE.month, month); }, [month, storageReady]);
  useEffect(() => { if (storageReady) saveDurable(STORAGE.savings, cleanExpanded(savings)); }, [savings, storageReady]);
  useEffect(() => { if (storageReady) saveDurable(STORAGE.expenses, cleanExpanded(expenses)); }, [expenses, storageReady]);
  useEffect(() => { if (storageReady) saveDurable(STORAGE.creditLoans, cleanExpanded(creditLoans)); }, [creditLoans, storageReady]);
  useEffect(() => { if (storageReady) saveDurable(STORAGE.backupMeta, backupMeta); }, [backupMeta, storageReady]);
  useEffect(() => { if (storageReady) saveDurable(STORAGE.ownerReminder, ownerReminder); }, [ownerReminder, storageReady]);
  useEffect(() => {
    document.body.classList.toggle("black-theme", theme === "black");
  }, [theme]);

  const backupAge = daysSince(backupMeta.lastBackupAt);
  const backupStatus = !backupMeta.lastBackupAt ? "Backup needed" : backupAge >= BACKUP_STALE_DAYS ? `${backupAge}d since backup` : "Backed up";

  const exportBackup = () => {
    const exportedAt = new Date().toISOString();
    const payload = {
      app: "Daily Damage",
      version: 1,
      exportedAt,
      data: {
        theme,
        month,
        savings: cleanExpanded(savings),
        expenses: cleanExpanded(expenses),
        creditLoans: cleanExpanded(creditLoans),
      },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `daily-damage-backup-${datedFileStamp()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setBackupMeta({ lastBackupAt: exportedAt });
    setBackupMenuOpen(false);
    setStorageNotice("Backup downloaded.");
  };

  const importBackup = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const data = parsed.data || parsed;
        if (!Array.isArray(data.savings) || !Array.isArray(data.expenses) || !Array.isArray(data.creditLoans)) throw new Error("Invalid backup");
        setTheme(data.theme || "black");
        setMonth(data.month || new Date().toISOString().slice(0, 7));
        setSavings(data.savings.map((item) => ({ ...item, expanded: false })));
        setExpenses(data.expenses.map((item) => ({ ...item, expanded: false })));
        setCreditLoans(data.creditLoans.map((item) => ({ ...item, expanded: false })));
        setBackupMenuOpen(false);
        setStorageNotice("Backup restored on this browser.");
      } catch {
        setStorageNotice("That file does not look like a Daily Damage backup.");
      }
    };
    reader.readAsText(file);
  };

  const updateAccount = (accountId, amountDelta) => {
    setSavings((items) => items.map((item) => item.id === accountId ? { ...item, amount: Number(item.amount || 0) + amountDelta } : item));
  };

  const deleteExpense = (expense) => {
    const refund = expense.type === "recurring" ? Number(expense.amount || 0) * (expense.paidDates || []).length : Number(expense.amount || 0);
    if (refund) updateAccount(expense.accountId, refund);
    setExpenses((items) => items.filter((item) => item.id !== expense.id));
  };

  return (
    <div className="app-shell">
      <header className={`sidebar ${scrolled ? "scrolled" : ""}`}>
        <div className="brand"><img className="brand-logo" src="assets/logos/DailyDamage.png" alt="Daily Damage" /></div>
        <nav className="nav" aria-label="Primary">
          {[
            ["dashboard", "Dashboard"], ["expenses", "Expenses"], ["savings", "Money"], ["creditLoans", "Credit/Loans"],
          ].map(([key, label]) => <button key={key} className={`nav-item ${view === key ? "active" : ""}`} onClick={() => setView(key)} type="button">{label}</button>)}
        </nav>
        <div className="month-card">
          <label htmlFor="monthPicker">Workspace month</label>
          <input ref={importInputRef} className="backup-file-input" type="file" accept="application/json,.json" onChange={importBackup} />
          <input id="monthPicker" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          <button className="theme-toggle icon-only" data-theme-icon={theme === "black" ? "light" : "dark"} onClick={() => setTheme(theme === "black" ? "light" : "black")} type="button" aria-label={theme === "black" ? "Switch to light theme" : "Switch to dark theme"} title={theme === "black" ? "Switch to light theme" : "Switch to dark theme"} />
        </div>
      </header>
      <main className="workspace" onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 8)}>
        <section className={`view ${view === "dashboard" ? "active" : ""}`}><Dashboard savings={savings} expenses={expenses} creditLoans={creditLoans} month={month} /></section>
        <section className={`view ${view === "expenses" ? "active" : ""}`}><Expenses expenses={expenses} setExpenses={setExpenses} savings={savings} setSavings={setSavings} forms={forms} setForms={setForms} modes={modes} setModes={setModes} editing={editing} setEditing={setEditing} setModal={setModal} deleteExpense={deleteExpense} /></section>
        <section className={`view ${view === "savings" ? "active" : ""}`}><Money savings={savings} setSavings={setSavings} forms={forms} setForms={setForms} modes={modes} setModes={setModes} editing={editing} setEditing={setEditing} setModal={setModal} /></section>
        <section className={`view ${view === "creditLoans" ? "active" : ""}`}><CreditLoans creditLoans={creditLoans} setCreditLoans={setCreditLoans} forms={forms} setForms={setForms} modes={modes} setModes={setModes} editing={editing} setEditing={setEditing} setModal={setModal} /></section>
      </main>
      {modal?.type === "delete" && <ConfirmModal title={`Delete ${modal.name}?`} copy={modal.copy} confirmText={modal.confirmText || "Delete"} danger onCancel={() => setModal(null)} onConfirm={() => { modal.onConfirm(); setModal(null); }} />}
      {modal?.type === "pay" && <ConfirmModal title={`Pay ${modal.expense.reason}?`} copy={modal.copy} confirmText="Confirm paid" onCancel={() => setModal(null)} onConfirm={() => { modal.onConfirm(); setModal(null); }} />}
      {storageReady && !ownerReminder.acknowledgedAt && <OwnerReminder onConfirm={() => setOwnerReminder({ acknowledgedAt: new Date().toISOString() })} />}
      <div className={`backup-dock ${backupMenuOpen ? "open" : ""}`}>
        <button className={`backup-menu-button ${backupAge >= BACKUP_STALE_DAYS ? "due" : ""}`} type="button" onClick={() => setBackupMenuOpen((open) => !open)} aria-expanded={backupMenuOpen}>
          <span className="backup-icon" />
          <span>{backupStatus}</span>
        </button>
        <div className="backup-dropdown">
          <div className="backup-dropdown-head"><strong>Local backup</strong><span>{backupMeta.lastBackupAt ? `Last export: ${formatDate(backupMeta.lastBackupAt.slice(0, 10))}` : "No backup exported yet"}</span></div>
          <button type="button" onClick={exportBackup}><strong>Export backup</strong><span>Downloads a JSON file. Keep it in Drive, OneDrive, or a safe folder.</span></button>
          <button type="button" onClick={() => importInputRef.current?.click()}><strong>Import backup</strong><span>Restores this browser from a Daily Damage backup file.</span></button>
        </div>
      </div>
      {storageNotice && <div className="storage-toast"><span>{storageNotice}</span><button type="button" onClick={() => setStorageNotice("")}>Dismiss</button></div>}
    </div>
  );
}

function Dashboard({ savings, expenses, creditLoans, month }) {
  const banks = savings.filter((a) => (a.accountType || "bank") === "bank");
  const wallets = savings.filter((a) => a.accountType === "ewallet");
  const cards = savings.filter((a) => a.accountType === "creditCard");
  const recurring = expenses.filter((e) => e.type === "recurring");
  const regular = expenses.filter((e) => e.type !== "recurring");
  const unpaid = recurring.filter((e) => daysUntil(recurringDueDate(e)) <= 0);
  const spent = sumBy(regular, (e) => e.amount) + sumBy(recurring, (e) => Number(e.amount || 0) * (e.paidDates || []).length);
  const recent = [...expenses].sort((a, b) => new Date(`${b.date || todayISO()}T00:00:00`) - new Date(`${a.date || todayISO()}T00:00:00`)).slice(0, 5);
  const upcoming = recurring.map((e) => ({ ...e, dueDate: recurringDueDate(e), dueIn: daysUntil(recurringDueDate(e)) })).sort((a, b) => Number(a.dueIn || 0) - Number(b.dueIn || 0)).slice(0, 5);
  const accounts = [...banks, ...wallets, ...cards].sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0)).slice(0, 5);
  const paidRecurring = recurring.map((e) => ({ ...e, amount: Number(e.amount || 0) * (e.paidDates || []).length })).filter((e) => e.amount > 0);
  const spendingTrend = chartBuckets([...regular, ...paidRecurring]);
  const accountMix = [
    { label: "Banks", value: sumBy(banks, (a) => a.amount), color: "#14d8c4" },
    { label: "E-wallets", value: sumBy(wallets, (a) => a.amount), color: "#38bdf8" },
    { label: "Cards", value: sumBy(cards, (a) => a.amount), color: "#a78bfa" },
  ].filter((item) => item.value > 0);
  const spendingBreakdown = categoryBreakdown([...regular, ...paidRecurring]);

  return (
    <div className="dashboard-shell">
      <div className="section-head dashboard-head"><div><p className="eyebrow">Dashboard</p><h2>Financial snapshot</h2></div><span className="dashboard-month">{month}</span></div>
      <section className="dashboard-top">
        <Panel title="Money watchlist">
          <Task icon="wallet" label="Cash + wallets" value={formatCurrency(sumBy([...banks, ...wallets], (a) => a.amount))} tone="positive" />
          <Task icon="alert" label="Unpaid recurring" value={unpaid.length} tone={unpaid.length ? "danger" : "positive"} />
          <Task icon="debt" label="Open credit/loans" value={formatCurrency(sumBy(creditLoans, (c) => c.balance))} tone="danger" />
          <Task icon="spend" label="Total spent" value={formatCurrency(spent)} tone="warning" />
        </Panel>
        <RecentTable expenses={recent} savings={savings} />
      </section>
      <section className="dashboard-quick">
        <Quick icon="wallet" label="Cash + wallets" value={sumBy([...banks, ...wallets], (a) => a.amount)} meta={`${banks.length + wallets.length} accounts`} tone="positive" />
        <Quick icon="card" label="Card limits" value={sumBy(cards, (a) => a.amount)} meta={`${cards.length} cards`} />
        <Quick icon="alert" label="Recurring unpaid" value={sumBy(unpaid, (e) => e.amount)} meta={`${unpaid.length} due`} tone="danger" />
        <Quick icon="debt" label="Credit/loans" value={sumBy(creditLoans, (c) => c.balance)} meta={`${creditLoans.length} balances`} tone="warning" />
      </section>
      <section className="dashboard-report">
        <div className="dashboard-report-head"><h3>Monthly report</h3><span>{month}</span></div>
        <div className="dashboard-insights">
          <SpendingLineChart title="Spending movement" data={spendingTrend} />
          <AccountDonut title="Money distribution" data={accountMix} />
          <RankedBreakdown title="Top spending reasons" data={spendingBreakdown} />
        </div>
      </section>
      <section className="dashboard-grid">
        <Panel title="Upcoming recurring">{upcoming.length ? upcoming.map((e) => <DashboardExpense key={e.id} expense={e} savings={savings} meta={availabilityLabel(e) || "Now"} />) : <Empty text="No recurring expenses yet" />}</Panel>
        <Panel title="Lowest balances">{accounts.length ? accounts.map((a) => <DashboardAccount key={a.id} account={a} />) : <Empty text="Add Money accounts to see balances" />}</Panel>
      </section>
    </div>
  );
}

function chartBuckets(expenses) {
  const buckets = new Map();
  expenses.forEach((expense) => {
    const key = new Date(`${expense.date || todayISO()}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    buckets.set(key, (buckets.get(key) || 0) + Number(expense.amount || 0));
  });
  return [...buckets.entries()].slice(-7).map(([label, value]) => ({ label, value }));
}

function categoryBreakdown(expenses) {
  const buckets = new Map();
  expenses.forEach((expense) => {
    const label = expense.reason || (expense.type === "recurring" ? "Recurring" : "Expense");
    buckets.set(label, (buckets.get(label) || 0) + Number(expense.amount || 0));
  });
  return [...buckets.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function Panel({ title, children }) {
  return <article className="dashboard-panel"><h3>{title}</h3><div className="dashboard-list">{children}</div></article>;
}

function FinanceIcon({ type }) {
  return <i className={`finance-icon ${type || "wallet"}`} aria-hidden="true" />;
}

function Task({ icon, label, value, tone }) {
  return <div className={`dashboard-task ${tone || ""}`}><span><FinanceIcon type={icon} />{label}</span><b>{value}</b></div>;
}

function Quick({ icon, label, value, meta, tone }) {
  return <article className={`dashboard-quick-card ${tone || ""}`}><div className="quick-card-head"><FinanceIcon type={icon} /><span>{label}</span></div><strong>{formatCurrency(value)}</strong><small>{meta}</small></article>;
}

function RecentTable({ expenses, savings }) {
  return <article className="dashboard-panel dashboard-table"><h3><FinanceIcon type="spend" />Recent expenses</h3><div className="dashboard-table-head"><span>Subject</span><span>Account</span><span>Type</span><span>Amount</span></div>{expenses.length ? expenses.map((e) => {
    const account = savings.find((a) => a.id === e.accountId);
    return <div className="dashboard-table-row" key={e.id}><span>{e.reason || "Expense"}</span><span>{account?.bank || "Account removed"}</span><span>{e.type === "recurring" ? recurringFrequencyLabel(e.frequency) : "One-time"}</span><b>{formatCurrency(e.amount)}</b></div>;
  }) : <Empty text="No recent expenses" />}</article>;
}

function SpendingLineChart({ title, data }) {
  const width = 520;
  const height = 190;
  const padding = 28;
  const max = Math.max(...data.map((item) => item.value), 1);
  const points = data.map((item, index) => {
    const x = data.length === 1 ? width / 2 : padding + (index / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - (item.value / max) * (height - padding * 2);
    return { ...item, x, y };
  });
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const area = points.length ? `${path} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z` : "";

  return <article className="insight-card insight-line"><div className="insight-card-head"><h4>{title}</h4><span>{formatCurrency(sumBy(data, (item) => item.value))}</span></div>{data.length ? <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
    <line className="chart-axis" x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
    {[0.25, 0.5, 0.75].map((tick) => <line className="chart-grid-line" key={tick} x1={padding} y1={height - padding - tick * (height - padding * 2)} x2={width - padding} y2={height - padding - tick * (height - padding * 2)} />)}
    <path className="line-area" d={area} />
    <path className="line-path" d={path} />
    {points.map((point) => <g key={point.label}><circle className="line-dot" cx={point.x} cy={point.y} r="4" /><text className="line-label" x={point.x} y={height - 7} textAnchor="middle">{point.label}</text></g>)}
  </svg> : <Empty text="No spending trend yet" />}</article>;
}

function AccountDonut({ title, data }) {
  const total = sumBy(data, (item) => item.value);
  let offset = 25;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;

  return <article className="insight-card"><div className="insight-card-head"><h4>{title}</h4><span>{formatCurrency(total)}</span></div>{data.length ? <div className="donut-wrap"><svg className="donut-chart" viewBox="0 0 120 120" role="img" aria-label={title}>
    <circle className="donut-track" cx="60" cy="60" r={radius} />
    {data.map((item) => {
      const dash = (item.value / total) * circumference;
      const segment = <circle key={item.label} className="donut-segment" cx="60" cy="60" r={radius} stroke={item.color} strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={offset} />;
      offset -= dash;
      return segment;
    })}
    <text className="donut-total" x="60" y="57" textAnchor="middle">{data.length}</text>
    <text className="donut-caption" x="60" y="72" textAnchor="middle">groups</text>
  </svg><div className="donut-legend">{data.map((item) => <div key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><b>{Math.round((item.value / total) * 100)}%</b></div>)}</div></div> : <Empty text="Add accounts to show distribution" />}</article>;
}

function RankedBreakdown({ title, data }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return <article className="insight-card"><div className="insight-card-head"><h4>{title}</h4><span>{data.length} items</span></div>{data.length ? <div className="ranked-list">{data.map((item, index) => <div className="ranked-row" key={item.label}><div><strong>{item.label}</strong><small>{formatCurrency(item.value)}</small></div><span className="rank-bar"><i style={{ width: `${Math.max(10, (item.value / max) * 100)}%` }} /></span><b>{index + 1}</b></div>)}</div> : <Empty text="No spending breakdown yet" />}</article>;
}

function DashboardExpense({ expense, savings, meta }) {
  const account = savings.find((a) => a.id === expense.accountId);
  return <div className="dashboard-row"><span className="expense-icon mini">{expense.icon || "🧾"}</span><span><strong>{expense.reason || "Expense"}</strong><small>{account?.bank || "Account removed"} • {meta}</small></span><b>{formatCurrency(expense.amount)}</b></div>;
}

function DashboardAccount({ account }) {
  return <div className="dashboard-row"><Logo name={account.bank} mini /><span><strong>{account.bank}</strong><small>{account.accountType === "ewallet" ? "Wallet" : account.accountType === "creditCard" ? "Card" : "Bank"}{account.accountNumber ? ` • ${account.accountNumber}` : ""}</small></span><b>{formatCurrency(account.amount)}</b></div>;
}

function Empty({ text }) {
  return <div className="dashboard-empty">{text}</div>;
}

function Money({ savings, setSavings, forms, setForms, modes, setModes, editing, setEditing, setModal }) {
  const [form, setForm] = useState({ accountType: "bank", bank: "MariBank", accountNumber: "", amount: "" });
  const groups = [
    ["bank", "Traditional bank accounts", "Bank accounts and cash deposits"],
    ["creditCard", "Credit card accounts", "Available card limits and card balances"],
    ["ewallet", "E-wallets", "Digital wallets and app balances"],
  ];
  const submit = (event) => {
    event.preventDefault();
    setSavings((items) => [...items, { id: crypto.randomUUID(), accountType: form.accountType, bank: form.bank, accountNumber: form.accountNumber, amount: parseMoney(form.amount), expanded: false }]);
    setForm({ accountType: "bank", bank: "MariBank", accountNumber: "", amount: "" });
    setForms((x) => ({ ...x, money: false }));
  };
  return <><div className="section-head"><div><p className="eyebrow">Money accounts</p><h2>Track cash, wallets, and cards</h2></div><button className="primary-action" onClick={() => setForms((x) => ({ ...x, money: true }))}>Add Money Account</button></div>
    {forms.money && <form className="inline-panel" onSubmit={submit}><Field label="Account type"><select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value, bank: institutions[e.target.value][0] })}>{institutionTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field><Field label="Institution"><input list="moneyInstitutionList" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} required /><datalist id="moneyInstitutionList">{institutions[form.accountType].map((i) => <option value={i} key={i} />)}</datalist></Field><Field label="Account number"><input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} required /></Field><MoneyField label={form.accountType === "creditCard" ? "Credit limit" : "Amount"} value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} /><div className="form-actions"><button className="primary-action">Save</button><button className="text-button" type="button" onClick={() => setForms((x) => ({ ...x, money: false }))}>Cancel</button></div></form>}
    <div className="savings-grid">{groups.map(([type, title, subtitle]) => <AccountCategory key={type} type={type} title={title} subtitle={subtitle} accounts={savings.filter((a) => (a.accountType || "bank") === type)} savings={savings} setSavings={setSavings} modes={modes} setModes={setModes} editing={editing} setEditing={setEditing} setModal={setModal} />)}</div></>;
}

function AccountCategory({ type, title, subtitle, accounts, savings, setSavings, modes, setModes, editing, setEditing, setModal }) {
  const deleteMode = modes.moneyDelete[type];
  const editMode = modes.moneyEdit[type];
  const toggleMode = (kind) => setModes((m) => ({ ...m, moneyDelete: { ...m.moneyDelete, [type]: kind === "delete" ? !deleteMode : false }, moneyEdit: { ...m.moneyEdit, [type]: kind === "edit" ? !editMode : false } }));
  const onDrop = (event) => {
    event.preventDefault();
    const payload = JSON.parse(event.dataTransfer.getData("text/plain") || "{}");
    if (payload.source !== "money" || payload.category !== type) return;
    const target = event.target.closest("[data-savings-id]");
    if (target) setSavings((items) => reorder(items, payload.id, target.dataset.savingsId, (item) => (item.accountType || "bank") === type));
  };
  return <section className={`savings-category ${deleteMode ? "deleting" : ""} ${editMode ? "editing" : ""}`} data-category={type}><CategoryHead title={title} subtitle={subtitle} disabled={!accounts.length} active={deleteMode || editMode} onEdit={() => toggleMode("edit")} editLabel={editMode ? "Stop editing" : "Edit order"} onDelete={() => toggleMode("delete")} deleteLabel={deleteMode ? "Stop deleting" : "Delete"} />{accounts.length ? <div className="savings-tile-grid" data-money-tile-grid={type} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>{accounts.map((account) => <MoneyTile key={account.id} account={account} editMode={editMode} savings={savings} setSavings={setSavings} editing={editing} setEditing={setEditing} setModal={setModal} />)}</div> : <div className="category-empty">No accounts added here yet.</div>}</section>;
}

function MoneyTile({ account, editMode, savings, setSavings, editing, setEditing, setModal }) {
  const isEditing = editing.money === account.id;
  const [draft, setDraft] = useState({ accountNumber: account.accountNumber || "", amount: formatMoneyInput(account.amount) });
  useEffect(() => setDraft({ accountNumber: account.accountNumber || "", amount: formatMoneyInput(account.amount) }), [account.id, account.accountNumber, account.amount]);
  const saveEdit = () => {
    setSavings((items) => items.map((item) => item.id === account.id ? { ...item, accountNumber: draft.accountNumber, amount: parseMoney(draft.amount) } : item));
    setEditing((x) => ({ ...x, money: "" }));
  };
  return <article className={`savings-tile ${account.expanded ? "expanded" : ""} ${isEditing ? "tile-editing" : ""}`} data-savings-id={account.id} draggable={editMode} onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ id: account.id, category: account.accountType || "bank", source: "money" }))}>
    <button className="tile-delete-button" type="button" onClick={() => setModal({ type: "delete", name: account.bank, copy: account.accountNumber ? `Account ${account.accountNumber} will be removed.` : "This account will be removed.", confirmText: "Delete account", onConfirm: () => setSavings((items) => items.filter((item) => item.id !== account.id)) })}><span className="trash-icon" /></button>
    {account.expanded && <TileMenu active={isEditing} onEdit={() => setEditing((x) => ({ ...x, money: isEditing ? "" : account.id }))} label={isEditing ? "Done editing" : "Edit details"} />}
    <button className="savings-summary" type="button" onClick={() => { if (!editMode) setSavings((items) => items.map((item) => item.id === account.id ? { ...item, expanded: !item.expanded } : item)); }}><Logo name={account.bank} /><span><strong>{account.bank}</strong><small className="account-number">{account.accountNumber || "No account number"}</small><small>{account.accountType === "creditCard" ? "Available credit" : "Available balance"}</small></span><b>{formatCurrency(account.amount)}</b></button>
    <div className="savings-detail">{isEditing ? <><Field label="Account number"><input className="savings-edit-input" value={draft.accountNumber} onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })} /></Field><MoneyField label={account.accountType === "creditCard" ? "Available credit" : "Amount"} value={draft.amount} onChange={(value) => setDraft({ ...draft, amount: value })} edit /><ActionRow onCancel={() => setEditing((x) => ({ ...x, money: "" }))} onSave={saveEdit} /></> : <div className="detail-grid"><Info label="Institution" value={account.bank} /><Info label="Account number" value={account.accountNumber || "Not set"} /><Info label={account.accountType === "creditCard" ? "Available credit" : "Available balance"} value={formatCurrency(account.amount)} /></div>}</div>
  </article>;
}

function Expenses({ expenses, setExpenses, savings, setSavings, forms, setForms, modes, setModes, editing, setEditing, setModal, deleteExpense }) {
  const [form, setForm] = useState({ type: "expense", icon: "🧾", amount: "", date: todayISO(), accountId: savings[0]?.id || "", reason: "", frequency: "monthly" });
  useEffect(() => { if (!form.accountId && savings[0]) setForm((f) => ({ ...f, accountId: savings[0].id })); }, [savings, form.accountId]);
  const submit = (event) => {
    event.preventDefault();
    const amount = parseMoney(form.amount);
    const expense = { id: crypto.randomUUID(), type: form.type, icon: form.icon, amount, date: form.date, accountId: form.accountId, reason: form.reason, frequency: form.type === "recurring" ? form.frequency : "", paidDates: [], expanded: false };
    setExpenses((items) => [...items, expense]);
    if (form.type !== "recurring") setSavings((items) => items.map((a) => a.id === form.accountId ? { ...a, amount: Number(a.amount || 0) - amount } : a));
    setForm({ type: "expense", icon: "🧾", amount: "", date: todayISO(), accountId: savings[0]?.id || "", reason: "", frequency: "monthly" });
    setForms((x) => ({ ...x, expense: false }));
  };
  return <><div className="section-head"><div><p className="eyebrow">Expenses</p><h2>Track spending and recurring bills</h2></div><button className="primary-action" onClick={() => setForms((x) => ({ ...x, expense: true }))}>Add Expense</button></div>
    {forms.expense && <form className="inline-panel" onSubmit={submit}><Field label="Type"><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="expense">Expense</option><option value="recurring">Recurring Expense</option></select></Field><Field label="Icon"><select value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}>{expenseIcons.map((i) => <option key={i.value} value={i.value}>{i.value} {i.label}</option>)}</select></Field>{form.type === "recurring" && <Field label="Frequency"><select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>{["monthly", "weekly", "biweekly", "daily", "annually"].map((f) => <option key={f} value={f}>{recurringFrequencyLabel(f)}</option>)}</select></Field>}<MoneyField label="Amount" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} /><Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field><Field label="Account taken from"><select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>{savings.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)} - {formatCurrency(a.amount)}</option>)}</select></Field><Field label="Reason"><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required /></Field><div className="form-actions"><button className="primary-action">Save</button><button className="text-button" type="button" onClick={() => setForms((x) => ({ ...x, expense: false }))}>Cancel</button></div></form>}
    <div className="savings-grid"><ExpenseCategory type="recurring" title="Recurring Monthly Expenses" subtitle="Bills and subscriptions that repeat monthly" expenses={expenses.filter((e) => e.type === "recurring")} allExpenses={expenses} setExpenses={setExpenses} savings={savings} setSavings={setSavings} modes={modes} setModes={setModes} editing={editing} setEditing={setEditing} setModal={setModal} deleteExpense={deleteExpense} /><ExpenseCategory type="expense" title="Expenses" subtitle="One-time spending and daily purchases" expenses={expenses.filter((e) => e.type !== "recurring")} allExpenses={expenses} setExpenses={setExpenses} savings={savings} setSavings={setSavings} modes={modes} setModes={setModes} editing={editing} setEditing={setEditing} setModal={setModal} deleteExpense={deleteExpense} /></div></>;
}

function ExpenseCategory(props) {
  const { type, title, subtitle, expenses, allExpenses, setExpenses, modes, setModes } = props;
  const deleteMode = modes.expenseDelete[type];
  const editMode = modes.expenseEdit[type];
  const toggleMode = (kind) => setModes((m) => ({ ...m, expenseDelete: { ...m.expenseDelete, [type]: kind === "delete" ? !deleteMode : false }, expenseEdit: { ...m.expenseEdit, [type]: kind === "edit" ? !editMode : false } }));
  const onDrop = (event) => {
    event.preventDefault();
    const payload = JSON.parse(event.dataTransfer.getData("text/plain") || "{}");
    if (payload.source !== "expense" || payload.category !== type) return;
    const target = event.target.closest("[data-expense-id]");
    if (target) setExpenses(reorder(allExpenses, payload.id, target.dataset.expenseId, (item) => (type === "recurring" ? item.type === "recurring" : item.type !== "recurring")));
  };
  return <section className={`savings-category ${deleteMode ? "deleting" : ""} ${editMode ? "editing" : ""}`} data-expense-category={type}><CategoryHead title={title} subtitle={subtitle} disabled={!expenses.length} active={deleteMode || editMode} onEdit={() => toggleMode("edit")} editLabel={editMode ? "Stop editing" : "Edit order"} onDelete={() => toggleMode("delete")} deleteLabel={deleteMode ? "Stop deleting" : "Delete"} />{expenses.length ? <div className="savings-tile-grid expense-tile-grid" data-expense-tile-grid={type} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>{expenses.map((e) => <ExpenseTile key={e.id} expense={e} editMode={editMode} {...props} />)}</div> : <div className="category-empty">No {type === "recurring" ? "recurring expenses" : "expenses"} added yet.</div>}</section>;
}

function ExpenseTile({ expense, editMode, allExpenses, setExpenses, savings, setSavings, editing, setEditing, setModal, deleteExpense }) {
  const account = savings.find((a) => a.id === expense.accountId);
  const isEditing = editing.expense === expense.id;
  const hasPaid = Boolean((expense.paidDates || []).length);
  const isRecurring = expense.type === "recurring";
  const due = isRecurring ? recurringDueDate(expense) : expense.date;
  const dueIn = daysUntil(due);
  const payable = isRecurring && (dueIn === "" || dueIn <= 0);
  const badge = isRecurring ? (hasPaid ? availabilityLabel(expense) : "Unpaid") : "";
  const [draft, setDraft] = useState({ icon: expense.icon || "🧾", amount: formatMoneyInput(expense.amount), date: expense.date || todayISO(), accountId: expense.accountId, reason: expense.reason || "", frequency: expense.frequency || "monthly" });
  useEffect(() => setDraft({ icon: expense.icon || "🧾", amount: formatMoneyInput(expense.amount), date: expense.date || todayISO(), accountId: expense.accountId, reason: expense.reason || "", frequency: expense.frequency || "monthly" }), [expense]);
  const saveEdit = () => {
    const previousAmount = Number(expense.amount || 0);
    const previousAccount = expense.accountId;
    const nextAmount = parseMoney(draft.amount);
    setExpenses((items) => items.map((item) => item.id === expense.id ? { ...item, icon: draft.icon, amount: nextAmount, date: draft.date, accountId: draft.accountId, reason: draft.reason, frequency: isRecurring ? draft.frequency : "" } : item));
    if (!isRecurring) setSavings((items) => items.map((a) => a.id === previousAccount ? { ...a, amount: Number(a.amount || 0) + previousAmount } : a).map((a) => a.id === draft.accountId ? { ...a, amount: Number(a.amount || 0) - nextAmount } : a));
    setEditing((x) => ({ ...x, expense: "" }));
  };
  const pay = () => setModal({ type: "pay", expense, copy: `Deduct ${formatCurrency(expense.amount)} from ${account?.bank || "the selected account"} for ${formatDate(due)}. The button unlocks on the next cycle.`, onConfirm: () => { setSavings((items) => items.map((a) => a.id === expense.accountId ? { ...a, amount: Number(a.amount || 0) - Number(expense.amount || 0) } : a)); setExpenses((items) => items.map((item) => item.id === expense.id ? { ...item, paidDates: [...new Set([...(item.paidDates || []), due])] } : item)); } });
  return <article className={`savings-tile expense-tile ${expense.expanded ? "expanded" : ""} ${isEditing ? "tile-editing" : ""}`} data-expense-id={expense.id} draggable={editMode} onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ id: expense.id, category: isRecurring ? "recurring" : "expense", source: "expense" }))}>
    <button className="tile-delete-button" type="button" onClick={() => setModal({ type: "delete", name: expense.reason, copy: "This expense will be removed. Any deducted amount from this record will be returned to its account.", confirmText: "Delete expense", onConfirm: () => deleteExpense(expense) })}><span className="trash-icon" /></button>
    {expense.expanded && <TileMenu active={isEditing} onEdit={() => setEditing((x) => ({ ...x, expense: isEditing ? "" : expense.id }))} label={isEditing ? "Done editing" : "Edit details"} extra={<button type="button" onClick={() => setModal({ type: "delete", name: expense.reason, copy: "This expense will be removed. Any deducted amount from this record will be returned to its account.", confirmText: "Delete expense", onConfirm: () => deleteExpense(expense) })}>Delete</button>} />}
    <button className="expense-summary" onClick={() => { if (!editMode) setExpenses((items) => items.map((item) => item.id === expense.id ? { ...item, expanded: !item.expanded } : item)); }} type="button"><span className="expense-icon">{expense.icon || "🧾"}</span><span><strong>{expense.reason}</strong><small className="account-number">{account?.bank || "Account removed"}</small><small>{isRecurring ? recurringFrequencyLabel(expense.frequency) : "One-time"}</small></span><span className="expense-amount"><b>{formatCurrency(expense.amount)}</b>{badge && <small className={`expense-counter ${!hasPaid ? "unpaid" : ""}`}>{badge}</small>}</span></button>
    <div className="savings-detail">{isEditing ? <><Field label="Icon"><select className="savings-edit-input" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })}>{expenseIcons.map((i) => <option key={i.value} value={i.value}>{i.value} {i.label}</option>)}</select></Field><MoneyField label="Amount" value={draft.amount} onChange={(value) => setDraft({ ...draft, amount: value })} edit /><Field label={isRecurring ? "Start date" : "Date"}><input className="savings-edit-input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>{isRecurring && <Field label="Frequency"><select className="savings-edit-input" value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}>{["monthly", "weekly", "biweekly", "daily", "annually"].map((f) => <option key={f} value={f}>{recurringFrequencyLabel(f)}</option>)}</select></Field>}<Field label="Account taken from"><select className="savings-edit-input" value={draft.accountId} onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}>{savings.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)} - {formatCurrency(a.amount)}</option>)}</select></Field><Field label="Reason"><input className="savings-edit-input" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} /></Field><ActionRow onCancel={() => setEditing((x) => ({ ...x, expense: "" }))} onSave={saveEdit} /></> : <><div className="detail-grid"><Info label="Type" value={isRecurring ? "Recurring" : "Expense"} /><Info label="Amount" value={formatCurrency(expense.amount)} /><Info label={isRecurring ? "Next due" : "Date"} value={formatDate(due)} /><Info label="Account" value={account ? accountLabel(account) : "Account removed"} />{isRecurring && <><Info label="Frequency" value={recurringFrequencyLabel(expense.frequency)} /><Info label="Paid count" value={(expense.paidDates || []).length} /></>}<Info label="Reason" value={expense.reason || "Not set"} /></div>{isRecurring && <div className="pay-action"><button className="primary-action detail-save pay-button" type="button" disabled={!payable} onClick={pay}>{payable ? "Paid" : hasPaid ? "Paid" : "Upcoming"}</button></div>}</>}</div>
  </article>;
}

function CreditLoans({ creditLoans, setCreditLoans, forms, setForms, modes, setModes, editing, setEditing, setModal }) {
  const [form, setForm] = useState({ type: "Credit Card", provider: "UnionBank", amount: "", usedDate: todayISO(), termMonths: "1", dueDate: todayISO(), reason: "" });
  const submit = (event) => {
    event.preventDefault();
    setCreditLoans((items) => [...items, { id: crypto.randomUUID(), type: normalizeCreditType(form.type), provider: form.provider || defaultProvider(form.type), balance: parseMoney(form.amount), usedDate: form.usedDate, termMonths: form.termMonths, dueDate: form.dueDate, reason: form.reason, expanded: false }]);
    setForm({ type: "Credit Card", provider: "UnionBank", amount: "", usedDate: todayISO(), termMonths: "1", dueDate: todayISO(), reason: "" });
    setForms((x) => ({ ...x, credit: false }));
  };
  const credits = creditLoans.filter((c) => isCreditType(c.type));
  const loans = creditLoans.filter((c) => !isCreditType(c.type));
  return <><div className="section-head"><div><p className="eyebrow">Credit and loans</p><h2>Track balances, terms, and due dates</h2></div><button className="primary-action" onClick={() => setForms((x) => ({ ...x, credit: true }))}>Add Credit/Loan</button></div>{forms.credit && <form className="inline-panel" onSubmit={submit}><Field label="Type"><input list="creditTypeList" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, provider: defaultProvider(e.target.value) || form.provider })} /><datalist id="creditTypeList">{creditTypes.map((t) => <option key={t} value={t} />)}</datalist></Field><Field label="Provider"><input list="creditProviderList" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} /><datalist id="creditProviderList">{creditProviders.map((p) => <option key={p} value={p} />)}</datalist></Field><Field label="Date used"><input type="date" value={form.usedDate} onChange={(e) => setForm({ ...form, usedDate: e.target.value })} /></Field><MoneyField label="Amount" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} /><Field label="Terms"><input inputMode="numeric" value={form.termMonths} onChange={(e) => setForm({ ...form, termMonths: e.target.value })} /></Field><Field label="Due date"><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field><Field label="Reason"><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field><div className="form-actions"><button className="primary-action">Save</button><button className="text-button" type="button" onClick={() => setForms((x) => ({ ...x, credit: false }))}>Cancel</button></div></form>}<div className="savings-grid"><div className="summary-grid"><article className="summary-card"><small>Total credit left</small><strong>{formatCurrency(sumBy(credits, (c) => c.balance))}</strong></article><article className="summary-card"><small>Total loans left</small><strong>{formatCurrency(sumBy(loans, (c) => c.balance))}</strong></article></div><CreditCategory type="credit" title="Credit" subtitle="Credit card and credit-line balances" items={credits} all={creditLoans} setCreditLoans={setCreditLoans} modes={modes} setModes={setModes} editing={editing} setEditing={setEditing} setModal={setModal} /><CreditCategory type="loan" title="Loans" subtitle="Loans, pay-later, and custom balances" items={loans} all={creditLoans} setCreditLoans={setCreditLoans} modes={modes} setModes={setModes} editing={editing} setEditing={setEditing} setModal={setModal} /></div></>;
}

function CreditCategory({ type, title, subtitle, items, all, setCreditLoans, modes, setModes, editing, setEditing, setModal }) {
  if (!items.length) return null;
  const deleteMode = modes.creditDelete[type];
  const editMode = modes.creditEdit[type];
  const toggleMode = (kind) => setModes((m) => ({ ...m, creditDelete: { ...m.creditDelete, [type]: kind === "delete" ? !deleteMode : false }, creditEdit: { ...m.creditEdit, [type]: kind === "edit" ? !editMode : false } }));
  const filter = (item) => (type === "credit" ? isCreditType(item.type) : !isCreditType(item.type));
  return <section className={`savings-category ${deleteMode ? "deleting" : ""} ${editMode ? "editing" : ""}`} data-credit-category={type}><CategoryHead title={title} subtitle={subtitle} disabled={!items.length} active={deleteMode || editMode} onEdit={() => toggleMode("edit")} editLabel={editMode ? "Stop editing" : "Edit order"} onDelete={() => toggleMode("delete")} deleteLabel={deleteMode ? "Stop deleting" : "Delete"} />{items.length ? <div className="savings-tile-grid" data-credit-tile-grid={type} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}"); const target = e.target.closest("[data-credit-loan-id]"); if (payload.source === "credit" && payload.category === type && target) setCreditLoans(reorder(all, payload.id, target.dataset.creditLoanId, filter)); }}>{items.map((item) => <CreditTile key={item.id} account={item} editMode={editMode} setCreditLoans={setCreditLoans} editing={editing} setEditing={setEditing} setModal={setModal} />)}</div> : <div className="category-empty">No accounts added here yet.</div>}</section>;
}

function CreditTile({ account, editMode, setCreditLoans, editing, setEditing, setModal }) {
  const isEditing = editing.credit === account.id;
  const dueIn = daysUntil(account.dueDate);
  const [draft, setDraft] = useState({ provider: account.provider || "", usedDate: account.usedDate || todayISO(), balance: formatMoneyInput(account.balance), termMonths: account.termMonths || "", dueDate: account.dueDate || "", reason: account.reason || "" });
  useEffect(() => setDraft({ provider: account.provider || "", usedDate: account.usedDate || todayISO(), balance: formatMoneyInput(account.balance), termMonths: account.termMonths || "", dueDate: account.dueDate || "", reason: account.reason || "" }), [account]);
  const schedule = Number(account.termMonths || 0) > 1 ? Array.from({ length: Number(account.termMonths || 0) }, (_, i) => addMonths(account.dueDate, i)) : [];
  const saveEdit = () => { setCreditLoans((items) => items.map((item) => item.id === account.id ? { ...item, provider: draft.provider, usedDate: draft.usedDate, balance: parseMoney(draft.balance), termMonths: draft.termMonths, dueDate: draft.dueDate, reason: draft.reason } : item)); setEditing((x) => ({ ...x, credit: "" })); };
  return <article className={`savings-tile credit-tile ${account.expanded ? "expanded" : ""} ${isEditing ? "tile-editing" : ""}`} data-credit-loan-id={account.id} draggable={editMode} onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ id: account.id, category: isCreditType(account.type) ? "credit" : "loan", source: "credit" }))}><button className="tile-delete-button" type="button" onClick={() => setModal({ type: "delete", name: account.provider, copy: `${creditTypeLabel(account.type)} from ${account.provider || "this provider"} will be removed.`, confirmText: "Delete item", onConfirm: () => setCreditLoans((items) => items.filter((item) => item.id !== account.id)) })}><span className="trash-icon" /></button>{account.expanded && <TileMenu active={isEditing} onEdit={() => setEditing((x) => ({ ...x, credit: isEditing ? "" : account.id }))} label={isEditing ? "Done editing" : "Edit details"} />}<button className="savings-summary" type="button" onClick={() => { if (!editMode) setCreditLoans((items) => items.map((item) => item.id === account.id ? { ...item, expanded: !item.expanded } : item)); }}><Logo name={account.provider} /><span><strong>{creditTypeLabel(account.type)}</strong><small className="account-number">{account.provider || "No provider"}</small><small>{account.termMonths ? `${account.termMonths} months` : "No terms set"}</small><small>{dueIn === "" ? "No due date" : dueIn < 0 ? `${Math.abs(dueIn)} days overdue` : dueIn === 0 ? "Due today" : `Due in ${dueIn} days`}</small></span><b>{formatCurrency(account.balance)}</b></button><div className="savings-detail">{isEditing ? <><Field label="Provider"><input className="savings-edit-input" value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} /></Field><Field label="Date used"><input className="savings-edit-input" type="date" value={draft.usedDate} onChange={(e) => setDraft({ ...draft, usedDate: e.target.value })} /></Field><MoneyField label="Amount" value={draft.balance} onChange={(value) => setDraft({ ...draft, balance: value })} edit /><Field label="Terms"><input className="savings-edit-input" value={draft.termMonths} onChange={(e) => setDraft({ ...draft, termMonths: e.target.value })} /></Field><Field label="Due date"><input className="savings-edit-input" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></Field><Field label="Reason"><input className="savings-edit-input" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} /></Field>{schedule.length > 0 && <PaymentSchedule dates={schedule} />}<ActionRow onCancel={() => setEditing((x) => ({ ...x, credit: "" }))} onSave={saveEdit} /></> : <><div className="detail-grid"><Info label="Provider" value={account.provider || "Not set"} /><Info label="Date used" value={formatDate(account.usedDate)} /><Info label="Amount" value={formatCurrency(account.balance)} /><Info label="Terms" value={`${account.termMonths || 0} months`} /><Info label={Number(account.termMonths || 0) > 1 ? "Payment due" : "Due date"} value={formatDate(account.dueDate)} /><Info label="Reason" value={account.reason || "Not set"} /></div>{schedule.length > 0 && <PaymentSchedule dates={schedule} />}</>}</div></article>;
}

function PaymentSchedule({ dates }) {
  return <div className="payment-schedule"><strong>Payment schedule</strong><ol>{dates.map((date, index) => <li key={`${date}-${index}`}><span>Payment {index + 1}</span><b>{formatDate(date)}</b></li>)}</ol></div>;
}

function CategoryHead({ title, subtitle, disabled, active, onEdit, editLabel, onDelete, deleteLabel }) {
  return <div className="savings-category-head"><div><h3>{title}</h3><p>{subtitle}</p></div><div className="category-actions"><button className={`category-menu-toggle ${active ? "active" : ""}`} disabled={disabled} type="button" onClick={(e) => e.currentTarget.parentElement.classList.toggle("open")}><span /></button><div className="category-menu"><button type="button" onClick={onEdit}>{editLabel}</button><button type="button" onClick={onDelete}>{deleteLabel}</button></div></div></div>;
}

function TileMenu({ active, onEdit, label, extra }) {
  return <div className="tile-actions"><button className={`category-menu-toggle tile-menu-toggle ${active ? "active" : ""}`} type="button" onClick={(e) => e.currentTarget.parentElement.classList.toggle("open")}><span /></button><div className="category-menu tile-menu"><button type="button" onClick={onEdit}>{label}</button>{extra}</div></div>;
}

function Logo({ name, mini }) {
  const [src, setSrc] = useState(logoPath(name));
  useEffect(() => setSrc(logoPath(name)), [name]);
  return <span className={`savings-logo ${mini ? "mini" : ""}`}><img src={src} alt={`${name} logo`} onError={() => src !== fallbackLogo(name) ? setSrc(fallbackLogo(name)) : setSrc("")} style={!src ? { display: "none" } : undefined} /></span>;
}

function Field({ label, children }) {
  return <label>{label}{children}</label>;
}

function MoneyField({ label, value, onChange, edit }) {
  return <Field label={label}><span className="money-input"><span>₱</span><input className={edit ? "savings-edit-input" : ""} inputMode="decimal" value={value} onChange={(e) => onChange(formatMoneyInput(e.target.value))} required /></span></Field>;
}

function Info({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ActionRow({ onCancel, onSave }) {
  return <div className="detail-actions"><button className="text-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-action detail-save" type="button" onClick={onSave}>Save</button></div>;
}

function OwnerReminder({ onConfirm }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="owner-reminder"><p className="eyebrow">Before using Daily Damage</p><h2>Your data is local to this browser</h2><div className="owner-backup-flow"><span>Backup</span><i /><span>Export file</span><i /><span>Import later</span></div><div className="owner-reminder-list"><p><strong>Use the same browser.</strong><span>Chrome on your laptop and Safari on your phone will each have separate data.</span></p><p><strong>Keep exported files somewhere safe.</strong><span>The Backup button downloads a JSON file. Save it in Drive, OneDrive, iCloud, or another folder you will not delete.</span></p><p><strong>Restore with Import.</strong><span>On a new browser or device, open Backup, choose Import, then select the exported Daily Damage file.</span></p><p><strong>Private browsing is temporary.</strong><span>Incognito or private windows can delete this app data when the session ends.</span></p></div><button className="primary-action" type="button" onClick={onConfirm}>I understand</button></div></div>;
}

function ConfirmModal({ title, copy, confirmText, danger, onCancel, onConfirm }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className={`delete-modal ${danger ? "" : "payment-modal"}`}><div className={`modal-icon ${danger ? "" : "payment-icon"}`}><span className={danger ? "trash-icon" : ""}>{danger ? "" : "₱"}</span></div><div><p className="eyebrow">{danger ? "Confirm delete" : "Confirm payment"}</p><h2>{title}</h2><p>{copy}</p></div><div className="modal-actions"><button className="text-button" type="button" onClick={onCancel}>Cancel</button><button className={danger ? "danger-button" : "primary-action"} type="button" onClick={onConfirm}>{confirmText}</button></div></div></div>;
}

createRoot(document.getElementById("root")).render(<App />);
