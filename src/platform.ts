import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
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
          accessory.context.lockState = 'locked';

          // Check device type and add Contact Sensor service if it's a UAH-DOOR
          if (device.type === 'UAH-DOOR' || device.type === 'UAH') {
            this.log.info(`Adding Contact Sensor service for: ${device.name}`);
            accessory.addService(this.api.hap.Service.ContactSensor, device.name);

            // Initialize sensor state (assuming it's closed initially)
            accessory.context.isSensorOpen = false;
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
    } catch (error:any) {
      this.log.error('Failed to fetch door details:', error.message);
      throw error; // Propagez l'erreur pour une gestion supplémentaire si nécessaire
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////
  //      Unlock door function
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
  //      Handle device update (Used for get token for door)
  /////////////////////////////////////////////////////////////////////////////////////////

  private handleDeviceUpdateEvent(eventData: any): void {
    try {
      const uniqueId = eventData.data.unique_id;
      const device = this.accessories.find(acc => acc.context.id === uniqueId);

      if (!device) {
        this.log.warn(`No accessory found for unique_id: ${uniqueId}. If this is the first configurations, please reboot.`);
        return;
      }

      // Extraction des valeurs de unique_id et door
      const doorId = eventData.data.door.unique_id;
      const doorName = eventData.data.door.name;

      // Stocker ces valeurs dans le contexte de l'accessoire
      device.context.doorId = doorId;
      device.context.doorName = doorName;

      // Création de l'accessoire UnifiAccessory pour gérer les caractéristiques
      const unifiAccessory = new UnifiAccessory(this, device, this.api, this.log);

      // Extraction des configurations
      const configs = eventData.data.configs;

      // Recherche de la configuration 'input_state_dps'
      const inputStateConfig = configs.find((config: any) => config.key === 'input_state_dps');

      if (!inputStateConfig) {
        this.log.warn(`Config 'input_state_dps' not found for ${device.displayName}`);
        return;
      }


      // Détermination de l'état du capteur (ouvert ou fermé)
      const isSensorOpen = inputStateConfig.value === 'off'; // Adapter selon votre logique spécifique

      // Comparaison avec l'état précédent
      const previousState = device.context.isSensorOpen;

      if (previousState !== isSensorOpen) {
        // Mettre à jour l'état dans le contexte de l'accessoire
        device.context.isSensorOpen = isSensorOpen;

        // Affichage du message dans les logs sur le changement d'état
        this.log.info(`Sensor state changed for ${device.displayName}: ${isSensorOpen ? 'Open' : 'Closed'}`);

        // Mettre à jour les caractéristiques de l'accessoire via UnifiAccessory
        unifiAccessory.updateAccessoryCharacteristics();

        // Mettre à jour l'état du service ContactSensor de l'accessoire
        const contactSensorService = device.getService(this.api.hap.Service.ContactSensor);
        if (contactSensorService) {
          contactSensorService.getCharacteristic(this.api.hap.Characteristic.ContactSensorState)
            .updateValue(isSensorOpen ? this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED);
        }
      }

      // Recherche de la configuration 'input_state_rly-lock_dry'
      const rlyLockDryConfig = configs.find((config: any) => config.key === 'input_state_rly-lock_dry');

      if (rlyLockDryConfig) {
        // Détermination de l'état actuel de la serrure
        const isLockUnlocked = rlyLockDryConfig.value === 'on';

        // Comparaison avec l'état précédent
        const previousLockState = device.context.lockState;

        // Seulement déverrouiller si l'état précédent n'était pas déverrouillé
        if (isLockUnlocked && previousLockState !== 'unlocked') {
          this.log.info('Lock is unlocked from Access API');
          device.context.lockState = 'unlocked';
          unifiAccessory.updateAccessoryCharacteristics();

        // Seulement verrouiller si l'état précédent n'était pas verrouillé
        } else if (!isLockUnlocked && previousLockState !== 'locked') {
          this.log.info('Lock is locked from Access API');
          device.context.lockState = 'locked';
          unifiAccessory.updateAccessoryCharacteristics();
        }
      }

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
  //      Handle remote call from
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

  private handleDeviceUpdate(eventData: EventData): void {
    if (!eventData.data) {
      //this.log.error('No data provided for access.data.device.update event');
      return;
    }
    // Handle device update event data
    //this.log.debug('Handling access.data.device.update event:', eventData.data);
  }
}
