const applyToDefaults = require('hoek').applyToDefaults;
const createChannel = require('./create-channel');
const getChannelName = require('./get-channel-name');

const addSubscriber = function ({connection, exchange, topic, subscriber, options}, plugin) {
  const {options: pluginOptions, state: pluginState} = plugin;
  const {encoding} = pluginOptions;
  const {_openChannels} = pluginState;

  const {
    channelName: userChannelName,
    channelOptions,
    exchangeOptions,
    queueOptions,
    subscriberOptions
  } = options || {};

  const channelName = userChannelName || getChannelName({method: 'subscribeToMessages', exchange});
  const exchangeTopic = topic ? `${exchange}.${topic}` : `${exchange}.*`;

  const defaultExchangeOptions = {
    durable: false,
    autoDelete: false
  };

  const defaultQueueOptions = {
    exclusive: true,
    autoDelete: true
  };

  const defaultSubscriberOptions = {
    noAck: true,
    exclusive: true
  };

  let channelCreated;
  let activeChannel;
  let activeQueue;

  if (_openChannels[channelName]) {
    channelCreated = Promise.resolve(_openChannels[channelName].channel);
  } else {
    channelCreated = createChannel({
      name: channelName,
      options: channelOptions,
      persist: true,
      connection
    }, plugin);
  }

  return channelCreated
    .then(ch => {
      activeChannel = ch;
      return activeChannel.assertExchange(
        exchange,
        'topic',
        applyToDefaults(defaultExchangeOptions, exchangeOptions)
      );
    })
    .then(() => {
      return activeChannel.assertQueue(
        '',
        applyToDefaults(defaultQueueOptions, queueOptions)
      );
    })
    .then(qok => {
      activeQueue = qok;
      return activeChannel.bindQueue(qok.queue, exchange, exchangeTopic);
    })
    .then(() => {
      const consumer = function (message) {
        subscriber({
          message,
          content: message.content.toString(encoding),
          channel: activeChannel,
          queue: activeQueue
        });
      };
      return activeChannel.consume(
        activeQueue.queue,
        consumer,
        applyToDefaults(defaultSubscriberOptions, subscriberOptions)
      );
    })
    .then(consumed => {
      return {channel: activeChannel, queue: activeQueue, consumed};
    });
};

module.exports = addSubscriber;
