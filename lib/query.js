const Query = module.exports = function(opts) {
  if(typeof opts === 'string' && opts === '*') {
    this._searchParams = '*';
  } else {
    this._searchParams = opts;
  }
};

Query.prototype.match = function(obj) {
  if(this._searchParams !== '*') {
    for(const k in this._searchParams) {
      if(this._searchParams[k] !== obj[k]) {
        return false;
      }
    }
  }
  return true;
};
