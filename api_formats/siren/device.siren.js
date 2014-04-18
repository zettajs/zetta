module.exports = function(model){
  var entity = {
    'class': [ 'device' ],
    'properties': {
      'name': model.name
    },
    'links': [
      { 'rel': [ 'collection' ], href: model.collectionUrl },
      { 'rel': [ 'self' ], href: model.selfUrl }
    ]
  };

  return entity;
};
