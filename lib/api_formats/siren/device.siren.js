const url = require('url');
const rel = require('zetta-rels');

module.exports = context => {
  const loader = context.loader;
  const env = context.env;
  const model = context.model;
  const actions = buildActions(model.id, env, loader, model.transitionsAvailable());
  const streams = buildStreamLinks(model, loader, env);
  const properties = model.properties();
  const entity = {
    class: ['device', properties.type],
    properties,
    actions,
    links: [{ rel: ['self', 'edit'], href: env.helpers.url.path(`${loader.path}/devices/${model.id}`) },
            { title: context.serverName, rel: ['up', rel.server], href: env.helpers.url.path(loader.path) },
            { rel: [rel.type, 'describedby'], href: `${env.helpers.url.path(loader.path)}/meta/${properties.type}` }]
  };

  entity.links = entity.links.concat(streams);
  return entity;
};

var buildActions = module.exports.buildActions = (deviceId, env, loader, transitions) => {
  let actions = null;
  Object.keys(transitions).forEach(type => {
    const transition = transitions[type];
    const fields = transition.fields ? [].concat(transition.fields) : [];
    fields.push({ name: 'action', type: 'hidden', value: type });

    const action = {
      class: ['transition'],
      name: type,
      method: 'POST',
      href: env.helpers.url.path(`${loader.path}/devices/${deviceId}`),
      fields
    };
    if (!actions) {
      actions = [];
    }

    actions.push(action);
  });

  return actions;
};

var buildStreamLinks = (model, loader, env) => {
  const links = [];
  const rootPath = env.helpers.url.path(loader.path);
  const isForwardedProtocol = env.request && env.request.headers.hasOwnProperty('x-forwarded-proto') &&
    ['http', 'https'].indexOf(env.request.headers['x-forwarded-proto']) !== -1;
  const isSpdy = env.request && !!env.request.isSpdy && !isForwardedProtocol;
  const eventPath = isSpdy ? `${rootPath}/events` : `${rootPath.replace(/^http/, 'ws')}/events`;

  const streams = model._streams;
  streams.logs = { enabled: true }; // add logs to links
  Object.keys(streams).forEach(name => {
    const q = { topic: `${model.type}/${model.id}/${name}` };
    let streamRel = rel.objectStream;
    if (streams[name]._writableState && !streams[name]._writableState.objectMode) {
      streamRel = rel.binaryStream;
    }
    const stream = {
      title: name,
      rel: ['monitor', streamRel],
      href: eventPath + url.format({ query: q})
    };
    if(streams[name].enabled) {
      links.push(stream);
    }
  });

  return links;

};
