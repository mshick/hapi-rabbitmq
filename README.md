# hapi-rabbitmq

A HAPI server plugin implementing PubSub and work queue patterns in RabbitMQ with [amqplib](http://squaremo.github.io/amqp.node/).

## Configuration

The plugin supports the following configuration (defaults shown):

```js
const config = {
  url: 'amqp://localhost',
  encoding: 'utf8',
  retry: {
    retries: 0,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: Infinity,
    randomize: false
  },
  preserveChannels: true,
  tuning: {},
  socket: {}
};
```

* `socket` options will be passed through to the underlying `amqp.connect`
* `tuning` is an object that constructs the various RabbitMQ tuning query string params
* `retry` affects the connection retry attempts using the underlying [retry](https://github.com/tim-kos/node-retry) module
* `preserveChannels` will keep around publish and push channels, minimizing request overhead, but potentially causing [issues](https://github.com/squaremo/amqp.node/issues/144), though none I've been able to replicate

Additionally, all of the exposed methods take options that get passed to the underlying `amqplib` calls.

## Usage

Generally speaking, you only need to create a connection once, and that will be reused for all of your channel creation. You do have the option of creating multiple connections and passing those to the methods that create channels, if you need greater control.

Below are the easiest examples.

PubSub:

```js

// Register plugin... start server

const rabbitmq = server.plugins['hapi-rabbitmq'];

const subscriber = function ({message, content, channel}) {
  console.log(' [x] Received \'%s\'', content);
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
      data: request.payload
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

const worker = function ({message, content, channel}) {
  const secs = 10;
  console.log(' [x] Received \'%s\'', content);
  console.log(' [x] Task takes %d seconds', secs);
  setTimeout(() => {
    console.log(' [x] Done');
    channel.ack(message);
  }, secs * 1000);
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
        data: request.payload
      })
      .then(() => reply('ok'))
      .catch(reply);
  }
});
```

## Promises

This plugin works almost entirely via Promises. It was my use case, and I've found it to be the most sane approach to this sort of problem.

## TODO

* Add tests
* Add fanout pattern
* Add RPC pattern
* Release 1.0
