const hoek = require('hoek');
const createConnection = require('./lib/create-connection');
const createChannel = require('./lib/create-channel');
const pushTask = require('./lib/push-task');
const addWorker = require('./lib/add-worker');
const publishMessage = require('./lib/publish-message');
const addSubscriber = require('./lib/add-subscriber');
const getChannelName = require('./lib/get-channel-name');
const pkg = require('./package.json');

const defaultOptions = {
  url: 'amqp://localhost',
  encoding: 'utf8',
  retry: {
    retries: 0,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: Infinity,
    randomize: false
  },
  useExistingConnection: false,
  preserveChannels: true,
  tuning: {},
  socket: {}
};

module.exports.register = function (plugin, userOptions, next) {
  const options = hoek.applyToDefaults(defaultOptions, userOptions);

  /* Tidy plugin */
  const state = {
    _defaultConnection: null,
    _openConnections: {},
    _openChannels: {}
  };

  plugin.app[pkg.name] = state;

  const closeAll = () => {
    let closingConnections = [];
    let closingChannels = Object.keys(state._openChannels).map(channel => channel.channel.close());

    return Promise.all(closingChannels)
      .then(() => {
        state._openChannels = [];
        closingChannels = [];
        closingConnections = Object.keys(state._openConnections).map(conn => conn.close());
        return Promise.all(closingConnections);
      })
      .then(() => {
        state._openConnections = [];
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

  next();
};

module.exports.register.attributes = {pkg};
