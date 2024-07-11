# Homebridge Unifi Access Plugin
<img src="https://techspecs.ui.com/static/brand/UniFi/access.svg" alt="Description de l'image" style="width:300px;">
<img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-color-round-stylized.png" alt="Homebridge" style="width:300px;">

## Introduction

Ce plugin Homebridge permet d'intégrer les systèmes Unifi Access dans votre environnement Homebridge. Avec ce plugin, vous pouvez surveiller et contrôler vos dispositifs Unifi Access directement depuis l'application HomeKit.

## Prérequis

- Homebridge installé et fonctionnel.
- Activer le token API Access.
- L'URL de votre API Unifi Access doit être sous la forme : `http://adresse_ip:12445`.

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

## Configuration de l'API Unifi Access

Pour utiliser ce plugin, vous devez activer l'API sur votre contrôleur Unifi Access. Voici comment procéder :

1. Connectez-vous à votre contrôleur Unifi Access.
2. Accédez à la section des paramètres.
3. Activez l'API et notez l'URL de base qui sera de la forme `http://adresse_ip:12445`.

## Fonctionnalités

- Surveillance en temps réel de vos dispositifs Unifi Access.
- Notifications d'événements et d'alarmes.
- Contrôle des dispositifs Unifi Access via l'application HomeKit.

## Support et Documentation

Pour plus d'informations et de support, ouvrez un [Support request](https://github.com/CdriFry/homebridge-access-gate/issues/new/choose).

## Contribuer

Les contributions sont les bienvenues !

## Licence

Ce projet est sous licence Apache 2.0. Voir le fichier [LICENSE](LICENSE) pour plus de détails.
