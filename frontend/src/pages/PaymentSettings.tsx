import { currentLocale } from '../utils/locale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import {
  getPaymentSettings,
  updatePaymentSettings,
  updatePaymentMethodFee,
  connectMollie,
  disconnectMollie,
  getMollieStatus,
  testMollieConnection,
  setMollieMode,
  deleteMollieKey,
} from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { SkeletonTable } from '../components/Skeleton';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ideal: 'iDEAL',
  creditcard: 'Creditcard',
  bancontact: 'Bancontact',
  paypal: 'PayPal',
  applepay: 'Apple Pay',
  googlepay: 'Google Pay',
  banktransfer: 'Bank Transfer',
};

export default function PaymentSettings() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.paymentSettings');

  const queryClient = useQueryClient();

  const [connectModalMode, setConnectModalMode] = useState<'live' | 'test' | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [editingFee, setEditingFee] = useState<{ method: string; customerFee: number } | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['paymentSettings'],
    queryFn: getPaymentSettings,
  });

  const { data: mollieStatus } = useQuery({
    queryKey: ['mollieStatus'],
    queryFn: getMollieStatus,
    refetchInterval: 5 * 60 * 1000,
  });

  const connectMutation = useMutation({
    mutationFn: (args: { key: string; mode: 'live' | 'test' }) => connectMollie(args.key, args.mode),
    onSuccess: (data) => {
      showSuccess(t('paymentSettings.connectSuccess', { name: data.organisationName }));
      setConnectModalMode(null);
      setApiKey('');
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectMollie,
    onSuccess: () => {
      showSuccess(t('paymentSettings.disconnectSuccess'));
      setShowDisconnectConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const setModeMutation = useMutation({
    mutationFn: (mode: 'live' | 'test') => setMollieMode(mode),
    onSuccess: (data) => {
      showSuccess(
        data.mode === 'live'
          ? t('paymentSettings.switchedToLive', 'Gewijzigd naar live modus')
          : t('paymentSettings.switchedToTest', 'Gewijzigd naar test modus'),
      );
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (mode: 'live' | 'test') => deleteMollieKey(mode),
    onSuccess: () => {
      showSuccess(t('paymentSettings.keyDeleted', 'API-sleutel verwijderd'));
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: updatePaymentSettings,
    onSuccess: () => {
      showSuccess(t('common.saved'));
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const updateFeeMutation = useMutation({
    mutationFn: ({ method, fee }: { method: string; fee: { customerFee: number; isEnabled?: boolean } }) =>
      updatePaymentMethodFee(method, fee),
    onSuccess: () => {
      showSuccess(t('common.saved'));
      setEditingFee(null);
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const testConnectionMutation = useMutation({
    mutationFn: testMollieConnection,
    onSuccess: (data) => {
      if (data.connected) {
        showSuccess(t('paymentSettings.connectionOk'));
      } else {
        showError(data.error || t('paymentSettings.connectionFailed'));
      }
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'EUR' }).format(amount);

  if (isLoading) {
    return (
      <div className="page">
        <h1>{t('paymentSettings.title')}</h1>
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={5} columns={3} />
          </div>
        </div>
      </div>
    );
  }

  const liveConfigured = settings?.liveKeyConfigured;
  const testConfigured = settings?.testKeyConfigured;
  const activeMode = settings?.mode || 'live';
  const anyKeyConfigured = liveConfigured || testConfigured;

  return (
    <div>
      <h1>{t('paymentSettings.title')}</h1>

      {/* Mollie Status Card */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 style={{ margin: 0 }}>Mollie</h3>
              <a
                href="https://status.mollie.com/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.875rem', color: 'var(--primary)' }}
              >
                Status:{' '}
                {mollieStatus?.operational ? (
                  <span style={{ color: 'var(--success)' }}>{mollieStatus?.statusDescription || 'Operational'}</span>
                ) : (
                  <span style={{ color: 'var(--warning)' }}>
                    {mollieStatus?.statusDescription || 'Issues detected'}
                  </span>
                )}
              </a>
            </div>
            {settings?.isConnected && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => testConnectionMutation.mutate()}
                disabled={testConnectionMutation.isPending}
              >
                {testConnectionMutation.isPending ? t('common.loading') : t('paymentSettings.testConnection')}
              </button>
            )}
          </div>

          {/* Active Mode Toggle */}
          {anyKeyConfigured && (
            <div className="card mb-3" style={{ background: 'var(--background)', padding: '1rem' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <strong>{t('paymentSettings.activeMode', 'Actieve modus')}:</strong>
                <div className="flex gap-1" role="tablist">
                  <button
                    role="tab"
                    aria-selected={activeMode === 'live'}
                    className={`btn btn-sm ${activeMode === 'live' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setModeMutation.mutate('live')}
                    disabled={!liveConfigured || setModeMutation.isPending || activeMode === 'live'}
                    title={!liveConfigured ? t('paymentSettings.noLiveKey', 'Geen live sleutel geconfigureerd') : ''}
                  >
                    {t('paymentSettings.liveMode', 'Live')}
                  </button>
                  <button
                    role="tab"
                    aria-selected={activeMode === 'test'}
                    className={`btn btn-sm ${activeMode === 'test' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setModeMutation.mutate('test')}
                    disabled={!testConfigured || setModeMutation.isPending || activeMode === 'test'}
                    title={!testConfigured ? t('paymentSettings.noTestKey', 'Geen test sleutel geconfigureerd') : ''}
                  >
                    {t('paymentSettings.testMode', 'Test')}
                  </button>
                </div>
                {activeMode === 'test' && (
                  <span
                    className="badge"
                    style={{
                      background: 'var(--warning-light)',
                      color: 'var(--warning)',
                      border: '1px solid var(--warning)',
                      padding: '0.2rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.8rem',
                    }}
                  >
                    {t(
                      'paymentSettings.testModeWarning',
                      'Testmodus actief — er worden geen echte betalingen verwerkt',
                    )}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Live Key Section */}
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <strong>{t('paymentSettings.liveApiKey', 'Live API-sleutel')}</strong>
              {liveConfigured && activeMode === 'live' && (
                <span
                  style={{
                    color: 'var(--success)',
                    fontSize: '0.875rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <Icon name="check" size={14} /> {t('paymentSettings.active', 'Actief')}
                </span>
              )}
            </div>
            {liveConfigured ? (
              <div className="flex gap-1 items-center">
                <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>live_••••••••••••••</span>
                {settings?.liveProfileId && <span className="text-muted text-sm ml-2">({settings.liveProfileId})</span>}
                <div style={{ marginLeft: 'auto' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setApiKey('');
                      setConnectModalMode('live');
                    }}
                  >
                    {t('paymentSettings.replace', 'Vervangen')}
                  </button>
                  <button
                    className="btn btn-outline btn-sm ml-1"
                    style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={() => deleteKeyMutation.mutate('live')}
                    disabled={deleteKeyMutation.isPending}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setApiKey('');
                  setConnectModalMode('live');
                }}
              >
                {t('paymentSettings.addLiveKey', 'Live sleutel toevoegen')}
              </button>
            )}
          </div>

          {/* Test Key Section */}
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <strong>{t('paymentSettings.testApiKey', 'Test API-sleutel')}</strong>
              {testConfigured && activeMode === 'test' && (
                <span
                  style={{
                    color: 'var(--success)',
                    fontSize: '0.875rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <Icon name="check" size={14} /> {t('paymentSettings.active', 'Actief')}
                </span>
              )}
            </div>
            {testConfigured ? (
              <div className="flex gap-1 items-center">
                <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>test_••••••••••••••</span>
                {settings?.testProfileId && <span className="text-muted text-sm ml-2">({settings.testProfileId})</span>}
                <div style={{ marginLeft: 'auto' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setApiKey('');
                      setConnectModalMode('test');
                    }}
                  >
                    {t('paymentSettings.replace', 'Vervangen')}
                  </button>
                  <button
                    className="btn btn-outline btn-sm ml-1"
                    style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={() => deleteKeyMutation.mutate('test')}
                    disabled={deleteKeyMutation.isPending}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setApiKey('');
                  setConnectModalMode('test');
                }}
              >
                {t('paymentSettings.addTestKey', 'Test sleutel toevoegen')}
              </button>
            )}
          </div>

          {settings?.isConnected && (
            <>
              <div
                className="card mb-3"
                style={{
                  backgroundColor: 'var(--success-light, #e8f5e9)',
                  border: '1px solid var(--success)',
                  padding: '1rem',
                }}
              >
                <div style={{ color: 'var(--success)', fontWeight: 500 }}>{t('paymentSettings.connectedMessage')}</div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="flex items-center gap-2">
                  {settings.canReceivePayments ? (
                    <span style={{ color: 'var(--success)', fontSize: '1.25rem' }}>&#10003;</span>
                  ) : (
                    <span style={{ color: 'var(--danger)', fontSize: '1.25rem' }}>&#10007;</span>
                  )}
                  <span>{t('paymentSettings.canReceivePayments')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {settings.canReceivePayouts ? (
                    <span style={{ color: 'var(--success)', fontSize: '1.25rem' }}>&#10003;</span>
                  ) : (
                    <span style={{ color: 'var(--danger)', fontSize: '1.25rem' }}>&#10007;</span>
                  )}
                  <span>{t('paymentSettings.canReceivePayouts')}</span>
                </div>
              </div>

              <button
                className="btn btn-outline"
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={() => setShowDisconnectConfirm(true)}
              >
                {t('paymentSettings.disconnect')}
              </button>
            </>
          )}

          {!anyKeyConfigured && (
            <div
              className="card"
              style={{
                backgroundColor: 'var(--warning-light, #fff3e0)',
                border: '1px solid var(--warning)',
                padding: '1rem',
              }}
            >
              <div style={{ color: 'var(--warning-dark, #e65100)' }}>{t('paymentSettings.notConnected')}</div>
            </div>
          )}
        </div>
      </div>

      {/* Payment Method Fees */}
      {settings?.isConnected && (
        <div className="card mb-3">
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>{t('paymentSettings.feesOverview')}</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('paymentSettings.paymentMethod')}</th>
                  <th>{t('paymentSettings.providerFee')}</th>
                  <th>{t('paymentSettings.customerFee')}</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {settings.fees.map((fee) => (
                  <tr key={fee.method} style={{ opacity: fee.isEnabled ? 1 : 0.5 }}>
                    <td>
                      <strong>{PAYMENT_METHOD_LABELS[fee.method] || fee.method}</strong>
                    </td>
                    <td>{formatCurrency(fee.providerFee)}</td>
                    <td>
                      {editingFee?.method === fee.method ? (
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="form-control"
                            style={{ width: '100px' }}
                            value={editingFee.customerFee}
                            onChange={(e) =>
                              setEditingFee({ ...editingFee, customerFee: parseFloat(e.target.value) || 0 })
                            }
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() =>
                              updateFeeMutation.mutate({
                                method: fee.method,
                                fee: { customerFee: editingFee.customerFee },
                              })
                            }
                            disabled={updateFeeMutation.isPending}
                          >
                            &#10003;
                          </button>
                          <button className="btn btn-outline btn-sm" onClick={() => setEditingFee(null)}>
                            &#10007;
                          </button>
                        </div>
                      ) : (
                        formatCurrency(fee.customerFee)
                      )}
                    </td>
                    <td>
                      {editingFee?.method !== fee.method && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditingFee({ method: fee.method, customerFee: fee.customerFee })}
                        >
                          &#9998;
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pass Fees to Customer */}
      {settings?.isConnected && (
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>{t('paymentSettings.feeSettings')}</h3>
            <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.passFeesToCustomer}
                onChange={(e) => updateSettingsMutation.mutate({ passFeesToCustomer: e.target.checked })}
                disabled={updateSettingsMutation.isPending}
              />
              <span>{t('paymentSettings.passFeesToCustomer')}</span>
            </label>
            <p style={{ color: 'var(--text-light)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {t('paymentSettings.passFeesToCustomerHelp')}
            </p>
          </div>
        </div>
      )}

      {/* Connect Mollie Modal */}
      {connectModalMode && (
        <Modal
          onClose={() => setConnectModalMode(null)}
          title={
            connectModalMode === 'live'
              ? t('paymentSettings.addLiveKey', 'Live sleutel toevoegen')
              : t('paymentSettings.addTestKey', 'Test sleutel toevoegen')
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              connectMutation.mutate({ key: apiKey, mode: connectModalMode });
            }}
          >
            <div className="form-group">
              <label className="form-label">{t('paymentSettings.apiKey')}</label>
              <input
                type="password"
                className="form-control"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={connectModalMode === 'live' ? 'live_xxxxxxxxxxxxxxxxxx' : 'test_xxxxxxxxxxxxxxxxxx'}
                required
              />
              <small style={{ color: 'var(--text-light)' }}>
                {connectModalMode === 'live'
                  ? t(
                      'paymentSettings.liveKeyHelp',
                      'Deze sleutel begint met "live_" en wordt gebruikt voor echte betalingen.',
                    )
                  : t(
                      'paymentSettings.testKeyHelp',
                      'Deze sleutel begint met "test_" en is alleen voor testdoeleinden.',
                    )}
              </small>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="btn btn-outline" onClick={() => setConnectModalMode(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={connectMutation.isPending}>
                {connectMutation.isPending ? t('common.loading') : t('paymentSettings.connect')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Disconnect Confirm Modal */}
      {showDisconnectConfirm && (
        <Modal onClose={() => setShowDisconnectConfirm(false)} title={t('paymentSettings.disconnectConfirmTitle')}>
          <p>{t('paymentSettings.disconnectConfirmMessage')}</p>
          <div className="flex justify-end gap-2 mt-3">
            <button className="btn btn-outline" onClick={() => setShowDisconnectConfirm(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-danger"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? t('common.loading') : t('paymentSettings.disconnect')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
