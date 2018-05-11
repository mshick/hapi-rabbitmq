const { defaultsDeep } = require('lodash/fp');
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

const defaultOptions = {
  preserveChannels: true,
  connection: {
    useExisting: true,
    retry: {
      retries: 0,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: Infinity,
      randomize: false
    }
  }
};

const register = async (server, userOptions = {}) => {
  const options = defaultsDeep(defaultOptions, userOptions);

  const isValid = ajv.validate(optionsSchema, options);

  if (!isValid) {
    server.log([pkg.name, 'error'], ajv.errors);
    throw new Error('Invalid configuration options.');
  }

  server.app[pkg.name] = state;

  const closeAll = async () => {
    try {
      server.log([pkg.name, 'debug'], `closing RabbitMQ connections`);

      if (state.openClients && state.openClients.length) {
        state.openClients.forEach(c => c.close());
      }

      await closeConnection();

      server.log([pkg.name], 'connections closed');
    } catch (error) {
      server.log([pkg.name, 'error'], error);
    }
  };

  server.events.on('stop', closeAll);

  const handlerOptions = { options, state, name: pkg.name, server };

  /* Initialization */

  server.method(`${SHORT_NAME}.createConnection`, args => {
    return createConnection(args, handlerOptions);
  });

  server.method(`${SHORT_NAME}.closeConnection`, args => {
    return closeConnection(args, handlerOptions);
  });

  server.method(`${SHORT_NAME}.createChannel`, args => {
    return createChannel(args, handlerOptions);
  });

  /* Work queue */

  server.method(`${SHORT_NAME}.pushTask`, args => {
    return pushTask(args, handlerOptions);
  });

  server.method(`${SHORT_NAME}.addWorker`, args => {
    return addWorker(args, handlerOptions);
  });

  /* PubSub */

  server.method(`${SHORT_NAME}.publishMessage`, args => {
    return publishMessage(args, handlerOptions);
  });

  server.method(`${SHORT_NAME}.addSubscriber`, args => {
    return addSubscriber(args, handlerOptions);
  });

  /* Utils */
  server.method(`${SHORT_NAME}.getChannelName`, getChannelName);

  /* Constants */
  server.expose('constants', constants);

  server.log([pkg.name, 'registered'], 'hapi-rabbitmq registered');
};

exports.plugin = {
  register,
  multiple: true,
  pkg
};
