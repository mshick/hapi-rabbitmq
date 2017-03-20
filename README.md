# hapi-rabbitmq

A HAPI server plugin implementing PubSub and work queue patterns in RabbitMQ with [amqplib](http://squaremo.github.io/amqp.node/).

## Configuration

The plugin supports the following configuration (defaults shown):

```js
const config = {
  url: 'amqp://localhost',
  preserveChannels: true,
  connection: {
    socket: {},
    tuning: {},
    retry: {
      retries: 0,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: Infinity,
      randomize: false
    },
    useExisting: false
  },
  retryQueue: {
    suffix: '_retry',
    maxCount: 10,
    factor: 2,
    minTimeout: 1 * 1000,
    maxTimeout: 60 * 1000,
    maxLength: 10000
  },
  doneQueue: {
    suffix: '_done',
    maxLength: 10000
  }
};
```

* `socket` options will be passed through to the underlying `amqp.connect`
* `tuning` is an object that constructs the various RabbitMQ tuning query string params
* `retry` affects the connection retry attempts using the underlying [retry](https://github.com/tim-kos/node-retry) module
* `useExistingConnection` will return an existing default connection upon invocation of `createConnection`, useful if you have many plugins but want to just use a single connection. Defaults to `false`.
* `preserveChannels` will keep around publish and push channels, minimizing request overhead, but potentially causing [issues](https://github.com/squaremo/amqp.node/issues/144), though none I've been able to replicate
* `retryQueue` implements a [retry queue with exponential backoff](https://felipeelias.github.io/rabbitmq/2016/02/22/rabbitmq-exponential-backoff.html) and is enabled by default for work queues
* `doneQueue` can write finished jobs to a final queue. Defaults to `false`, because it seems like an odd pattern. You're probably better off writing to your own db.

Additionally, all of the exposed methods take options that get passed to the underlying `amqplib` calls.

## Usage

Generally speaking, you only need to create a connection once, and that will be reused for all of your channel creation. You do have the option of creating multiple connections and passing those to the methods that create channels, if you need greater control.

Below are the easiest examples.

PubSub:

```js

// Register plugin... start server

const rabbitmq = server.plugins['hapi-rabbitmq'];

const subscriber = function ({payload}) {
  return new Promise(resolve => {
    console.log(' [x] Received \'%s\'', content);
  });
};

rabbitmq.createConnection()
  .then(() => {
    return rabbitmq.addSubscriber({
      exchange: 'pubsub',
      subscriber
    });
  })
  .then(() => next())
  .catch(next);


server.route({
  method: 'POST',
  path: '/publish',
  handler(request, reply) {
    rabbitmq.publishMessage({
      exchange: 'pubsub',
      topic: 'request',
      payload: request.payload
    })
    .then(() => reply('ok'))
    .catch(reply);
  }
});
```

Work queue:

```js

// Register plugin... start server

const rabbitmq = server.plugins['hapi-rabbitmq'];

const worker = function ({payload}) {
  const secs = 10;
  console.log(' [x] Received payload', content);
  console.log(payload);
  console.log(' [x] Task takes %d seconds', secs);
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      console.log(' [x] Done');
      resolve({code: rabbitmq.constants.ACK});
    }, secs * 1000);
  });
};

rabbitmq.createConnection()
  .then(() => {
    return rabbitmq.addWorker({
      queue: 'work',
      worker
    });
  })
  .then(() => next())
  .catch(next);

server.route({
  method: 'POST',
  path: '/work',
  handler(request, reply) {
    rabbitmq
      .pushTask({
        queue: 'work',
        type: 'foo',
        payload: request.payload
      })
      .then(() => reply('ok'))
      .catch(reply);
  }
});
```

## Promises

This plugin works almost entirely via Promises. It was my use case, and I've found it to be the most sane approach to this sort of problem.

## TODO

* Handle queue assertion failures
* Add tests
* Add fanout pattern
* Add RPC pattern
* Release 1.0
