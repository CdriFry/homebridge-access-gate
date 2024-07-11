<h1 style="text-align: center;">Homebridge Unifi Access Gate Plugin</h1>

<div style="text-align: center;">
    <div style="display: inline-block; margin-right: 10px;">
        <img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-color-round-stylized.png" alt="Homebridge logo" style="width: 200px;">
    </div>
    <div style="display: inline-block; margin-right: 10px;">
        <img src="https://techspecs.ui.com/static/brand/UniFi/access.svg" alt="Unifi Access Branding" style="width: 200px;">
    </div>
</div>


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
