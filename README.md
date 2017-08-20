hapi-rabbitmq [![Build Status](https://travis-ci.org/mshick/hapi-rabbitmq.svg?branch=master)](https://travis-ci.org/mshick/hapi-rabbitmq) [![npm version](https://badge.fury.io/js/hapi-rabbitmq.svg)](https://badge.fury.io/js/hapi-rabbitmq)
==============

A HAPI server plugin exposing RabbitMQ-backed PubSub and task queue pattern methods from [librabbitmq](https://github.com/mshick/librabbitmq/).

Configuration
-------------

The only required config is the url for your RabbitMQ server:

```js
server.register({
  register: require('hapi-rabbitmq'),
  options: {
    url: 'amqp://localhost'
  }
});
```

This plugin sets two notable defaults, intended to give good results on a HAPI server, where you are probably registering many decoupled plugins, and probably might not know which first set up your RabbitMQ connection.

```js
{
  preserveChannels: true,
  connection: {
    useExisting: true
  }
}
```

There are many more configuration options which are passed through to librabbitmq. [Read more about them](https://github.com/mshick/librabbitmq#configuration).

Usage
-----

Generally speaking, you only need to create a connection once, and that will be reused for all of your channel creation. You do have the option of creating multiple connections and passing those to the methods that create channels, if you need greater control.

### PubSub

```js

// Register plugin... start server

const {rabbitmq} = server.methods;

const subscriber = function (message) {
  return new Promise(() => {
    console.log('Message: ', message.payload);
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

### Task queue

```js

// Register plugin... start server

const {rabbitmq} = server.plugins;
const {ACK} = server.plugins['hapi-rabbitmq'].constants;

const worker = function (task) {
  return new Promise(resolve => {
    setTimeout(() => {
      console.log(task.payload);
      resolve(ACK);
    }, 1000);
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

Requirements
------------

*   node.js >= 6.0
*   RabbitMQ 3.6.11 (only version tested)
