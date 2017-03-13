const applyToDefaults = require('hoek').applyToDefaults;
const createChannel = require('./create-channel');
const getChannelName = require('./get-channel-name');

const publishMessage = function ({exchange, topic, data, connection, options}, plugin) {
  const {options: pluginOptions, state: pluginState} = plugin;
  const {encoding, preserveChannels} = pluginOptions;
  const {_openChannels} = pluginState;

  const {
    channelName: userChannelName,
    channelOptions,
    exchangeOptions,
    messageOptions
  } = options || {};

  const channelName = userChannelName || getChannelName({method: 'publishMessage', exchange});

  const defaultExchangeOptions = {
    durable: false,
    autoDelete: false
  };

  const defaultMessageOptions = {
    expiration: 0,
    persistent: false
  };

  let channelCreated;

  if (_openChannels[channelName]) {
    channelCreated = Promise.resolve(_openChannels[channelName].channel);
  } else {
    channelCreated = createChannel({
      name: channelName,
      options: channelOptions,
      connection
    }, plugin);
  }

  return channelCreated
    .then(ch => {
      const ok = ch.assertExchange(
        exchange,
        'topic',
        applyToDefaults(defaultExchangeOptions, exchangeOptions)
      );
      return Promise.all([Promise.resolve(ch), ok]);
    })
    .then(([ch]) => {
      const message = {
        type: topic,
        data
      };

      const published = ch.publish(
        exchange,
        `${exchange}.${topic}`,
        new Buffer(JSON.stringify(message), encoding),
        applyToDefaults(defaultMessageOptions, messageOptions)
      );
      return Promise.all([Promise.resolve(ch), published]);
    })
    .then(([channel, published]) => {
      const tasks = [Promise.resolve({channel, published})];
      if (!preserveChannels) {
        tasks.push(channel.close());
      }
      return Promise.all(tasks);
    })
    .then(([results]) => results);
};

module.exports = publishMessage;
