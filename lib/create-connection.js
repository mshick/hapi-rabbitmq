const qs = require('qs');
const amqp = require('amqplib');
const applyToDefaults = require('hoek').applyToDefaults;
const retry = require('retry');
const isEmpty = require('lodash.isempty');
const get = require('lodash.get');
const uuid = require('uuid/v4');
const createChannel = require('./create-channel');

const getConnectionChannels = function (connection, openChannels) {
  return Object.keys(openChannels)
    .filter(channelName => {
      const channel = openChannels[channelName];
      return get(channel, 'connection._connectName') === connection._connectName;
    })
    .map(channelName => {
      return openChannels[channelName];
    });
};

const keepConnectionAlive = function (openConnection, options, plugin) {
  const connectionName = openConnection._connectName;
  const onConnectionError = () => {
    if (plugin.state._defaultConnection._connectName === connectionName) {
      plugin.state._defaultConnection = null;
    }

    const connectionOptions = applyToDefaults(options, {connectionName});

    createConnection(connectionOptions, plugin) // eslint-disable-line
      .then(connection => {
        const connectionChannels = getConnectionChannels(connection, plugin.state._openChannels);
        const channelsCreated = connectionChannels.map(channel => {
          return createChannel({
            connection,
            name: channel.name,
            options: channel.options,
            persist: channel.persist
          }, plugin);
        });
        return Promise.all(channelsCreated);
      })
      .then(() => {
        openConnection.removeListener('error', onConnectionError);
      });
  };

  openConnection.on('error', onConnectionError);
};

const createConnection = function (localOptions, plugin) {
  const {options: pluginOptions, state: pluginState} = plugin;
  const options = applyToDefaults(pluginOptions, localOptions || {});

  const {_openConnections, _defaultConnection} = pluginState;

  if (options.useExistingConnection && _defaultConnection) {
    return Promise.resolve(_defaultConnection);
  }

  const {connectionName, url, socket, tuning, retry: retryOptions} = options;

  const connectName = connectionName || uuid();
  const connectUrl = isEmpty(tuning) ? url : `${url}?${qs.stringify(tuning)}`;
  const operation = retry.operation(retryOptions);

  return new Promise((resolve, reject) => {
    operation.attempt(() => {
      amqp.connect(connectUrl, socket)
        .then(connection => {
          connection._connectName = connectName;
          _openConnections[connectName] = connection;
          pluginState._defaultConnection = _defaultConnection || connection;
          keepConnectionAlive(connection, options, plugin);
          resolve(connection);
        })
        .catch(err => {
          if (operation.retry(err)) {
            return;
          }
          reject(err);
        });
    });
  });
};

module.exports = createConnection;
