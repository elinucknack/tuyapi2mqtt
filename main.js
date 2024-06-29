const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(message => {
            const getLevel = message => `${message.exception ? 'UNCAUGHT EXCEPTION' : message.level.toUpperCase()}`;
            const getMessage = message => `${message.stack ? message.stack : message.message}${message.cause ? '\nCaused by ' + getMessage(message.cause) : ''}`;
            return `${message.timestamp} | ${getLevel(message)} | ${getMessage(message)}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: `${__dirname}/app.log`,
            maxsize: 1000000
        })
    ],
    exceptionHandlers: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: `${__dirname}/app.log`,
            maxsize: 1000000
        })
    ]
});

logger.info('=== TUYAPI2MQTT INITIALIZATION START ===');

logger.debug('Loading dependencies...');

const fs = require('fs');
const mqtt = require('mqtt');
const tuyapi = require('tuyapi');

logger.debug('Loading dependencies completed.');

logger.debug('Preparing MQTT driver definition...');

const createMqttDriver = () => {
    let connection = null;
    
    const connect = () => {
        let options = {
            protocol: process.env.APP_MQTT_PROTOCOL,
            host: process.env.APP_MQTT_HOST,
            port: process.env.APP_MQTT_PORT,
            username: process.env.APP_MQTT_USERNAME,
            password: Buffer.from(process.env.APP_MQTT_PASSWORD, 'base64').toString('utf8')
        };
        if (process.env.APP_MQTT_PROTOCOL === 'mqtts') {
            options = {
                ...options,
                ca: fs.readFileSync(`${__dirname}/${process.env.APP_MQTT_CA_FILENAME}`),
                cert: fs.readFileSync(`${__dirname}/${process.env.APP_MQTT_CERT_FILENAME}`),
                key: fs.readFileSync(`${__dirname}/${process.env.APP_MQTT_KEY_FILENAME}`)
            };
        }
        connection = mqtt.connect(options);
    };
    
    const publish = (name, message, qos, retain) => {
        connection.publish(
            `${process.env.APP_MQTT_TOPIC}/${name}/state`,
            JSON.stringify(message || {}, null, '    '),
            { qos: qos || 0, retain: retain || false },
            e => {
                if (e) {
                    logger.error(e);
                }
            }
        );
    };
    
    const subscribe = qos => {
        connection.subscribe(
            `${process.env.APP_MQTT_TOPIC}/#`,
            { qos: qos || 0 },
            e => {
                if (e) {
                    logger.error(e);
                }
            }
        );
    };
    
    const onConnect = callback => connection.on('connect', callback);
    
    const onClose = callback => connection.on('close', callback);
    
    const onError = callback => connection.on('error', callback);
    
    const onMessage = callback => {
        connection.on('message', (topic, message) => {
            callback(
                topic.substr(`${process.env.APP_MQTT_TOPIC}/`.length),
                JSON.parse(message.toString())
            );
        });
    };
    
    return {
        connect: () => connect(),
        publish: (name, message, qos, retain) => publish(name, message, qos, retain),
        subscribe: qos => subscribe(qos),
        onConnect: callback => onConnect(callback),
        onClose: callback => onClose(callback),
        onError: callback => onError(callback),
        onMessage: callback => onMessage(callback)
    };
};

logger.debug('Preparing MQTT driver definition completed.');

logger.debug('Creating MQTT driver...');

const mqttDriver = createMqttDriver();

logger.debug('Creating MQTT driver completed.');

logger.debug('Connecting MQTT server...');

mqttDriver.connect();

logger.debug('Connecting MQTT server completed.');

logger.debug('Preparing TuyAPI driver definition...');

const createTuyapiDriver = (name, id, key, ip, version) => {
    let device = null;
    let deviceData = { conn: false, dps: {} };
    
    const connect = () => {
        device = new tuyapi({ id, key, ip, version, issueRefreshOnConnect: true });
        
        device.connect().catch(e => logger.error(e));
        setInterval(() => {
            if (!device.isConnected()) {
                device.connect().catch(e => logger.error(e));
            }
        }, 15000);
    };
    
    const getName = () => name;
    
    const getData = data => deviceData;
    
    const sendData = data => {
        try {
            device.set(data);
        } catch (e) {
            logger.error(e);
        }
    };
    
    const onConnect = callback => device.on('connected', () => {
        deviceData.conn = true;
        callback();
    });
    
    const onData = callback => device.on('data', data => {
        deviceData.conn = true;
        deviceData.dps = { ...deviceData.dps, ...data.dps };
        callback(data);
    });
    
    const onDpRefresh = callback => device.on('dp-refresh', data => {
        deviceData.conn = true;
        deviceData.dps = { ...deviceData.dps, ...data.dps };
        callback(data);
    });
    
    const onClose = callback => device.on('disconnected', () => () => {
        deviceData.conn = false;
        callback();
    });
    
    const onError = callback => device.on('error', callback);
    
    return {
        connect: () => connect(),
        getName: () => getName(),
        getData: () => getData(),
        sendData: data => sendData(data),
        onConnect: callback => onConnect(callback),
        onData: callback => onData(callback),
        onDpRefresh: callback => onDpRefresh(callback),
        onClose: callback => onClose(callback),
        onError: callback => onError(callback)
    };
};

logger.debug('Preparing TuyAPI driver definition completed.');

logger.debug('Creating TuyAPI drivers...');

const tuyapiDrivers = [];
let deviceIndex = 0;
while (true) {
    if (!Object.keys(process.env).some(key => key.startsWith('APP_TUYAPI_' + deviceIndex.toString() + '_'))) {
        break;
    }
    
    tuyapiDrivers.push(createTuyapiDriver(
        process.env['APP_TUYAPI_' + deviceIndex.toString() + '_NAME'],
        process.env['APP_TUYAPI_' + deviceIndex.toString() + '_ID'],
        Buffer.from(process.env['APP_TUYAPI_' + deviceIndex.toString() + '_KEY'], 'base64').toString('utf8'),
        process.env['APP_TUYAPI_' + deviceIndex.toString() + '_IP'],
        process.env['APP_TUYAPI_' + deviceIndex.toString() + '_VERSION']
    ));
    
    deviceIndex++;
}

logger.debug('Creating TuyAPI drivers completed.');

logger.debug('Connecting TuyAPI drivers...');

for (const tuyapiDriver of tuyapiDrivers) {
    tuyapiDriver.connect();
}

logger.debug('Connecting TuyAPI drivers completed.');

logger.debug('Creating MQTT listeners...');

let mqttConnectionState = 'unknown';

const setMqttConnectionState = newConnectionState => {
    mqttConnectionState = newConnectionState;
    logger.info(`MQTT client ${newConnectionState}.`);
    if (['connected', 'reconnected'].includes(newConnectionState)) {
        for (const tuyapiDriver of tuyapiDrivers) {
            mqttDriver.publish(tuyapiDriver.getName(), { ...tuyapiDriver.getData(), timestamp: Date.now() }, 0, true);
        }
    }
};

mqttDriver.onConnect(() => {
    if (['unknown', 'unconnected'].includes(mqttConnectionState)) {
        setMqttConnectionState('connected');
    } else if (mqttConnectionState === 'disconnected') {
        setMqttConnectionState('reconnected');
    }
});

mqttDriver.onClose(() => {
    if (mqttConnectionState === 'unknown') {
        setMqttConnectionState('unconnected');
    } else if (['connected', 'reconnected'].includes(mqttConnectionState)) {
        setMqttConnectionState('disconnected');
    }
});

mqttDriver.subscribe();
mqttDriver.onMessage((topic, message) => {
    for (const tuyapiDriver of tuyapiDrivers) {
        if (topic === `${tuyapiDriver.getName()}/set-state`) {
            tuyapiDriver.sendData(message);
        }
    }
});

logger.debug('Creating MQTT listeners completed.');

logger.debug('Creating TuyAPI listeners...');

for (const tuyapiDriver of tuyapiDrivers) {
    let tuyapiConnectionState = 'unknown';
    
    const setTuyapiConnectionState = newConnectionState => {
        tuyapiConnectionState = newConnectionState;
        logger.info(`Tuyapi device '${tuyapiDriver.getName()}' client ${newConnectionState}.`);
    };
    
    tuyapiDriver.onConnect(() => {
        if (['unknown', 'unconnected'].includes(tuyapiConnectionState)) {
            setTuyapiConnectionState('connected');
        } else if (tuyapiConnectionState === 'disconnected') {
            setTuyapiConnectionState('reconnected');
        }
        mqttDriver.publish(tuyapiDriver.getName(), { ...tuyapiDriver.getData(), timestamp: Date.now() }, 0, true);
    });
    
    tuyapiDriver.onData(() => mqttDriver.publish(tuyapiDriver.getName(), { ...tuyapiDriver.getData(), timestamp: Date.now() }, 0, true));
    
    tuyapiDriver.onDpRefresh(() => mqttDriver.publish(tuyapiDriver.getName(), { ...tuyapiDriver.getData(), timestamp: Date.now() }, 0, true));

    tuyapiDriver.onClose(() => {
        if (tuyapiConnectionState === 'unknown') {
            setTuyapiConnectionState('unconnected');
        } else if (['connected', 'reconnected'].includes(tuyapiConnectionState)) {
            setTuyapiConnectionState('disconnected');
        }
        mqttDriver.publish(tuyapiDriver.getName(), { ...tuyapiDriver.getData(), timestamp: Date.now() }, 0, true);
    });
    
    tuyapiDriver.onError(e => logger.error(e));
}

logger.debug('Creating TuyAPI listeners completed.');

logger.debug('Creating Tuya devices state repeater...');

setInterval(() => {
    for (const tuyapiDriver of tuyapiDrivers) {
        mqttDriver.publish(tuyapiDriver.getName(), { ...tuyapiDriver.getData(), timestamp: Date.now() }, 0, true);
    }
}, 15000);

logger.debug('Creating Tuya devices state repeater completed.');

logger.info('=== TUYAPI2MQTT INITIALIZATION COMPLETED ===');
