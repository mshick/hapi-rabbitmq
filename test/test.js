import test from 'ava';
import {Server} from 'hapi';

const {POSTGRES_USER, POSTGRES_DB} = process.env;
const PG_URL = `postgresql://${POSTGRES_USER}@localhost/${POSTGRES_DB}`;

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
      url: 'postgresql://localhost/db'
    }
  }, t.end);
});

test.cb('should log upon registration', t => {
  server.once('log', entry => {
    t.is(entry.data, 'hapi-piggy registered');
    t.end();
  });

  server.register({
    register: require('../'),
    options: {
      url: 'postgresql://localhost/db'
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
      url: 'mongodb://localhost:27017'
    }
  }, err => {
    if (err) {
      t.fail();
      return t.end();
    }

    const methods = server.methods.piggy;

    t.truthy(methods.createConnection);
    t.truthy(methods.closeConnection);
    t.truthy(methods.createPool);
    t.truthy(methods.createClient);
    t.truthy(methods.tableExists);
    t.truthy(methods.getTableColumns);
    t.truthy(methods.watchTable);
    t.truthy(methods.createStore);
    t.truthy(methods.set);
    t.truthy(methods.del);
    t.truthy(methods.get);
    t.truthy(methods.mget);
    t.truthy(methods.upsert);

    t.end();
  });
});

if (PG_URL) {
  test('should be able to connect to the database and clean up after itself', async t => {
    const err = await server.registerPromise({
      register: require('../'),
      options: {
        url: PG_URL
      }
    });

    if (err) {
      return t.fail();
    }

    const state = server.app['hapi-piggy'];

    const {piggy} = server.methods;

    const client = await piggy.createConnection();

    t.is(Object.keys(state.openPools).length, 1);
    t.is(state.openClients.length, 1);

    client.close();

    t.is(state.openClients.length, 0);

    await piggy.closeConnection();

    t.is(Object.keys(state.openPools).length, 0);

    t.pass();
  });
}
