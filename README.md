# TuyAPI2MQTT

This is the documentation of TuyAPI2MQTT, an adapter application connecting Tuya devices to MQTT broker using the TuyAPI library!

The following steps describe the installation of TuyAPI2MQTT on Debian.

## Install the prerequisite software

### Install Node.js

1. Connect to the device through SSH.
2. Switch to `root` through `sudo su`.
3. Install Node.js and npm:
```
curl -sL https://deb.nodesource.com/setup_21.x | sudo bash -
apt update
apt upgrade
apt install nodejs
```

## Install the app

### Prepare the UNIX user

1. Connect to the device through SSH.
2. Switch to `root` through `sudo su`.
3. Create the new user `tuyapi2mqtt`:
```
adduser tuyapi2mqtt
```

### Prepare the file system

1. Create the `/var/tuyapi2mqtt` directory:
```
mkdir /var/tuyapi2mqtt
chown tuyapi2mqtt:tuyapi2mqtt /var/tuyapi2mqtt
```
2. Copy the content of this folder to the directory `/var/tuyapi2mqtt`.

### Customize `tuyapi2mqtt.service`

1. Depending on the configuration of MQTT broker, set `APP_MQTT_PROTOCOL` to `mqtt` or `mqtts`. In case of `mqtts`, it's necessary to put the certificate files into the directory `/var/tuyapi2mqtt` and don't forget to set their filenames into `tuyapi2mqtt.service`:
```
APP_MQTT_CA_FILENAME=rootCA.crt
APP_MQTT_CERT_FILENAME=mysite.crt
APP_MQTT_KEY_FILENAME=mysite.key
```
2. Set the MQTT broker password encoded in base64.
3. Every single Tuya device has its own configuration variables set: `APP_TUYAPI_0_...`, `APP_TUYAPI_1_...`, etc.
4. The Tuya device has to be connected through Tuya Smart app, it's possible to find the device ID and the device KEY using Tuya developer platform (see [this documentation](https://github.com/codetheweb/tuyapi/blob/master/docs/SETUP.md)).
5. The device key is always encoded as base64, don't forget the key is regenerated after re-addition of the device to Tuya Smart.
6. You can find out the local device IP through your router. I recomment to configure the static IP (by the MAC address).

### Install NPM modules and start the app

1. Install npm modules:
```
su - tuyapi2mqtt
cd /var/tuyapi2mqtt
npm install
exit
```
2. Enable and start the `tuyapi2mqtt` service:
```
systemctl enable /var/tuyapi2mqtt/tuyapi2mqtt.service
systemctl start tuyapi2mqtt
```

## Authors

- [**Eli Nucknack**](mailto:eli.nucknack@gmail.com)
