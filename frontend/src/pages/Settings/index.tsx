import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getMicrosoftConfig } from '../../api';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useSettings } from '../../hooks/useSettings';
import { GoogleDriveSettings } from '../../components/GoogleDriveSettings';
import { OrganisatieSectie } from './OrganisatieSectie';
import { LogoSectie } from './LogoSectie';
import { MicrosoftSectie } from './MicrosoftSectie';
import { M365GroepenSectie } from './M365GroepenSectie';
import { SmtpSectie } from './SmtpSectie';
import { TelegramSectie } from './TelegramSectie';
import { WhatsAppSectie } from './WhatsAppSectie';
import { OfflineSectie } from './OfflineSectie';
import { ConcerttypenSectie } from './ConcerttypenSectie';
import { SupportSectie } from './SupportSectie';

/**
 * De instellingenpagina: een stapel losse kaarten onder elkaar.
 *
 * Deze pagina was één functie van 1495 regels met veertig `useState`, zes
 * queries, vijf effecten en negentien handlers. De secties raakten elkaar op
 * twee plekken; beide knopen zijn hier ontward.
 *
 * KNOOP 1 - de toestand hoorde bij de pagina in plaats van bij de sectie. Elke
 * kaart heeft nu zijn eigen component met zijn eigen velden, zijn eigen
 * "bezig met opslaan" en zijn eigen query. Wat een sectie in zijn eentje weet,
 * blijft daar. Alleen twee dingen staan nog hier, omdat meer dan één sectie ze
 * nodig heeft:
 *   - de verenigingsinstellingen (naam en logo), die de pagina toch al moet
 *     afwachten voor de laadmelding;
 *   - de Microsoft-configuratie, waarvan `configured` bepaalt of de sectie met
 *     de M365-groepen iets te doen heeft.
 * Die twee gaan als prop naar beneden. Eén query op één plek is eerlijker dan
 * twee componenten die dezelfde sleutel aanvragen en toevallig hetzelfde
 * antwoord uit de cache krijgen.
 *
 * KNOOP 2 - één bevestigingsdialoog voor vijf verwijderacties, aangestuurd door
 * één stukje toestand met vijf mogelijke waarden. Elke sectie die je eruit haalt
 * moest daarlangs. Gekozen oplossing: elke sectie heeft nu zijn eigen dialoog,
 * met een simpele ja/nee in plaats van een gedeelde vijfkeuze.
 *
 * Overwogen alternatief: `useConfirm` uit `src/hooks/useConfirm.tsx`, dat via
 * een context één dialoog voor de hele app verzorgt en `await confirm(...)`
 * teruggeeft. Mooi voor losse acties in een lijst, maar hier ruilt het de ene
 * gedeelde toestand in voor de andere: elke sectie zou dan afhangen van een
 * provider die ergens boven in de boom hangt, en dus niet meer op zichzelf te
 * renderen zijn - niet in een test, niet ergens anders in de app. Vijf keer een
 * `useState` met een `ConfirmDialog` eronder is acht regels per sectie en houdt
 * de sectie zelfstandig. Waar wél iets te delen viel is dat gedaan: de
 * foutmelding uit een mislukte aanroep staat één keer in `foutmelding.ts`.
 *
 * De Google Drive-instellingen waren al een eigen component en zijn ongemoeid
 * gelaten.
 *
 * EEN GEVOLG OM TE WETEN. De laadmelding hieronder is gebleven zoals hij was:
 * zolang de verenigingsinstellingen binnenkomen staat er niets anders op de
 * pagina. Omdat de secties nu hun eigen query meebrengen, beginnen die queries
 * pas als de secties er zijn - dus één heenreis later dan vroeger, toen alle zes
 * tegelijk vertrokken. Op deze pagina is dat te overzien: het scheelt één
 * roundtrip op een scherm dat zelden bezocht wordt, en de gegevens blijven vijf
 * minuten geldig. De ruil is bewust: de laadmelding voorkomt dat er even lege
 * formulieren staan te knipperen, en dat weegt hier zwaarder dan die ene
 * heenreis. Wie het anders wil, haalt de laadmelding weg en laat elke sectie
 * zijn eigen wachtstand tonen - dan vertrekt alles weer tegelijk.
 */
export default function Settings() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.settings');

  // De instellingen komen uit `useSettings`, samen met ThemeSettings.tsx. Die
  // twee pagina's hadden allebei hun eigen query op sleutel `['settings']`
  // staan; zie de uitleg bij de hook waarom dat een sleutel met twee gezichten
  // opleverde.
  const { data: settings = null, isLoading } = useSettings();

  const { data: msConfig = null } = useQuery({
    queryKey: ['microsoftConfig'],
    queryFn: getMicrosoftConfig,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="loading" role="status" aria-label={t('accessibility.loadingContent')}>
        <div className="spinner" aria-hidden="true"></div>
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>{t('settings.title')}</h1>

      <OrganisatieSectie settings={settings} />
      <LogoSectie logoUrl={settings?.logoUrl ?? null} />
      <MicrosoftSectie config={msConfig} />
      <M365GroepenSectie microsoftIngesteld={Boolean(msConfig?.configured)} />
      <SmtpSectie />
      <TelegramSectie />
      <WhatsAppSectie />
      <GoogleDriveSettings />
      <OfflineSectie />
      <ConcerttypenSectie />
      <SupportSectie />
    </div>
  );
}
