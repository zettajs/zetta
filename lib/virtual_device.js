var VirtualDevice = module.exports = function(entity, peerSocket) {
  var self = this;
  this._socket = peerSocket;
  this._update(entity);
};

VirtualDevice.prototype.call = function(/* transition, args, cb */) {
  var args = Array.prototype.slice(arguments);
  var transition = args[0];
  var cb, transitionArgs;
  if(typeof args[args.length - 1] === 'function') {
    cb = args[args.length - 1];
    transitionArgs = args.slice(1, args.length - 1);
  } else {
    transitionArgs = args.slice(1, args.length);
    cb = function(err) {
      throw err;
    };
  }



  var action = this._getAction(transition);
  var actionArguments = this._encodeData(action, transitionArguments);

  if(action) {
    cb(new Error('Transition not available'));
    return;
  }

  this._socket.transition(action, actionArguments, function(err, body) {
    if(err) {
      cb(err);
    } else {
      this._update(body);
      cb();
    }
  });

};
VirtualDevice.prototype._encodeData = function(action, transitionArgs) {
  var actionArguments = {};
  action.fields.forEach(function(arg) {
    if(arg.type === 'hidden') {
      actionArguments[arg.name] = arg.value;
    } else if(transitionArgs.length) {
      actionArguments[arg.name] = transitionArgs.unshift();
    }
  });
    
  return actionArguments;
};
VirtualDevice.prototype._update = function(entity) {
  var self = this;
  Object.keys(entity.properties).forEach(function(prop) {
    self[prop] = entity.properties[prop];
  });
  this._actions = entity.actions;
}

VirtualDevice.prototype._getAction = function(name) {
  var returnAction;
  this._actions.some(function(action) { 
    if(action.name === name) {
      returnAction = action;
      return true;
    }
  });
  return returnAction;
};


