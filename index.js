const applyToDefaults = require('hoek').applyToDefaults;
const createConnection = require('./lib/create-connection');
const createChannel = require('./lib/create-channel');
const pushTask = require('./lib/push-task');
const addWorker = require('./lib/add-worker');
const publishMessage = require('./lib/publish-message');
const addSubscriber = require('./lib/add-subscriber');
const getChannelName = require('./lib/get-channel-name');
const constants = require('./lib/constants');
const pkg = require('./package.json');

const defaultOptions = {
  url: 'amqp://localhost',
  preserveChannels: true,
  connection: {
    socket: {},
    tuning: {},
    retry: {
      retries: 0,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: Infinity,
      randomize: false
    },
    useExisting: false
  },
  retryQueue: {
    suffix: '_retry',
    maxCount: 10,
    factor: 2,
    minTimeout: 1 * 1000,
    maxTimeout: 60 * 1000,
    maxLength: 10000
  },
  failQueue: {
    suffix: '_fail',
    maxLength: 10000
  }
};

const initialState = {
  _defaultConnection: null,
  _openConnections: {},
  _openChannels: {}
};

module.exports.register = function (plugin, userOptions, next) {
  const options = applyToDefaults(defaultOptions, userOptions || {});

  /* Tidy plugin */
  let state;

  const resetState = () => {
    plugin.app[pkg.name] = applyToDefaults(initialState, {});
    state = plugin.app[pkg.name];
  };

  resetState();

  const closeAll = () => {
    let closingConnections = [];
    let closingChannels = Object.keys(state._openChannels)
      .map(channelName => {
        return state._openChannels[channelName].channel.close();
      });

    return Promise.all(closingChannels)
      .then(() => {
        closingChannels = [];
        closingConnections = Object.keys(state._openConnections)
          .map(connectionName => {
            return state._openConnections[connectionName].close();
          });
        return Promise.all(closingConnections);
      })
      .then(() => {
        resetState();
        closingConnections = [];
      });
  };

  plugin.ext('onPreStop', (server, next) => {
    closeAll().then(() => next()).catch(next);
  });

  /* Initialization */
  plugin.expose('createConnection', args => {
    return createConnection(args, {options, state});
  });

  plugin.expose('createChannel', args => {
    return createChannel(args, {options, state});
  });

  /* Work queue */
  plugin.expose('pushTask', args => {
    return pushTask(args, {options, state});
  });

  plugin.expose('addWorker', args => {
    return addWorker(args, {options, state});
  });

  /* PubSub */
  plugin.expose('publishMessage', args => {
    return publishMessage(args, {options, state});
  });

  plugin.expose('addSubscriber', args => {
    return addSubscriber(args, {options, state});
  });

  /* Utils */
  plugin.expose('getChannelName', getChannelName);

  /* Constants */
  plugin.expose('constants', constants);

  next();
};

module.exports.register.attributes = {pkg};
