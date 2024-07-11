import { Service, PlatformAccessory, Logger, CharacteristicValue, API } from 'homebridge';
import UnifiAccessPlatform from './platform';

interface Device {
  id: string;
  name: string;
  device_type: string;
  unique_id: string;
  type: string;
  isLocked?: boolean;
  isClosed?: boolean;
}

interface DoorChangeEvent {
  event: 'access.dps_change';
  receiver_id: string;
  event_object_id: string;
  save_to_history: boolean;
  data: {
    door_id: string;
    door_name: string;
    status: 'open' | 'close'; // Status peut être 'open' ou 'close'
    type: 'dps_change';
  };
}

export class UnifiAccessory {
  private readonly platform: UnifiAccessPlatform;
  private readonly accessory: PlatformAccessory;
  private readonly service: Service;
  private readonly api: API;
  private readonly log: Logger;

  constructor(platform: UnifiAccessPlatform, accessory: PlatformAccessory, api: API, log: Logger) {
    this.platform = platform;
    this.accessory = accessory;
    this.api = api;
    this.log = log;


    const device: Device = accessory.context.device;
    if (device.isLocked === undefined) {
      device.isLocked = true; // Fermer par défaut
    }


    this.service = this.determineService(device);

    // Set accessory information
    this.accessory.getService(this.api.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.api.hap.Characteristic.Manufacturer, 'Soundimage')
      .setCharacteristic(this.api.hap.Characteristic.Model, 'Access HUB')
      .setCharacteristic(this.api.hap.Characteristic.SerialNumber, '110720241011');
  }

  private determineService(device: Device): Service {
    if (device.type === 'UAH-DOOR' || device.type === 'UAH' || device.type === 'door') {
      const service = this.accessory.getService(this.api.hap.Service.LockMechanism) ||
        this.accessory.addService(this.api.hap.Service.LockMechanism);

      service.setCharacteristic(this.api.hap.Characteristic.Name, device.name);


      service.getCharacteristic(this.api.hap.Characteristic.LockCurrentState)
        .onGet(this.handleLockCurrentStateGet.bind(this));

      service.getCharacteristic(this.api.hap.Characteristic.LockTargetState)
        .onGet(this.handleLockTargetStateGet.bind(this))
        .onSet(this.handleLockTargetStateSet.bind(this));

      // Set default values for LockCurrentState and LockTargetState
      service.updateCharacteristic(
        this.api.hap.Characteristic.LockCurrentState,
        this.api.hap.Characteristic.LockCurrentState.SECURED,
      );
      service.updateCharacteristic(
        this.api.hap.Characteristic.LockTargetState,
        this.api.hap.Characteristic.LockTargetState.SECURED,
      );

      this.updateAccessoryCharacteristics();

      return service;
    } else if (device.type === 'UA-G2-MINI' || device.type === 'UA-LITE') {
      const service = this.accessory.getService(this.api.hap.Service.ContactSensor) ||
        this.accessory.addService(this.api.hap.Service.ContactSensor);

      service.setCharacteristic(this.api.hap.Characteristic.Name, device.name);
      service.getCharacteristic(this.api.hap.Characteristic.ContactSensorState)
        .onGet(this.handleContactSensorStateGet.bind(this));

      return service;
    } else if (device.type === 'UA-Intercom' ) {
      const service = this.accessory.getService(this.api.hap.Service.ContactSensor) ||
        this.accessory.addService(this.api.hap.Service.ContactSensor);

      service.setCharacteristic(this.api.hap.Characteristic.Name, device.name);
      service.getCharacteristic(this.api.hap.Characteristic.ContactSensorState)
        .onGet(this.handleContactSensorStateGet.bind(this));

      return service;

    } else if (device.type === 'UA-Int-Viewer' ) {
      const service = this.accessory.getService(this.api.hap.Service.ContactSensor) ||
        this.accessory.addService(this.api.hap.Service.ContactSensor);

      service.setCharacteristic(this.api.hap.Characteristic.Name, device.name);
      service.getCharacteristic(this.api.hap.Characteristic.ContactSensorState)
        .onGet(this.handleContactSensorStateGet.bind(this));

      return service;

    } else {
      // Log unknown device type as a warning
      this.platform.logWarning(`Unknown device type: ${device.type}`);

      // You might want to handle this differently based on your application logic
      throw new Error(`Unsupported device type: ${device.type}`);
    }
  }


  // Méthodes pour gérer les états et événements spécifiques à l'accessoire

  handleDoorChangeEvent(event: DoorChangeEvent): void {

    // Mettre à jour l'état du contact selon l'événement reçu
    const contactState = event.data.status === 'close'
      ? this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

    // Mettre à jour le service ContactSensor avec le nouvel état
    this.service.updateCharacteristic(this.api.hap.Characteristic.ContactSensorState, contactState);

    // Log pour le suivi dans les logs
    this.platform.logWarning(`Door '${event.data.door_name}' state changed to '${event.data.status}'`);
  }


  handleLockCurrentStateGet(): CharacteristicValue {
    const device = this.accessory.context;
    //this.log.debug('Accessory context:', this.accessory.context);
    const lockState = device.lockState === 'locked'
      ? this.api.hap.Characteristic.LockCurrentState.SECURED
      : this.api.hap.Characteristic.LockCurrentState.UNSECURED;

    //this.log.debug(`Lock current state get: ${lockState}`);
    return lockState;
  }

  handleLockTargetStateGet(): CharacteristicValue {
    const device = this.accessory.context;
    const targetLockState = device.lockState === 'locked'
      ? this.api.hap.Characteristic.LockTargetState.SECURED
      : this.api.hap.Characteristic.LockTargetState.UNSECURED;

    //this.log.debug(`Lock target state get: ${targetLockState}`);
    return targetLockState;
  }

  async handleLockTargetStateSet(value: CharacteristicValue, callback: (error?: Error) => void): Promise<void> {
    try {
      const device = this.accessory.context.device;
      const isSecured = value === this.api.hap.Characteristic.LockTargetState.SECURED;

      this.platform.logWarning(`Lock target state set: ${isSecured ? 'SECURED' : 'UNSECURED'}`);

      // Update the lock state in the device context
      device.isLocked = isSecured;

      // Update the current lock state to reflect the change
      const lockService = this.accessory.getService(this.api.hap.Service.LockMechanism);
      if (lockService) {
        lockService.updateCharacteristic(
          this.api.hap.Characteristic.LockCurrentState,
          isSecured ? this.api.hap.Characteristic.LockCurrentState.SECURED : this.api.hap.Characteristic.LockCurrentState.UNSECURED,
        );
      }

      // If unlocking is requested, call unlockDoorById with the device's door_id
      if (!isSecured) {
        const doorId = this.accessory.context.doorId; // Replace with actual device ID
        await this.platform.unlockDoorById(doorId); // Utilisez la fonction unlockDoorById de UnifiAccessPlatform
      }

    } catch (error:any) {
      // Call the callback with an error in case of exception
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }





  handleContactSensorStateGet(): CharacteristicValue {
    const device = this.accessory.context.device;
    return device.isClosed ? this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
  }

  updateAccessoryCharacteristics(): void {
    const deviceContext = this.accessory.context;

    if (!deviceContext || !deviceContext.device) {
      this.platform.logWarning('Device context is missing');
      return;
    }

    // Mettre à jour l'état de verrouillage actuel à partir du contexte
    if (this.service instanceof this.api.hap.Service.LockMechanism) {
      const lockState = deviceContext.lockState === 'locked'
        ? this.api.hap.Characteristic.LockCurrentState.SECURED
        : this.api.hap.Characteristic.LockCurrentState.UNSECURED;

      this.service.updateCharacteristic(this.api.hap.Characteristic.LockCurrentState, lockState);
      this.service.updateCharacteristic(this.api.hap.Characteristic.LockTargetState, lockState);
    }

    // Mettre à jour l'état du capteur de contact à partir du contexte
    if (this.service instanceof this.api.hap.Service.ContactSensor) {
      const contactState = !deviceContext.isSensorOpen
        ? this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED
        : this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

      this.service.updateCharacteristic(this.api.hap.Characteristic.ContactSensorState, contactState);
    }

    // Mettre à jour l'accessoire dans Homebridge
    this.api.updatePlatformAccessories([this.accessory]);
  }


}
