/* eslint-disable max-len */
import { API, DynamicPlatformPlugin, CharacteristicValue, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import WebSocket from 'ws';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { UnifiAccessory } from './platformAccessory';


interface Device {
  id: string;
  name: string;
  device_type: string;
  unique_id: string;
  type: string;
  isLocked?: boolean;
  isClosed?: boolean;
}

interface EventData {
  event: string;
  deviceId?: string;
  data?: any; // Définissez un type plus précis si possible pour `data`
}


export default class UnifiAccessPlatform implements DynamicPlatformPlugin {
  private readonly log: Logger;
  private readonly config: PlatformConfig;
  private readonly api: API;
  private readonly accessories: PlatformAccessory[] = [];
  private axiosInstance!: AxiosInstance;
  private ws!: WebSocket;
  private lastHelloTime: number = Date.now();
  private pendingTimeouts: Map<string, NodeJS.Timeout> = new Map();

  private apiToken: string;

  public logWarning(message: string): void {
    this.log.warn(message);
  }

  constructor(log: Logger, config: PlatformConfig, api: API) {
    this.log = log;
    this.config = config;
    this.api = api;

    // Initialize WebSocket and Axios instances
    this.initAxiosInstance();
    this.initWebSocket();

    this.apiToken = this.config.apiToken as string;

    // Register the existing accessories
    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  initAxiosInstance(): void {
    this.axiosInstance = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });
  }

  //////////////////////////////////////////////////////////////////////////////////////////
  //      Initial connection to access websocket for receive event from access API
  /////////////////////////////////////////////////////////////////////////////////////////

  initWebSocket(): void {
    const wsBaseUrl = this.config.baseUrl.replace(/^https:\/\//, 'wss://');
    const path = '/api/v1/developer/devices/notifications';

    // Ajouter le chemin spécifique
    const wsUrl = `${wsBaseUrl}${path}`;
    // Initialize WebSocket connection
    this.ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
      },
      rejectUnauthorized: false,
    });

    this.ws.on('open', () => {
      this.log.info('WebSocket connected');
      // Reset lastHelloTime when WebSocket is connected
      this.lastHelloTime = Date.now();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const eventData = JSON.parse(data.toString());
        //this.log.debug(eventData);
        if (eventData.data === 'Hello') {
          this.handleHelloEvent();
        } else {
          this.handleEvent(eventData);
        }
        // Update lastHelloTime on every 'Hello' message received
        this.lastHelloTime = Date.now();
      } catch (error) {
        this.log.error('Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('error', (error: Error) => {
      this.log.error('WebSocket error:', error);
      // Handle error and attempt to reconnect
      this.reconnectWebSocket();
    });

    this.ws.on('close', () => {
      //this.log.info('WebSocket connection closed');
      // Automatically attempt to reconnect
      this.reconnectWebSocket();
    });

    // Handle reconnection if 'Hello' is not received within 1 minute
    setInterval(() => {
      const now = Date.now();
      const timeDiff = now - this.lastHelloTime;
      const oneMinute = 60 * 1000;

      if (timeDiff >= oneMinute) {
        this.log.warn('No "Hello" received for 1 minute. Reconnecting WebSocket...');
        this.reconnectWebSocket();
      }
    }, 60 * 1000); // Check every minute
  }

  //////////////////////////////////////////////////////////////////////////////////////////
  //     Reconnect websocket (Called if ping server is not received for 1 minute)
  /////////////////////////////////////////////////////////////////////////////////////////

  reconnectWebSocket(): void {
    // Close existing WebSocket connection if it exists
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.ws.close();
    }

    const wsBaseUrl = this.config.baseUrl.replace(/^https:\/\//, 'wss://');
    const path = '/api/v1/developer/devices/notifications';

    // Ajouter le chemin spécifique
    const wsUrl = `${wsBaseUrl}${path}`;

    // Initialize a new WebSocket connection
    this.ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
      },
      rejectUnauthorized: false,
    });

    this.ws.on('open', () => {
      this.log.info('WebSocket reconnected');
      // Reset lastHelloTime when WebSocket is reconnected
      this.lastHelloTime = Date.now();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const eventData = JSON.parse(data.toString());
        if (eventData.data === 'Hello') {
          this.handleHelloEvent();
        } else {
          this.handleEvent(eventData);
        }
        // Update lastHelloTime on every 'Hello' message received
        this.lastHelloTime = Date.now();
      } catch (error) {
        this.log.error('Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('error', (error: Error) => {
      this.log.error('WebSocket error:', error);
      // Handle error and attempt to reconnect
      this.reconnectWebSocket();
    });

    this.ws.on('close', () => {
      this.log.info('WebSocket connection closed');
      // Automatically attempt to reconnect
      this.reconnectWebSocket();
    });
  }

  //////////////////////////////////////////////////////////////////////////////////////////
  //      Discover devices
  /////////////////////////////////////////////////////////////////////////////////////////

  async discoverDevices(): Promise<void> {
    try {
      const urlForDiscover = this.config.baseUrl;
      const discoverUrl = `${urlForDiscover}/api/v1/developer/devices`;
      const response = await this.axiosInstance.get(discoverUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Accept': 'application/json',
        },
      });

      if (response.status !== 200) {
        throw new Error(`Failed to fetch devices. Status: ${response.status}`);
      }

      if (!response.data || !Array.isArray(response.data.data) || response.data.data.length === 0) {
        throw new Error('Invalid or empty data array received');
      }

      // Flatten the data array
      const devices: Device[] = response.data.data.flat(2);

      devices.forEach(device => {
        const uuid = this.api.hap.uuid.generate(device.id);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          // Update existing accessory if needed
          this.log.info(`Updating existing accessory from cache: ${existingAccessory.displayName}`);
          new UnifiAccessory(this, existingAccessory, this.api, this.log); // Pass this.api as the third argument
        } else {
          // Create new accessory
          this.log.info(`Adding new accessory: ${device.name}`);
          const accessory = new this.api.platformAccessory(device.name, uuid);
          accessory.context.device = device;
          accessory.context.id = device.id;

          // Check device type and add Contact Sensor service if it's a UAH-DOOR
          if (device.type === 'UAH-DOOR' || device.type === 'UAH') {
            this.log.info(`Adding Contact Sensor service for: ${device.name}`);
            // Définir les variables à suivre pour chaque hub
            const variablesToTrack = ['isClosed', 'ContactRen', 'ContactRex', 'ContactRel']; // Remplacez par vos variables spécifiques

            variablesToTrack.forEach(variable => {
              const contactSensorName = `${device.name} - ${variable}`;
              this.log.info(`Adding Contact Sensor service for: ${contactSensorName}`);

              const contactSensorService = accessory.addService(this.api.hap.Service.ContactSensor, contactSensorName, variable);

              contactSensorService.setCharacteristic(this.api.hap.Characteristic.Name, contactSensorName);

              // Initialize sensor state for each variable (assuming it's closed initially)
              accessory.context[`${variable}State`] = false; // Initialisez l'état selon vos besoins
              contactSensorService.updateCharacteristic(this.api.hap.Characteristic.ContactSensorState, this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED);
            });

            accessory.context.lockState = 'locked';

            // Initialize sensor state (assuming it's closed initially)
            accessory.context.isClosed = false;
          } else if (device.type === 'UA-G2-MINI' || device.type === 'UA-LITE' || device.type === 'UA-Intercom' || device.type === 'UA-Intercom-viewer') {
            this.log.info(`Adding ContactSensor service for: ${device.name}`);
            accessory.addService(this.api.hap.Service.ContactSensor, device.name);
            // Initialize sensor state (assuming it's closed initially)
            accessory.context.isClosed = true;
          }

          // Register the accessory
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

          // Create UnifiAccessory instance for handling updates
          new UnifiAccessory(this, accessory, this.api, this.log); // Pass this.api as the third argument
        }
      });

    } catch (error:any) {
      this.log.error('Failed to discover devices:', error.message);
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////
  //      Fetch door details
  /////////////////////////////////////////////////////////////////////////////////////////

  async fetchDoorDetails(): Promise<any[]> {
    try {

      const urlForDoorDetail = this.config.baseUrl;
      const doorUrl = `${urlForDoorDetail}/api/v1/developer/doors`;
      const response = await this.axiosInstance.get(doorUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Accept': 'application/json',
        },
      });

      if (response.status !== 200) {
        throw new Error(`Failed to fetch door details. Status: ${response.status}`);
      }

      const doors = response.data; // Supposons que la réponse contient un tableau d'objets représentant les portes

      // Vous pouvez maintenant utiliser ces détails de porte comme nécessaire dans votre logique
      return doors;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error:any) {
      this.log.error('Failed to fetch door details:', error.message);
      throw error; // Propagez l'erreur pour une gestion supplémentaire si nécessaire
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////
  //      Unlock door function (Called when a remote unlock is requested by the user)
  /////////////////////////////////////////////////////////////////////////////////////////

  async unlockDoorById(doorId: string): Promise<void> {
    const urlForUnlock = this.config.baseUrl;
    const unlockUrl = `${urlForUnlock}/api/v1/developer/doors/${doorId}/unlock`;

    try {
      const response = await this.axiosInstance.put(unlockUrl, {}, {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status !== 200) {
        throw new Error(`Failed to unlock door. Status: ${response.status}`);
      }

      console.log('Door unlocked successfully, if not unlocked in real, reboot now and retry.');
    } catch (error: any) {
      console.error('Error unlocking door:', error.message);
      throw error; // Propagez l'erreur pour une gestion supplémentaire si nécessaire
    }
  }

  /////////////////////////////////////////////////////////////////////////////////////////
  //      Configure accessory when called
  /////////////////////////////////////////////////////////////////////////////////////////

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info(`Loading accessory from cache: ${accessory.displayName}`);
    this.accessories.push(accessory);
    new UnifiAccessory(this, accessory, this.api, this.log);
  }

  handleEvent(eventData: any): void {
    if (!this.isValidEventData(eventData)) {
      return;
    }

    // Log the received event
    //const eventString = JSON.stringify(eventData, null, 2);
    //this.log.debug(`Received event:\n${eventString}`);

    // Process the event based on its type
    if (eventData.event) {
      switch (eventData.event) {
        case 'access.remote_view':
          if (eventData.data) {
            this.handleRemoteViewEvent(eventData.data);
          }
          break;
        case 'access.remote_view.change':
          if (eventData.data) {
            this.handleRemoteViewChangeEvent(eventData.data);
          }
          break;
        case 'access.data.device.remote_unlock':
          //this.log.warn(eventData.data);
          if (eventData.data) {
            this.handleRemoteUnlockEvent(eventData.data);
          }
          break;
        case 'access.data.device.update':
          this.handleDeviceUpdateEvent(eventData);
          break;
        case 'access.logs.add':
          //this.logWarning(eventData.data);
          this.handleMessage(eventData);
          break;
        case 'access.hw.door_bell':
          //this.logWarning(eventData.data);
          break;
        default:
          //this.log.debug('Unhandled event:', eventData);
          break;
      }
    } else {
      //this.log.warn('Unhandled event:', eventData);
    }

    // Attempt to find the accessory by deviceId if available
    const device = this.findAccessoryByDeviceId(eventData.deviceId);
    if (device) {
      new UnifiAccessory(this, device, this.api, this.log).updateAccessoryCharacteristics();
    } else {
      //this.log.warn(`No accessory found for deviceId: ${eventData.deviceId}`);
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////
  //      Handle specific devices states (Reader, Intercom, ect)
  /////////////////////////////////////////////////////////////////////////////////////////

  private checkEvent(message: any): boolean {
    // Assurez-vous que le message contient bien les données attendues
    if (!message || !message._source || !message._source.event) {
      this.log.warn('Invalid message format or missing event data.');
      return false;
    }

    const eventType = message._source.event.type;
    //this.log.debug(`Event type from message: ${eventType}`);

    // Vérifiez si le type d'événement correspond à l'ouverture de la porte
    return true;
  }

  private handleMessage(eventData: EventData): void {
    try {
      // Vérifiez que les données de l'événement sont définies et contiennent les cibles
      if (!eventData.data || !eventData.data._source || !eventData.data._source.target) {
        this.log.warn('Event data or target is missing.');
        return;
      }

      // Cherchez l'objet avec le type "UA-G2-MINI" dans le tableau target
      const targetItem = eventData.data._source.target.find((item: { type: string }) => item.type === 'UA-G2-MINI' || item.type === 'UA-LITE');

      // Vérifiez que targetItem est défini
      if (!targetItem) {
        //this.log.warn('No target item with type "UA-G2-MINI" found.');
        return;
      }

      // Récupérez l'ID correspondant
      const uniqueId = targetItem.id;

      // Trouvez l'accessoire avec le ID unique
      const device = this.accessories.find(acc => acc.context.device.id === uniqueId);

      if (!device) {
        this.log.warn(`No accessory found for unique_id: ${uniqueId}. If this is the first configuration, please reboot now for register the devices.`);
        return;
      }

      // Récupérez l'ID du capteur à partir du contexte de l'accessoire
      const sensorId = device.context.device.id;

      //this.log.debug('Received message:', JSON.stringify(eventData.data, null, 2));
      //this.log.debug('Sensor ID to compare:', sensorId);
      //this.log.info('Device context:', JSON.stringify(device.context, null, 2));

      // Vérifiez si le capteur est ouvert ou fermé en fonction des données de l'événement
      const isOpened = this.checkEvent(eventData.data); // Utilisez cette méthode pour déterminer si le capteur est ouvert

      // Log pour l'état actuel du capteur
      //this.log.debug(`Current state: ${isOpened ? 'Open' : 'Closed'}`);

      // Mettre à jour l'état du capteur uniquement si nécessaire
      const contactSensorService = device.getService(this.api.hap.Service.ContactSensor);
      if (contactSensorService) {
        const currentState = contactSensorService.getCharacteristic(this.api.hap.Characteristic.ContactSensorState).value;

        // Si le capteur est ouvert et était précédemment fermé, ou vice versa, mettre à jour l'état
        if (isOpened && currentState !== this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED) {
          // Mise à jour pour "ouvert"
          contactSensorService.getCharacteristic(this.api.hap.Characteristic.ContactSensorState)
            .updateValue(this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
          this.log.debug(`Sensor state changed for ${device.displayName}: Open`);
          device.context.isClosed = false;
        } else if (!isOpened && currentState !== this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED) {
          // Mise à jour pour "fermé"
          contactSensorService.getCharacteristic(this.api.hap.Characteristic.ContactSensorState)
            .updateValue(this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED);
          this.log.debug(`Sensor state changed for ${device.displayName}: Closed`);
          device.context.isClosed = true;
        }

        // Si un timeout est déjà en cours pour cet appareil, annulez-le
        if (this.pendingTimeouts.has(sensorId)) {
          clearTimeout(this.pendingTimeouts.get(sensorId)!);
        }

        // Lancez un délai de 5 secondes avant de fermer le contact si le capteur est ouvert
        if (isOpened) {
          const timeoutId = setTimeout(() => {
            contactSensorService.getCharacteristic(this.api.hap.Characteristic.ContactSensorState)
              .updateValue(this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED);
            this.log.debug(`Sensor state changed for ${device.displayName}: Closed`);
            device.context.isClosed = true;
            this.pendingTimeouts.delete(sensorId); // Nettoyez la Map après l'expiration du délai
          }, 5000); // 5000 millisecondes = 5 secondes

          // Stockez le timeout en cours
          this.pendingTimeouts.set(sensorId, timeoutId);
        }
      } else {
        this.log.warn('ContactSensor service not found.');
      }
    } catch (error) {
      this.log.error('Failed to handle message from devices:', error);
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////
  //      Handle device update (Used for get token for door)
  /////////////////////////////////////////////////////////////////////////////////////////

  private handleDeviceUpdateEvent(eventData: EventData): void {
    try {
      const uniqueId = eventData.data.unique_id;
      const device = this.accessories.find(acc => acc.context.id === uniqueId);

      if (!device) {
        this.log.warn(`No accessory found for unique_id: ${uniqueId}. If this is the first configurations, please reboot.`);
        return;
      }

      // Extraction des valeurs de unique_id et door
      const doorId = eventData.data.door?.unique_id;
      const doorName = eventData.data.door?.name;

      // Stocker ces valeurs dans le contexte de l'accessoire
      device.context.doorId = doorId;
      device.context.doorName = doorName;

      // Création de l'accessoire UnifiAccessory pour gérer les caractéristiques
      const unifiAccessory = new UnifiAccessory(this, device, this.api, this.log);

      // Extraction des configurations
      const configs = eventData.data.configs;

      // Fonction pour traiter les configurations
      const handleConfig = (key: string, contextKey: string, stateMapping: { [key: string]: CharacteristicValue }) => {
        const config = configs.find((config: any) => config.key === key);
        if (config) {
          const state = stateMapping[config.value];
          if (state === undefined) {
            this.log.warn(`Unhandled state value '${config.value}' for ${key}. Defaulting to 'CONTACT_NOT_DETECTED'.`);
          }
          const previousState = device.context[contextKey];
          const finalState = state ?? this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED; // Valeur par défaut

          if (previousState !== finalState) {
            device.context[contextKey] = finalState;
            this.log.info(`${contextKey} state changed for ${device.displayName}: ${finalState}`);

            // Mise à jour du service ContactSensor
            const contactSensorService = device.getServiceById(this.api.hap.Service.ContactSensor, contextKey);
            if (contactSensorService) {
              contactSensorService.getCharacteristic(this.api.hap.Characteristic.ContactSensorState)
                .updateValue(finalState);
            }
            unifiAccessory.updateAccessoryCharacteristics();
          }
        }
      };

      // Gestion de l'état du capteur principal
      handleConfig('input_state_dps', 'isClosed', {
        'off': this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
        'on': this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
        'default': this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
      });

      // Gestion de l'état de la serrure
      handleConfig('input_state_rly-lock_dry', 'lockState', {
        'on': 'unlocked',
        'off': 'locked',
        'default': device.context.lockState,
      });

      // Gestion des variables supplémentaires
      const variableConfigs = [
        { key: 'input_state_rex', contextKey: 'ContactRex' },
        { key: 'input_state_ren', contextKey: 'ContactRen' },
        { key: 'input_state_rel', contextKey: 'ContactRel' },
      ];

      variableConfigs.forEach(({ key, contextKey }) => {
        handleConfig(key, contextKey, {
          'on': this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
          'off': this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
          'default': this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
        });
      });

    } catch (error) {
      this.log.error('Failed to handle device update event:', error);
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////
  //      Find accessory in cached devices by "id"
  /////////////////////////////////////////////////////////////////////////////////////////

  private findAccessoryByDeviceId(deviceId: string | undefined): PlatformAccessory | undefined {
    if (!deviceId) {
      return undefined;
    }
    return this.accessories.find(acc => acc.UUID === this.api.hap.uuid.generate(deviceId));
  }

  //////////////////////////////////////////////////////////////////////////////////////////
  //      Handle Ping websocket server
  /////////////////////////////////////////////////////////////////////////////////////////

  handleHelloEvent(): void {
    this.lastHelloTime = Date.now();
    this.log.debug('Ping reçu');
  }

  //////////////////////////////////////////////////////////////////////////////////////////
  //      Verify if eventdata is a valid payload
  /////////////////////////////////////////////////////////////////////////////////////////

  private isValidEventData(eventData: any): eventData is EventData {
    if (!eventData) {
      //this.log.error('Invalid event data received:', eventData);
      return false;
    }

    if (typeof eventData.event !== 'string') {
      //this.log.error('Invalid event data received:', eventData);
      return false;
    }

    return true;
  }

  //////////////////////////////////////////////////////////////////////////////////////////
  //      Handle remote call from access API
  /////////////////////////////////////////////////////////////////////////////////////////

  private handleRemoteViewEvent(eventData: EventData): void {
    if (!eventData.data) {
      //this.log.error('No data provided for access.remote_view event');
      return;
    }
    // Handle remote_view event data
    //this.log.debug('Handling access.remote_view event:', eventData.data);
  }

  private handleRemoteViewChangeEvent(eventData: EventData): void {
    if (!eventData.data) {
      //this.log.error('No data provided for access.remote_view.change event');
      return;
    }
    // Handle remote_view.change event data
    //this.log.debug('Handling access.remote_view.change event:', eventData.data);
  }

  private handleRemoteUnlockEvent(eventData: EventData): void {
    if (!eventData.data) {
      //this.log.error('No data provided for access.data.device.remote_unlock event');
      return;
    }
    // Handle remote_unlock event data
    //this.log.debug('Handling access.data.device.remote_unlock event:', eventData.data);
  }

  ////////////////////////////////////////////////////////////////////////////////////////
  // UNUSED AT THIS TIME
  ///////////////////////////////////////////////////////////////////////////////////////

  private handleDeviceUpdate(eventData: EventData): void {
    if (!eventData.data) {
      //this.log.error('No data provided for access.data.device.update event');
      return;
    }
    // Handle device update event data
    //this.log.debug('Handling access.data.device.update event:', eventData.data);
  }
}
