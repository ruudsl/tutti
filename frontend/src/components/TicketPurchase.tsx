import { useState, useMemo, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { getConcertTickets, createTicketOrder, payTicketOrder, mockPayment } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import type { TicketType } from '../types';
import CaptchaWidget from './CaptchaWidget';
import { FormField } from './FormField';

interface TicketPurchaseProps {
  concertId: string;
  onClose?: () => void;
  onSuccess?: (orderId: string) => void;
}

type Step = 'select' | 'checkout' | 'payment' | 'complete';

export default function TicketPurchase({ concertId, onClose, onSuccess }: TicketPurchaseProps) {
  const { t } = useTranslation();
  const kopersEmailId = useId();

  const [step, setStep] = useState<Step>('select');
  const [selectedTickets, setSelectedTickets] = useState<Record<string, number>>({});
  const [buyerInfo, setBuyerInfo] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('ideal');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Fetch concert ticket info
  const { data: ticketInfo, isLoading: isLoadingTickets } = useQuery({
    queryKey: queryKeys.concertTickets(concertId),
    queryFn: () => getConcertTickets(concertId),
  });

  // CAPTCHA handlers
  const handleCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token);
  }, []);

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null);
  }, []);

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: () => {
      const items = Object.entries(selectedTickets)
        .filter(([, qty]) => qty > 0)
        .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));

      return createTicketOrder(concertId, {
        items,
        buyerName: buyerInfo.name,
        buyerEmail: buyerInfo.email,
        buyerPhone: buyerInfo.phone || undefined,
        captchaToken: captchaToken || undefined,
      });
    },
    onSuccess: (data) => {
      setOrderId(data.orderId);
      setStep('payment');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });

  // Pay order mutation
  const payOrderMutation = useMutation({
    mutationFn: () => {
      if (!orderId) throw new Error('No order ID');
      return payTicketOrder(orderId, { method: paymentMethod });
    },
    onSuccess: (data) => {
      // Redirect to payment provider
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });

  // Mock payment mutation (development only)
  const mockPaymentMutation = useMutation({
    mutationFn: () => {
      if (!orderId) throw new Error('No order ID');
      return mockPayment(orderId, 'pay');
    },
    onSuccess: () => {
      showSuccess(t('tickets.paymentSuccess'));
      setStep('complete');
      if (onSuccess && orderId) {
        onSuccess(orderId);
      }
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });

  // Calculate totals
  const { totalTickets, subtotal, totalServiceFee, totalPrice, selectedItems, showServiceFeeSeparate } = useMemo(() => {
    if (!ticketInfo)
      return {
        totalTickets: 0,
        subtotal: 0,
        totalServiceFee: 0,
        totalPrice: 0,
        selectedItems: [],
        showServiceFeeSeparate: false,
      };

    let sub = 0;
    let serviceFeeSum = 0;
    let count = 0;
    let showSeparate = false;
    const items: { ticketType: TicketType; quantity: number }[] = [];

    ticketInfo.ticketTypes.forEach((tt) => {
      const qty = selectedTickets[tt.id] || 0;
      if (qty > 0) {
        sub += tt.price * qty;
        serviceFeeSum += (tt.serviceFee || 0) * qty;
        count += qty;
        if (tt.showServiceFeeSeparate) {
          showSeparate = true;
        }
        items.push({ ticketType: tt, quantity: qty });
      }
    });

    return {
      totalTickets: count,
      subtotal: sub,
      totalServiceFee: serviceFeeSum,
      totalPrice: sub + serviceFeeSum,
      selectedItems: items,
      showServiceFeeSeparate: showSeparate,
    };
  }, [ticketInfo, selectedTickets]);

  const handleQuantityChange = (ticketTypeId: string, quantity: number, maxAvailable: number, maxPerOrder: number) => {
    const maxQty = Math.min(maxAvailable, maxPerOrder);
    const newQty = Math.max(0, Math.min(quantity, maxQty));
    setSelectedTickets((prev) => ({
      ...prev,
      [ticketTypeId]: newQty,
    }));
  };

  const handleCheckout = () => {
    if (totalTickets === 0) {
      showError(t('tickets.selectAtLeastOne'));
      return;
    }
    setStep('checkout');
  };

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerInfo.name || !buyerInfo.email) {
      showError(t('tickets.fillRequiredFields'));
      return;
    }
    createOrderMutation.mutate();
  };

  const handlePayment = () => {
    payOrderMutation.mutate();
  };

  if (isLoadingTickets) {
    return (
      <div className="ticket-purchase">
        <div className="loading">
          <div className="spinner"></div>
          <span>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (!ticketInfo) {
    return (
      <div className="ticket-purchase">
        <p>{t('tickets.noTicketsAvailable')}</p>
      </div>
    );
  }

  return (
    <div className="ticket-purchase">
      {/* Concert Info Header */}
      <div className="ticket-purchase-header" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>{ticketInfo.concert.name}</h2>
        <p style={{ color: 'var(--text-light)', margin: '0.5rem 0' }}>
          {new Date(ticketInfo.concert.date).toLocaleDateString()} -{' '}
          {ticketInfo.concert.location || t('tickets.locationTba')}
        </p>
      </div>

      {/* Progress indicator */}
      <div className="ticket-steps" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        {['select', 'checkout', 'payment'].map((s, i) => (
          <div
            key={s}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '0.5rem',
              borderBottom: `3px solid ${step === s || (s === 'select' && step !== 'select') || (s === 'checkout' && (step === 'payment' || step === 'complete')) ? 'var(--primary)' : 'var(--border-color)'}`,
              color: step === s ? 'var(--primary)' : 'var(--text-light)',
            }}
          >
            <span style={{ fontWeight: step === s ? 'bold' : 'normal' }}>
              {i + 1}. {t(`tickets.step${s.charAt(0).toUpperCase() + s.slice(1)}`)}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Ticket Selection */}
      {step === 'select' && (
        <div className="ticket-selection">
          {ticketInfo.ticketTypes.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-light)' }}>{t('tickets.noTicketTypesAvailable')}</p>
          ) : (
            <>
              {ticketInfo.ticketTypes.map((tt) => (
                <div
                  key={tt.id}
                  className="card"
                  style={{
                    marginBottom: '1rem',
                    opacity: tt.available === 0 || !tt.onSale ? 0.6 : 1,
                  }}
                >
                  <div
                    className="card-body"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <h4 style={{ margin: 0 }}>{tt.name}</h4>
                      {tt.description && (
                        <p style={{ color: 'var(--text-light)', fontSize: '0.875rem', margin: '0.25rem 0' }}>
                          {tt.description}
                        </p>
                      )}
                      <p style={{ fontWeight: 'bold', margin: '0.5rem 0 0' }}>EUR {tt.price.toFixed(2)}</p>
                      {tt.available === 0 && <span className="badge badge-danger">{t('tickets.soldOut')}</span>}
                      {!tt.onSale && tt.available > 0 && (
                        <span className="badge badge-warning">{t('tickets.notOnSale')}</span>
                      )}
                      {tt.onSale && tt.available > 0 && tt.available <= 10 && (
                        <span className="badge badge-warning">{t('tickets.onlyXLeft', { count: tt.available })}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        className="btn btn-outline"
                        disabled={!tt.onSale || tt.available === 0 || (selectedTickets[tt.id] || 0) === 0}
                        onClick={() =>
                          handleQuantityChange(tt.id, (selectedTickets[tt.id] || 0) - 1, tt.available, tt.maxPerOrder)
                        }
                      >
                        -
                      </button>
                      <span style={{ minWidth: '2rem', textAlign: 'center', fontWeight: 'bold' }}>
                        {selectedTickets[tt.id] || 0}
                      </span>
                      <button
                        className="btn btn-outline"
                        disabled={
                          !tt.onSale ||
                          tt.available === 0 ||
                          (selectedTickets[tt.id] || 0) >= Math.min(tt.available, tt.maxPerOrder)
                        }
                        onClick={() =>
                          handleQuantityChange(tt.id, (selectedTickets[tt.id] || 0) + 1, tt.available, tt.maxPerOrder)
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Order Summary */}
              {totalTickets > 0 && (
                <div className="card" style={{ backgroundColor: 'var(--surface-color)', marginTop: '1rem' }}>
                  <div className="card-body">
                    <h4>{t('tickets.orderSummary')}</h4>
                    {selectedItems.map(({ ticketType, quantity }) => (
                      <div
                        key={ticketType.id}
                        style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}
                      >
                        <span>
                          {quantity}x {ticketType.name}
                        </span>
                        <span>EUR {(ticketType.price * quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    {showServiceFeeSeparate && totalServiceFee > 0 && (
                      <>
                        <hr />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span>{t('tickets.subtotal')}</span>
                          <span>EUR {subtotal.toFixed(2)}</span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: '0.5rem',
                            color: 'var(--text-light)',
                          }}
                        >
                          <span>{t('tickets.serviceFee')}</span>
                          <span>EUR {totalServiceFee.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    <hr />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: 'bold',
                        fontSize: '1.125rem',
                      }}
                    >
                      <span>{t('tickets.total')}</span>
                      <span>EUR {totalPrice.toFixed(2)}</span>
                    </div>
                    {showServiceFeeSeparate && totalServiceFee > 0 && (
                      <p
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-light)',
                          marginTop: '0.5rem',
                          marginBottom: 0,
                        }}
                      >
                        {t('tickets.serviceFeeInfo')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                {onClose && (
                  <button className="btn btn-outline" onClick={onClose}>
                    {t('common.cancel')}
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={totalTickets === 0}
                  onClick={handleCheckout}
                >
                  {t('tickets.proceedToCheckout')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 2: Checkout Form */}
      {step === 'checkout' && (
        <form onSubmit={handleSubmitOrder} className="ticket-checkout">
          <FormField label={`${t('tickets.buyerName')} *`}>
            <input
              type="text"
              className="form-control"
              value={buyerInfo.name}
              onChange={(e) => setBuyerInfo({ ...buyerInfo, name: e.target.value })}
              required
            />
          </FormField>
          {/* Met de hand gekoppeld: in deze form-group staat naast label en veld
              ook nog een hulptekst, en FormField kloont maar één kind. De
              hulptekst hangt via aria-describedby aan het veld, anders valt hij
              buiten beeld voor een schermlezer. */}
          <div className="form-group">
            <label className="form-label" htmlFor={kopersEmailId}>
              {t('tickets.buyerEmail')} *
            </label>
            <input
              id={kopersEmailId}
              aria-describedby={`${kopersEmailId}-hulp`}
              type="email"
              className="form-control"
              value={buyerInfo.email}
              onChange={(e) => setBuyerInfo({ ...buyerInfo, email: e.target.value })}
              required
            />
            <small id={`${kopersEmailId}-hulp`} style={{ color: 'var(--text-light)' }}>
              {t('tickets.emailDescription')}
            </small>
          </div>
          <FormField label={t('tickets.buyerPhone')}>
            <input
              type="tel"
              className="form-control"
              value={buyerInfo.phone}
              onChange={(e) => setBuyerInfo({ ...buyerInfo, phone: e.target.value })}
            />
          </FormField>

          {/* Order Summary */}
          <div
            className="card"
            style={{ backgroundColor: 'var(--surface-color)', marginTop: '1rem', marginBottom: '1rem' }}
          >
            <div className="card-body">
              <h4>{t('tickets.orderSummary')}</h4>
              {selectedItems.map(({ ticketType, quantity }) => (
                <div
                  key={ticketType.id}
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}
                >
                  <span>
                    {quantity}x {ticketType.name}
                  </span>
                  <span>EUR {(ticketType.price * quantity).toFixed(2)}</span>
                </div>
              ))}
              {showServiceFeeSeparate && totalServiceFee > 0 && (
                <>
                  <hr />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span>{t('tickets.subtotal')}</span>
                    <span>EUR {subtotal.toFixed(2)}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                      color: 'var(--text-light)',
                    }}
                  >
                    <span>{t('tickets.serviceFee')}</span>
                    <span>EUR {totalServiceFee.toFixed(2)}</span>
                  </div>
                </>
              )}
              <hr />
              <div
                style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.125rem' }}
              >
                <span>{t('tickets.total')}</span>
                <span>EUR {totalPrice.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* CAPTCHA verification */}
          {ticketInfo?.captcha?.enabled && ticketInfo.captcha.siteKey && (
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <CaptchaWidget
                siteKey={ticketInfo.captcha.siteKey}
                onVerify={handleCaptchaVerify}
                onExpire={handleCaptchaExpire}
                theme="auto"
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setStep('select')}>
              {t('common.back')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={createOrderMutation.isPending || (ticketInfo?.captcha?.enabled && !captchaToken)}
            >
              {createOrderMutation.isPending ? t('common.loading') : t('tickets.placeOrder')}
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Payment */}
      {step === 'payment' && (
        <div className="ticket-payment">
          <h3>{t('tickets.selectPaymentMethod')}</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {ticketInfo.paymentMethods.map((method) => (
              <label
                key={method}
                className="card"
                style={{
                  padding: '1rem',
                  cursor: 'pointer',
                  border: paymentMethod === method ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                }}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method}
                  checked={paymentMethod === method}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{ marginRight: '0.5rem' }}
                />
                {t(`tickets.paymentMethods.${method}`, method.toUpperCase())}
              </label>
            ))}
          </div>

          {/* Order Summary */}
          <div className="card" style={{ backgroundColor: 'var(--surface-color)', marginBottom: '1rem' }}>
            <div className="card-body">
              <div
                style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.125rem' }}
              >
                <span>{t('tickets.totalToPay')}</span>
                <span>EUR {totalPrice.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              className="btn btn-outline"
              onClick={() => setStep('checkout')}
              disabled={payOrderMutation.isPending}
            >
              {t('common.back')}
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handlePayment}
              disabled={payOrderMutation.isPending}
            >
              {payOrderMutation.isPending ? t('common.loading') : t('tickets.payNow')}
            </button>
          </div>

          {/* Development: Mock payment button */}
          {import.meta.env.DEV && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button
                className="btn btn-outline"
                onClick={() => mockPaymentMutation.mutate()}
                disabled={mockPaymentMutation.isPending}
                style={{ fontSize: '0.75rem' }}
              >
                [DEV] Simulate successful payment
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && (
        <div className="ticket-complete" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#10003;</div>
          <h2>{t('tickets.orderComplete')}</h2>
          <p style={{ color: 'var(--text-light)' }}>{t('tickets.confirmationSent', { email: buyerInfo.email })}</p>
          {orderId && (
            <p>
              <strong>{t('tickets.orderNumber')}:</strong> {orderId}
            </p>
          )}
          {onClose && (
            <button className="btn btn-primary" onClick={onClose} style={{ marginTop: '1rem' }}>
              {t('common.close')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
