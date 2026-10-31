import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Invoice, InvoiceItem } from "@prisma/client";
export async function invoicePdf(invoice: Invoice & { items: InvoiceItem[] }, paidMinor: number) {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]); let y = 790;
  const text = (value: string, size = 11) => {
    const safe = value.replace(/[^\x20-\x7E]/g, "?");
    for (let offset = 0; offset < safe.length; offset += 80) { if (y < 60) { page = pdf.addPage([595, 842]); y = 790; } page.drawText(safe.slice(offset, offset + 80), { x: 45, y, size, font, color: rgb(.12, .16, .2) }); y -= 19; }
  };
  text("SUBWISE - INVOICE", 20); y -= 12;
  text(invoice.number); text(`Status: ${invoice.status} | Currency: ${invoice.currency}`);
  text(`Customer ID: ${invoice.customerId}`);
  text(`Issued: ${invoice.issuedAt?.toISOString().slice(0, 10) ?? "Draft"} | Due: ${invoice.dueAt?.toISOString().slice(0, 10) ?? "-"}`);
  text(`Period: ${invoice.periodStart?.toISOString().slice(0, 10)} to ${invoice.periodEnd?.toISOString().slice(0, 10)}`); y -= 12;
  text("All amounts below are integer currency minor units.");
  for (const item of invoice.items) { text(`${item.position + 1}. ${item.description}`); text(`Qty ${item.quantity} x ${item.unitAmountMinor} | Discount ${item.discountAmountMinor} | Tax ${item.taxAmountMinor} | Total ${item.totalMinor}`); y -= 8; }
  text(`Subtotal: ${invoice.subtotalMinor}`); text(`Discount: ${invoice.discountTotalMinor}`); text(`Tax: ${invoice.taxTotalMinor}`); text(`Total: ${invoice.totalMinor}`, 14); text(`Paid: ${paidMinor} | Outstanding: ${invoice.status === "VOID" ? 0 : invoice.totalMinor - paidMinor}`);
  return pdf.save();
}
