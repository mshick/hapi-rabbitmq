const defaultsDeep = require('lodash/defaultsDeep');
const Ajv = require('ajv');
const {
  constants,
  state,
  createConnection,
  closeConnection,
  createChannel,
  addSubscriber,
  publishMessage,
  addWorker,
  pushTask,
  getChannelName
} = require('librabbitmq');
const pkg = require('./package.json');

const SHORT_NAME = pkg.name.replace('hapi-', '');

const ajv = new Ajv();

const optionsSchema = {
  title: 'hapi-rabbitmq options',
  type: 'object',
  additionalProperties: true,
  properties: {
    url: {
      type: 'string'
    },
    preserveChannels: {
      type: 'boolean'
    },
    connection: {
      type: 'object',
      properties: {
        socket: {
          type: 'object'
        },
        tuning: {
          type: 'object'
        },
        retry: {
          type: 'object'
        },
        useExisting: {
          type: 'boolean'
        }
      }
    },
    retryQueue: {
      type: 'object',
      properties: {
        suffix: {
          type: 'string'
        },
        maxCount: {
          type: 'number'
        },
        factor: {
          type: 'number'
        },
        minTimeout: {
          type: 'number'
        },
        maxTimeout: {
          type: 'number'
        },
        maxLength: {
          type: 'number'
        }
      }
    },
    doneQueue: {
      type: ['object', 'boolean', 'null']
    }
  },
  required: ['url']
};

const validate = ajv.compile(optionsSchema);

const defaultOptions = {
  preserveChannels: true,
  connection: {
    retry: {
      retries: 0,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: Infinity,
      randomize: false
    },
    useExisting: false
  }
};

exports.register = function (server, userOptions, next) {
  const options = defaultsDeep({}, userOptions, defaultOptions);

  const isValid = validate(options);

  if (!isValid) {
    return next(validate.errors);
  }

  server.app[pkg.name] = state;

  const closeAll = () => {
    if (state.openClients.length) {
      state.openClients.forEach(c => c.close());
    }

    return closeConnection().then(() => {
      server.log([pkg.name], 'connections closed');
    });
  };

  server.ext('onPreStop', (server, next) => {
    closeAll().then(() => next()).catch(next);
  });

  const handlerOptions = {options, state, name: pkg.name, server};

  /* Initialization */

  server.method(`${SHORT_NAME}.createConnection`, args => {
    return createConnection(args, handlerOptions)
      .then(result => {
        server.log(['info', 'connection', pkg.name], 'connection created');
        return result;
      })
      .catch(error => {
        server.log(['error', 'connection', pkg.name], error);
        throw error;
      });
  });

  server.method(`${SHORT_NAME}.closeConnection`, args => {
    return closeConnection(args, handlerOptions)
      .then(result => {
        server.log(['info', 'connection', pkg.name], 'connection closed');
        return result;
      })
      .catch(error => {
        server.log(['error', 'connection', pkg.name], error);
        throw error;
      });
  });

  server.method(`${SHORT_NAME}.createChannel`, args => {
    return createChannel(args, handlerOptions)
      .then(result => {
        server.log(['info', 'channel', pkg.name], 'channel created');
        return result;
      })
      .catch(error => {
        server.log(['error', 'channel', pkg.name], error);
        throw error;
      });
  });

  /* Work queue */

  server.method(`${SHORT_NAME}.pushTask`, args => {
    return pushTask(args, handlerOptions);
  });

  server.method(`${SHORT_NAME}.addWorker`, args => {
    return addWorker(args, handlerOptions)
      .then(result => {
        server.log(['worker', pkg.name], `worker added ${args.queue}`);
        return result;
      })
      .catch(error => {
        server.log(['error', 'worker', pkg.name], error);
        throw error;
      });
  });

  /* PubSub */

  server.method(`${SHORT_NAME}.publishMessage`, args => {
    return publishMessage(args, handlerOptions);
  });

  server.method(`${SHORT_NAME}.addSubscriber`, args => {
    return addSubscriber(args, handlerOptions)
      .then(result => {
        server.log(['subscriber', pkg.name], `subscriber added ${args.exchange}`);
        return result;
      })
      .catch(error => {
        server.log(['error', 'subscriber', pkg.name], error);
        throw error;
      });
  });

  /* Utils */
  server.method(`${SHORT_NAME}.getChannelName`, getChannelName);

  /* Constants */
  server.expose('constants', constants);

  server.log([pkg.name, 'registered'], 'hapi-rabbitmq registered');

  next();
};

module.exports.register.attributes = {pkg};
