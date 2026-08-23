import { useState, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { getConcerts, validateTicket } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import { OfflineScanner } from '../components/OfflineScanner';
import type { TicketValidationResult } from '../types';

export default function TicketScanner() {
  const { t } = useTranslation();
  const concertKeuzeId = useId();
  useDocumentTitle('pageTitle.ticketScanner');
  const queryClient = useQueryClient();

  const [selectedConcertId, setSelectedConcertId] = useState<string>('');
  const [manualCode, setManualCode] = useState('');
  const [lastResult, setLastResult] = useState<TicketValidationResult | null>(null);
  const [scanCount, setScanCount] = useState({ valid: 0, invalid: 0 });
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [hasBarcodeDetector] = useState(() => 'BarcodeDetector' in window);
  const [showOfflineMode, setShowOfflineMode] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Fetch concerts for dropdown
  const { data: concertsData } = useQuery({
    queryKey: queryKeys.concerts({}),
    queryFn: () => getConcerts({}),
  });

  const concerts = concertsData?.data || [];

  // Filter to upcoming concerts
  const upcomingConcerts = concerts.filter((c) => new Date(c.date) >= new Date(new Date().setHours(0, 0, 0, 0)));

  // Validate ticket mutation
  const validateMutation = useMutation({
    mutationFn: (code: string) => validateTicket(code, selectedConcertId || undefined),
    onSuccess: (result) => {
      setLastResult(result);
      if (result.valid) {
        setScanCount((prev) => ({ ...prev, valid: prev.valid + 1 }));
        showSuccess(t('tickets.ticketValidated'));
        // Play success sound
        playSound('success');
      } else {
        setScanCount((prev) => ({ ...prev, invalid: prev.invalid + 1 }));
        showError(result.message);
        // Play error sound
        playSound('error');
      }
      // Invalidate ticket stats
      if (selectedConcertId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.ticketStats(selectedConcertId) });
      }
    },
    onError: (error) => {
      // De uitslag van de vórige kaart bleef hier staan. Wie aan de deur een
      // tweede kaart scant terwijl de server onbereikbaar is, ziet dan nog
      // steeds het groene vinkje met de naam van de vorige bezoeker, terwijl de
      // foutmelding als toast voorbijschiet. Die tweede bezoeker wordt dan
      // binnengelaten op andermans kaart. Er is niets bekend over deze scan,
      // dus staat er ook niets.
      setLastResult(null);
      showError(getErrorMessage(error));
      playSound('error');
    },
  });

  const playSound = (type: 'success' | 'error') => {
    // Create audio context for sound feedback
    try {
      const audioContext = new (
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      if (type === 'success') {
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
      } else {
        oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(200, audioContext.currentTime + 0.1);
      }

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch {
      // Audio not supported, ignore
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    validateMutation.mutate(manualCode.trim().toUpperCase());
    setManualCode('');
  };

  const scanningRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  // QR Scanner using native camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Wait for video to be ready before starting scan loop
        videoRef.current.onloadedmetadata = () => {
          videoRef.current
            ?.play()
            .then(() => {
              setIsCameraActive(true);
              scanningRef.current = true;
              scanQRCode();
            })
            .catch((err) => {
              console.error('Failed to play video:', err);
              showError(t('tickets.cameraError'));
            });
        };
      }
    } catch (error) {
      console.error('Failed to start camera:', error);
      showError(t('tickets.cameraError'));
    }
  };

  const stopCamera = () => {
    scanningRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const scanQRCode = async () => {
    if (!videoRef.current || !canvasRef.current || !scanningRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      animationFrameRef.current = requestAnimationFrame(scanQRCode);
      return;
    }

    // Only scan if video is playing and has data
    if (video.readyState !== video.HAVE_ENOUGH_DATA || video.videoWidth === 0) {
      animationFrameRef.current = requestAnimationFrame(scanQRCode);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Use BarcodeDetector API if available
    if ('BarcodeDetector' in window) {
      try {
        const barcodeDetector = new (
          window as unknown as {
            BarcodeDetector: new (options: { formats: string[] }) => {
              detect: (image: ImageBitmap) => Promise<{ rawValue: string }[]>;
            };
          }
        ).BarcodeDetector({ formats: ['qr_code'] });
        const imageBitmap = await createImageBitmap(canvas);
        const barcodes = await barcodeDetector.detect(imageBitmap);

        if (barcodes.length > 0 && !validateMutation.isPending) {
          const code = barcodes[0].rawValue;
          if (code && code.length > 10) {
            validateMutation.mutate(code);
            // Pause scanning briefly after a detection
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      } catch {
        // BarcodeDetector error, continue scanning
      }
    }

    if (scanningRef.current) {
      animationFrameRef.current = requestAnimationFrame(scanQRCode);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const getResultColor = (status: string) => {
    switch (status) {
      case 'valid':
        return 'var(--success)';
      case 'used':
        return 'var(--warning)';
      default:
        return 'var(--danger)';
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t('tickets.scanner')}</h1>
        <button
          className={`btn ${showOfflineMode ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setShowOfflineMode(!showOfflineMode)}
        >
          {showOfflineMode ? t('tickets.onlineMode', 'Online Modus') : t('tickets.offlineMode', 'Offline Modus')}
        </button>
      </div>

      {/* Offline Scanner Mode */}
      {showOfflineMode && selectedConcertId && (
        <div className="mb-3">
          <OfflineScanner
            concertId={selectedConcertId}
            onScanComplete={(result) => {
              if (result.valid) {
                setScanCount((prev) => ({ ...prev, valid: prev.valid + 1 }));
              } else {
                setScanCount((prev) => ({ ...prev, invalid: prev.invalid + 1 }));
              }
            }}
          />
        </div>
      )}

      {/* Concert Selection */}
      <div className="card mb-3">
        <div className="card-body">
          {/* Met de hand gekoppeld: naast label en veld staat hier ook een
              hulptekst, en FormField kloont maar één kind. */}
          <div className="form-group mb-0">
            <label className="form-label" htmlFor={concertKeuzeId}>
              {t('tickets.selectConcert')}
            </label>
            <select
              id={concertKeuzeId}
              aria-describedby={`${concertKeuzeId}-hulp`}
              className="form-control"
              value={selectedConcertId}
              onChange={(e) => setSelectedConcertId(e.target.value)}
              style={{ maxWidth: '400px' }}
            >
              <option value="">{t('tickets.allConcerts')}</option>
              {upcomingConcerts.map((concert) => (
                <option key={concert.id} value={concert.id}>
                  {concert.name} ({new Date(concert.date).toLocaleDateString()})
                </option>
              ))}
            </select>
            <small id={`${concertKeuzeId}-hulp`} style={{ color: 'var(--text-light)' }}>
              {t('tickets.selectConcertDescription')}
            </small>
          </div>
        </div>
      </div>

      <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
        {/* Scanner Section */}
        <div className="card" style={{ flex: '1 1 400px', minWidth: '300px' }}>
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>{t('tickets.scanQrCode')}</h3>

            {/* Camera View */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '400px',
                aspectRatio: '1',
                backgroundColor: 'var(--surface-color)',
                borderRadius: '8px',
                overflow: 'hidden',
                margin: '0 auto 1rem',
              }}
            >
              {/* Video element always rendered but hidden when inactive */}
              <video
                ref={videoRef}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: isCameraActive ? 'block' : 'none',
                }}
                playsInline
                muted
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              {isCameraActive ? (
                <>
                  {/* Scan overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '60%',
                      height: '60%',
                      border: '2px solid var(--primary)',
                      borderRadius: '8px',
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.3)',
                    }}
                  />
                </>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--text-light)',
                  }}
                >
                  <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#128247;</span>
                  <p>{t('tickets.cameraInactive')}</p>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center' }}>
              {isCameraActive ? (
                <button className="btn btn-danger" onClick={stopCamera}>
                  {t('tickets.stopCamera')}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={startCamera} disabled={!hasBarcodeDetector}>
                  {t('tickets.startCamera')}
                </button>
              )}
            </div>

            {!hasBarcodeDetector && (
              <div
                className="alert"
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  backgroundColor: 'rgba(255, 193, 7, 0.15)',
                  border: '1px solid var(--warning)',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                }}
              >
                <strong>{t('tickets.noBarcodeDetector')}</strong>
                <p style={{ margin: '0.5rem 0 0' }}>{t('tickets.useChromeOrManual')}</p>
              </div>
            )}

            {/* Manual Entry */}
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
              <h4>{t('tickets.manualEntry')}</h4>
              <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-control"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  placeholder={t('tickets.enterCode')}
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={validateMutation.isPending || !manualCode.trim()}
                >
                  {validateMutation.isPending ? '...' : t('tickets.validate')}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="card" style={{ flex: '1 1 400px', minWidth: '300px' }}>
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>{t('tickets.lastScan')}</h3>

            {/* Scan Counter */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <div
                className="card"
                style={{
                  flex: 1,
                  padding: '1rem',
                  textAlign: 'center',
                  backgroundColor: 'rgba(76, 175, 80, 0.1)',
                }}
              >
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)' }}>{scanCount.valid}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>{t('tickets.validScans')}</div>
              </div>
              <div
                className="card"
                style={{
                  flex: 1,
                  padding: '1rem',
                  textAlign: 'center',
                  backgroundColor: 'rgba(244, 67, 54, 0.1)',
                }}
              >
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--danger)' }}>{scanCount.invalid}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>{t('tickets.invalidScans')}</div>
              </div>
            </div>

            {/* Last Result */}
            {lastResult ? (
              <div
                className="card"
                style={{
                  padding: '1.5rem',
                  backgroundColor: lastResult.valid ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                  border: `2px solid ${getResultColor(lastResult.status)}`,
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                  <span
                    style={{
                      fontSize: '3rem',
                      color: getResultColor(lastResult.status),
                    }}
                  >
                    {lastResult.valid ? '\u2713' : '\u2717'}
                  </span>
                </div>

                <div
                  style={{
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '1.25rem',
                    marginBottom: '1rem',
                    color: getResultColor(lastResult.status),
                  }}
                >
                  {lastResult.message}
                </div>

                {lastResult.ticket && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-light)' }}>{t('tickets.ticketCode')}</span>
                      <span style={{ fontFamily: 'monospace' }}>{lastResult.ticket.code}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-light)' }}>{t('tickets.buyerName')}</span>
                      <span>{lastResult.ticket.buyerName}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-light)' }}>{t('tickets.ticketType')}</span>
                      <span>{lastResult.ticket.ticketType}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-light)' }}>{t('concerts.concertName')}</span>
                      <span>{lastResult.ticket.concertName}</span>
                    </div>
                    {lastResult.ticket.seatInfo && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--text-light)' }}>{t('tickets.seatInfo')}</span>
                        <span>{lastResult.ticket.seatInfo}</span>
                      </div>
                    )}
                    {lastResult.ticket.usedAt && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--text-light)' }}>{t('tickets.usedAt')}</span>
                        <span>{new Date(lastResult.ticket.usedAt).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '3rem',
                  color: 'var(--text-light)',
                }}
              >
                <p>{t('tickets.noScansYet')}</p>
              </div>
            )}

            {/* Reset Button */}
            {(scanCount.valid > 0 || scanCount.invalid > 0) && (
              <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setScanCount({ valid: 0, invalid: 0 });
                    setLastResult(null);
                  }}
                >
                  {t('tickets.resetCounter')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
