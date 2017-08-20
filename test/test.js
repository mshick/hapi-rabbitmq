import test from 'ava';
import {Server} from 'hapi';
import pkg from '../package.json';

const {RABBITMQ_USER, RABBITMQ_PASSWORD} = process.env;
const RABBITMQ_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@localhost/`;

let server;

const registerPromise = function (options) {
  return new Promise((resolve, reject) => {
    server.register(options, err => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
};

test.beforeEach(() => {
  server = new Server();
  server.registerPromise = registerPromise;
});

test.cb('reject invalid options', t => {
  server.register({
    register: require('../'),
    options: {
      url: 12345
    }
  }, err => {
    if (err && err[0].message === 'should be string') {
      t.pass();
    } else {
      t.fail();
    }
    t.end();
  });
});

test.cb('should be able to register plugin with just URL', t => {
  server.register({
    register: require('../'),
    options: {
      url: RABBITMQ_URL
    }
  }, t.end);
});

test.cb('should log upon registration', t => {
  server.once('log', entry => {
    t.is(entry.data, 'hapi-rabbitmq registered');
    t.end();
  });

  server.register({
    register: require('../'),
    options: {
      url: RABBITMQ_URL
    }
  }, err => {
    if (err) {
      t.fail();
      return t.end();
    }
  });
});

test.cb('should be able to find the plugin exposed methods', t => {
  server.register({
    register: require('../'),
    options: {
      url: RABBITMQ_URL
    }
  }, err => {
    if (err) {
      t.fail();
      return t.end();
    }

    const methods = server.methods.rabbitmq;

    t.truthy(methods.createConnection);
    t.truthy(methods.closeConnection);
    t.truthy(methods.createChannel);
    t.truthy(methods.pushTask);
    t.truthy(methods.addWorker);
    t.truthy(methods.publishMessage);
    t.truthy(methods.addSubscriber);
    t.truthy(methods.getChannelName);

    t.end();
  });
});

if (RABBITMQ_URL) {
  test('should be able to connect to rabbitmq and clean up after itself', async t => {
    const err = await server.registerPromise({
      register: require('../'),
      options: {
        url: RABBITMQ_URL
      }
    });

    if (err) {
      return t.fail();
    }

    const state = server.app[pkg.name];

    const {rabbitmq} = server.methods;

    await rabbitmq.createConnection();

    t.is(Object.keys(state._openConnections).length, 1);

    await rabbitmq.closeConnection();

    t.is(Object.keys(state._openConnections).length, 0);

    t.pass();
  });
}
