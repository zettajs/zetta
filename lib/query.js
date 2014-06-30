var Query = module.exports = function(opts) {
  this._searchParams = opts;
};

Query.prototype.match = function(obj) {
  for(var k in this._searchParams) {
    if(this._searchParams[k] !== obj[k]) {
      return false;
    }
  }
  return true;
};
