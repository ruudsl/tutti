import { useTranslation } from 'react-i18next';
import { useBluetoothPedal } from '../hooks/useBluetoothPedal';
import { Icon } from './Icon';

interface BluetoothPedalIndicatorProps {
  onPageNext?: () => void;
  onPagePrevious?: () => void;
  showBattery?: boolean;
}

export function BluetoothPedalIndicator({
  onPageNext,
  onPagePrevious,
  showBattery = true,
}: BluetoothPedalIndicatorProps) {
  const { t } = useTranslation();
  const {
    isSupported,
    isConnected,
    isConnecting,
    deviceName,
    batteryLevel,
    error,
    connect,
    disconnect,
  } = useBluetoothPedal({ onPageNext, onPagePrevious });

  if (!isSupported) {
    return null;
  }

  const statusClass = isConnected ? 'connected' : isConnecting ? 'connecting' : '';

  return (
    <div className={`bluetooth-indicator ${statusClass}`}>
      <span className="bluetooth-dot" />

      {isConnected ? (
        <>
          <span>{deviceName}</span>
          {showBattery && batteryLevel !== null && (
            <span title={t('bluetooth.batteryLevel')}>
              <Icon name={batteryLevel <= 20 ? 'batteryLow' : 'battery'} size={16} /> {batteryLevel}%
            </span>
          )}
          <button
            className="btn btn-sm btn-outline"
            onClick={disconnect}
            title={t('bluetooth.disconnect')}
          >
            {t('bluetooth.disconnect')}
          </button>
        </>
      ) : isConnecting ? (
        <span>{t('bluetooth.connecting')}</span>
      ) : (
        <>
          <button
            className="btn btn-sm btn-primary"
            onClick={connect}
            title={t('bluetooth.connectPedal')}
          >
            {t('bluetooth.connectPedal')}
          </button>
          {error && <span className="text-danger">{error}</span>}
        </>
      )}
    </div>
  );
}

export default BluetoothPedalIndicator;
