module.exports = function(model) {
  var entity = {
    'class': [ 'devices' ],
    'entities': []
  };

  entity.entities = model.entities.map(function(item) {
    var e = {
      'class': [ 'device' ],
      'rel': [ 'http://zettajs.io/rels/device', 'item' ],
      'properties': {
        'name' : item.name
      },
      'links': [
        {
          'rel': [ 'self' ],
          'href': item.selfUrl
        }
      ]
    };

    return e;
  });

  return entity;
};
