const applyToDefaults = require('hoek').applyToDefaults;
const {
  constants,
  createConnection,
  closeConnection,
  addSubscriber,
  publishMessage,
  addWorker,
  pushTask
} = requie('librabbitmq');
const pkg = require('./package.json');

const SHORT_NAME = pkg.name.replace('hapi-', '');

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
  doneQueue: false
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
        plugin.log([pkg.name], 'connections closed');
      });
  };

  plugin.ext('onPreStop', (server, next) => {
    closeAll().then(() => next()).catch(next);
  });

  const handlerOptions = {options, state, name: pkg.name, server: plugin};

  /* Initialization */

  plugin.method(`${SHORT_NAME}.createConnection`, args => {
    return createConnection(args, handlerOptions)
      .then(result => {
        plugin.log(['info', 'connection', pkg.name], 'connection created');
        return result;
      })
      .catch(error => {
        plugin.log(['error', 'connection', pkg.name], error);
        throw error;
      });
  });

  plugin.method(`${SHORT_NAME}.createChannel`, args => {
    return createChannel(args, handlerOptions)
      .then(result => {
        plugin.log(['info', 'channel', pkg.name], 'channel created');
        return result;
      })
      .catch(error => {
        plugin.log(['error', 'channel', pkg.name], error);
        throw error;
      });
  });

  /* Work queue */

  plugin.method(`${SHORT_NAME}.pushTask`, args => {
    return pushTask(args, handlerOptions);
  });

  plugin.method(`${SHORT_NAME}.addWorker`, args => {
    return addWorker(args, handlerOptions)
      .then(result => {
        plugin.log(['worker', pkg.name], `worker added ${args.queue}`);
        return result;
      })
      .catch(error => {
        plugin.log(['error', 'worker', pkg.name], error);
        throw error;
      });
  });

  /* PubSub */

  plugin.method(`${SHORT_NAME}.publishMessage`, args => {
    return publishMessage(args, handlerOptions);
  });

  plugin.method(`${SHORT_NAME}.addSubscriber`, args => {
    return addSubscriber(args, handlerOptions)
      .then(result => {
        plugin.log(['subscriber', pkg.name], `subscriber added ${args.exchange}`);
        return result;
      })
      .catch(error => {
        plugin.log(['error', 'subscriber', pkg.name], error);
        throw error;
      });
  });

  /* Utils */
  plugin.method(`${SHORT_NAME}.getChannelName`, getChannelName);

  /* Constants */
  plugin.expose('constants', constants);

  next();
};

module.exports.register.attributes = {pkg};
