const getChannelName = function ({method, exchange, queue}) {
  const p1 = method;
  const p2 = exchange || queue;
  return `${p1}.${p2}`;
};

module.exports = getChannelName;
