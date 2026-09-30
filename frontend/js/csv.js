export function createValidatedCsvFile(rows, filename = "transactions.csv") {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("At least one validated transaction is required.");
  const headers = ["date", "description", "category", "type", "amount"];
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [headers, ...rows.map((row) => headers.map((key) => row[key]))];
  const content = lines.map((line) => line.map(quote).join(",")).join("\r\n");
  return new File([content], filename || "transactions.csv", { type: "text/csv;charset=utf-8" });
}
