import { API } from 'homebridge';
import UnifiAccessPlatform from './platform'; // Utilisez l'exportation par défaut
import { PLATFORM_NAME } from './settings';

export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, UnifiAccessPlatform);
};
