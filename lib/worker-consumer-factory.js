const isUndefined = require('lodash.isundefined');
const applyToDefaults = require('hoek').applyToDefaults;
const constants = require('./constants');

const getPriority = function ({maxPriority, maxCount, retryCount}) {
  return maxPriority - Math.floor((retryCount * maxPriority) / maxCount);
};

const getFailReason = function ({retryCount, maxCount, error}) {
  const fail = {};

  if (error) {
    fail.error = error;
  }

  if (!isUndefined(retryCount) && retryCount >= maxCount) {
    fail.reason = `Max retries exceeded ${retryCount} >= ${maxCount}`;
  } else {
    fail.reason = 'General failure';
  }

  return fail;
};

const sendToDoneQueue = function ({channel, doneQueue, maxCount}) {
  return ({retryCount, error, result, properties, content}) => {
    const done = {};

    if (error || retryCount) {
      done.fail = getFailReason({maxCount, retryCount, error});
    }

    if (result) {
      done.result = result;
    }

    const options = {
      headers: {
        'x-done': done,
        'x-original-properties': properties
      }
    };
    channel.sendToQueue(doneQueue.queue, content, options);
  };
};

const sendToRetryQueue = function ({channel, queue, retryOptions, retryQueueOptions}) {
  const {maxPriority} = retryQueueOptions || {};
  const {
    maxCount,
    factor,
    minTimeout,
    maxTimeout,
    suffix
  } = retryOptions || {};

  return ({retryCount, properties, content}) => {
    let priority = 0;
    let {expiration, headers} = properties;
    const deathHeader = headers['x-death'];

    if (suffix) {
      if (deathHeader && deathHeader.length) {
        expiration = Number(deathHeader[0]['original-expiration'] || 0);
        expiration *= (deathHeader[0].count + 1);
      } else {
        expiration = Number(expiration || 0);
      }

      expiration = Math.max(expiration, minTimeout);

      if (retryCount > 0) {
        expiration = Math.min(expiration * factor, maxTimeout);
      }

      if (maxPriority) {
        priority = getPriority({maxPriority, maxCount, retryCount});
      }
    }

    const options = applyToDefaults(properties, {
      priority,
      expiration,
      headers: {
        'x-retry-count': retryCount + 1
      }
    });

    channel.sendToQueue(queue.queue, content, options);
  };
};

const consumerFactory = function ({
  channel,
  queue,
  worker,
  retryQueue,
  retryQueueOptions,
  retryOptions,
  doneQueue
}) {
  const {maxCount} = retryOptions || {};

  let retry;
  if (retryOptions) {
    retry = sendToRetryQueue({
      channel,
      queue: retryQueue || queue,
      retryOptions,
      retryQueueOptions
    });
  }

  let finished;
  if (doneQueue) {
    finished = sendToDoneQueue({
      channel,
      doneQueue,
      maxCount
    });
  }

  return message => {
    const {content, properties} = message;
    const {contentType, contentEncoding} = properties;

    let payload = content.toString(contentEncoding);

    if (contentType === 'application/json') {
      payload = JSON.parse(payload);
    }

    const consumerObj = {
      raw: message,
      properties,
      payload,
      channel,
      queue
    };

    const onResult = result => {
      if (typeof result === 'string') {
        result = {code: result};
      }

      if (result && result.code) {
        if (result.code === constants.ACK) {
          channel.ack(message);
        } else if (result.code === constants.NACK) {
          channel.nack(message);
        } else if (result.code === constants.REJECT) {
          channel.ack(message);
        } else if (result.code === constants.RETRY) {
          throw new Error('retry requested');
        }
      }

      if (finished) {
        finished({properties, content, result});
      }
    };

    const onError = error => {
      if (!retry && !finished) {
        // Conventional behavior
        return channel.nack(message);
      }

      const {headers} = properties;
      const retryCountHeader = headers['x-retry-count'];

      // Will require more work
      channel.ack(message);

      // Some form of retry requested
      let shouldRetry = false;
      let retryCount;

      if (!isUndefined(retryCountHeader)) {
        retryCount = Number(retryCountHeader);
        shouldRetry = retryCount > -1 && retryCount < maxCount;
      }

      if (shouldRetry && retry) {
        retry({properties, content, retryCount});
        return;
      }

      // No retries, but doneQueue is configured
      if (finished) {
        finished({properties, content, retryCount, error});
      }
    };

    worker(consumerObj).then(onResult).catch(onError);
  };
};

module.exports = consumerFactory;
