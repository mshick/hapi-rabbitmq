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
  maxPriority: 10,
  maxLength: 10000
};

const defaultDoneQueueOptions = {
  durable: true,
  maxLength: 10000
};

const addWorker = function ({connection, queue: queueName, worker, options}, plugin) {
  const {options: pluginOptions, state: pluginState} = plugin;
  const {
    retryQueue: pluginRetryOptions,
    doneQueue: pluginDoneOptions
  } = pluginOptions;

  const {_openChannels} = pluginState;

  const {
    channelName: userChannelName,
    channelOptions,
    queueOptions,
    retryQueueOptions: userRetryQueueOptions,
    retryOptions: userRetryOptions,
    doneQueueOptions: userDoneQueueOptions,
    doneOptions: userDoneOptions,
    workerOptions
  } = options || {};

  const channelName = userChannelName || getChannelName({method: 'addWorker', queue: queueName});

  const rQueueOptions = applyToDefaults(
    defaultRetryQueueOptions,
    userRetryQueueOptions || {}
  );

  const doneQueueOptions = applyToDefaults(
    defaultDoneQueueOptions,
    userDoneQueueOptions || {}
  );

  let retryQueueOptions;
  let retryOptions;
  let doneOptions;

  if (pluginRetryOptions) {
    retryOptions = applyToDefaults(pluginRetryOptions, userRetryOptions || {});
  }

  if (pluginDoneOptions) {
    doneOptions = applyToDefaults(pluginDoneOptions, userDoneOptions || {});
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
      if (retryOptions && retryOptions.suffix) {
        const {suffix, maxLength} = retryOptions;
        const rQueueName = `${queueName}${suffix}`;
        retryQueueOptions = applyToDefaults(rQueueOptions, {
          maxLength,
          deadLetterExchange: '',
          deadLetterRoutingKey: queueName
        });
        const retryQueue = channel.assertQueue(rQueueName, rQueueOptions);
        queuesAsserted.push(retryQueue);
      } else {
        queuesAsserted.push(Promise.resolve(null));
      }

      // Done queue assertion
      if (doneOptions && doneOptions.suffix) {
        const {suffix, maxLength} = doneOptions;
        const dQueueName = `${queueName}${suffix}`;
        const dQueueOptions = applyToDefaults(doneQueueOptions, {
          maxLength
        });
        const doneQueue = channel.assertQueue(dQueueName, dQueueOptions);
        queuesAsserted.push(doneQueue);
      } else {
        queuesAsserted.push(Promise.resolve(null));
      }

      return Promise.all(queuesAsserted);
    })
    .then(([qok, rok, dok]) => {
      queue = qok;

      const consumer = workerConsumerFactory({
        channel,
        queue,
        worker,
        retryQueue: rok,
        retryQueueOptions,
        retryOptions,
        doneQueue: dok,
        doneOptions
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
