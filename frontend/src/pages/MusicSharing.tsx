import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '../components/Icon';
import { FormModal } from '../components/FormModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../context/AuthContext';
import { showError, showSuccess } from '../utils/toast';
import { youtubeInsluitUrl, youtubeVideoId, isVeiligeLink } from '../utils/videoInsluiten';
import { currentLocale } from '../utils/locale';
import type { Bestandsverzoek, Oproep } from '../api/music-sharing';
import { haalVrijgegevenBestandOp } from '../api/music-sharing';
import {
  useAntwoordOpOproep,
  useAntwoorden,
  useBeeindigKoppeling,
  useBinnengekomenVerzoeken,
  useCatalogus,
  useCatalogusTitel,
  useEigenVerzoeken,
  useKeurVerzoekGoed,
  useMaakKoppelcode,
  useOproepen,
  useOverzicht,
  usePartners,
  usePlaatsOproep,
  useTrekVerzoekIn,
  useVerwijderOproep,
  useVraagPartijAan,
  useWerkOproepBij,
  useWijsVerzoekAf,
  useWisselKoppelcodeIn,
} from '../hooks/useMusicSharing';

type Tabblad = 'koppelingen' | 'catalogus' | 'verzoeken' | 'oproepen' | 'overzicht';

const datum = (waarde: string | null) =>
  waarde
    ? new Date(waarde).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

/**
 * Muziek delen tussen verenigingen.
 *
 * Vijf tabbladen, in de volgorde waarin je ze nodig hebt: eerst koppelen, dan
 * kijken wat een ander deelt, dan de verzoeken die daaruit volgen, de oproepen
 * voor wat je nergens vindt, en tot slot het overzicht van wat je zelf uitdeelt.
 */
export default function MusicSharing() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.musicSharing');
  const [tab, setTab] = useState<Tabblad>('koppelingen');

  const tabbladen: { id: Tabblad; icon: IconName }[] = [
    { id: 'koppelingen', icon: 'link' },
    { id: 'catalogus', icon: 'book' },
    { id: 'verzoeken', icon: 'envelope' },
    { id: 'oproepen', icon: 'send' },
    { id: 'overzicht', icon: 'clipboard' },
  ];

  return (
    <div className="page">
      <h1>{t('musicSharing.title')}</h1>
      <p className="text-muted mb-3">{t('musicSharing.intro')}</p>

      <div className="tabs mb-3" role="tablist">
        {tabbladen.map((blad) => (
          <button
            key={blad.id}
            role="tab"
            aria-selected={tab === blad.id}
            className={`tab ${tab === blad.id ? 'tab-active' : ''}`}
            onClick={() => setTab(blad.id)}
          >
            <Icon name={blad.icon} /> {t(`musicSharing.tabs.${blad.id}`)}
          </button>
        ))}
      </div>

      {tab === 'koppelingen' && <KoppelingenTab />}
      {tab === 'catalogus' && <CatalogusTab />}
      {tab === 'verzoeken' && <VerzoekenTab />}
      {tab === 'oproepen' && <OproepenTab />}
      {tab === 'overzicht' && <OverzichtTab />}
    </div>
  );
}

/**
 * Koppelen gaat via een code, niet via een lijst.
 *
 * Er is bewust geen overzicht van verenigingen op het platform. Je maakt een
 * code, geeft die buiten Tutti om door, en de ander voert hem in.
 */
function KoppelingenTab() {
  const { t } = useTranslation();
  const { data: partners, isLoading } = usePartners();
  const maakCode = useMaakKoppelcode();
  const wisselIn = useWisselKoppelcodeIn();
  const beeindig = useBeeindigKoppeling();

  const [code, setCode] = useState('');
  const [teBeeindigen, setTeBeeindigen] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="space-y-4">
      <div className="alert alert-info">
        <Icon name="info" /> {t('musicSharing.link.explanation')}
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="text-lg font-medium mb-2">{t('musicSharing.link.giveTitle')}</h2>
          <p className="text-muted mb-2">{t('musicSharing.link.giveHelp')}</p>

          {maakCode.data ? (
            <div>
              <output className="block text-2xl font-mono tracking-widest mb-1">{maakCode.data.code}</output>
              <small className="text-muted">
                {t('musicSharing.link.validUntil', { datum: datum(maakCode.data.expiresAt) })}
              </small>
            </div>
          ) : (
            <button className="btn btn-primary" disabled={maakCode.isPending} onClick={() => maakCode.mutate()}>
              <Icon name="plus" /> {t('musicSharing.link.generate')}
            </button>
          )}
          {maakCode.data && (
            <p className="text-muted mt-2">
              <small>{t('musicSharing.link.replacesPrevious')}</small>
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="text-lg font-medium mb-2">{t('musicSharing.link.enterTitle')}</h2>
          <form
            className="flex gap-2 items-start flex-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              wisselIn.mutate(code, {
                onSuccess: (resultaat) => {
                  showSuccess(t('musicSharing.link.linked', { naam: resultaat.partnerNaam }));
                  setCode('');
                },
                onError: (fout) =>
                  showError(
                    (fout as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                      t('musicSharing.link.failed'),
                  ),
              });
            }}
          >
            <label className="sr-only" htmlFor="koppelcode">
              {t('musicSharing.link.codeLabel')}
            </label>
            <input
              id="koppelcode"
              className="px-3 py-2 border rounded-lg font-mono tracking-widest uppercase"
              placeholder="XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button className="btn btn-primary" type="submit" disabled={!code.trim() || wisselIn.isPending}>
              {t('musicSharing.link.redeem')}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="text-lg font-medium mb-2">{t('musicSharing.link.partnersTitle')}</h2>
          {isLoading ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : (partners ?? []).length === 0 ? (
            <p className="text-muted">{t('musicSharing.link.noPartners')}</p>
          ) : (
            <ul className="divide-y">
              {(partners ?? []).map((partner) => (
                <li key={partner.id} className="py-2 flex justify-between items-center">
                  <span>{partner.displayName || partner.name}</span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setTeBeeindigen({ id: partner.id, name: partner.displayName || partner.name })}
                  >
                    {t('musicSharing.link.end')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {teBeeindigen && (
        <ConfirmDialog
          title={t('musicSharing.link.endTitle')}
          message={t('musicSharing.link.endConfirm', { naam: teBeeindigen.name })}
          onConfirm={() => {
            beeindig.mutate(teBeeindigen.id, {
              onSuccess: () => showSuccess(t('musicSharing.link.ended')),
            });
            setTeBeeindigen(null);
          }}
          onCancel={() => setTeBeeindigen(null)}
        />
      )}
    </div>
  );
}

/** Wat partners met ons hebben gedeeld. */
function CatalogusTab() {
  const { t } = useTranslation();
  const [zoekterm, setZoekterm] = useState('');
  const { data: titels, isLoading } = useCatalogus(zoekterm);
  const [geopend, setGeopend] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <label className="sr-only" htmlFor="catalogus-zoeken">
        {t('common.search')}
      </label>
      <input
        id="catalogus-zoeken"
        className="w-full px-3 py-2 border rounded-lg"
        placeholder={t('musicSharing.catalog.search')}
        value={zoekterm}
        onChange={(e) => setZoekterm(e.target.value)}
      />

      {isLoading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : (titels ?? []).length === 0 ? (
        <div className="alert alert-info">
          <Icon name="info" /> {t('musicSharing.catalog.empty')}
        </div>
      ) : (
        <ul className="divide-y">
          {(titels ?? []).map((titel) => (
            <li key={titel.id} className="py-3">
              <button className="text-left w-full" onClick={() => setGeopend(titel.id)}>
                <strong>{titel.title}</strong>
                <span className="text-muted block">{[titel.composer, titel.arranger].filter(Boolean).join(' · ')}</span>
                <small className="text-muted">{titel.associationName}</small>
              </button>
            </li>
          ))}
        </ul>
      )}

      {geopend && <CatalogusTitelModal titleId={geopend} onClose={() => setGeopend(null)} />}
    </div>
  );
}

/** De partijen bij een gedeeld stuk, en de stand van je verzoek per partij. */
function CatalogusTitelModal({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: titel, isLoading } = useCatalogusTitel(titleId);
  const vraagAan = useVraagPartijAan();

  const stand = (partij: { request: { status: string } | null }) => {
    if (!partij.request) return null;
    return t(`musicSharing.request.status.${partij.request.status}`);
  };

  return (
    <FormModal
      title={titel?.title ?? t('common.loading')}
      onClose={onClose}
      onSubmit={onClose}
      submitLabel={t('common.close')}
      size="large"
    >
      {isLoading || !titel ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-muted">{[titel.composer, titel.arranger].filter(Boolean).join(' · ')}</p>

          <div className="alert alert-info">
            <Icon name="info" /> {t('musicSharing.catalog.requestExplanation')}
          </div>

          <ul className="divide-y">
            {titel.parts.map((partij) => (
              <li key={partij.id} className="py-2 flex justify-between items-center gap-2">
                <span>
                  {partij.instrumentName ?? t('musicSharing.catalog.unknownInstrument')}
                  {partij.tuning ? ` (${partij.tuning})` : ''}
                  {partij.groupNumber ? ` ${partij.groupNumber}` : ''}
                </span>
                {partij.request ? (
                  <span className="text-muted">{stand(partij)}</span>
                ) : (
                  <button
                    // Zonder `type` is een knop in een formulier een
                    // verstuurknop. Deze staat in het formulier van FormModal,
                    // waarvan het versturen het venster sluit: de aanvraag ging
                    // wel weg, maar het venster klapte dicht voordat de melding
                    // kwam en voordat de stand bij de partij verscheen.
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={vraagAan.isPending}
                    onClick={() =>
                      vraagAan.mutate(
                        { pieceId: partij.id },
                        { onSuccess: () => showSuccess(t('musicSharing.request.sent')) },
                      )
                    }
                  >
                    {t('musicSharing.catalog.request')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </FormModal>
  );
}

/** Verzoeken die binnenkomen en verzoeken die wij hebben gedaan. */
function VerzoekenTab() {
  const { t } = useTranslation();
  const { data: binnen } = useBinnengekomenVerzoeken();
  const { data: eigen } = useEigenVerzoeken();
  const keurGoed = useKeurVerzoekGoed();
  const wijsAf = useWijsVerzoekAf();
  const trekIn = useTrekVerzoekIn();

  const omschrijving = (verzoek: Bestandsverzoek) =>
    `${verzoek.titleName ?? verzoek.originalFilename} — ${verzoek.instrumentName ?? ''}`.trim();

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body">
          <h2 className="text-lg font-medium mb-2">{t('musicSharing.request.incoming')}</h2>
          {(binnen ?? []).length === 0 ? (
            <p className="text-muted">{t('musicSharing.request.noIncoming')}</p>
          ) : (
            <ul className="divide-y">
              {(binnen ?? []).map((verzoek) => (
                <li key={verzoek.id} className="py-3">
                  <div className="flex justify-between items-start gap-2 flex-wrap">
                    <div>
                      <strong>{omschrijving(verzoek)}</strong>
                      <span className="text-muted block">
                        {verzoek.requestingAssociationName} · {verzoek.requestedByName} · {datum(verzoek.createdAt)}
                      </span>
                      {verzoek.message && <p className="mt-1">{verzoek.message}</p>}
                    </div>
                    {verzoek.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            keurGoed.mutate(
                              { id: verzoek.id },
                              { onSuccess: () => showSuccess(t('musicSharing.request.approved')) },
                            )
                          }
                        >
                          {t('musicSharing.request.approve')}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            wijsAf.mutate(
                              { id: verzoek.id },
                              { onSuccess: () => showSuccess(t('musicSharing.request.rejected')) },
                            )
                          }
                        >
                          {t('musicSharing.request.reject')}
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted">{t(`musicSharing.request.status.${verzoek.status}`)}</span>
                    )}
                  </div>
                  {verzoek.decisionNote && <small className="text-muted block mt-1">{verzoek.decisionNote}</small>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="text-lg font-medium mb-2">{t('musicSharing.request.outgoing')}</h2>
          {(eigen ?? []).length === 0 ? (
            <p className="text-muted">{t('musicSharing.request.noOutgoing')}</p>
          ) : (
            <ul className="divide-y">
              {(eigen ?? []).map((verzoek) => (
                <li key={verzoek.id} className="py-3 flex justify-between items-start gap-2 flex-wrap">
                  <div>
                    <strong>{omschrijving(verzoek)}</strong>
                    <span className="text-muted block">{verzoek.ownerAssociationName}</span>
                    {verzoek.decisionNote && <small className="text-muted">{verzoek.decisionNote}</small>}
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-muted">{t(`musicSharing.request.status.${verzoek.status}`)}</span>
                    {verzoek.status === 'approved' && (
                      <>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            haalVrijgegevenBestandOp(verzoek.id).catch(() =>
                              showError(t('musicSharing.request.downloadFailed')),
                            )
                          }
                        >
                          <Icon name="download" /> {t('common.download')}
                        </button>
                        {verzoek.accessExpiresAt && (
                          <small className="text-muted">
                            {t('musicSharing.request.until', { datum: datum(verzoek.accessExpiresAt) })}
                          </small>
                        )}
                      </>
                    )}
                    {verzoek.status === 'pending' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => trekIn.mutate(verzoek.id)}>
                        {t('musicSharing.request.withdraw')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Oproepen: wie zoekt wat, en wat is erop geantwoord. */
function OproepenTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [status, setStatus] = useState('open');
  const { data: oproepen, isLoading } = useOproepen(status);
  const plaats = usePlaatsOproep();
  const werkBij = useWerkOproepBij();
  const verwijder = useVerwijderOproep();
  const [nieuw, setNieuw] = useState(false);
  const [geopend, setGeopend] = useState<Oproep | null>(null);

  /** Gaan wij over deze oproep? Zonder eigen vereniging: nooit. */
  const eigenOproep = (oproep: Oproep) => !!user?.associationId && oproep.associationId === user.associationId;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="flex gap-2">
          {['open', 'resolved', ''].map((waarde) => (
            <button
              key={waarde || 'alle'}
              className={`btn btn-sm ${status === waarde ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatus(waarde)}
            >
              {t(`musicSharing.wanted.filter.${waarde || 'all'}`)}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setNieuw(true)}>
          <Icon name="plus" /> {t('musicSharing.wanted.new')}
        </button>
      </div>

      {isLoading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : (oproepen ?? []).length === 0 ? (
        <div className="alert alert-info">
          <Icon name="info" /> {t('musicSharing.wanted.empty')}
        </div>
      ) : (
        <ul className="space-y-3">
          {(oproepen ?? []).map((oproep) => (
            <li key={oproep.id} className="card">
              <div className="card-body">
                <div className="flex justify-between items-start gap-2 flex-wrap">
                  <div>
                    <strong>{oproep.title}</strong>
                    <span className="text-muted block">
                      {[oproep.composer, oproep.arranger].filter(Boolean).join(' · ')}
                    </span>
                    <small className="text-muted">
                      {oproep.associationName} · {datum(oproep.createdAt)}
                    </small>
                  </div>
                  <span className="text-muted">{t(`musicSharing.wanted.status.${oproep.status}`)}</span>
                </div>

                {oproep.description && <p className="mt-2">{oproep.description}</p>}

                <Verwijzing url={oproep.referenceUrl} />

                <div className="flex gap-2 mt-2 flex-wrap">
                  <button className="btn btn-secondary btn-sm" onClick={() => setGeopend(oproep)}>
                    <Icon name="message" /> {t('musicSharing.wanted.replies', { aantal: oproep.replyCount })}
                  </button>
                  {/*
                    De lijst bevat ook de oproepen van gekoppelde verenigingen -
                    daar is hij voor. Beheren doe je alleen je eigen oproep: de
                    server houdt PATCH en DELETE tegen op de vereniging en geeft
                    anders een 404, dus zo'n knop bij een ander deed niets en
                    wekte alleen de indruk dat je erover ging.
                  */}
                  {eigenOproep(oproep) && (
                    <>
                      {oproep.status === 'open' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => werkBij.mutate({ id: oproep.id, status: 'resolved' })}
                        >
                          {t('musicSharing.wanted.markResolved')}
                        </button>
                      )}
                      <button className="btn btn-secondary btn-sm" onClick={() => verwijder.mutate(oproep.id)}>
                        {t('common.delete')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {nieuw && (
        <OproepModal
          isLoading={plaats.isPending}
          onClose={() => setNieuw(false)}
          onSubmit={(gegevens) =>
            plaats.mutate(gegevens, {
              onSuccess: () => {
                showSuccess(t('musicSharing.wanted.posted'));
                setNieuw(false);
              },
              onError: () => showError(t('musicSharing.wanted.failed')),
            })
          }
        />
      )}

      {geopend && <AntwoordenModal oproep={geopend} onClose={() => setGeopend(null)} />}
    </div>
  );
}

/**
 * De verwijzing bij een oproep.
 *
 * Een YouTube-adres wordt een insluiting - maar niet door het adres zelf in de
 * src te zetten. We halen alleen het video-id eruit en bouwen de url zelf op.
 * Al het andere blijft een gewone link, en wat geen http of https is tonen we
 * helemaal niet.
 */
function Verwijzing({ url }: { url: string | null }) {
  const videoId = youtubeVideoId(url);

  if (videoId) {
    return (
      <div className="mt-2 aspect-video max-w-xl">
        <iframe
          className="w-full h-full rounded-lg"
          src={youtubeInsluitUrl(videoId)}
          title="YouTube"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allowFullScreen
        />
      </div>
    );
  }

  if (isVeiligeLink(url)) {
    return (
      <p className="mt-2">
        <a href={url as string} target="_blank" rel="noopener noreferrer nofollow">
          <Icon name="link" /> {url}
        </a>
      </p>
    );
  }

  return null;
}

function OproepModal({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void;
  onSubmit: (gegevens: {
    title: string;
    composer?: string;
    arranger?: string;
    description?: string;
    referenceUrl?: string;
  }) => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const [velden, setVelden] = useState({ title: '', composer: '', arranger: '', description: '', referenceUrl: '' });

  const zet = (naam: keyof typeof velden) => (e: { target: { value: string } }) =>
    setVelden((vorig) => ({ ...vorig, [naam]: e.target.value }));

  return (
    <FormModal
      title={t('musicSharing.wanted.new')}
      onClose={onClose}
      onSubmit={() =>
        onSubmit({
          title: velden.title,
          composer: velden.composer || undefined,
          arranger: velden.arranger || undefined,
          description: velden.description || undefined,
          referenceUrl: velden.referenceUrl || undefined,
        })
      }
      isLoading={isLoading || !velden.title.trim()}
      submitLabel={t('musicSharing.wanted.post')}
    >
      <div className="space-y-3">
        {(['title', 'composer', 'arranger'] as const).map((naam) => (
          <div key={naam}>
            <label className="block text-sm font-medium mb-1" htmlFor={`oproep-${naam}`}>
              {t(`musicSharing.wanted.field.${naam}`)}
            </label>
            <input
              id={`oproep-${naam}`}
              className="w-full px-3 py-2 border rounded-lg"
              value={velden[naam]}
              onChange={zet(naam)}
            />
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="oproep-description">
            {t('musicSharing.wanted.field.description')}
          </label>
          <textarea
            id="oproep-description"
            className="w-full px-3 py-2 border rounded-lg"
            rows={3}
            value={velden.description}
            onChange={zet('description')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="oproep-referenceUrl">
            {t('musicSharing.wanted.field.referenceUrl')}
          </label>
          <input
            id="oproep-referenceUrl"
            type="url"
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="https://www.youtube.com/watch?v=..."
            value={velden.referenceUrl}
            onChange={zet('referenceUrl')}
          />
          <small className="text-muted">{t('musicSharing.wanted.field.referenceHelp')}</small>
        </div>
      </div>
    </FormModal>
  );
}

function AntwoordenModal({ oproep, onClose }: { oproep: Oproep; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: antwoorden, isLoading } = useAntwoorden(oproep.id);
  const antwoord = useAntwoordOpOproep();
  const [tekst, setTekst] = useState('');

  return (
    <FormModal
      title={oproep.title}
      onClose={onClose}
      onSubmit={() =>
        antwoord.mutate(
          { oproepId: oproep.id, body: tekst },
          {
            onSuccess: () => {
              showSuccess(t('musicSharing.wanted.replied'));
              setTekst('');
            },
            onError: () => showError(t('musicSharing.wanted.replyFailed')),
          },
        )
      }
      isLoading={antwoord.isPending || !tekst.trim()}
      submitLabel={t('musicSharing.wanted.reply')}
      size="large"
    >
      <div className="space-y-3">
        {isLoading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : (antwoorden ?? []).length === 0 ? (
          <p className="text-muted">{t('musicSharing.wanted.noReplies')}</p>
        ) : (
          <ul className="divide-y">
            {(antwoorden ?? []).map((regel) => (
              <li key={regel.id} className="py-2">
                <strong>{regel.associationName}</strong>
                <small className="text-muted">
                  {' '}
                  · {regel.createdByName} · {datum(regel.createdAt)}
                </small>
                <p>{regel.body}</p>
              </li>
            ))}
          </ul>
        )}

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="antwoord-tekst">
            {t('musicSharing.wanted.yourReply')}
          </label>
          <textarea
            id="antwoord-tekst"
            className="w-full px-3 py-2 border rounded-lg"
            rows={3}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
          />
        </div>
      </div>
    </FormModal>
  );
}

/** Wat delen wij met wie, en wat sluiten we overal van uit. */
function OverzichtTab() {
  const { t } = useTranslation();
  const { data, isLoading } = useOverzicht();

  if (isLoading) return <p className="text-muted">{t('common.loading')}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {data.partners.length === 0 ? (
        <div className="alert alert-info">
          <Icon name="info" /> {t('musicSharing.overview.noPartners')}
        </div>
      ) : (
        data.partners.map((partner) => (
          <div key={partner.partnerId} className="card">
            <div className="card-body">
              <h2 className="text-lg font-medium mb-2">
                {partner.partnerName}{' '}
                <span className="text-muted">
                  ({t('musicSharing.overview.count', { aantal: partner.titles.length })})
                </span>
              </h2>
              {partner.titles.length === 0 ? (
                <p className="text-muted">{t('musicSharing.overview.nothingShared')}</p>
              ) : (
                <ul className="divide-y">
                  {partner.titles.map((titel) => (
                    <li key={titel.id} className="py-2">
                      <strong>{titel.title}</strong>
                      <span className="text-muted block">
                        {[titel.composer, titel.arranger].filter(Boolean).join(' · ')}
                      </span>
                      <small className="text-muted">
                        {t('musicSharing.overview.since', { datum: datum(titel.sinds) })}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))
      )}

      <div className="card">
        <div className="card-body">
          <h2 className="text-lg font-medium mb-2">{t('musicSharing.overview.excluded')}</h2>
          <p className="text-muted mb-2">{t('musicSharing.overview.excludedHelp')}</p>
          {data.excludedParts.length === 0 ? (
            <p className="text-muted">{t('musicSharing.overview.noExclusions')}</p>
          ) : (
            <ul className="divide-y">
              {data.excludedParts.map((partij) => (
                <li key={partij.id} className="py-2">
                  <strong>{partij.title}</strong>
                  <span className="text-muted"> — {partij.instrumentName ?? partij.originalFilename}</span>
                  {partij.reason && <small className="text-muted block">{partij.reason}</small>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
