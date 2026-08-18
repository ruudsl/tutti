import type { ReactNode } from 'react';

interface PageLayoutProps {
  /** De titel van de pagina. Verschijnt als h1, één per pagina. */
  title: string;
  /** Eén zin die uitlegt waar de pagina voor is. Mag weg als de titel het al zegt. */
  description?: string;
  /**
   * De hoofdactie, rechtsboven. Meestal één knop: "Nieuwe repetitie",
   * "Lid toevoegen". Op smalle schermen zakt hij onder de titel en wordt hij
   * volle breedte.
   */
  actions?: ReactNode;
  /**
   * Filters, zoekvelden of tabs. Staan tussen de kop en de inhoud, zodat je
   * eerst ziet wát je bekijkt, dan hoe je het filtert, dan pas de gegevens.
   */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * De gedeelde opbouw van elke pagina.
 *
 * Hiervoor had elke pagina zijn eigen indeling: 47 begonnen met een losse
 * flex-rij, 15 met .page-header, 8 meteen met een kaart. Geen van die klassen
 * was echt gedefinieerd, dus er was ook geen gedeeld verticaal ritme. Gevolg:
 * de hoofdactie stond overal ergens anders en je moest per pagina zoeken waar
 * je kon beginnen.
 *
 * De volgorde is hier vast: titel, waar het over gaat, wat je kunt doen,
 * waarmee je filtert, en dan pas de inhoud.
 */
export function PageLayout({ title, description, actions, toolbar, children }: PageLayoutProps) {
  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-description">{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>

      {toolbar && <div className="page-toolbar">{toolbar}</div>}

      <div className="page-body">{children}</div>
    </div>
  );
}

export default PageLayout;
