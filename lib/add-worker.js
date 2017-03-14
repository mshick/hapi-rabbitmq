const applyToDefaults = require('hoek').applyToDefaults;
const createChannel = require('./create-channel');
const getChannelName = require('./get-channel-name');
const workerConsumerFactory = require('./worker-consumer-factory');

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

const defaultRetryQueueOptions = {
  durable: true,
  maxPriority: 10
};

const defaultFailQueueOptions = {
  durable: true
};

const addWorker = function ({connection, queue: queueName, worker, options}, plugin) {
  const {options: pluginOptions, state: pluginState} = plugin;
  const {
    retryQueue: pluginRetryOptions,
    failQueue: pluginFailOptions
  } = pluginOptions;

  const {_openChannels} = pluginState;

  const {
    channelName: userChannelName,
    channelOptions,
    queueOptions,
    retryQueueOptions: userRetryQueueOptions,
    retryOptions: userRetryOptions,
    failQueueOptions: userFailQueueOptions,
    failOptions: userFailOptions,
    workerOptions
  } = options || {};

  const channelName = userChannelName || getChannelName({method: 'addWorker', queue: queueName});

  const retryQueueOptions = applyToDefaults(defaultRetryQueueOptions, userRetryQueueOptions || {});
  const failQueueOptions = applyToDefaults(defaultFailQueueOptions, userFailQueueOptions || {});

  let retryOptions;
  let failOptions;

  if (pluginRetryOptions) {
    retryOptions = applyToDefaults(pluginRetryOptions, userRetryOptions || {});
  }

  if (pluginFailOptions) {
    failOptions = applyToDefaults(pluginFailOptions, userFailOptions || {});
  }

  let channelCreated;

  let channel;
  let queue;

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
      channel = ch;

      const queuesAsserted = [];

      // Work queue assertion
      const wQueueOptions = applyToDefaults(
        defaultQueueOptions,
        queueOptions || {}
      );
      const workQueue = channel.assertQueue(queueName, wQueueOptions);
      queuesAsserted.push(workQueue);

      // Retry queue assertion
      if (retryOptions) {
        const {queueSuffix} = retryOptions;
        const rQueueName = `${queueName}${queueSuffix || '_retry'}`;
        const rQueueOptions = applyToDefaults(retryQueueOptions, {
          deadLetterExchange: '',
          deadLetterRoutingKey: queueName
        });
        const retryQueue = channel.assertQueue(rQueueName, rQueueOptions);
        queuesAsserted.push(retryQueue);
      } else {
        queuesAsserted.push(Promise.resolve(null));
      }

      // Fail queue assertion
      if (failOptions) {
        const {queueSuffix} = failOptions;
        const fQueueName = `${queueName}${queueSuffix || '_fail'}`;
        const fQueueOptions = failQueueOptions;
        const failQueue = channel.assertQueue(fQueueName, fQueueOptions);
        queuesAsserted.push(failQueue);
      } else {
        queuesAsserted.push(Promise.resolve(null));
      }

      return Promise.all(queuesAsserted);
    })
    .then(([qok, rok, fok]) => {
      queue = qok;

      const consumer = workerConsumerFactory({
        channel,
        queue,
        worker,
        retryQueue: rok,
        retryQueueOptions,
        retryOptions,
        failQueue: fok,
        failOptions
      });

      const consumerOptions = applyToDefaults(
        defaultWorkerOptions,
        workerOptions || {}
      );

      return channel.consume(
        queue.queue,
        consumer,
        consumerOptions
      );
    })
    .then(consumed => {
      return {channel, queue, consumed};
    })
    .catch(console.error);
};

module.exports = addWorker;
