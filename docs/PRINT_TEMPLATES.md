# Print Templates

This document describes the printable components and templates available in Tutti.

## Overview

Tutti includes several components designed for printing physical materials for concerts and events. These use CSS `@media print` rules to format content appropriately for paper output.

## Available Print Components

### 1. Seat Card Printer (`SeatCardPrinter.tsx`)

Generates printable seat cards for orchestra members at concerts.

**Location:** `/frontend/src/components/SeatCardPrinter.tsx`

**Features:**

- Multiple card sizes (small: 65x40mm, medium: 85x54mm, large: 100x60mm)
- Configurable cards per row
- Concert information header
- Member name, instrument, and seat position
- Print-optimized CSS

**Usage:**

```tsx
import SeatCardPrinter from '../components/SeatCardPrinter';

<SeatCardPrinter
  concertName="Nieuwjaarsconcert 2024"
  concertDate="2024-01-01"
  concertLocation="Concertgebouw"
  layoutName="Symfonie Opstelling"
  seatCards={seatCards}
  cardsPerRow={3}
  cardSize="medium"
  showConcertInfo={true}
/>;
```

**Card Data Structure:**

```typescript
interface SeatCard {
  id: string;
  memberName: string;
  instrumentName: string;
  seatPosition: string;
  section?: string;
}
```

### 2. Concert Poster Generator (`ConcertPosterGenerator.tsx`)

Creates customizable concert posters for download and print.

**Location:** `/frontend/src/components/ConcertPosterGenerator.tsx`

**Features:**

- Multiple templates (Classic, Modern, Minimal)
- Custom color themes
- Logo and background image support
- Program listing
- Export to PNG or PDF
- Real-time preview

**Templates:**

| Template | Style               | Best For           |
| -------- | ------------------- | ------------------ |
| Classic  | Traditional, formal | Symphonic concerts |
| Modern   | Bold, contemporary  | Pop/jazz events    |
| Minimal  | Clean, simple       | Chamber music      |

**Color Themes:**

- Elegant (Navy/Gold)
- Festive (Red/Green)
- Spring (Soft greens)
- Summer (Warm oranges)
- Autumn (Earth tones)
- Winter (Cool blues)

**Poster Data Structure:**

```typescript
interface PosterData {
  title: string;
  subtitle?: string;
  date: string;
  time: string;
  location: string;
  address?: string;
  orchestraName: string;
  program: string[];
  ticketInfo?: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
}
```

### 3. Ticket Display (`TicketDisplay.tsx`)

Displays and prints ticket QR codes for concert admission.

**Location:** `/frontend/src/components/TicketDisplay.tsx`

**Features:**

- QR code for scanning
- Ticket details (event, seat, price)
- Print-optimized layout
- Mobile-friendly display

### 4. Loan Receipt Printer (`LoanReceiptPrinter.tsx`)

Generates a printable loan receipt ("uitleenbon") for music title loans, with signature lines for issue and return.

**Location:** `/frontend/src/components/LoanReceiptPrinter.tsx`

**Features:**

- Association name header and receipt title
- Borrower details (name, organization, email)
- Item details (title, arranger) and reference number
- Loan date and expected return date
- Condition/notes box
- Signature blocks for issue and return (signature + date lines)
- A4 print layout; renders as an overlay, only the receipt is printed

**Props:**

```typescript
interface LoanReceiptPrinterProps {
  loan: Loan; // Loan from src/api (snake_case fields incl. title_name, borrower_name, ...)
  onClose: () => void; // Closes the print overlay
}
```

**Usage:** Integrated in the Loans page (`/frontend/src/pages/Loans.tsx`). Each loan row has a "Print bon" button that opens the overlay:

```tsx
import LoanReceiptPrinter from '../components/LoanReceiptPrinter';

{
  printLoan && <LoanReceiptPrinter loan={printLoan} onClose={() => setPrintLoan(null)} />;
}
```

**Labels:** i18n keys under `printTemplates.loanReceipt.*` (nl/en/de).

### 5. Invoice Printer (`InvoicePrinter.tsx`)

Printable invoice view for the accounting module.

**Location:** `/frontend/src/components/InvoicePrinter.tsx`

**Features:**

- Association name header, invoice/credit note title
- Invoice number, invoice date, due date, reference
- Addressee (relation name and email)
- Line items table (description, quantity, unit price, VAT rate, line total)
- Totals block: subtotal, VAT amount, total, and amount paid/due when partially paid
- Payment instructions (with amount due, due date, invoice number, and payment reference) shown while an amount is outstanding
- Fetches the invoice detail (including lines) on open via `getInvoice(id)`
- A4 print layout; renders as an overlay, only the invoice is printed

**Props:**

```typescript
interface InvoicePrinterProps {
  invoice: Invoice; // Invoice from src/api/accounting (list item is enough; lines are fetched)
  onClose: () => void; // Closes the print overlay
}
```

**Usage:** Integrated in the Accounting page invoices tab (`/frontend/src/pages/Accounting.tsx`). Each invoice row has a small print button:

```tsx
import InvoicePrinter from '../components/InvoicePrinter';

{
  printInvoice && <InvoicePrinter invoice={printInvoice} onClose={() => setPrintInvoice(null)} />;
}
```

**Labels:** i18n keys under `printTemplates.invoice.*` (nl/en/de).

### 6. Setlist / Concert Program

Printable concert program generated from music lists.

**Location:** `/frontend/src/pages/MusicListManager.tsx`

**Features:**

- Program order with piece durations
- Composer information
- Intermission markers
- Total duration calculation

## Print CSS Guidelines

All print components use dedicated print stylesheets. Key patterns:

### Hide on Print

```css
.no-print {
  display: none !important;
}

@media print {
  .print-controls,
  .navbar,
  .sidebar {
    display: none !important;
  }
}
```

### Page Breaks

```css
@media print {
  .page-break-before {
    page-break-before: always;
  }

  .avoid-break {
    page-break-inside: avoid;
  }
}
```

### Print Sizing

```css
@media print {
  @page {
    size: A4;
    margin: 10mm;
  }

  body {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
```

## Adding New Print Templates

### 1. Create the component

```tsx
// components/MyPrintTemplate.tsx
import './MyPrintTemplate.css';

export default function MyPrintTemplate({ data }) {
  const handlePrint = () => window.print();

  return (
    <div className="my-print-template">
      <div className="no-print">
        <button onClick={handlePrint}>Print</button>
      </div>
      <div className="print-content">{/* Printable content */}</div>
    </div>
  );
}
```

### 2. Create print styles

```css
/* components/MyPrintTemplate.css */
.my-print-template .print-content {
  /* Screen styles */
}

@media print {
  .my-print-template {
    width: 100%;
  }

  .my-print-template .no-print {
    display: none;
  }

  .my-print-template .print-content {
    /* Print-specific styles */
  }
}
```

### 3. Best practices

- **Test actual printing:** Browser preview differs from physical print
- **Use mm/cm units:** More predictable than pixels for print
- **Include page breaks:** Prevent awkward content splitting
- **Consider paper sizes:** A4 (Europe) vs Letter (US)
- **Test grayscale:** Some users print in black & white
- **Mind the margins:** Printers have unprintable areas

## Future Templates to Add

- [ ] Member directory cards
- [ ] Rehearsal schedule printout
- [ ] Annual calendar overview
- [x] Equipment loan receipts (`LoanReceiptPrinter.tsx`)
- [x] Invoice printouts (`InvoicePrinter.tsx`)
- [ ] Certificate templates (participation, awards)
