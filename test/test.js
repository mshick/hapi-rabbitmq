import test from 'ava';
import hapi from 'hapi';
import pkg from '../package.json';

const { RABBITMQ_USER, RABBITMQ_PASSWORD } = process.env;
const RABBITMQ_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@localhost/`;

let server;

test.beforeEach(() => {
  server = hapi.server({ port: 5000 });
});

test('reject invalid options', async t => {
  try {
    await server.register({
      plugin: require('../'),
      options: {
        url: 12345
      }
    });
  } catch (err) {
    if (err && err.message === 'Invalid configuration options.') {
      return t.pass();
    }
    t.fail();
  }
});

test('should be able to register plugin with just URL', async t => {
  try {
    await server.register({
      plugin: require('../'),
      options: {
        url: RABBITMQ_URL
      }
    });
    t.pass();
  } catch (err) {
    t.fail(err);
  }
});

test('should log upon registration', async t => {
  server.events.on('log', entry => {
    t.is(entry.data, 'hapi-rabbitmq registered');
  });

  try {
    await server.register({
      plugin: require('../'),
      options: {
        url: RABBITMQ_URL
      }
    });
  } catch (err) {
    t.fail(err);
  }
});

test('should be able to find the plugin exposed methods', async t => {
  try {
    await server.register({
      plugin: require('../'),
      options: {
        url: RABBITMQ_URL
      }
    });

    const methods = server.methods.rabbitmq;

    t.truthy(methods.createConnection);
    t.truthy(methods.closeConnection);
    t.truthy(methods.createChannel);
    t.truthy(methods.pushTask);
    t.truthy(methods.addWorker);
    t.truthy(methods.publishMessage);
    t.truthy(methods.addSubscriber);
    t.truthy(methods.getChannelName);
  } catch (err) {
    t.fail(err);
  }
});

if (RABBITMQ_URL) {
  test('should be able to connect to rabbitmq and clean up after itself', async t => {
    try {
      await server.register({
        plugin: require('../'),
        options: {
          url: RABBITMQ_URL
        }
      });

      const state = server.app[pkg.name];

      const { rabbitmq } = server.methods;

      await rabbitmq.createConnection();

      t.is(Object.keys(state._openConnections).length, 1);

      await rabbitmq.closeConnection();

      t.is(Object.keys(state._openConnections).length, 0);

      t.pass();
    } catch (err) {
      return t.fail(err);
    }
  });
}
