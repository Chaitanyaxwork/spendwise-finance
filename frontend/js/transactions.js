import { normalizeItems } from "./api.js";
import { createValidatedCsvFile } from "./csv.js";
import { DEMO_MODE, dataService } from "./data-service.js";
import { currentMonthKey, isValidDate, sumAmounts, toAmount } from "./calculations.js";
import { clearPageError, confirmAction, createPageError, currency, dateLabel, escapeHtml, mountAppShell, notify, setBusy, setPageLoading, showPageError } from "./shared.js";

mountAppShell();
const $ = (selector) => document.querySelector(selector);
const form = $("#transaction-form"); const dialog = $("#transaction-dialog"); const pageError = createPageError(document.getElementById("page-main"));
let allRows = []; let currentPage = 1; const pageSize = 10; let editingId = null; let selectedFile = null; let validCsvRows = [];
const compareAmount = (a, b, direction = 1) => { const left = toAmount(a.amount); const right = toAmount(b.amount); if (left === null) return right === null ? 0 : 1; if (right === null) return -1; return (left - right) * direction; };
const categoryMark = (category) => ({ Housing: "⌂", Food: "◍", Dining: "◌", Transport: "↗", Utilities: "⌁", Healthcare: "+", Shopping: "◇", Entertainment: "♪", Income: "↗" }[category] || "•");
function filteredRows() {
  const query = $("#transaction-search").value.trim().toLowerCase(); const type = $("#type-filter").value; const category = $("#category-filter").value;
  const from = $("#date-from").value; const to = $("#date-to").value; const sort = $("#sort-filter").value;
  const rows = allRows.filter((row) => {
    const date = String(row.date || "");
    return (!query || `${row.description || ""} ${row.category || ""}`.toLowerCase().includes(query)) &&
      (type === "all" || row.type === type) && (category === "all" || row.category === category) &&
      (!from || date >= from) && (!to || date <= to);
  });
  const comparators = {
    "date-desc": (a, b) => String(b.date).localeCompare(String(a.date)),
    "date-asc": (a, b) => String(a.date).localeCompare(String(b.date)),
    "amount-desc": (a, b) => compareAmount(a, b, -1),
    "amount-asc": (a, b) => compareAmount(a, b),
    "name-asc": (a, b) => String(a.description).localeCompare(String(b.description))
  };
  return rows.sort(comparators[sort] || comparators["date-desc"]);
}
function populateCategories() {
  const select = $("#category-filter"); const selected = select.value;
  const categories = [...new Set(allRows.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  select.innerHTML = '<option value="all">All categories</option>' + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}
function render() {
  populateCategories();
  const month = currentMonthKey(); const monthRows = allRows.filter((row) => String(row.date || "").startsWith(month));
  const income = sumAmounts(monthRows.filter((row) => row.type === "income").map((row) => row.amount));
  const expenses = sumAmounts(monthRows.filter((row) => row.type === "expense").map((row) => row.amount));
  const net = income === null || expenses === null ? null : income - expenses;
  $("#transaction-income").textContent = currency(income); $("#transaction-expenses").textContent = currency(expenses); $("#transaction-net").textContent = currency(net);
  const rows = filteredRows(); const pages = Math.max(1, Math.ceil(rows.length / pageSize)); currentPage = Math.min(currentPage, pages);
  const start = (currentPage - 1) * pageSize; const visible = rows.slice(start, start + pageSize);
  $("#transaction-count").textContent = `${rows.length} record${rows.length === 1 ? "" : "s"}`;
  $("#transaction-rows").innerHTML = visible.map((row) => { const amount = toAmount(row.amount); const amountText = amount === null ? "Amount unavailable" : `${row.type === "income" ? "+" : "−"}${currency(amount, 2)}`; return `<tr><td><div class="transaction-title-cell"><span class="category-icon" aria-hidden="true">${categoryMark(row.category)}</span><strong class="transaction-name">${escapeHtml(row.description)}</strong></div></td><td><span class="category-chip">${escapeHtml(row.category)}</span></td><td>${dateLabel(row.date)}</td><td><span class="type-pill ${row.type === "income" ? "income" : "expense"}"><i aria-hidden="true"></i>${row.type === "income" ? "Income" : "Expense"}</span></td><td class="align-right ${amount === null ? "" : row.type === "income" ? "amount-positive" : "amount-negative"}">${escapeHtml(amountText)}</td><td><div class="table-actions"><button class="table-action" type="button" data-edit="${escapeHtml(row.id)}" aria-label="Edit ${escapeHtml(row.description)}">Edit</button><button class="table-action danger" type="button" data-delete="${escapeHtml(row.id)}" aria-label="Delete ${escapeHtml(row.description)}">Delete</button></div></td></tr>`; }).join("");
  $("#transaction-empty").classList.toggle("hidden", visible.length > 0);
  $("#pagination-label").textContent = rows.length ? `Showing ${start + 1}–${Math.min(start + pageSize, rows.length)} of ${rows.length}` : "No matching transactions";
  $("#page-number").textContent = `${currentPage} / ${pages}`; $("#page-prev").disabled = currentPage <= 1; $("#page-next").disabled = currentPage >= pages;
}
async function load() {
  $("#page-main").setAttribute("aria-busy", "true"); setPageLoading(true);
  try { allRows = normalizeItems(await dataService.listTransactions()); render(); clearPageError(pageError); }
  catch (error) { showPageError(pageError, error.message || "Could not load transactions.", load); }
  finally { $("#page-main").removeAttribute("aria-busy"); setPageLoading(false); }
}
function openForm(row = null) {
  editingId = row?.id || null; form.reset(); $("#transaction-dialog-title").textContent = row ? "Edit transaction" : "Add transaction"; $("#transaction-form-message").textContent = "";
  form.elements.description.value = row?.description || ""; form.elements.amount.value = row?.amount ?? ""; form.elements.type.value = row?.type || "expense"; form.elements.category.value = row?.category || ""; form.elements.date.value = row?.date || new Date().toISOString().slice(0, 10);
  dialog.showModal(); $("#tx-description").focus();
}
form.addEventListener("submit", async (event) => {
  event.preventDefault(); if (!form.reportValidity()) return;
  const value = { description: form.elements.description.value.trim(), amount: Number(form.elements.amount.value), type: form.elements.type.value, category: form.elements.category.value.trim(), date: form.elements.date.value };
  const message = $("#transaction-form-message");
  if (!value.description || !value.category || !isValidDate(value.date) || !Number.isFinite(value.amount) || value.amount <= 0) { message.textContent = "Enter a description, category, valid date, and amount greater than zero."; return; }
  const submit = form.querySelector('button[type="submit"]'); setBusy(submit, true, "Saving…"); message.textContent = "";
  try {
    const wasEditing = Boolean(editingId);
    if (wasEditing) await dataService.updateTransaction(editingId, value); else await dataService.createTransaction(value);
    dialog.close(); await load(); notify(wasEditing ? "Your transaction was updated." : "Your transaction was added.", { title: "Saved" });
  } catch (error) { message.textContent = error.message || "Could not save this transaction."; }
  finally { setBusy(submit, false); }
});

$("#add-transaction").addEventListener("click", () => openForm()); $("#empty-add-transaction").addEventListener("click", () => openForm());
["#transaction-search", "#type-filter", "#category-filter", "#date-from", "#date-to", "#sort-filter"].forEach((selector) => $(selector).addEventListener(selector === "#transaction-search" ? "input" : "change", () => { currentPage = 1; render(); }));
$("#page-prev").addEventListener("click", () => { currentPage = Math.max(1, currentPage - 1); render(); }); $("#page-next").addEventListener("click", () => { currentPage += 1; render(); });
$("#transaction-rows").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit]"); const remove = event.target.closest("[data-delete]");
  if (edit) { const row = allRows.find((item) => String(item.id) === edit.dataset.edit); if (row) openForm(row); }
  if (remove) {
    const row = allRows.find((item) => String(item.id) === remove.dataset.delete);
    if (!row || !await confirmAction({ title: "Delete this transaction?", message: `“${row.description}” will be removed from this account. This cannot be undone.`, confirmLabel: "Delete transaction", danger: true })) return;
    try { await dataService.deleteTransaction(row.id); await load(); notify("Transaction deleted.", { title: "Updated" }); }
    catch (error) { notify(error.message || "Could not delete that transaction.", { title: "Delete failed", type: "error" }); }
  }
});
document.querySelectorAll('[data-close-dialog="transaction-dialog"]').forEach((button) => button.addEventListener("click", () => dialog.close()));

$("#open-csv").addEventListener("click", () => $("#csv-file").click());
$("#csv-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0]; if (!file) return; selectedFile = file;
  try {
    const records = parseCsv(await file.text());
    const header = records.shift()?.map((value) => value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[ _-]/g, "")) || [];
    const index = Object.fromEntries(["date", "description", "category", "type", "amount"].map((key) => [key, header.indexOf(key)]));
    if (Object.values(index).some((position) => position < 0)) throw new Error("CSV must include headers: date, description, category, type, amount.");
    validCsvRows = []; const errors = [];
    records.forEach((record, offset) => {
      const line = offset + 2; const get = (name) => String(record[index[name]] ?? "").trim();
      const normalizedType = get("type").toLowerCase(); const amount = Number(get("amount").replace(/[₹,\s]/g, "")); const date = normalizeDate(get("date"));
      const row = { date, description: get("description"), category: get("category"), type: ["income", "credit"].includes(normalizedType) ? "income" : ["expense", "debit"].includes(normalizedType) ? "expense" : "", amount };
      if (!row.date || !row.description || !row.category || !row.type || !Number.isFinite(amount) || amount <= 0) errors.push(line);
      else validCsvRows.push(row);
    });
    if (!validCsvRows.length) throw new Error("No valid rows found. Check the dates, categories, transaction type, and positive amounts.");
    $("#csv-summary").textContent = `${validCsvRows.length} valid row${validCsvRows.length === 1 ? "" : "s"}${errors.length ? ` · ${errors.length} invalid row${errors.length === 1 ? "" : "s"} will be skipped (lines ${errors.slice(0, 8).join(", ")}${errors.length > 8 ? ", …" : ""})` : ""}.`;
    $("#csv-rows").innerHTML = validCsvRows.slice(0, 8).map((row) => `<tr><td>${dateLabel(row.date)}</td><td class="transaction-name">${escapeHtml(row.description)}</td><td>${escapeHtml(row.category)}</td><td>${row.type === "income" ? "Income" : "Expense"}</td><td class="align-right">${currency(row.amount, 2)}</td></tr>`).join("") + (validCsvRows.length > 8 ? `<tr><td colspan="5" class="panel-caption">And ${validCsvRows.length - 8} more valid rows…</td></tr>` : "");
    $("#csv-preview").classList.remove("hidden"); $("#csv-preview").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) { notify(error.message || "This CSV could not be read.", { title: "Import preview failed", type: "error" }); selectedFile = null; validCsvRows = []; }
  finally { event.target.value = ""; }
});
$("#confirm-csv").addEventListener("click", async () => {
  if (!selectedFile || !validCsvRows.length) return;
  const button = $("#confirm-csv"); setBusy(button, true, "Importing…");
  try {
    const result = DEMO_MODE ? await dataService.importCsv(validCsvRows) : await dataService.importCsv(createValidatedCsvFile(validCsvRows, selectedFile.name));
    const count = Number(result?.imported ?? validCsvRows.length); selectedFile = null; validCsvRows = []; $("#csv-preview").classList.add("hidden");
    await load(); notify(`${count} transaction${count === 1 ? "" : "s"} imported.`, { title: "Import complete" });
  } catch (error) { notify(error.message || "The CSV could not be imported.", { title: "Import failed", type: "error" }); }
  finally { setBusy(button, false); }
});
const closeCsv = () => { selectedFile = null; validCsvRows = []; $("#csv-preview").classList.add("hidden"); };
$("#close-csv-preview").addEventListener("click", closeCsv); $("#cancel-csv").addEventListener("click", closeCsv);
function normalizeDate(value) {
  if (isValidDate(value)) return value;
  const match = String(value).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); if (!match) return "";
  const year = Number(match[3]); const month = Number(match[1]); const day = Number(match[2]); const normalized = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidDate(normalized) ? normalized : "";
}
function parseCsv(text) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index += 1; row.push(value); if (row.some((cell) => cell.trim())) rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  row.push(value); if (row.some((cell) => cell.trim())) rows.push(row); return rows;
}
const params = new URLSearchParams(window.location.search);
load().then(() => { if (params.get("action") === "add") openForm(); else if (params.get("action") === "import") { $("#open-csv").focus(); notify("Choose a CSV file to start the import.", { title: "Import transactions" }); } });
