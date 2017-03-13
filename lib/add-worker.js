const applyToDefaults = require('hoek').applyToDefaults;
const createChannel = require('./create-channel');
const getChannelName = require('./get-channel-name');

const addWorker = function ({connection, queue, worker, options}, plugin) {
  const {options: pluginOptions, state: pluginState} = plugin;
  const {encoding} = pluginOptions;
  const {_openChannels} = pluginState;

  const {
    channelName: userChannelName,
    channelOptions,
    queueOptions,
    workerOptions
  } = options || {};

  const channelName = userChannelName || getChannelName({method: 'addWorker', queue});

  const defaultChannelOptions = {
    prefetch: 1
  };

  const defaultQueueOptions = {
    durable: true,
    maxPriority: 0
  };

  const defaultWorkerOptions = {
    noAck: false
  };

  let channelCreated;
  let activeChannel;
  let activeQueue;

  if (_openChannels[channelName]) {
    channelCreated = Promise.resolve(_openChannels[channelName].channel);
  } else {
    channelCreated = createChannel({
      name: channelName,
      options: applyToDefaults(defaultChannelOptions, channelOptions || {}),
      persist: true,
      connection
    }, plugin);
  }

  return channelCreated
    .then(ch => {
      activeChannel = ch;
      return activeChannel.assertQueue(
        queue,
        applyToDefaults(defaultQueueOptions, queueOptions || {})
      );
    })
    .then(qok => {
      activeQueue = qok;
      const consumer = function (message) {
        worker({
          message,
          content: message.content.toString(encoding),
          channel: activeChannel,
          queue: activeQueue
        });
      };
      return activeChannel.consume(
        activeQueue.queue,
        consumer,
        applyToDefaults(defaultWorkerOptions, workerOptions || {})
      );
    })
    .then(consumed => {
      return {channel: activeChannel, queue: activeQueue, consumed};
    })
    .catch(console.error);
};

module.exports = addWorker;
