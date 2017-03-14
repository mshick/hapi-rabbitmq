const applyToDefaults = require('hoek').applyToDefaults;
const createChannel = require('./create-channel');
const getChannelName = require('./get-channel-name');
const subscriberConsumerFactory = require('./subscriber-consumer-factory');

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

const addSubscriber = function ({connection, exchange, topic, subscriber, options}, plugin) {
  const {state: pluginState} = plugin;
  const {_openChannels} = pluginState;

  const {
    channelName: userChannelName,
    channelOptions,
    exchangeOptions: userExchangeOptions,
    queueOptions: userQueueOptions,
    subscriberOptions: userSubscriberOptions
  } = options || {};

  const channelName = userChannelName || getChannelName({method: 'subscribeToMessages', exchange});
  const exchangeTopic = topic ? `${exchange}.${topic}` : `${exchange}.*`;

  const exchangeOptions = applyToDefaults(
    defaultExchangeOptions,
    userExchangeOptions || {}
  );

  const queueOptions = applyToDefaults(
    defaultQueueOptions,
    userQueueOptions || {}
  );

  const subscriberOptions = applyToDefaults(
    defaultSubscriberOptions,
    userSubscriberOptions || {}
  );

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
      return activeChannel.assertExchange(exchange, 'topic', exchangeOptions);
    })
    .then(() => {
      return activeChannel.assertQueue('', queueOptions);
    })
    .then(qok => {
      activeQueue = qok;
      return activeChannel.bindQueue(qok.queue, exchange, exchangeTopic);
    })
    .then(() => {
      const consumer = subscriberConsumerFactory({
        subscriber,
        channel: activeChannel,
        queue: activeQueue,
        options: subscriberOptions
      });
      return activeChannel.consume(activeQueue.queue, consumer, subscriberOptions);
    })
    .then(consumed => {
      return {channel: activeChannel, queue: activeQueue, consumed};
    });
};

module.exports = addSubscriber;
