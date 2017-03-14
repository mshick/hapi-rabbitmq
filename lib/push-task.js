const applyToDefaults = require('hoek').applyToDefaults;
const createChannel = require('./create-channel');
const getChannelName = require('./get-channel-name');

const defaultQueueOptions = {
  durable: true,
  maxPriority: 0
};

const pushTask = function ({connection, queue, payload, type, options}, plugin) {
  const {options: pluginOptions, state: pluginState} = plugin;
  const {preserveChannels, retry: retryOptions} = pluginOptions;
  const {_openChannels} = pluginState;

  const {
    channelName: userChannelName,
    channelOptions,
    queueOptions,
    taskOptions
  } = options || {};

  const channelName = userChannelName || getChannelName({method: 'pushTask', queue});

  const defaultTaskOptions = {
    persistent: true,
    priority: 0,
    contentType: 'application/json',
    contentEncoding: 'utf-8',
    headers: {
      'x-retry-count': retryOptions === false ? -1 : 0
    }
  };

  const mergedTaskOptions = applyToDefaults(defaultTaskOptions, taskOptions || {});

  if (type) {
    mergedTaskOptions.type = type;
  }

  let channelCreated;
  let activeChannel;
  let activeQueue;

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
      activeChannel = ch;
      return activeChannel.assertQueue(
        queue,
        applyToDefaults(defaultQueueOptions, queueOptions || {})
      );
    })
    .then(qok => {
      activeQueue = qok;
      return activeChannel.sendToQueue(
        activeQueue.queue,
        new Buffer(JSON.stringify(payload), mergedTaskOptions.contentEncoding),
        mergedTaskOptions
      );
    })
    .then(queued => {
      const wrapUp = [Promise.resolve(queued)];
      if (!preserveChannels) {
        wrapUp.push(activeChannel.close());
      }
      return Promise.all(wrapUp);
    })
    .then(([queued]) => {
      return {channel: activeChannel, queue: activeQueue, queued};
    });
};

module.exports = pushTask;
