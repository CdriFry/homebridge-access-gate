<p align="center">
  <img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-color-round-stylized.png" alt="Homebridge" width="200"/>
  <img src="https://techspecs.ui.com/static/brand/UniFi/access.svg" alt="Unifi access branding" width="200"/>
</p>

---

<h1 align="center">Homebridge Unifi Access Gate Plugin</h1>

## Introduction

Ce plugin Homebridge permet d'intégrer les systèmes Unifi Access dans votre environnement Homebridge. Avec ce plugin, vous pouvez surveiller et contrôler vos dispositifs Unifi Access directement depuis l'application HomeKit. 
J'ai ajouté la possibilité de récupérer l'état des capteurs des portes afin de faire suivre des automatisations en cas d'ouverture prolongée. 

## Prérequis

- Homebridge installé et fonctionnel.
- Activer le token API Access.
- L'URL de votre Unifi Access Controller doit être sous la forme : `http://adresse_ip:12445`.

## Configuration

Ajoutez la configuration suivante à votre fichier `config.json` de Homebridge :


```json
{
  "platforms": [
    {
      "name": "Unifi Access Gate",
      "baseUrl": "http://adresse_ip:12445",
      "apiToken": "tokenaccess",
      "platform": "UnifiAccessPlatform",
    }
  ]
}
```

Ou utilisez la configuration UI dans homebridge/Hoobs.

## Configuration de l'API Unifi Access

Pour utiliser ce plugin, vous devez activer l'API sur votre contrôleur Unifi Access. Voici comment procéder :

1. Connectez-vous à votre contrôleur Unifi Access.
2. Accédez à la section des paramètres.
3. Activez l'API et notez l'URL de base qui sera de la forme `http://adresse_ip:12445`.


## Features 

- Déverouiller les dispositifs Unifi Access via l'application HomeKit.
- Auto-découverte des dispositifs Unifi Access (Déjà pris en charge - UA Hub - UA Hub Door (G2) - UA G2 Mini - UA LITE  /  À venir - Intercom - Intercom Viewer)
- Détecteur de contact pour les lecteurs NFC, Intercom
- Surveillance en temps réel de vos dispositifs Unifi Access.
- Notifications d'événements et d'alarmes.

## Fonctionnalités à venir

 - Doorbell depuis Intercom
 - Doorbell depuis Hub
 - Détecteur de contact pour les utilisateurs (Qui déverouille ?)
 - 
  
## Support et Documentation

Pour plus d'informations et de support, ouvrez un [Support request](https://github.com/CdriFry/homebridge-access-gate/issues/new/choose).

## Contribuer

Les contributions sont les bienvenues !

## Licence

Ce projet est sous licence Apache 2.0. Voir le fichier [LICENSE](LICENSE) pour plus de détails.
