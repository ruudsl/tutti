import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { currentLocale } from '../utils/locale';
import { useAuth } from '../context/AuthContext';
import { getInvoice, type Invoice } from '../api/accounting';
import './InvoicePrinter.css';

interface InvoicePrinterProps {
  invoice: Invoice;
  onClose: () => void;
}

/**
 * Printable invoice view. Renders as a full-screen overlay with an
 * A4-formatted invoice and a print button. The invoice detail (including
 * line items) is fetched on open; the list item passed in is used as a
 * fallback while loading. Only the invoice itself is printed.
 */
export default function InvoicePrinter({ invoice, onClose }: InvoicePrinterProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const associationName = user?.associationName || 'Harmonie';

  // The invoice list endpoint does not include line items, fetch the detail.
  const { data: detail } = useQuery({
    queryKey: ['invoice', invoice.id],
    queryFn: () => getInvoice(invoice.id),
  });

  const inv = detail ?? invoice;
  const lines = inv.lines ?? [];

  // Scope the @media print "hide everything else" rules to this overlay
  // being open (the CSS is bundled globally, so the rules must not affect
  // printing of other pages).
  useEffect(() => {
    document.body.classList.add('invoice-printing');
    return () => document.body.classList.remove('invoice-printing');
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(currentLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const handlePrint = () => {
    window.print();
  };

  const title =
    inv.invoiceType === 'credit_note' ? t('printTemplates.invoice.creditNoteTitle') : t('printTemplates.invoice.title');

  return (
    <div className="invoice-printer" role="dialog" aria-modal="true" aria-label={title}>
      {/* Controls - hidden when printing */}
      <div className="print-controls no-print">
        <button className="btn btn-outline" onClick={onClose}>
          {t('common.close')}
        </button>
        <button className="btn btn-primary" onClick={handlePrint}>
          {t('printTemplates.invoice.printButton')}
        </button>
      </div>

      {/* Printable area */}
      <div className="print-area invoice-document">
        <header className="invoice-header">
          <div className="association-name">{associationName}</div>
          <h1 className="invoice-title">{title}</h1>
        </header>

        <div className="invoice-meta">
          <div className="billed-to">
            <h2>{t('printTemplates.invoice.billedTo')}</h2>
            <div className="relation-name">{inv.relationName}</div>
            {inv.relationEmail && <div className="relation-email">{inv.relationEmail}</div>}
          </div>
          <table className="invoice-info">
            <tbody>
              <tr>
                <th scope="row">{t('printTemplates.invoice.invoiceNumber')}</th>
                <td>{inv.invoiceNumber}</td>
              </tr>
              <tr>
                <th scope="row">{t('printTemplates.invoice.invoiceDate')}</th>
                <td>{formatDate(inv.invoiceDate)}</td>
              </tr>
              <tr>
                <th scope="row">{t('printTemplates.invoice.dueDate')}</th>
                <td>{formatDate(inv.dueDate)}</td>
              </tr>
              {inv.reference && (
                <tr>
                  <th scope="row">{t('printTemplates.invoice.reference')}</th>
                  <td>{inv.reference}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {inv.description && <p className="invoice-description">{inv.description}</p>}

        <table className="invoice-lines">
          <thead>
            <tr>
              <th className="col-description">{t('printTemplates.invoice.description')}</th>
              <th className="col-number">{t('printTemplates.invoice.quantity')}</th>
              <th className="col-number">{t('printTemplates.invoice.unitPrice')}</th>
              <th className="col-number">{t('printTemplates.invoice.vatRate')}</th>
              <th className="col-number">{t('printTemplates.invoice.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="col-description">{line.description}</td>
                <td className="col-number">{line.quantity}</td>
                <td className="col-number">{formatCurrency(line.unitPrice)}</td>
                <td className="col-number">{line.vatRate}%</td>
                <td className="col-number">{formatCurrency(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="invoice-totals avoid-break">
          <tbody>
            <tr>
              <th scope="row">{t('printTemplates.invoice.subtotal')}</th>
              <td>{formatCurrency(inv.subtotal)}</td>
            </tr>
            <tr>
              <th scope="row">{t('printTemplates.invoice.vatAmount')}</th>
              <td>{formatCurrency(inv.vatAmount)}</td>
            </tr>
            <tr className="grand-total">
              <th scope="row">{t('printTemplates.invoice.total')}</th>
              <td>{formatCurrency(inv.total)}</td>
            </tr>
            {inv.amountPaid > 0 && (
              <>
                <tr>
                  <th scope="row">{t('printTemplates.invoice.amountPaid')}</th>
                  <td>{formatCurrency(inv.amountPaid)}</td>
                </tr>
                <tr>
                  <th scope="row">{t('printTemplates.invoice.amountDue')}</th>
                  <td>{formatCurrency(inv.amountDue)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        {inv.amountDue > 0 && inv.invoiceType !== 'credit_note' && (
          <section className="payment-instructions avoid-break">
            <h2>{t('printTemplates.invoice.paymentInstructions')}</h2>
            <p>
              {t('printTemplates.invoice.paymentInstructionsText', {
                amount: formatCurrency(inv.amountDue),
                dueDate: formatDate(inv.dueDate),
                invoiceNumber: inv.invoiceNumber,
              })}
            </p>
            {inv.paymentReference && (
              <p>
                {t('printTemplates.invoice.paymentReference')}: <strong>{inv.paymentReference}</strong>
              </p>
            )}
          </section>
        )}

        {inv.notes && (
          <section className="invoice-notes avoid-break">
            <h2>{t('printTemplates.invoice.notes')}</h2>
            <p>{inv.notes}</p>
          </section>
        )}
      </div>
    </div>
  );
}
