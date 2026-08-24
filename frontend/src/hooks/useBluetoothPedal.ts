import { useState, useCallback, useEffect, useRef } from 'react';

// Web Bluetooth API types (not fully supported in all browsers)
declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: {
        acceptAllDevices?: boolean;
        filters?: Array<{ services?: string[]; name?: string; namePrefix?: string }>;
        optionalServices?: string[];
      }): Promise<BluetoothDeviceType>;
    };
  }
}

interface BluetoothDeviceType {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<BluetoothGATTServerType>;
    disconnect(): void;
  };
  addEventListener(event: string, callback: () => void): void;
}

interface BluetoothGATTServerType {
  getPrimaryService(service: string): Promise<BluetoothGATTServiceType>;
}

interface BluetoothGATTServiceType {
  getCharacteristic(characteristic: string): Promise<BluetoothGATTCharacteristicType>;
}

interface BluetoothGATTCharacteristicType {
  value?: DataView;
  readValue(): Promise<DataView>;
  startNotifications(): Promise<void>;
  addEventListener(event: string, callback: (event: { target: BluetoothGATTCharacteristicType }) => void): void;
}

interface BluetoothPedalOptions {
  onPageNext?: () => void;
  onPagePrevious?: () => void;
  onCustomAction?: (action: string) => void;
}

interface BluetoothPedalState {
  isSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  deviceName: string | null;
  batteryLevel: number | null;
  error: string | null;
}

// Common Bluetooth page turner service UUIDs
const PAGE_TURNER_SERVICE_UUIDS = [
  '00001812-0000-1000-8000-00805f9b34fb', // HID Service
  '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
];

// Common keyboard keycodes for page turners
const PAGE_NEXT_KEYS = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'];
const PAGE_PREV_KEYS = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];

export function useBluetoothPedal(options: BluetoothPedalOptions = {}) {
  const [state, setState] = useState<BluetoothPedalState>({
    isSupported: false,
    isConnected: false,
    isConnecting: false,
    deviceName: null,
    batteryLevel: null,
    error: null,
  });

  const deviceRef = useRef<BluetoothDeviceType | null>(null);
  const characteristicRef = useRef<BluetoothGATTCharacteristicType | null>(null);
  const optionsRef = useRef(options);

  // Keep options ref updated
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Check Web Bluetooth support
  useEffect(() => {
    const isSupported = 'bluetooth' in navigator;
    setState((prev) => ({ ...prev, isSupported }));
  }, []);

  // Handle keyboard events (many Bluetooth pedals send keyboard events)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only process if connected to a device or in fullscreen (PDF viewer mode)
      if (!state.isConnected && !document.fullscreenElement) return;

      // Typt de gebruiker? Dan is de toets van hem en niet van het pedaal.
      // Zonder deze uitzondering slokt een gekoppeld pedaal spatie, Enter en
      // Backspace op uit elk invoerveld in de app - de gebruiker typt dan een
      // aantekening zonder spaties terwijl de bladmuziek onder zijn handen
      // doorbladert.
      const doel = e.target;
      if (
        doel instanceof HTMLInputElement ||
        doel instanceof HTMLTextAreaElement ||
        doel instanceof HTMLSelectElement ||
        // `isContentEditable` is in jsdom niet ingevuld; het kenmerk zelf wel,
        // en `closest` vangt meteen de tekst binnen een bewerkbaar blok mee.
        (doel instanceof HTMLElement &&
          (doel.isContentEditable || doel.closest('[contenteditable]:not([contenteditable="false"])') !== null))
      ) {
        return;
      }

      if (PAGE_NEXT_KEYS.includes(e.key)) {
        e.preventDefault();
        optionsRef.current.onPageNext?.();
      } else if (PAGE_PREV_KEYS.includes(e.key)) {
        e.preventDefault();
        optionsRef.current.onPagePrevious?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isConnected]);

  // Connect to Bluetooth device
  const connect = useCallback(async () => {
    if (!navigator.bluetooth) {
      setState((prev) => ({ ...prev, error: 'Bluetooth not supported' }));
      return;
    }

    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Request device with optional services
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PAGE_TURNER_SERVICE_UUIDS,
      });

      deviceRef.current = device;

      // Listen for disconnection
      device.addEventListener('gattserverdisconnected', () => {
        setState((prev) => ({
          ...prev,
          isConnected: false,
          deviceName: null,
          batteryLevel: null,
        }));
      });

      // Connect to GATT server
      const server = await device.gatt?.connect();

      if (server) {
        // Try to read battery level if available
        try {
          const batteryService = await server.getPrimaryService('battery_service');
          const batteryLevelChar = await batteryService.getCharacteristic('battery_level');
          const value = await batteryLevelChar.readValue();
          const batteryLevel = value.getUint8(0);
          setState((prev) => ({ ...prev, batteryLevel }));

          // Subscribe to battery level changes
          await batteryLevelChar.startNotifications();
          batteryLevelChar.addEventListener('characteristicvaluechanged', (event) => {
            const target = event.target as BluetoothGATTCharacteristicType;
            const level = target.value?.getUint8(0);
            if (level !== undefined) {
              setState((prev) => ({ ...prev, batteryLevel: level }));
            }
          });
        } catch {
          // Battery service not available, ignore
        }

        // Try to subscribe to HID reports or UART
        try {
          const hidService = await server.getPrimaryService('human_interface_device');
          const reportChar = await hidService.getCharacteristic('report');
          characteristicRef.current = reportChar;

          await reportChar.startNotifications();
          reportChar.addEventListener('characteristicvaluechanged', (event) => {
            const target = event.target as BluetoothGATTCharacteristicType;
            const data = target.value;
            if (data) {
              handleHIDReport(data);
            }
          });
        } catch {
          // HID service not available, device likely uses keyboard emulation
        }
      }

      setState((prev) => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        deviceName: device.name || 'Unknown Device',
      }));
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: error.message || 'Failed to connect',
      }));
    }
  }, []);

  // Handle HID reports from Bluetooth device
  const handleHIDReport = useCallback((data: DataView) => {
    // Common HID report parsing for page turners
    const byte0 = data.getUint8(0);

    // Many page turners use simple single-byte reports
    // 0x01 or similar for "next", 0x02 for "previous"
    if (byte0 === 0x01 || byte0 === 0x4f) {
      // Right arrow or custom "next"
      optionsRef.current.onPageNext?.();
    } else if (byte0 === 0x02 || byte0 === 0x50) {
      // Left arrow or custom "prev"
      optionsRef.current.onPagePrevious?.();
    } else if (byte0 !== 0) {
      // Unknown action, pass to custom handler
      optionsRef.current.onCustomAction?.(`0x${byte0.toString(16)}`);
    }
  }, []);

  // Disconnect from device
  const disconnect = useCallback(() => {
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    deviceRef.current = null;
    characteristicRef.current = null;
    setState((prev) => ({
      ...prev,
      isConnected: false,
      deviceName: null,
      batteryLevel: null,
    }));
  }, []);

  return {
    ...state,
    connect,
    disconnect,
  };
}

export default useBluetoothPedal;
