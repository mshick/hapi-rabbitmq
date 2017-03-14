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

const sendToFailQueue = function ({channel, failQueue, maxCount}) {
  return ({retryCount, error, properties, content}) => {
    const failReason = getFailReason({maxCount, retryCount, error});
    const options = {
      headers: {
        'x-fail': failReason,
        'x-fail-original-properties': properties
      }
    };
    channel.sendToQueue(failQueue.queue, content, options);
  };
};

const consumerFactory = function ({
  channel,
  queue,
  worker,
  retryQueue,
  retryQueueOptions,
  retryOptions,
  failQueue
}) {
  const {maxPriority} = retryQueueOptions || {};
  const {
    maxCount,
    factor,
    minTimeout,
    maxTimeout
  } = retryOptions || {};

  let failed;
  if (failQueue) {
    failed = sendToFailQueue({channel, failQueue, maxCount});
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

    const onResult = resultCode => {
      // Default assumes the reply was handled manually
      if (resultCode) {
        if (resultCode === constants.ACK) {
          channel.ack(message);
        } else if (resultCode === constants.NACK) {
          channel.nack(message);
        } else if (resultCode === constants.REJECT) {
          channel.ack(message);
          if (failed) {
            failed({properties, content});
          }
        } else if (resultCode === constants.RETRY) {
          throw new Error('retry requested');
        }
      }
    };

    const onError = error => {
      const {headers} = properties;
      const deathHeader = headers['x-death'];
      const retryCountHeader = headers['x-retry-count'];

      if (!retryQueue && !failQueue && isUndefined(retryCountHeader)) {
        // Conventional behavior
        channel.nack(message);
      } else {
        // Will require more work
        channel.ack(message);
      }

      // Some form of retry requested
      let shouldRetry = false;
      let retryCount;

      if (!isUndefined(retryCountHeader)) {
        retryCount = Number(retryCountHeader);
        shouldRetry = retryCount > -1 && retryCount < maxCount;
      }

      if (shouldRetry) {
        // Can retry on the same queue, or using the retryQueue
        let destinationQueue = queue.queue;
        let priority = 0;
        let {expiration} = properties;

        if (retryQueue) {
          destinationQueue = retryQueue.queue;

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

        channel.sendToQueue(destinationQueue, content, options);
        return;
      }

      // No retries, but failQueue is configured
      if (failed) {
        failed({properties, content, retryCount, error});
      }
    };

    worker(consumerObj).then(onResult).catch(onError);
  };
};

module.exports = consumerFactory;
