const constants = require('./constants');

const consumerFactory = function ({channel, queue, subscriber, options}) {
  const {noAck} = options || {};
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
      if (resultCode && !noAck) {
        if (resultCode === constants.ACK) {
          channel.ack(message);
        } else if (resultCode === constants.NACK) {
          channel.nack(message);
        }
      }
    };

    const onError = () => {
      if (!noAck) {
        channel.nack(message);
      }
    };

    subscriber(consumerObj).then(onResult).catch(onError);
  };
};

module.exports = consumerFactory;
