const createChannel = require('./create-channel');
const getChannelName = require('./get-channel-name');

const pushTask = function ({connection, queue, data, options}, plugin) {
  const {options: pluginOptions, state: pluginState} = plugin;
  const {encoding, preserveChannels} = pluginOptions;
  const {_openChannels} = pluginState;


  const {
    channelName: userChannelName,
    channelOptions,
    queueOptions,
    taskOptions
  } = options || {};

  const channelName = userChannelName || getChannelName({method: 'pushTask', queue});

  const defaultQueueOptions = {
    durable: true,
    maxPriority: 0
  };

  const defaultTaskOptions = {
    persistent: true,
    priority: 0
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
      connection
    }, plugin);
  }

  return channelCreated
    .then(ch => {
      activeChannel = ch;
      return activeChannel.assertQueue(
        queue,
        Object.assign(defaultQueueOptions, queueOptions)
      );
    })
    .then(qok => {
      activeQueue = qok;
      const task = {data};
      return activeChannel.sendToQueue(
        activeQueue.queue,
        new Buffer(JSON.stringify(task), encoding),
        Object.assign(defaultTaskOptions, taskOptions)
      );
    })
    .then(queued => {
      const tasks = [Promise.resolve(queued)];
      if (!preserveChannels) {
        tasks.push(activeChannel.close());
      }
      return Promise.all(tasks);
    })
    .then(([queued]) => {
      return {channel: activeChannel, queue: activeQueue, queued};
    });
};

module.exports = pushTask;
