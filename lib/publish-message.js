const applyToDefaults = require('hoek').applyToDefaults;
const createChannel = require('./create-channel');
const getChannelName = require('./get-channel-name');

const defaultExchangeOptions = {
  durable: false,
  autoDelete: false
};

const defaultMessageOptions = {
  expiration: 0,
  persistent: false,
  contentType: 'application/json',
  contentEncoding: 'utf-8'
};

const publishMessage = function ({exchange, topic, payload, connection, options}, plugin) {
  const {options: pluginOptions, state: pluginState} = plugin;
  const {preserveChannels} = pluginOptions;
  const {_openChannels} = pluginState;

  const {
    channelName: userChannelName,
    channelOptions,
    exchangeOptions: userExchangeOptions,
    messageOptions: userMessageOptions
  } = options || {};

  const channelName = userChannelName || getChannelName({method: 'publishMessage', exchange});

  const exchangeOptions = applyToDefaults(
    defaultExchangeOptions,
    userExchangeOptions || {}
  );

  const messageOptions = applyToDefaults(
    defaultMessageOptions,
    userMessageOptions || {}
  );

  messageOptions.type = topic;

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

  let channel;

  return channelCreated
    .then(ch => {
      channel = ch;
      return channel.assertExchange(exchange, 'topic', exchangeOptions);
    })
    .then(() => {
      return channel.publish(
        exchange,
        `${exchange}.${topic}`,
        new Buffer(JSON.stringify(payload), messageOptions.contentEncoding),
        messageOptions
      );
    })
    .then(published => {
      const tasks = [Promise.resolve(published)];
      if (!preserveChannels) {
        tasks.push(channel.close());
      }
      return Promise.all(tasks);
    })
    .then(([published]) => {
      return {channel, published};
    });
};

module.exports = publishMessage;
