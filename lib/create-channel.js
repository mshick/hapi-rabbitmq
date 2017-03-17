const assert = require('assert');
const isEmpty = require('lodash.isempty');

const createChannel = function ({connection, name, options, persist}, plugin) {
  const {options: pluginOptions, state: pluginState} = plugin;
  const {_openChannels, _defaultConnection} = pluginState;
  const {preserveChannels} = pluginOptions;

  connection = connection || _defaultConnection;

  assert.ok(connection, 'You must create a connection before creating a channel');

  let newChannel;

  return connection.createChannel()
    .then(ch => {
      newChannel = ch;
      if (options && !isEmpty(options)) {
        const optsSet = Object
          .keys(options)
          .map(opt => {
            return newChannel[opt](options[opt]);
          });

        return Promise.all(optsSet);
      }
      return;
    })
    .then(() => {
      if (preserveChannels || persist) {
        const oldChannel = _openChannels[name] && _openChannels[name].channel;
        _openChannels[name] = {
          connection,
          name,
          channel: newChannel,
          options,
          persist
        };
        if (oldChannel) {
          return oldChannel.close();
        }
      }
      return;
    })
    .then(() => {
      plugin.log(['info', plugin.name], `new channel created`);
      return newChannel;
    });
};

module.exports = createChannel;
