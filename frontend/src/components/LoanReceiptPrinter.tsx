import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { currentLocale } from '../utils/locale';
import { useAuth } from '../context/AuthContext';
import type { Loan } from '../api';
import './LoanReceiptPrinter.css';

interface LoanReceiptPrinterProps {
  loan: Loan;
  onClose: () => void;
}

/**
 * Printable loan receipt ("uitleenbon") for a music title loan.
 * Renders as a full-screen overlay with an A4-formatted receipt and a
 * print button. Only the receipt itself is printed (@media print rules).
 */
export default function LoanReceiptPrinter({ loan, onClose }: LoanReceiptPrinterProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const associationName = user?.associationName || 'Harmonie';

  // Scope the @media print "hide everything else" rules to this overlay
  // being open (the CSS is bundled globally, so the rules must not affect
  // printing of other pages).
  useEffect(() => {
    document.body.classList.add('loan-receipt-printing');
    return () => document.body.classList.remove('loan-receipt-printing');
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(currentLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="loan-receipt-printer"
      role="dialog"
      aria-modal="true"
      aria-label={t('printTemplates.loanReceipt.title')}
    >
      {/* Controls - hidden when printing */}
      <div className="print-controls no-print">
        <button className="btn btn-outline" onClick={onClose}>
          {t('common.close')}
        </button>
        <button className="btn btn-primary" onClick={handlePrint}>
          {t('printTemplates.loanReceipt.printButton')}
        </button>
      </div>

      {/* Printable area */}
      <div className="print-area loan-receipt">
        <header className="receipt-header">
          <div className="association-name">{associationName}</div>
          <h1 className="receipt-title">{t('printTemplates.loanReceipt.title')}</h1>
        </header>

        <table className="receipt-details">
          <tbody>
            <tr>
              <th scope="row">{t('printTemplates.loanReceipt.borrower')}</th>
              <td>{loan.borrower_name}</td>
            </tr>
            {loan.borrower_organization && (
              <tr>
                <th scope="row">{t('printTemplates.loanReceipt.organization')}</th>
                <td>{loan.borrower_organization}</td>
              </tr>
            )}
            {loan.borrower_email && (
              <tr>
                <th scope="row">{t('printTemplates.loanReceipt.email')}</th>
                <td>{loan.borrower_email}</td>
              </tr>
            )}
            <tr>
              <th scope="row">{t('printTemplates.loanReceipt.item')}</th>
              <td>
                <strong>{loan.title_name || '-'}</strong>
                {loan.title_arranger && (
                  <span className="item-arranger">
                    {' '}
                    ({t('printTemplates.loanReceipt.arranger')}: {loan.title_arranger})
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <th scope="row">{t('printTemplates.loanReceipt.reference')}</th>
              <td className="reference-number">{loan.id}</td>
            </tr>
            <tr>
              <th scope="row">{t('printTemplates.loanReceipt.dateOut')}</th>
              <td>{formatDate(loan.date_out)}</td>
            </tr>
            <tr>
              <th scope="row">{t('printTemplates.loanReceipt.expectedReturn')}</th>
              <td>{formatDate(loan.expected_return)}</td>
            </tr>
          </tbody>
        </table>

        <section className="condition-notes">
          <h2>{t('printTemplates.loanReceipt.conditionNotes')}</h2>
          <div className="notes-box">{loan.notes || ''}</div>
        </section>

        <section className="signatures avoid-break">
          <div className="signature-block">
            <h2>{t('printTemplates.loanReceipt.signatureIssue')}</h2>
            <div className="signature-line">
              <span className="line" />
              <span className="line-label">{t('printTemplates.loanReceipt.signature')}</span>
            </div>
            <div className="signature-line">
              <span className="line" />
              <span className="line-label">{t('printTemplates.loanReceipt.date')}</span>
            </div>
          </div>
          <div className="signature-block">
            <h2>{t('printTemplates.loanReceipt.signatureReturn')}</h2>
            <div className="signature-line">
              <span className="line" />
              <span className="line-label">{t('printTemplates.loanReceipt.signature')}</span>
            </div>
            <div className="signature-line">
              <span className="line" />
              <span className="line-label">{t('printTemplates.loanReceipt.date')}</span>
            </div>
          </div>
        </section>

        {loan.created_by_name && (
          <footer className="receipt-footer">
            {t('printTemplates.loanReceipt.issuedBy')}: {loan.created_by_name}
          </footer>
        )}
      </div>
    </div>
  );
}
