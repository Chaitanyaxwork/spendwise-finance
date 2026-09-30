from io import BytesIO
from xml.sax.saxutils import escape


class PdfUnavailable(RuntimeError):
    pass


def _money(value):
    return "-" if value is None else f"{value:,.2f}"


def _pct(value):
    return "-" if value is None else f"{value:+.1f}%"


def render_report_pdf(report):
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError as exc:
        raise PdfUnavailable(
            "PDF export needs the optional 'reportlab' package: pip install -r requirements-pdf.txt"
        ) from exc

    styles = getSampleStyleSheet()
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm, title=f"SpendWise report {report['month']}")

    def table(rows):
        t = Table(rows, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eef5")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#b8c2cc")),
            ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ]))
        return t

    summary = report["summary"]
    story = [Paragraph(f"SpendWise financial report: {escape(report['month'])}", styles["Title"])]
    if report["is_partial"]:
        story.append(Paragraph("This month is still in progress; figures are partial.", styles["Italic"]))
    story += [Spacer(1, 6), Paragraph("Summary", styles["Heading2"]), table([
        ["", "This month", "Change vs previous"],
        ["Income", _money(summary["income"]), _pct(summary["vs_previous_month"]["income"]["percent"])],
        ["Expenses", _money(summary["expenses"]), _pct(summary["vs_previous_month"]["expenses"]["percent"])],
        ["Savings", _money(summary["savings"]), _pct(summary["vs_previous_month"]["savings"]["percent"])],
        ["Savings rate", "-" if summary["savings_rate"] is None else f"{summary['savings_rate']}%", ""],
    ])]

    if report["category_breakdown"]:
        rows = [["Category", "Amount", "Share", "Change"]] + [
            [escape(c["category"]), _money(c["amount"]), f"{c['percentage']}%", _pct(c["change_percent"])]
            for c in report["category_breakdown"]
        ]
        story += [Spacer(1, 8), Paragraph("Spending by category", styles["Heading2"]), table(rows)]

    budgets = report["budget_performance"]["budgets"]
    if budgets:
        rows = [["Budget", "Limit", "Spent", "Remaining", "Used"]] + [
            [escape(b["category"]), _money(b["monthly_limit"]), _money(b["spent"]),
             _money(b["remaining"]), f"{b['percentage_used']}%"]
            for b in budgets
        ]
        story += [Spacer(1, 8), Paragraph("Budget performance", styles["Heading2"]), table(rows)]

    recurring = report["recurring_expenses"]["items"]
    if recurring:
        rows = [["Recurring expense", "Frequency", "Amount", "Monthly cost"]] + [
            [escape(r["description"][:40]), r["frequency"], _money(r["average_amount"]),
             _money(r["estimated_monthly_cost"])]
            for r in recurring
        ]
        story += [Spacer(1, 8), Paragraph("Recurring expenses", styles["Heading2"]), table(rows)]

    if report["key_insights"]:
        story += [Spacer(1, 8), Paragraph("Key insights", styles["Heading2"])]
        story += [Paragraph(f"&bull; {escape(i['message'])}", styles["BodyText"]) for i in report["key_insights"]]

    doc.build(story)
    return buffer.getvalue()
